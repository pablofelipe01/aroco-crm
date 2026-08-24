"""CacaoQ — Reportes curados de StoneX MI (acceso directo, no vía chat).

Estos son los reportes que el cliente consume regularmente. Cada entrada
incluye un patrón de título para buscar el último número publicado, y un
UUID de fallback por si la búsqueda no encuentra match.
"""

from typing import Any

from mcp_client import stonex as stonex_mcp


CURATED_REPORTS: list[dict] = [
    {
        "key": "cocoa_ratios",
        "name": "Cocoa Ratios Report",
        "title_pattern": "ratios report",
        "fallback_id": "4c9741bb-32b0-421e-a490-a7785bba80b8",
        "description": (
            "Reporte de ratios del mercado de cacao (semillas/manteca/licor/"
            "polvo vs. futuros). Útil para entender pricing relativo entre "
            "productos derivados y el subyacente."
        ),
    },
    {
        "key": "cocoa_differentials",
        "name": "Cocoa Differentials Report",
        "title_pattern": "differentials report",
        "fallback_id": "15ef2c11-0e59-440c-853e-15c3e997d794",
        "description": (
            "Reporte de diferenciales por origen del cacao físico (Costa de "
            "Marfil, Ghana, Ecuador, etc.) sobre el futuro de ICE. Refleja "
            "primas/descuentos del cacao físico vs. el contrato de NY."
        ),
    },
]


def _looks_like_match(title: str, pattern: str) -> bool:
    """Compara ignorando case y permitiendo el patrón en cualquier parte."""
    return pattern.lower() in (title or "").lower()


def fetch_latest_report(spec_key: str, market_id: int = 16974) -> dict | None:
    """Busca el último artículo que matchee el patrón de título.

    Estrategia:
      1. Lista hasta 50 artículos del mercado de cocoa.
      2. Filtra por título que contenga el patrón.
      3. Si encuentra, hace get_intel_article para traer el contenido completo.
      4. Si no encuentra, cae al fallback_id hardcoded.

    Args:
        spec_key: clave del spec en CURATED_REPORTS.
        market_id: ID del mercado StoneX (default 16974 = cocoa).

    Returns:
        Dict del artículo (con contenido completo) o None si no se pudo obtener.
    """
    spec = next((r for r in CURATED_REPORTS if r["key"] == spec_key), None)
    if not spec:
        return None

    if not stonex_mcp.is_configured():
        return {"error": "StoneX MCP no configurado"}

    article_id: str | None = None
    matched_title: str | None = None

    try:
        articles = stonex_mcp.list_intel_articles(
            market_id=market_id,
            page_size=50,
            only_primary=False,
        )
        if articles:
            for art in articles:
                if not isinstance(art, dict):
                    continue
                title = art.get("title") or art.get("headline") or ""
                if _looks_like_match(title, spec["title_pattern"]):
                    article_id = (
                        art.get("id")
                        or art.get("articleId")
                        or art.get("uuid")
                    )
                    matched_title = title
                    break
    except Exception as e:
        return {"error": f"Falló list_intel_articles: {type(e).__name__}: {e}"}

    if not article_id:
        # Caemos al UUID del spec — puede estar obsoleto pero es el último
        # conocido en el momento que se configuró el reporte.
        article_id = spec["fallback_id"]

    try:
        article = stonex_mcp.get_intel_article(article_id)
    except Exception as e:
        return {"error": f"Falló get_intel_article: {type(e).__name__}: {e}"}

    if not article:
        return {"error": f"Artículo {article_id} no encontrado en el MCP"}

    # Anotamos cómo lo encontramos para debug/transparencia
    if isinstance(article, dict):
        article["_resolved_via"] = "title_match" if matched_title else "fallback_id"
        article["_resolved_id"] = article_id
        if matched_title:
            article["_matched_title"] = matched_title

    return article


def article_to_markdown(article: dict, spec: dict) -> str:
    """Convierte un artículo a markdown listo para descargar."""
    title = article.get("title") or article.get("headline") or spec["name"]
    published = article.get("publishDate") or article.get("date") or ""
    author = article.get("author") or ""
    abstract = article.get("abstract") or article.get("summary") or ""
    content = article.get("content") or article.get("body") or ""
    url = article.get("url") or ""

    lines = [f"# {title}", ""]
    meta = [b for b in [str(published)[:10], author] if b]
    if meta:
        lines.append(f"*{' · '.join(meta)}*")
        lines.append("")
    if url:
        lines.append(f"Fuente: {url}")
        lines.append("")
    if abstract and abstract.strip() != content.strip():
        lines.append("## Resumen")
        lines.append("")
        lines.append(abstract.strip())
        lines.append("")
    if content:
        lines.append("## Contenido")
        lines.append("")
        lines.append(content.strip())
        lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(f"_Descargado desde CacaoQ · StoneX MI · spec: {spec['key']}_")
    return "\n".join(lines)
