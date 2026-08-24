"""CacaoQ — Cliente para Barchart MCP (cadena de opciones de futuros)."""

from typing import Any

from config import (
    BARCHART_MCP_URL, BARCHART_MCP_TOKEN,
    BARCHART_MCP_CF_CLIENT_ID, BARCHART_MCP_CF_CLIENT_SECRET,
    BARCHART_COCOA_SYMBOL,
)
from mcp_client._transport import build_auth_headers, call_tool, run_sync


def is_configured() -> bool:
    return bool(BARCHART_MCP_URL)


def _headers() -> dict[str, str]:
    return build_auth_headers(
        BARCHART_MCP_TOKEN, BARCHART_MCP_CF_CLIENT_ID, BARCHART_MCP_CF_CLIENT_SECRET
    )


def _call(tool: str, args: dict[str, Any] | None = None) -> Any:
    return run_sync(call_tool(BARCHART_MCP_URL, _headers(), tool, args))


# ─── Tools ─────────────────────────────────────────────────────────────

def ping_session() -> dict:
    """Wrapper de check_session que normaliza respuesta para la UI."""
    if not is_configured():
        return {"ok": False, "message": "BARCHART_MCP_URL no configurado"}
    try:
        result = _call("check_session")
        if isinstance(result, dict):
            ok = bool(result.get("ok") or result.get("logged_in_as"))
            msg = result.get("logged_in_as") or result.get("final_url") or str(result)
            return {"ok": ok, "message": str(msg), "raw": result}
        return {"ok": True, "message": str(result)}
    except Exception as e:
        return {"ok": False, "message": f"{type(e).__name__}: {e}"}


def list_expirations(symbol: str = BARCHART_COCOA_SYMBOL) -> list[str] | None:
    """Fechas de expiración disponibles para un símbolo Barchart."""
    result = _call("list_expirations", {"symbol": symbol})
    if isinstance(result, dict):
        return result.get("expirations") or result.get("dates") or result.get("data")
    return result


def get_options_chain(symbol: str = BARCHART_COCOA_SYMBOL,
                      expiration: str = "") -> dict | None:
    """Cadena de opciones JSON (strike, bid/ask, last, vol, OI, IV, calls+puts)."""
    return _call("get_options_chain", {"symbol": symbol, "expiration": expiration})


def download_csv(symbol: str = BARCHART_COCOA_SYMBOL,
                 expiration: str = "") -> dict | None:
    """Descarga el CSV nativo y retorna {ok, path, filename, size_bytes}."""
    return _call("download_csv", {"symbol": symbol, "expiration": expiration})


def list_csvs(limit: int = 50) -> list[dict] | None:
    """Lista los CSVs ya descargados en el server."""
    result = _call("list_csvs", {"limit": limit})
    if isinstance(result, dict):
        return result.get("files") or result.get("csvs") or result.get("data")
    return result
