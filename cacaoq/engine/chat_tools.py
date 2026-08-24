"""CacaoQ — Tools que Claude puede invocar durante el chat.

Permiten al modelo consultar el StoneX Market Intelligence en tiempo real
en vez de depender solo del contexto pre-inyectado en el system prompt.
"""

import json
from typing import Any

from mcp_client import stonex as stonex_mcp


# ─── Definiciones (formato Anthropic tool use) ────────────────────────

TOOL_DEFINITIONS: list[dict] = [
    {
        "name": "list_intel_articles",
        "description": (
            "Lista artículos del StoneX Market Intelligence (intel.stonex.com) "
            "para un mercado. Retorna metadata: id (UUID), title, abstract, "
            "publishDate, author, url. NO incluye el contenido completo — para "
            "eso usar get_intel_article. Útil para descubrir qué reportes hay "
            "antes de leer alguno en detalle."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "market_id": {
                    "type": "integer",
                    "description": (
                        "ID del mercado en StoneX. 16974 = Cocoa (default). "
                        "Otros markets relevantes para AROCO si los conoces."
                    ),
                },
                "page_size": {
                    "type": "integer",
                    "description": "Cuántos artículos listar (1-50). Default: 20.",
                },
                "only_primary": {
                    "type": "boolean",
                    "description": (
                        "Si true, solo artículos primarios (excluye recopilaciones "
                        "y rollups). Default: false."
                    ),
                },
            },
        },
    },
    {
        "name": "get_intel_article",
        "description": (
            "Obtiene el contenido COMPLETO de un artículo específico de StoneX MI "
            "por su UUID. Usar después de list_intel_articles para leer en detalle. "
            "El contenido suele ser análisis técnico, fundamental, weather, supply/"
            "demand, política comercial, COT positioning, etc."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "article_id": {
                    "type": "string",
                    "description": "UUID del artículo (campo 'id' de list_intel_articles).",
                },
            },
            "required": ["article_id"],
        },
    },
    {
        "name": "get_latest_cocoa_intel",
        "description": (
            "Atajo: trae los N artículos más recientes de Cocoa CON contenido "
            "completo en una sola llamada. Usar cuando el usuario pide un "
            "resumen rápido de lo más reciente y no necesitas filtrar por título."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Cantidad (1-5). Default: 3.",
                },
                "only_primary": {
                    "type": "boolean",
                    "description": "Si true, solo primarios. Default: true.",
                },
            },
        },
    },
]


# ─── Despacho ──────────────────────────────────────────────────────────

def handle_tool_call(name: str, input_args: dict[str, Any]) -> dict:
    """Ejecuta un tool call y retorna un dict serializable a JSON."""
    try:
        if name == "list_intel_articles":
            articles = stonex_mcp.list_intel_articles(
                market_id=int(input_args.get("market_id") or 16974),
                page_size=int(input_args.get("page_size") or 20),
                only_primary=bool(input_args.get("only_primary") or False),
            )
            return {
                "ok": True,
                "count": len(articles) if articles else 0,
                "articles": articles or [],
            }

        if name == "get_intel_article":
            article_id = (input_args.get("article_id") or "").strip()
            if not article_id:
                return {"ok": False, "error": "article_id es requerido"}
            article = stonex_mcp.get_intel_article(article_id)
            return {"ok": True, "article": article}

        if name == "get_latest_cocoa_intel":
            articles = stonex_mcp.get_latest_cocoa_intel(
                limit=int(input_args.get("limit") or 3),
                only_primary=bool(input_args.get("only_primary", True)),
            )
            return {
                "ok": True,
                "count": len(articles) if articles else 0,
                "articles": articles or [],
            }

        return {"ok": False, "error": f"Tool desconocida: {name}"}

    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def serialize_result(result: dict, max_chars: int = 60_000) -> str:
    """Convierte el resultado a JSON string, recortando si es muy grande."""
    text = json.dumps(result, default=str, ensure_ascii=False)
    if len(text) > max_chars:
        text = text[:max_chars] + '..."__TRUNCATED__"}'
    return text
