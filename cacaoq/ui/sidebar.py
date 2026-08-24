"""CacaoQ — Componente sidebar con métricas rápidas y navegación."""

import streamlit as st
from db.models import get_latest_market_price, get_latest_trm, get_latest_balance
from data.fx import get_usdcop_spot
from engine.risk import compute_risk


def _num(value, default=None):
    """Valor numérico o `default`.

    Las columnas del statement (net_liquidating_value, strike, etc.) pueden venir
    NULL desde el MCP, y `dict.get(k, 0)` devuelve None cuando la clave existe con
    valor nulo — lo que rompe el formateo `f"{v:,.2f}"`.
    """
    return default if value is None else value


def render_sidebar() -> str:
    """Renderiza el sidebar y retorna la página seleccionada."""
    with st.sidebar:
        st.title("CacaoQ")
        st.caption("Gestión de Riesgo — AROCO SAS")

        st.divider()

        # --- Métricas rápidas ---
        market = get_latest_market_price()
        trm_data = get_latest_trm()
        spot = get_usdcop_spot()
        balance = get_latest_balance()

        if market and _num(market.get("close_price")) is not None:
            st.metric("Cacao ICE NY", f"USD {market['close_price']:,.0f}/ton")

        if spot:
            delta_vs_trm = None
            if trm_data and _num(trm_data.get("trm")) is not None:
                delta_vs_trm = spot["rate"] - trm_data["trm"]
            st.metric(
                "USD/COP Spot",
                f"${spot['rate']:,.2f}",
                delta=f"{delta_vs_trm:+,.2f} vs TRM" if delta_vs_trm else None,
                delta_color="inverse",
            )
        elif trm_data:
            st.metric("TRM", f"COP {trm_data['trm']:,.2f}")

        if balance:
            # El MCP no siempre trae net_liquidating_value; caer a total_equity.
            nlv = _num(balance.get("net_liquidating_value"))
            if nlv is None:
                nlv = _num(balance.get("total_equity"))
            prior = _num(balance.get("prior_net_liquidating_value"))
            delta = nlv - prior if (nlv is not None and prior) else None
            if nlv is not None:
                st.metric(
                    "Net Liq Value",
                    f"USD {nlv:,.2f}",
                    delta=f"USD {delta:,.2f}" if delta else None,
                )
            excess = _num(balance.get("excess_equity"))
            if excess is not None:
                st.metric("Excess Equity", f"USD {excess:,.2f}")

        # Cobertura
        try:
            risk = compute_risk()
            coverage = risk["hedge"]["coverage_pct"]
            total = risk["physical"]["total_tonnes"]
            if total > 0:
                st.metric("Cobertura", f"{coverage:.0f}%")
                st.progress(min(coverage / 100, 1.0))
        except Exception:
            pass

        st.divider()

        # --- Navegación ---
        page = st.radio(
            "Navegación",
            ["Chat", "Inventario", "Opciones", "Statements", "Reportes", "Configuración"],
            label_visibility="collapsed",
        )

        st.divider()

        # --- Actualizar datos ---
        if st.button("Actualizar Datos de Mercado", width="stretch"):
            with st.spinner("Actualizando..."):
                try:
                    from data.fetcher import refresh_market_data
                    result = refresh_market_data()
                    if result["cacao"]:
                        st.success(f"Cacao: USD {result['cacao']['close']:,.0f}")
                    if result.get("usdcop_spot"):
                        st.success(f"USD/COP: ${result['usdcop_spot']['rate']:,.2f}")
                    elif result["trm"]:
                        st.success(f"TRM: {result['trm']['trm']:,.2f}")
                    if not result["cacao"] and not result["trm"]:
                        st.warning("No se pudieron obtener datos")
                    st.rerun()
                except Exception as e:
                    st.error(f"Error: {e}")

        return page
