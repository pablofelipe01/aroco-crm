"""CacaoQ — Sincronización Barchart MCP → tablas options_board / options_chain.

Reemplaza el flujo manual de subir screenshot del tablero por pull directo
de la cadena de opciones de Barchart.
"""

from datetime import date as _date, datetime
from typing import Any

from config import BARCHART_COCOA_SYMBOL
from mcp_client import barchart as mcp
from db.models import upsert_options_board


_MONTH_CODES = {
    "F": "JAN", "G": "FEB", "H": "MAR", "J": "APR", "K": "MAY", "M": "JUN",
    "N": "JUL", "Q": "AUG", "U": "SEP", "V": "OCT", "X": "NOV", "Z": "DEC",
}


def _coerce_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        if isinstance(v, str):
            v = v.replace(",", "").replace("%", "").strip()
        return float(v)
    except (ValueError, TypeError):
        return None


def _avg(values: list[float | None]) -> float:
    nums = [v for v in values if v is not None]
    return sum(nums) / len(nums) if nums else 0.0


def _contract_month_from_symbol(symbol: str) -> str:
    """CCK26 → 'MAY 26'. Para CC*0 u otros, devuelve el símbolo."""
    s = (symbol or "").upper().replace(".NYB", "").strip()
    # Formato esperado: prefix(2) + monthCode(1) + year(2)
    if len(s) >= 5 and s[-3] in _MONTH_CODES:
        return f"{_MONTH_CODES[s[-3]]} {s[-2:]}"
    return s


def _normalize_expiration(raw: Any) -> str | None:
    """Acepta 'YYYY-MM-DD', 'MM/DD/YY', 'MM/DD/YYYY' → ISO 'YYYY-MM-DD'."""
    if not raw:
        return None
    s = str(raw).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%y", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return s  # devolvemos crudo si no matchea


def _normalize_chain(payload: dict) -> dict:
    """Convierte el payload Barchart a {strike → {call/put metrics}}.

    Acepta dos formatos comunes:
    1. {calls: [...], puts: [...]}  con cada item teniendo "strike"
    2. {strikes: [{strike, call: {...}, put: {...}}]}
    """
    by_strike: dict[float, dict] = {}

    if "calls" in payload or "puts" in payload:
        for c in payload.get("calls") or []:
            strike = _coerce_float(c.get("strike") or c.get("strikePrice"))
            if strike is None:
                continue
            by_strike.setdefault(strike, {})["call"] = c
        for p in payload.get("puts") or []:
            strike = _coerce_float(p.get("strike") or p.get("strikePrice"))
            if strike is None:
                continue
            by_strike.setdefault(strike, {})["put"] = p
    elif "strikes" in payload:
        for row in payload["strikes"]:
            strike = _coerce_float(row.get("strike") or row.get("strikePrice"))
            if strike is None:
                continue
            entry = by_strike.setdefault(strike, {})
            if "call" in row:
                entry["call"] = row["call"]
            if "put" in row:
                entry["put"] = row["put"]
    return by_strike


def _premium(side: dict | None) -> float | None:
    """Precio: prefiere last, cae a mid(bid,ask), luego bid o ask sueltos."""
    if not side:
        return None
    last = _coerce_float(side.get("last") or side.get("lastPrice"))
    if last is not None and last > 0:
        return last
    bid = _coerce_float(side.get("bid"))
    ask = _coerce_float(side.get("ask"))
    if bid is not None and ask is not None:
        return (bid + ask) / 2
    return bid if bid is not None else ask


def _delta(side: dict | None) -> float | None:
    if not side:
        return None
    return _coerce_float(side.get("delta") or side.get("optionDelta"))


def _iv(side: dict | None) -> float | None:
    if not side:
        return None
    v = _coerce_float(
        side.get("impliedVolatility") or side.get("iv")
        or side.get("volatility") or side.get("impVol")
    )
    if v is None:
        return None
    # Barchart suele devolver 0.42 (fracción) o "42.01" (porcentaje). Normalizar a %.
    return v * 100 if v < 5 else v


