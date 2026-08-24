"""CacaoQ — Vista de upload y parseo de statements StoneX."""

from datetime import date, timedelta

import streamlit as st
import pandas as pd
from pathlib import Path
from config import STATEMENTS_DIR
from parser.stonex_parser import parse_and_store
from db.models import get_all_processed_statements, get_positions_by_date, get_latest_balance
from mcp_client import stonex as stonex_mcp
from engine.stonex_sync import sync_latest_statement


def _render_mcp_panel():
    """Panel de sincronización vía StoneX MCP."""
    st.subheader("Sincronización automática (StoneX MCP)")

    if not stonex_mcp.is_configured():
        st.info(
            "StoneX MCP no configurado. Agrega `STONEX_MCP_URL` y "
            "`STONEX_MCP_TOKEN` (o credenciales CF Access) en los secrets "
            "para activar la sincronización directa. Puedes seguir usando "
            "el upload manual abajo."
        )
        return

    col1, col2, col3 = st.columns([2, 2, 1])
    with col1:
        target_date = st.date_input(
            "Fecha del statement",
            value=date.today() - timedelta(days=1),
            help="Por defecto, ayer (último statement disponible).",
        )
    with col2:
        force = st.checkbox(
            "Forzar re-sync",
            value=False,
            help="Ignora dedup y vuelve a insertar (puede crear duplicados).",
        )
    with col3:
        st.write("")  # spacer para alinear el botón
        st.write("")
        sync_btn = st.button("Sincronizar", type="primary", width="stretch")

    health_col, _ = st.columns([1, 3])
    with health_col:
        if st.button("Probar conexión", width="stretch"):
            with st.spinner("Pinging MCP..."):
                result = stonex_mcp.ping()
            if result["ok"]:
                st.success(f"MCP OK: {result['message']}")
            else:
                st.error(f"MCP error: {result['message']}")

    if sync_btn:
        with st.spinner(f"Sincronizando statement de {target_date}..."):
            result = sync_latest_statement(
                date_str=str(target_date),
                force=force,
            )
        if not result.get("ok"):
            st.error(f"Error: {result.get('error', 'desconocido')}")
        elif result.get("already_processed"):
            st.warning(
                f"Ya existía un statement procesado para "
                f"{result['date']} / {result['account']}. "
                "Marca 'Forzar re-sync' si quieres reemplazarlo."
            )
        else:
            st.success(
                f"Statement sincronizado: {result['date']} | "
                f"Cuenta: {result['account']} | "
                f"Posiciones: {result['positions_count']}"
            )
            st.rerun()


def render_statement_view():
    """Renderiza la página de statements."""
    st.header("Statements StoneX")

    _render_mcp_panel()

    st.divider()

    # --- Upload manual de PDF (fallback) ---
    st.subheader("Upload manual de PDF (fallback)")
    uploaded = st.file_uploader(
        "Sube un Daily Statement de StoneX (PDF)",
        type=["pdf"],
        help="Usa esto si el MCP no está disponible o quieres procesar un archivo histórico."
    )

    if uploaded:
        # Guardar archivo temporalmente
        STATEMENTS_DIR.mkdir(parents=True, exist_ok=True)
        save_path = STATEMENTS_DIR / uploaded.name
        save_path.write_bytes(uploaded.getvalue())

        with st.spinner("Parseando statement..."):
            try:
                result = parse_and_store(str(save_path))

                if result.get("already_processed"):
                    st.warning(
                        f"Este statement ya fue procesado anteriormente "
                        f"({result['filename']}, {result['date']})"
                    )
                else:
                    st.success(
                        f"Statement procesado: {result['date']} | "
                        f"Cuenta: {result['account']} | "
                        f"Posiciones: {len(result['positions'])}"
                    )

                # Mostrar resultado del parseo
                _show_parse_result(result)

            except Exception as e:
                st.error(f"Error parseando el PDF: {e}")

    st.divider()

    # --- Statements procesados ---
    st.subheader("Statements Procesados")
    processed = get_all_processed_statements()
    if processed:
        df = pd.DataFrame(processed)
        st.dataframe(
            df[["filename", "statement_date", "account", "num_positions", "processed_at"]].rename(
                columns={
                    "filename": "Archivo",
                    "statement_date": "Fecha",
                    "account": "Cuenta",
                    "num_positions": "Posiciones",
                    "processed_at": "Procesado",
                }
            ),
            hide_index=True,
        )

        # Ver posiciones de un statement
        dates = sorted(set(s["statement_date"] for s in processed), reverse=True)
        selected_date = st.selectbox("Ver posiciones del:", dates)
        if selected_date:
            _show_positions(selected_date)
    else:
        st.info("No se han procesado statements aún. Sube un PDF arriba.")


def _show_parse_result(result: dict):
    """Muestra el resultado del parseo de un statement."""
    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Posiciones")
        if result["positions"]:
            for pos in result["positions"]:
                side = "LONG" if (pos["long_qty"] or 0) > 0 else "SHORT"
                qty = pos["long_qty"] or pos["short_qty"]
                icon = "+" if pos["dr_cr"] == "CR" else "-"
                # strike es NULL en futuros; market_value puede faltar en el MCP.
                strike = pos["strike"]
                strike_txt = f"{strike:,.0f}" if strike is not None else "—"
                mv = pos["market_value"] or 0
                st.markdown(
                    f"**{qty} {pos['option_type']} {side}** | "
                    f"Strike: {strike_txt} | "
                    f"Mes: {pos['contract_month']} | "
                    f"Settle: {pos['settle_price']} | "
                    f"Valor: {icon}USD {mv:,.2f}"
                )
        else:
            st.write("Sin posiciones")

    with col2:
        st.subheader("Balance")
        bal = result.get("balance", {})
        if bal:
            for key, label in [
                ("net_liquidating_value", "Net Liquidating Value"),
                ("total_equity", "Total Equity"),
                ("net_option_value", "Valor Neto Opciones"),
                ("excess_equity", "Equity Disponible"),
                ("initial_margin", "Margen Inicial"),
                ("market_variance", "Varianza del Mercado"),
            ]:
                val = bal.get(key, 0)
                if val is not None:
                    color = "green" if val >= 0 else "red"
                    st.markdown(f"**{label}**: :{color}[USD {val:,.2f}]")

        # P&L
        pnl = result.get("pnl", {})
        if pnl:
            st.markdown("---")
            mtd = pnl.get("realized_pnl_mtd") or 0
            ytd = pnl.get("realized_pnl_ytd") or 0
            st.markdown(f"**P&L Realizado MTD**: USD {mtd:,.2f}")
            st.markdown(f"**P&L Realizado YTD**: USD {ytd:,.2f}")


def _show_positions(statement_date: str):
    """Muestra posiciones de una fecha específica."""
    positions = get_positions_by_date(statement_date)
    if positions:
        df = pd.DataFrame(positions)
        display_cols = ["option_type", "long_qty", "short_qty", "contract_month",
                        "strike", "settle_price", "market_value", "dr_cr"]
        col_names = {
            "option_type": "Tipo", "long_qty": "Long", "short_qty": "Short",
            "contract_month": "Mes", "strike": "Strike",
            "settle_price": "Settle", "market_value": "Valor", "dr_cr": "DR/CR",
        }
        st.dataframe(
            df[display_cols].rename(columns=col_names),
            hide_index=True,
        )
