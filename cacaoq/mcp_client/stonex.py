"""CacaoQ — Cliente para StoneX MCP (cuenta GMI-MICH5483 + Market Intelligence)."""

from typing import Any

from config import (
    STONEX_MCP_URL, STONEX_MCP_TOKEN,
    STONEX_MCP_CF_CLIENT_ID, STONEX_MCP_CF_CLIENT_SECRET,
)
from mcp_client._transport import build_auth_headers, call_tool, run_sync


def is_configured() -> bool:
    return bool(STONEX_MCP_URL)


def _headers() -> dict[str, str]:
    return build_auth_headers(
        STONEX_MCP_TOKEN, STONEX_MCP_CF_CLIENT_ID, STONEX_MCP_CF_CLIENT_SECRET
    )


def _call(tool: str, args: dict[str, Any] | None = None,
          timeout: float | None = None) -> Any:
    kwargs = {"timeout": timeout} if timeout is not None else {}
    return run_sync(call_tool(STONEX_MCP_URL, _headers(), tool, args, **kwargs))


# ─── Cuenta ────────────────────────────────────────────────────────────

def ping() -> dict:
    if not is_configured():
        return {"ok": False, "message": "STONEX_MCP_URL no configurado"}
    try:
        return {"ok": True, "message": str(_call("ping"))}
    except Exception as e:
        return {"ok": False, "message": f"{type(e).__name__}: {e}"}


def get_account_summary() -> dict | None:
    return _call("get_account_summary")


def get_positions() -> dict | None:
    return _call("get_positions")


def get_positions_detail(lookback_days: int = 90) -> dict | None:
    return _call("get_positions_detail", {"lookback_days": lookback_days})


def download_daily_statement(date_str: str | None = None,
                              account_id: str = "GMI-MICH5483") -> dict | None:
    args = {"account_id": account_id}
    if date_str:
        args["date_str"] = date_str
    return _call("download_daily_statement", args)


def extract_statement_data(pdf_path: str, include_raw_text: bool = False) -> dict | None:
    return _call("extract_statement_data", {
        "pdf_path": pdf_path,
        "include_raw_text": include_raw_text,
    })


def download_and_extract_daily(date_str: str | None = None,
                                account_id: str = "GMI-MICH5483") -> dict | None:
    args = {"account_id": account_id}
    if date_str:
        args["date_str"] = date_str
    return _call("download_and_extract_daily", args)


# ─── Market Intelligence ───────────────────────────────────────────────

def list_intel_articles(market_id: int = 16974, page_size: int = 20,
                         only_primary: bool = False) -> list[dict] | None:
    return _call("list_intel_articles", {
        "market_id": market_id,
        "page_size": page_size,
        "only_primary": only_primary,
    })


def get_intel_article(article_id: str) -> dict | None:
    return _call("get_intel_article", {"article_id": article_id})


def get_latest_cocoa_intel(limit: int = 3, only_primary: bool = True) -> list[dict] | None:
    return _call("get_latest_cocoa_intel", {
        "limit": limit,
        "only_primary": only_primary,
    })
