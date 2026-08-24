"""CacaoQ — UI para carga y visualización del tablero de opciones."""

import streamlit as st
from datetime import date
from config import BARCHART_COCOA_SYMBOL
from parser.options_board_parser import parse_options_board_image
from db.models import upsert_options_board, get_latest_options_board
from mcp_client import barchart as barchart_mcp
from engine.barchart_sync import sync_options_board
import pandas as pd


def _render_barchart_panel():
    """Panel de sincronización del tablero vía Barchart MCP."""
    st.subheader("Sincronización automática (Barchart MCP)")

    # Mostrar success del sync anterior (sobrevive rerun)
    last_result = st.session_state.pop("_barchart_sync_result", None)
    if last_result and last_result.get("ok"):
        st.success(
            f"Tablero sincronizado: {last_result['contract_month']} | "
            f"Underlying: USD {(last_result['underlying_price'] or 0):,.0f} | "
            f"{last_result['strikes_count']} strikes | DTE: {last_result['dte']}"
        )

    if not barchart_mcp.is_configured():
        st.info(
            "Barchart MCP no configurado. Agrega `BARCHART_MCP_URL` y "
            "credenciales en los secrets para activar el pull directo del tablero. "
            "Puedes seguir usando el upload manual abajo."
        )
        return

    # Estado de sesión (caché en session_state para no spamear el MCP)
    if "barchart_expirations" not in st.session_state:
        st.session_state.barchart_expirations = []

    col1, col2, col3 = st.columns([2, 2, 1])
    with col1:
        symbol = st.text_input(
            "Símbolo Barchart",
            value=BARCHART_COCOA_SYMBOL,
            help=(
                "Usa un contrato CONCRETO (ej. CCN26, CCU26, CCZ26). "
                "CC*0 (continuo) NO tiene cadena de opciones — solo precio de futuros. "
                "Códigos de mes: H=Mar, K=May, N=Jul, U=Sep, Z=Dec."
            ),
        )
    with col2:
        exps = st.session_state.barchart_expirations
        if exps:
            options = ["(default)"] + exps
            sel = st.selectbox("Expiración", options, index=0)
            expiration = "" if sel == "(default)" else sel
        else:
            expiration = st.text_input(
                "Expiración (opcional)",
                value="",
                help="Formato YYYY-MM-DD o MM/DD/YY. Vacío = default del símbolo.",
            )
    with col3:
        st.write("")
        st.write("")
        sync_btn = st.button("Sincronizar", type="primary", width="stretch")

    btn_col1, btn_col2 = st.columns(2)
    with btn_col1:
        if st.button("Probar sesión Barchart", width="stretch"):
            with st.spinner("Verificando sesión..."):
                health = barchart_mcp.ping_session()
            if health["ok"]:
                st.success(f"Sesión OK: {health['message']}")
            else:
                st.error(
                    f"Sesión inválida: {health['message']}. "
                    "Posiblemente venció — regenera storage_state.json en el server."
                )
    with btn_col2:
        if st.button("Cargar expiraciones", width="stretch"):
            with st.spinner("Listando expiraciones..."):
                try:
                    exps = barchart_mcp.list_expirations(symbol=symbol)
                    st.session_state.barchart_expirations = exps or []
                    st.success(f"{len(exps or [])} expiraciones disponibles")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error: {e}")

    if sync_btn:
        with st.spinner(f"Trayendo cadena de {symbol}{' ' + expiration if expiration else ''}..."):
            result = sync_options_board(symbol=symbol, expiration=expiration)
        if not result.get("ok"):
            st.error(f"Error: {result.get('error', 'desconocido')}")
            if result.get("diagnosis"):
                st.info(result["diagnosis"])
            with st.expander("Debug — payload Barchart", expanded=False):
                cols = st.columns(2)
                with cols[0]:
                    st.write("**Top-level keys:**")
                    st.code(", ".join(result.get("payload_top_keys") or []))
                    st.write(f"**count:** `{result.get('payload_count')}`")
                with cols[1]:
                    st.write("**source_url:**")
                    st.code(result.get("payload_source_url") or "(none)")
                if result.get("payload_meta"):
                    st.write("**meta:**")
                    st.json(result["payload_meta"])
                if result.get("payload_sample"):
                    st.write("**Muestra de data:**")
                    st.json(result["payload_sample"])
        else:
            st.session_state["_barchart_sync_result"] = result
            st.rerun()


