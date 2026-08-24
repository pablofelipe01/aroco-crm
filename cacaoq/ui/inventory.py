"""CacaoQ — UI de inventario físico y ventas locales."""

import streamlit as st
import pandas as pd
from datetime import date, datetime
from config import REGIONES_CACAO, ESTADOS_INVENTARIO, PROVEEDORES_DEFAULT
from db.models import (
    insert_inventory, get_all_inventory, get_active_inventory,
    update_inventory, delete_inventory,
    insert_local_sale, get_all_local_sales, get_sales_summary,
    get_total_sold_tonnes, delete_local_sale,
)
from mcp_client import inventory as inventory_mcp
from engine.inventory_sync import sync_from_sheet


def _render_sheet_sync_panel():
    """Panel de sincronización desde Google Sheet vía Inventory MCP."""
    # Mostrar resultado de sync anterior (sobrevive a st.rerun)
    last_result = st.session_state.pop("_inv_sync_result", None)
    if last_result:
        if last_result.get("ok"):
            r = last_result
            st.success(
                f"Sincronizado: {r['inserted']} insertadas, "
                f"{r['updated']} actualizadas, "
                f"{r['skipped']} omitidas "
                f"({r['rows_read']} filas leídas)"
            )
            if not r.get("price_column_detected"):
                st.warning(
                    f"No se detectó columna de precio. "
                    f"{r.get('no_price_count', 0)} fila(s) con precio = 0."
                )
            if r.get("errors"):
                st.warning("Errores parciales:")
                for err in r["errors"]:
                    st.text(f"  - {err}")
        else:
            st.error(f"Error: {last_result.get('error', 'desconocido')}")

    with st.expander("Sincronizar desde Google Sheet (Inventory MCP)", expanded=False):
        if not inventory_mcp.is_configured():
            st.info(
                "Inventory MCP no configurado. Agrega `INVENTORY_MCP_URL` y "
                "credenciales en los secrets para activar la sincronización con "
                "la Google Sheet."
            )
            return

        col1, col2, col3, col4 = st.columns([2, 1, 1, 1])
        with col1:
            worksheet = st.text_input(
                "Hoja (worksheet)",
                value="",
                help="Vacío = hoja por defecto del MCP (Inventario de disponobilidad).",
            )
        with col2:
            header_row_raw = st.text_input(
                "Fila headers",
                value="",
                help="Vacío = autodetectar.",
            )
        with col3:
            limit_raw = st.text_input(
                "Limit",
                value="100",
                help="Tope de filas a leer (evita timeouts en sheets grandes). Vacío = sin límite.",
            )
        with col4:
            st.write("")
            st.write("")
            sync_btn = st.button("Sincronizar", type="primary", width="stretch")

        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            if st.button("Probar conexión", width="stretch"):
                with st.spinner("Pinging MCP..."):
                    health = inventory_mcp.ping()
                if health["ok"]:
                    st.success(f"MCP OK: {health['message']}")
                else:
                    st.error(f"MCP error: {health['message']}")
        with btn_col2:
            if st.button("Ver hojas disponibles", width="stretch"):
                with st.spinner("Obteniendo info de la sheet..."):
                    try:
                        info = inventory_mcp.get_sheet_info()
                        st.json(info)
                    except Exception as e:
                        st.error(f"Error: {e}")

        if sync_btn:
            header_row = None
            if header_row_raw.strip():
                try:
                    header_row = int(header_row_raw.strip())
                except ValueError:
                    st.error("Fila de headers debe ser un número")
                    return
            limit = None
            if limit_raw.strip():
                try:
                    limit = int(limit_raw.strip())
                except ValueError:
                    st.error("Limit debe ser un número o vacío")
                    return

            # Wrap everything: nunca quedarse sin mensaje
            result = None
            try:
                with st.spinner("Sincronizando inventario desde la Sheet..."):
                    result = sync_from_sheet(
                        worksheet_name=worksheet or None,
                        header_row=header_row,
                        limit=limit,
                    )
            except Exception as e:
                st.error(f"Excepción no capturada: {type(e).__name__}: {e}")
                import traceback
                with st.expander("Traceback"):
                    st.code(traceback.format_exc())
                return

            if result is None:
                st.error("Sync devolvió None (no debería pasar). Revisar logs.")
                return

            # Guardar resultado en session_state para que sobreviva al rerun
            # y los métricos arriba se actualicen con los nuevos datos.
            st.session_state["_inv_sync_result"] = result
            if result.get("ok"):
                st.rerun()
            else:
                # En caso de error mantenemos el panel abierto sin rerun
                # para que el usuario vea los headers y colmap detectados.
                st.error(f"Error: {result.get('error', 'desconocido')}")
                if result.get("headers_found"):
                    st.caption("Headers detectados:")
                    st.code(", ".join(result["headers_found"]))
                if result.get("colmap"):
                    st.caption("Mapeo parcial:")
                    st.json(result["colmap"])


