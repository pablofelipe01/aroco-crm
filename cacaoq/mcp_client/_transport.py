"""CacaoQ — Utilidades compartidas para los clientes MCP.

Centraliza la construcción de headers de auth y el wrapper sync↔async,
para que los clientes (stonex, barchart, inventory) solo declaren sus tools.
"""

import asyncio
from typing import Any


def build_auth_headers(token: str | None,
                       cf_client_id: str | None,
                       cf_client_secret: str | None) -> dict[str, str]:
    """Headers de auth para un MCP, según los secrets disponibles.

    Soporta Bearer simple y/o Cloudflare Access Service Token (pueden coexistir;
    CF Access valida primero y luego el upstream valida el bearer si lo usa).
    """
    headers = {}
    if cf_client_id and cf_client_secret:
        headers["CF-Access-Client-Id"] = cf_client_id
        headers["CF-Access-Client-Secret"] = cf_client_secret
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


# Tope por defecto para cualquier tool MCP. Sin esto, una tool lenta del lado
# del servidor (p.ej. download_and_extract_daily, que baja y parsea un PDF)
# cuelga el render de Streamlit indefinidamente.
DEFAULT_TIMEOUT = 120.0


async def call_tool(url: str,
                    headers: dict[str, str],
                    tool_name: str,
                    args: dict[str, Any] | None = None,
                    timeout: float | None = DEFAULT_TIMEOUT) -> Any:
    """Llama una tool MCP y devuelve el payload estructurado."""
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    transport = StreamableHttpTransport(url=url, headers=headers or None)
    async with Client(transport, timeout=timeout, init_timeout=timeout) as client:
        result = await client.call_tool(tool_name, args or {}, timeout=timeout)
        if hasattr(result, "data") and result.data is not None:
            return result.data
        if hasattr(result, "structured_content") and result.structured_content is not None:
            return result.structured_content
        content = getattr(result, "content", None)
        if content:
            return content
        return None


def run_sync(coro):
    """Ejecuta una coroutine desde código síncrono (Streamlit)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import nest_asyncio
            nest_asyncio.apply()
            return loop.run_until_complete(coro)
    except RuntimeError:
        pass
    return asyncio.run(coro)
