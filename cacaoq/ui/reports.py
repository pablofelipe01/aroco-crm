"""CacaoQ — Página de Reportes curados de StoneX MI."""

from datetime import date as _date

import streamlit as st

from engine.curated_reports import (
    CURATED_REPORTS, fetch_latest_report, article_to_markdown,
)
from mcp_client import stonex as stonex_mcp


def _render_report_tab(spec: dict):
    """Renderiza un reporte: metadata + contenido + descarga + refresh."""
    cache_key = f"_report_{spec['key']}"
    article = st.session_state.get(cache_key)

    # Auto-fetch en primera apertura de la pestaña
    if article is None:
        with st.spinner(f"Trayendo {spec['name']}..."):
            article = fetch_latest_report(spec["key"])
        st.session_state[cache_key] = article

    st.caption(spec["description"])

    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("Actualizar", key=f"refresh_{spec['key']}", type="primary"):
            with st.spinner(f"Actualizando {spec['name']}..."):
                st.session_state[cache_key] = fetch_latest_report(spec["key"])
            st.rerun()

    if not article:
        st.warning("No se pudo cargar el reporte.")
        return

    if article.get("error"):
        st.error(article["error"])
        return

    # Metadata
    title = article.get("title") or article.get("headline") or spec["name"]
    published = article.get("publishDate") or article.get("date") or ""
    author = article.get("author") or ""
    url = article.get("url") or ""
    resolved_via = article.get("_resolved_via")

    st.subheader(title)
    meta_bits = [b for b in [str(published)[:10], author] if b]
    if meta_bits:
        st.caption(" · ".join(meta_bits))

    if resolved_via == "fallback_id":
        st.warning(
            "Búsqueda por título no encontró match — se cargó el UUID de "
            "fallback. Puede no ser la última edición. Revisar el spec en "
            "`engine/curated_reports.py` si esto persiste."
        )

    if url:
        st.caption(f"[Ver en intel.stonex.com]({url})")

    st.divider()

    # Descarga
    md = article_to_markdown(article, spec)
    pub_iso = (str(published)[:10] if published else _date.today().isoformat())
    filename = f"{spec['key']}_{pub_iso}.md"
    st.download_button(
        label=f"📥 Descargar {spec['name']} (.md)",
        data=md,
        file_name=filename,
        mime="text/markdown",
        key=f"dl_{spec['key']}",
    )

    st.divider()

    # Resumen (si es distinto del contenido)
    abstract = (article.get("abstract") or article.get("summary") or "").strip()
    content = (article.get("content") or article.get("body") or "").strip()
    if abstract and abstract != content:
        st.markdown("### Resumen")
        st.markdown(abstract)
        st.divider()

    if content:
        st.markdown("### Contenido")
        st.markdown(content)
    else:
        st.info("El artículo no trae contenido completo desde el MCP.")


def render_reports():
    """Renderiza la página de Reportes curados."""
    st.header("Reportes StoneX")

    if not stonex_mcp.is_configured():
        st.error(
            "StoneX MCP no configurado. Configura `STONEX_MCP_URL` y "
            "credenciales en los secrets para acceder a los reportes."
        )
        return

    st.caption(
        "Reportes recurrentes del StoneX Market Intelligence. "
        "Se busca el último número por patrón de título; si no aparece, "
        "se usa el UUID de fallback registrado en el spec."
    )

    tab_names = [r["name"] for r in CURATED_REPORTS]
    tabs = st.tabs(tab_names)
    for tab, spec in zip(tabs, CURATED_REPORTS):
        with tab:
            _render_report_tab(spec)