def render_inventory():
    """Renderiza la página de inventario físico."""
    st.header("Inventario Físico de Cacao")

    _render_sheet_sync_panel()

    # --- Métricas resumen ---
    inventory = get_active_inventory()
    sales = get_sales_summary()
    sold = sales["total_tonnes"]

    if inventory:
        df = pd.DataFrame(inventory)
        by_status = df.groupby("status")["tonnes"].sum()
        total = df["tonnes"].sum()
        net = total - sold

        cols = st.columns(6)
        cols[0].metric("Total Comprado", f"{total:.1f} ton")
        cols[1].metric("Vendido Local", f"{sold:.1f} ton", delta=f"-{sold:.1f}" if sold > 0 else None, delta_color="inverse")
        cols[2].metric("Neto (Exposición)", f"{net:.1f} ton")
        for i, status in enumerate(["bodega", "tránsito", "puerto"], 3):
            val = by_status.get(status, 0)
            if i < len(cols):
                cols[i].metric(status.capitalize(), f"{val:.1f} ton")

    st.divider()

    tab_compras, tab_ventas = st.tabs(["Compras", "Ventas Locales"])

    # ═══════════════════════════════════════════════════════════════
    # TAB COMPRAS
    # ═══════════════════════════════════════════════════════════════
    with tab_compras:
        # --- Formulario de nueva compra ---
        with st.expander("Registrar Nueva Compra", expanded=False):
            with st.form("new_purchase", clear_on_submit=True):
                col1, col2, col3 = st.columns(3)
                with col1:
                    purchase_date = st.date_input("Fecha de compra", value=date.today())
                    tonnes = st.number_input("Toneladas", min_value=0.1, max_value=1000.0,
                                             value=1.0, step=0.5)
                with col2:
                    price_cop = st.number_input("Precio (COP/kg)", min_value=1000,
                                                max_value=100000, value=12000, step=500)
                    supplier = st.selectbox("Proveedor", [""] + PROVEEDORES_DEFAULT)
                with col3:
                    region = st.selectbox("Región", [""] + REGIONES_CACAO)
                    status = st.selectbox("Estado", ESTADOS_INVENTARIO)

                shipment_date = st.date_input("Fecha estimada de embarque", value=None)
                notes = st.text_area("Notas", max_chars=500)

                submitted = st.form_submit_button("Registrar Compra", type="primary")
                if submitted:
                    insert_inventory(
                        date=str(purchase_date),
                        tonnes=tonnes,
                        price_cop_kg=price_cop,
                        supplier=supplier or None,
                        region=region or None,
                        status=status,
                        shipment_date=str(shipment_date) if shipment_date else None,
                        notes=notes or None,
                    )
                    st.success(f"Compra registrada: {tonnes} ton a COP {price_cop:,.0f}/kg")
                    st.rerun()

        # --- Registros de inventario ---
        all_inv = get_all_inventory()
        if not all_inv:
            st.info("No hay registros de inventario. Registra tu primera compra arriba.")
        else:
            for item in all_inv:
                item_id = item["id"]
                with st.expander(
                    f"**#{item_id}** | {item['date']} | {item['tonnes']} ton | "
                    f"{item['status'].upper()} | COP {item['price_cop_kg']:,.0f}/kg"
                    f"{' — ' + item['supplier'] if item.get('supplier') else ''}"
                ):
                    with st.form(f"edit_{item_id}"):
                        col1, col2, col3 = st.columns(3)
                        with col1:
                            edit_date = st.date_input(
                                "Fecha",
                                value=datetime.strptime(item["date"], "%Y-%m-%d").date(),
                                key=f"date_{item_id}",
                            )
                            edit_tonnes = st.number_input(
                                "Toneladas", min_value=0.1, max_value=1000.0,
                                value=float(item["tonnes"]), step=0.5,
                                key=f"ton_{item_id}",
                            )
                        with col2:
                            edit_price = st.number_input(
                                "Precio (COP/kg)", min_value=1000, max_value=100000,
                                value=int(item["price_cop_kg"]), step=500,
                                key=f"price_{item_id}",
                            )
                            current_supplier = item.get("supplier") or ""
                            supplier_options = [""] + PROVEEDORES_DEFAULT
                            supplier_idx = supplier_options.index(current_supplier) if current_supplier in supplier_options else 0
                            edit_supplier = st.selectbox(
                                "Proveedor", supplier_options,
                                index=supplier_idx, key=f"sup_{item_id}",
                            )
                        with col3:
                            current_region = item.get("region") or ""
                            region_options = [""] + REGIONES_CACAO
                            region_idx = region_options.index(current_region) if current_region in region_options else 0
                            edit_region = st.selectbox(
                                "Región", region_options,
                                index=region_idx, key=f"reg_{item_id}",
                            )
                            status_idx = ESTADOS_INVENTARIO.index(item["status"]) if item["status"] in ESTADOS_INVENTARIO else 0
                            edit_status = st.selectbox(
                                "Estado", ESTADOS_INVENTARIO,
                                index=status_idx, key=f"st_{item_id}",
                            )

                        ship_val = None
                        if item.get("shipment_date"):
                            try:
                                ship_val = datetime.strptime(item["shipment_date"], "%Y-%m-%d").date()
                            except ValueError:
                                pass
                        edit_shipment = st.date_input(
                            "Fecha embarque", value=ship_val, key=f"ship_{item_id}",
                        )
                        edit_notes = st.text_area(
                            "Notas", value=item.get("notes") or "",
                            max_chars=500, key=f"notes_{item_id}",
                        )

                        btn_col1, btn_col2 = st.columns([3, 1])
                        with btn_col1:
                            save = st.form_submit_button("Guardar cambios", type="primary")
                        with btn_col2:
                            remove = st.form_submit_button("Eliminar", type="secondary")

                        if save:
                            update_inventory(
                                inventory_id=item_id,
                                date=str(edit_date),
                                tonnes=edit_tonnes,
                                price_cop_kg=edit_price,
                                supplier=edit_supplier or None,
                                region=edit_region or None,
                                status=edit_status,
                                shipment_date=str(edit_shipment) if edit_shipment else None,
                                notes=edit_notes or None,
                            )
                            st.success(f"Registro #{item_id} actualizado")
                            st.rerun()

                        if remove:
                            delete_inventory(item_id)
                            st.warning(f"Registro #{item_id} eliminado")
                            st.rerun()

    # ═══════════════════════════════════════════════════════════════
    # TAB VENTAS LOCALES
    # ═══════════════════════════════════════════════════════════════
    with tab_ventas:
        st.subheader("Registrar Venta Local")

        # Opciones de inventario para asociar la venta
        all_inv = get_all_inventory()
        inv_options = {f"#{i['id']} — {i['date']} — {i['tonnes']} ton ({i['status']})": i["id"] for i in all_inv}

        with st.form("new_sale", clear_on_submit=True):
            col1, col2 = st.columns(2)
            with col1:
                sale_date = st.date_input("Fecha de venta", value=date.today())
                sale_tonnes = st.number_input("Toneladas vendidas", min_value=0.1,
                                              max_value=1000.0, value=1.0, step=0.5)
                sale_price = st.number_input("Precio de venta (COP/kg)", min_value=1000,
                                             max_value=100000, value=12000, step=500)
            with col2:
                inv_ref = st.selectbox(
                    "Lote de inventario (opcional)",
                    ["Sin asociar"] + list(inv_options.keys()),
                )
                buyer = st.text_input("Comprador")
                sale_notes = st.text_area("Notas de la venta", max_chars=500)

            sale_submitted = st.form_submit_button("Registrar Venta", type="primary")
            if sale_submitted:
                inv_id = inv_options.get(inv_ref) if inv_ref != "Sin asociar" else None
                insert_local_sale(
                    date=str(sale_date),
                    tonnes=sale_tonnes,
                    price_cop_kg=sale_price,
                    inventory_id=inv_id,
                    buyer=buyer or None,
                    notes=sale_notes or None,
                )
                st.success(
                    f"Venta registrada: {sale_tonnes} ton a COP {sale_price:,.0f}/kg"
                    f"{' — ' + buyer if buyer else ''}"
                )
                st.rerun()

        st.divider()

        # --- Resumen de ventas ---
        if sales["num_sales"] > 0:
            cols = st.columns(3)
            cols[0].metric("Total Vendido", f"{sales['total_tonnes']:.1f} ton")
            cols[1].metric("Precio Promedio", f"COP {sales['avg_price_cop_kg']:,.0f}/kg")
            cols[2].metric("Ingresos Totales", f"COP {sales['total_revenue_cop']:,.0f}")

        # --- Historial de ventas ---
        all_sales = get_all_local_sales()
        if all_sales:
            st.subheader("Historial de Ventas")
            for sale in all_sales:
                sale_id = sale["id"]
                inv_ref_text = f" (Lote #{sale['inventory_id']})" if sale.get("inventory_id") else ""
                with st.expander(
                    f"**#{sale_id}** | {sale['date']} | {sale['tonnes']} ton | "
                    f"COP {sale['price_cop_kg']:,.0f}/kg"
                    f"{' — ' + sale['buyer'] if sale.get('buyer') else ''}"
                    f"{inv_ref_text}"
                ):
                    if sale.get("notes"):
                        st.write(sale["notes"])
                    if st.button(f"Eliminar venta #{sale_id}", key=f"del_sale_{sale_id}"):
                        delete_local_sale(sale_id)
                        st.warning(f"Venta #{sale_id} eliminada")
                        st.rerun()
        else:
            st.info("No hay ventas locales registradas.")
