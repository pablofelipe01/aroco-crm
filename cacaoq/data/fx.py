"""CacaoQ — Datos de tasas de cambio USD/COP."""

import httpx
import yfinance as yf
from config import TRM_API_URL


def get_usdcop_spot() -> dict | None:
    """Obtiene la tasa USD/COP spot en tiempo real (Yahoo Finance)."""
    try:
        t = yf.Ticker("USDCOP=X")
        hist = t.history(period="2d")
        if hist.empty:
            return None
        last = hist.iloc[-1]
        return {
            "date": str(hist.index[-1].date()),
            "rate": float(last["Close"]),
            "high": float(last["High"]),
            "low": float(last["Low"]),
        }
    except Exception as e:
        print(f"Error obteniendo USD/COP spot: {e}")
        return None


def get_trm_latest() -> dict | None:
    """Obtiene la TRM oficial más reciente de datos.gov.co."""
    try:
        resp = httpx.get(
            TRM_API_URL,
            params={"$order": "vigenciadesde DESC", "$limit": 1},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if data:
            row = data[0]
            return {
                "date": row["vigenciadesde"][:10],
                "trm": float(row["valor"]),
            }
    except Exception as e:
        print(f"Error obteniendo TRM: {e}")
    return None


def get_trm_history(days: int = 30) -> list[dict]:
    """Obtiene histórico de TRM."""
    try:
        resp = httpx.get(
            TRM_API_URL,
            params={"$order": "vigenciadesde DESC", "$limit": days},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        return [
            {"date": r["vigenciadesde"][:10], "trm": float(r["valor"])}
            for r in data
        ]
    except Exception as e:
        print(f"Error obteniendo histórico TRM: {e}")
        return []
