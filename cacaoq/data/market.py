"""CacaoQ — Datos de mercado de cacao (Yahoo Finance)."""

import yfinance as yf
import pandas as pd
from datetime import datetime


# Meses de vencimiento de futuros de cacao ICE NY
_CACAO_MONTHS = [
    ("H", 3),   # Marzo
    ("K", 5),   # Mayo
    ("N", 7),   # Julio
    ("U", 9),   # Septiembre
    ("Z", 12),  # Diciembre
]


def _generate_contract_codes(n: int = 6) -> list[str]:
    """Genera los próximos n códigos de contratos de cacao."""
    now = datetime.now()
    year = now.year
    month = now.month
    codes = []

    for y in range(year, year + 3):
        for letter, m in _CACAO_MONTHS:
            # Incluir contratos desde el mes actual en adelante
            if y == year and m < month:
                continue
            suffix = str(y)[2:]  # 2026 -> 26
            codes.append(f"CC{letter}{suffix}.NYB")
            if len(codes) >= n:
                return codes
    return codes


def _find_active_contract() -> str:
    """Encuentra el contrato activo (mayor volumen) entre los próximos vencimientos."""
    codes = _generate_contract_codes(6)
    best_code = codes[0]  # fallback: el más cercano
    best_volume = -1

    for code in codes:
        try:
            t = yf.Ticker(code)
            hist = t.history(period="2d")
            if hist.empty:
                continue
            vol = float(hist.iloc[-1]["Volume"])
            if vol > best_volume:
                best_volume = vol
                best_code = code
        except Exception:
            continue

    return best_code


def get_cacao_price() -> dict | None:
    """Obtiene el precio más reciente de cacao ICE NY (contrato activo)."""
    try:
        active = _find_active_contract()
        ticker = yf.Ticker(active)
        hist = ticker.history(period="5d")
        if hist.empty:
            return None
        last = hist.iloc[-1]
        return {
            "date": str(hist.index[-1].date()),
            "contract": active,
            "close": float(last["Close"]),
            "open": float(last["Open"]),
            "high": float(last["High"]),
            "low": float(last["Low"]),
            "volume": float(last["Volume"]),
        }
    except Exception as e:
        print(f"Error obteniendo precio cacao: {e}")
        return None


def get_cacao_history(period: str = "3mo") -> pd.DataFrame:
    """Obtiene histórico de precios de cacao (contrato activo)."""
    try:
        active = _find_active_contract()
        ticker = yf.Ticker(active)
        hist = ticker.history(period=period)
        return hist
    except Exception as e:
        print(f"Error obteniendo histórico cacao: {e}")
        return pd.DataFrame()


def get_term_structure() -> list[dict]:
    """Obtiene estructura de futuros de cacao (contratos cercanos)."""
    codes = _generate_contract_codes(6)
    results = []
    for code in codes:
        try:
            t = yf.Ticker(code)
            info = t.fast_info
            if hasattr(info, "last_price") and info.last_price:
                results.append({
                    "contract": code,
                    "price": float(info.last_price),
                })
        except Exception:
            continue
    return results
