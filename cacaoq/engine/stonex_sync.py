"""CacaoQ — Sincronización StoneX MCP → tablas internas.

Reemplaza el flujo manual de subir PDF: trae datos directos del MCP
(download_and_extract_daily) y los persiste en las mismas tablas que el parser
local. La UI manual queda como fallback.
"""

from typing import Any

from mcp_client import stonex as mcp
from db.database import get_connection
from db.models import (
    insert_position, insert_balance, insert_broker_pnl,
    insert_processed_statement, is_statement_processed,
)


def _synthetic_hash(account: str, date: str) -> str:
    """Hash sintético para dedup cuando la fuente es el MCP (no hay archivo local).

    Garantiza idempotencia para una misma (cuenta, fecha) sin importar cuántas
    veces se llame al sync.
    """
    return f"mcp:stonex:{account}:{date}"


def _exists_for_date(account: str, statement_date: str) -> bool:
    """True si ya hay un processed_statement para esta cuenta y fecha
    (independiente de la fuente: manual o MCP)."""
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM processed_statements WHERE statement_date=? AND account=? LIMIT 1",
        (str(statement_date), str(account)),
    ).fetchone()
    conn.close()
    return row is not None


# ─── Normalización del payload MCP ─────────────────────────────────────

def _coerce_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        if isinstance(v, str):
            v = v.replace(",", "").replace("USD", "").strip()
        return float(v)
    except (ValueError, TypeError):
        return None


def _coerce_int(v: Any) -> int:
    if v is None or v == "":
        return 0
    try:
        return int(v)
    except (ValueError, TypeError):
        return 0


def _safe_str(v: Any) -> str | None:
    """Convierte a str (str() del valor) o None. Evita pasar datetime/memoryview a libsql."""
    if v is None or v == "":
        return None
    return str(v)


def _normalize_position(p: dict) -> dict:
    """Acepta nombres alternos del payload MCP y los normaliza al schema interno."""
    return {
        "trade_date": _safe_str(p.get("trade_date") or p.get("tradeDate")),
        "card": str(p.get("card") or ""),
        "long_qty": _coerce_int(p.get("long_qty") or p.get("longQty") or p.get("long")),
        "short_qty": _coerce_int(p.get("short_qty") or p.get("shortQty") or p.get("short")),
        "option_type": _safe_str(p.get("option_type") or p.get("optionType") or p.get("type")),
        "contract_month": _safe_str(p.get("contract_month") or p.get("contractMonth") or p.get("month")),
        "exchange": str(p.get("exchange") or "ICE COCOA"),
        "strike": _coerce_float(p.get("strike")),
        "settle_price": _coerce_float(p.get("settle_price") or p.get("settlePrice") or p.get("settle")),
        "market_value": _coerce_float(p.get("market_value") or p.get("marketValue") or p.get("value")) or 0.0,
        "dr_cr": _safe_str(p.get("dr_cr") or p.get("drCr")) or ("DR" if (_coerce_float(p.get("market_value")) or 0) < 0 else "CR"),
    }


def _normalize_balance(b: dict | None) -> dict:
    if not b:
        return {}
    keys_map = {
        "beginning_balance": ["beginning_balance", "beginningBalance"],
        "ending_balance": ["ending_balance", "endingBalance"],
        "total_equity": ["total_equity", "totalEquity"],
        "long_option_value": ["long_option_value", "longOptionValue"],
        "short_option_value": ["short_option_value", "shortOptionValue"],
        "net_option_value": ["net_option_value", "netOptionValue", "net_market_value_of_options"],
        "net_liquidating_value": ["net_liquidating_value", "netLiquidatingValue", "current_net_liquidating_value"],
        "prior_net_liquidating_value": ["prior_net_liquidating_value", "priorNetLiquidatingValue"],
        "market_variance": ["market_variance", "marketVariance"],
        "initial_margin": ["initial_margin", "initialMargin"],
        "maintenance_margin": ["maintenance_margin", "maintenanceMargin"],
        "excess_equity": ["excess_equity", "excessEquity"],
    }
    out = {}
    for canonical, alts in keys_map.items():
        for k in alts:
            if k in b and b[k] is not None:
                out[canonical] = _coerce_float(b[k])
                break
    return out