def sync_options_board(symbol: str = BARCHART_COCOA_SYMBOL,
                        expiration: str = "") -> dict:
    """Trae la cadena de opciones del MCP y la guarda en options_board.

    Args:
        symbol: símbolo Barchart (CC*0=cacao nearest, CCK26=mayo 26, etc.)
        expiration: fecha de expiración específica; "" = la default del MCP.
    """
    if not mcp.is_configured():
        return {"ok": False, "error": "BARCHART_MCP_URL no configurado"}

    try:
        payload = mcp.get_options_chain(symbol=symbol, expiration=expiration)
    except Exception as e:
        return {"ok": False, "error": f"MCP error: {type(e).__name__}: {e}"}

    if not payload:
        return {"ok": False, "error": "MCP devolvió cadena vacía"}

    underlying = _coerce_float(
        payload.get("underlyingPrice") or payload.get("underlying_price")
        or payload.get("lastPrice")
    )
    exp_raw = payload.get("expirationDate") or payload.get("expiration")
    expiration_iso = _normalize_expiration(exp_raw) or ""
    dte_val = payload.get("daysToExpiration") or payload.get("dte")
    try:
        dte = int(dte_val) if dte_val is not None else 0
    except (ValueError, TypeError):
        dte = 0
    contract_symbol = payload.get("symbol") or symbol
    contract_month = (
        payload.get("contract_month")
        or payload.get("contractMonth")
        or _contract_month_from_symbol(contract_symbol)
    )

    by_strike = _normalize_chain(payload)
    if not by_strike:
        # Diagnóstico ampliado para distinguir "shape desconocido" de
        # "Barchart devolvió cadena vacía" (auth/symbol/mercado cerrado).
        top_keys = list(payload.keys()) if isinstance(payload, dict) else [type(payload).__name__]
        sample = None
        for k in ("data", "results", "options", "optionPairs", "chain", "items"):
            if isinstance(payload, dict) and k in payload:
                v = payload[k]
                if isinstance(v, list) and v:
                    sample = {
                        "key": k,
                        "length": len(v),
                        "first_item_keys": list(v[0].keys()) if isinstance(v[0], dict) else type(v[0]).__name__,
                    }
                    break

        # Si los keys conocidos están todos vacíos, el problema está en Barchart
        count = payload.get("count") if isinstance(payload, dict) else None
        empty_data = (
            isinstance(payload, dict)
            and count == 0
            and isinstance(payload.get("data"), list)
            and len(payload["data"]) == 0
        )
        diagnosis = None
        if empty_data:
            diagnosis = (
                "Barchart devolvió data:[] para este símbolo. Causas comunes: "
                "(1) símbolo continuo CC*0 no tiene cadena — usa contrato concreto (CCN26, CCU26); "
                "(2) sesión de Barchart vencida en el server — verifica con 'Probar sesión Barchart'; "
                "(3) mercado cerrado o sin liquidez intradiaria; "
                "(4) el símbolo no existe en la suscripción de AROCO."
            )

        return {
            "ok": False,
            "error": "No se encontraron strikes en la cadena",
            "payload_top_keys": top_keys,
            "payload_sample": sample,
            "payload_count": count,
            "payload_meta": payload.get("meta") if isinstance(payload, dict) else None,
            "payload_source_url": payload.get("source_url") if isinstance(payload, dict) else None,
            "diagnosis": diagnosis,
        }

    call_ivs: list[float | None] = []
    put_ivs: list[float | None] = []
    strikes_out = []
    for strike in sorted(by_strike.keys()):
        sides = by_strike[strike]
        call = sides.get("call")
        put = sides.get("put")
        call_ivs.append(_iv(call))
        put_ivs.append(_iv(put))
        strikes_out.append({
            "strike": strike,
            "call_premium": _premium(call),
            "call_delta": _delta(call),
            "put_premium": _premium(put),
            "put_delta": _delta(put),
        })

    interest_rate = _coerce_float(
        payload.get("interestRate") or payload.get("interest_rate")
        or payload.get("riskFreeRate")
    ) or 0.0

    today = _date.today().isoformat()
    upsert_options_board(
        date=today,
        contract_month=contract_month,
        underlying_price=underlying or 0.0,
        dte=dte,
        expiration=expiration_iso,
        volatility_calls=_avg(call_ivs),
        volatility_puts=_avg(put_ivs),
        interest_rate=interest_rate,
        strikes=strikes_out,
    )

    return {
        "ok": True,
        "symbol": contract_symbol,
        "contract_month": contract_month,
        "underlying_price": underlying,
        "expiration": expiration_iso,
        "dte": dte,
        "strikes_count": len(strikes_out),
    }


def health_check() -> dict:
    return mcp.ping_session()
