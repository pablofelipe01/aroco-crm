"""CacaoQ — Cliente para Inventory MCP (Google Sheet de inventario físico)."""

from typing import Any

from config import (
    INVENTORY_MCP_URL, INVENTORY_MCP_TOKEN,
    INVENTORY_MCP_CF_CLIENT_ID, INVENTORY_MCP_CF_CLIENT_SECRET,
)
from mcp_client._transport import build_auth_headers, call_tool, run_sync


def is_configured() -> bool:
    return bool(INVENTORY_MCP_URL)


def _headers() -> dict[str, str]:
    return build_auth_headers(
        INVENTORY_MCP_TOKEN, INVENTORY_MCP_CF_CLIENT_ID, INVENTORY_MCP_CF_CLIENT_SECRET
    )


def _call(tool: str, args: dict[str, Any] | None = None) -> Any:
    return run_sync(call_tool(INVENTORY_MCP_URL, _headers(), tool, args))


# ─── Tools ─────────────────────────────────────────────────────────────

def ping() -> dict:
    if not is_configured():
        return {"ok": False, "message": "INVENTORY_MCP_URL no configurado"}
    try:
        return {"ok": True, "message": str(_call("ping"))}
    except Exception as e:
        return {"ok": False, "message": f"{type(e).__name__}: {e}"}


def get_sheet_info() -> dict | None:
    """Metadata de la sheet: título, URL, por hoja gid/headers detectados."""
    return _call("get_sheet_info")


def read_inventory(worksheet_name: str | None = None,
                   limit: int | None = None,
                   header_row: int | None = None) -> list[dict] | None:
    """Filas como lista de dicts {header: valor}."""
    args: dict[str, Any] = {}
    if worksheet_name is not None:
        args["worksheet_name"] = worksheet_name
    if limit is not None:
        args["limit"] = limit
    if header_row is not None:
        args["header_row"] = header_row
    result = _call("read_inventory", args)
    if isinstance(result, dict):
        return result.get("rows") or result.get("data") or result.get("records")
    return result


def query_inventory(filter_column: str, filter_value: str,
                    worksheet_name: str | None = None,
                    columns: list[str] | None = None,
                    case_sensitive: bool = False,
                    header_row: int | None = None) -> list[dict] | None:
    args: dict[str, Any] = {
        "filter_column": filter_column,
        "filter_value": filter_value,
        "case_sensitive": case_sensitive,
    }
    if worksheet_name is not None:
        args["worksheet_name"] = worksheet_name
    if columns is not None:
        args["columns"] = columns
    if header_row is not None:
        args["header_row"] = header_row
    result = _call("query_inventory", args)
    if isinstance(result, dict):
        return result.get("rows") or result.get("data")
    return result


def append_row(values: dict[str, Any],
               worksheet_name: str | None = None,
               header_row: int | None = None) -> dict | None:
    args: dict[str, Any] = {"values": values}
    if worksheet_name is not None:
        args["worksheet_name"] = worksheet_name
    if header_row is not None:
        args["header_row"] = header_row
    return _call("append_row", args)


def update_cell(row: int, column: str, value: Any,
                worksheet_name: str | None = None,
                header_row: int | None = None) -> dict | None:
    args: dict[str, Any] = {"row": row, "column": column, "value": value}
    if worksheet_name is not None:
        args["worksheet_name"] = worksheet_name
    if header_row is not None:
        args["header_row"] = header_row
    return _call("update_cell", args)