def _normalize_pnl(p: dict | None) -> dict:
    """Acepta P&L como dict simple o como dict por moneda."""
    if not p:
        return {"realized_pnl_mtd": 0.0, "realized_pnl_ytd": 0.0}
    # Caso 1: dict por moneda { "USD": {"mtd": ..., "ytd": ...} }
    if "USD" in p and isinstance(p["USD"], dict):
        usd = p["USD"]
        return {
            "realized_pnl_mtd": _coerce_float(usd.get("mtd") or usd.get("realized_pnl_mtd")) or 0.0,
            "realized_pnl_ytd": _coerce_float(usd.get("ytd") or usd.get("realized_pnl_ytd")) or 0.0,
        }
    # Caso 2: dict plano
    return {
        "realized_pnl_mtd": _coerce_float(
            p.get("realized_pnl_mtd") or p.get("realizedMtd") or p.get("mtd")
        ) or 0.0,
        "realized_pnl_ytd": _coerce_float(
            p.get("realized_pnl_ytd") or p.get("realizedYtd") or p.get("ytd")
        ) or 0.0,
    }


# ─── Sync principal ────────────────────────────────────────────────────

def sync_latest_statement(date_str: str | None = None,
                           account_id: str = "GMI-MICH5483",
                           force: bool = False) -> dict:
    """Trae un Daily Statement del MCP y lo persiste en la DB.

    Args:
        date_str: YYYY-MM-DD; None = ayer (default del MCP).
        account_id: cuenta StoneX.
        force: si True, ignora dedup y re-procesa.

    Returns:
        dict con: ok, date, account, positions_count, already_processed, error
    """
    if not mcp.is_configured():
        return {"ok": False, "error": "STONEX_MCP_URL no configurado"}

    try:
        payload = mcp.download_and_extract_daily(date_str=date_str, account_id=account_id)
    except Exception as e:
        return {"ok": False, "error": f"MCP error: {type(e).__name__}: {e}"}

    if not payload:
        return {"ok": False, "error": "MCP devolvió respuesta vacía"}

    # Coerce a str — libsql_client no acepta datetime.date u otros tipos exóticos
    raw_date = payload.get("date") or payload.get("statement_date") or date_str
    raw_account = payload.get("account") or payload.get("account_id") or account_id
    if not raw_date or not raw_account:
        return {"ok": False, "error": "Payload sin fecha o cuenta", "payload": payload}
    statement_date = str(raw_date)[:10]  # YYYY-MM-DD aunque venga un datetime
    # El MCP devuelve account como dict {name, number, salesman, address}.
    # Extraer un identificador estable; fallback al account_id pasado.
    if isinstance(raw_account, dict):
        number = raw_account.get("number") or raw_account.get("id")
        account = f"GMI-{number}" if number else account_id
    else:
        account = str(raw_account)

    if not force and _exists_for_date(account, statement_date):
        return {
            "ok": True,
            "already_processed": True,
            "date": statement_date,
            "account": account,
            "positions_count": 0,
        }

    positions_raw = payload.get("positions") or []
    positions = [_normalize_position(p) for p in positions_raw]
    balance = _normalize_balance(payload.get("balance") or payload.get("balances"))
    pnl = _normalize_pnl(payload.get("pnl") or payload.get("realized_pnl"))

    # Insertar posiciones
    for pos in positions:
        insert_position(
            statement_date=statement_date,
            account=account,
            trade_date=pos["trade_date"],
            card=pos["card"],
            long_qty=pos["long_qty"],
            short_qty=pos["short_qty"],
            option_type=pos["option_type"],
            contract_month=pos["contract_month"],
            exchange=pos["exchange"],
            strike=pos["strike"],
            settle_price=pos["settle_price"],
            market_value=pos["market_value"],
            dr_cr=pos["dr_cr"],
        )

    # Balance (solo si vino algo)
    if balance:
        insert_balance(statement_date=statement_date, account=account, **balance)

    # P&L
    insert_broker_pnl(
        statement_date=statement_date,
        account=account,
        realized_pnl_mtd=pnl["realized_pnl_mtd"],
        realized_pnl_ytd=pnl["realized_pnl_ytd"],
    )

    # Marcar como procesado con hash sintético (fuente = MCP)
    filename = payload.get("filename") or f"mcp-{account}-{statement_date}.pdf"
    insert_processed_statement(
        filename=filename,
        statement_date=statement_date,
        account=account,
        file_hash=_synthetic_hash(account, statement_date),
        num_positions=len(positions),
    )

    return {
        "ok": True,
        "already_processed": False,
        "date": statement_date,
        "account": account,
        "positions_count": len(positions),
        "filename": filename,
    }


def health_check() -> dict:
    """Ping al MCP. Útil para mostrar estado en UI."""
    return mcp.ping()