def render_options_upload():
    """Renderiza la página de carga del tablero de opciones."""
    st.header("Tablero de Opciones")

    _render_barchart_panel()

    st.divider()

    # --- Subir imagen (fallback manual) ---
    st.subheader("Upload manual de screenshot (fallback)")
    uploaded = st.file_uploader(
        "Sube la captura del tablero de opciones del broker",
        type=["jpg", "jpeg", "png"],
        help="Captura de pantalla del tablero CCE (Cocoa ICE) con strikes, primas y deltas"
    )

    if uploaded:
        st.image(uploaded, caption="Tablero cargado", width="stretch")

        if st.button("Procesar con IA", type="primary"):
            with st.spinner("Analizando imagen con Claude Vision..."):
                try:
                    image_bytes = uploaded.getvalue()
                    mime = uploaded.type or "image/jpeg"
                    result = parse_options_board_image(image_bytes, mime)

                    if result:
                        today = date.today().isoformat()
                        board_id = upsert_options_board(
                            date=today,
                            contract_month=result["contract_month"],
                            underlying_price=result["underlying_price"],
                            dte=result["dte"],
                            expiration=result["expiration"],
                            volatility_calls=result.get("volatility_calls", 0),
                            volatility_puts=result.get("volatility_puts", 0),
                            interest_rate=result.get("interest_rate", 0),
                            strikes=result["strikes"],
                        )
                        st.success(
                            f"Tablero procesado: {result['contract_month']} | "
                            f"Underlying: USD {result['underlying_price']:,.0f} | "
                            f"{len(result['strikes'])} strikes | DTE: {result['dte']}"
                        )
                        st.rerun()
                    else:
                        st.error("No se pudo parsear la imagen")
                except Exception as e:
                    st.error(f"Error procesando imagen: {e}")

    st.divider()

    # --- Mostrar tablero actual ---
    board = get_latest_options_board()
    if board:
        st.subheader(f"Tablero vigente: {board['contract_month']} ({board['date']})")

        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Underlying", f"USD {board['underlying_price']:,.0f}")
        col2.metric("DTE", f"{board['dte']} días")
        col3.metric("Vol Calls", f"{board['volatility_calls']:.1f}%")
        col4.metric("Vol Puts", f"{board['volatility_puts']:.1f}%")

        # Tabla de opciones
        strikes = board["strikes"]
        if strikes:
            df = pd.DataFrame(strikes)[["strike", "call_premium", "call_delta", "put_premium", "put_delta"]]
            df.columns = ["Strike", "Call Prima", "Call Delta", "Put Prima", "Put Delta"]

            # Resaltar strikes cercanos al precio actual
            underlying = board["underlying_price"]

            st.dataframe(
                df.style.format({
                    "Strike": "{:,.0f}",
                    "Call Prima": "{:,.0f}",
                    "Call Delta": "{:.2f}",
                    "Put Prima": "{:,.0f}",
                    "Put Delta": "{:.2f}",
                }),
                height=500,
            )

            # Resumen rápido de opciones ATM
            atm = min(strikes, key=lambda s: abs(s["strike"] - underlying))
            st.info(
                f"**ATM (Strike {atm['strike']:,.0f})**: "
                f"Call = {atm['call_premium']:,.0f} (Δ{atm['call_delta']:.1f}) | "
                f"Put = {atm['put_premium']:,.0f} (Δ{atm['put_delta']:.1f})"
            )
    else:
        st.info("No hay tablero de opciones cargado. Sube una captura para comenzar.")
