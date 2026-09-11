import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { parseCsv } from "@/lib/ventas/sheet";
import { parseLiquidacion } from "./hoja";

/**
 * Ingesta de la liquidación de comisiones.
 *
 * SE ACUMULA, NO SE REEMPLAZA. La hoja liquida un mes a la vez y Nicolás
 * cierra cada uno cambiando el parámetro «Mes a liquidar». Cada corrida guarda
 * EL MES QUE ESTÉ PUESTO y no toca los demás; un reemplazo total, que es lo
 * que hacen los otros syncs del CRM, borraría el histórico cada vez que
 * alguien mueve ese desplegable.
 *
 * Dentro del mes sí se reemplaza entero: si Nicolás corrige una cifra, aquí
 * tiene que verse corregida y no duplicada.
 */

export type ResultadoComisiones = {
  anio: number;
  mes: number;
  mesNombre: string;
  lineas: number;
  operaciones: number;
  totalComisiones: number;
  sumaLineas: number;
  /** Nombres de la hoja que todavía no corresponden a nadie del equipo. */
  sinAsignar: string[];
  /**
   * Diferencia entre el total de la hoja y la suma de sus líneas, cuando no se
   * explica por redondeo. Se reporta en vez de corregirse: si las dos cifras
   * de la hoja no cuadran entre sí, el problema está en la hoja.
   */
  descuadre: number | null;
};

export async function sincronizarComisiones(
  db: SupabaseClient<Database>,
  csv: string,
): Promise<ResultadoComisiones> {
  const L = parseLiquidacion(parseCsv(csv));

  // ── A quién corresponde cada nombre ──────────────────────────────────────
  const { data: catalogo, error: eCat } = await db
    .from("comision_comerciales")
    .select("nombre, profile_id, es_casa");
  if (eCat) throw new Error(`comision_comerciales: ${eCat.message}`);

  const porNombre = new Map(
    (catalogo ?? []).map((c) => [c.nombre.trim().toLowerCase(), c]),
  );

  // Un nombre nuevo se da de alta SIN asignar en vez de intentar adivinar a
  // quién corresponde: hay dos Johns en el equipo y atribuirle a uno la
  // comisión del otro es peor que dejarla sin dueño.
  const nuevos = L.lineas
    .map((l) => l.comercial.trim())
    .filter((n) => n && !porNombre.has(n.toLowerCase()));
  if (nuevos.length > 0) {
    const { error } = await db
      .from("comision_comerciales")
      .insert([...new Set(nuevos)].map((nombre) => ({ nombre })));
    if (error) throw new Error(`comision_comerciales (alta): ${error.message}`);
    for (const n of nuevos) {
      porNombre.set(n.toLowerCase(), { nombre: n, profile_id: null, es_casa: false });
    }
  }

  const sumaLineas = Math.round(L.lineas.reduce((s, l) => s + l.totalPagar, 0) * 100) / 100;
  // Un peso por línea es lo que puede explicar el redondeo de la hoja: sus
  // celdas se muestran redondeadas y el total se calcula sin redondear.
  const tolerancia = Math.max(1, L.lineas.length);
  const brecha = Math.round((L.totalComisiones - sumaLineas) * 100) / 100;
  const descuadre = Math.abs(brecha) > tolerancia ? brecha : null;

  // ── El periodo ───────────────────────────────────────────────────────────
  const cabecera = {
    anio: L.anio,
    mes: L.mes,
    mes_nombre: L.mesNombre,
    mercado_por_defecto: L.mercadoPorDefecto,
    umbral_senior_ton: L.umbralSeniorTon,
    share_vendedor: L.shareVendedor,
    share_comprador: L.shareComprador,
    transporte_kg: L.transporteKg,
    seleccion_kg: L.seleccionKg,
    toneladas: L.toneladas,
    utilidad: L.utilidad,
    total_comisiones: L.totalComisiones,
    suma_lineas: sumaLineas,
    synced_at: new Date().toISOString(),
  };

  const { data: periodo, error: ePer } = await db
    .from("comision_periodos")
    .upsert(cabecera, { onConflict: "anio,mes" })
    .select("id")
    .single();
  if (ePer) throw new Error(`comision_periodos: ${ePer.message}`);

  // ── Las líneas y el detalle, reemplazados dentro del mes ─────────────────
  const { error: eDelL } = await db
    .from("comision_lineas")
    .delete()
    .eq("periodo_id", periodo.id);
  if (eDelL) throw new Error(`comision_lineas (limpieza): ${eDelL.message}`);

  if (L.lineas.length > 0) {
    const { error } = await db.from("comision_lineas").insert(
      L.lineas.map((l) => ({
        periodo_id: periodo.id,
        // Repetidos en la línea: un comercial no puede leer el periodo, donde
        // está el total del equipo, y necesita saber de qué mes es lo suyo.
        anio: L.anio,
        mes: L.mes,
        comercial: l.comercial,
        profile_id: porNombre.get(l.comercial.trim().toLowerCase())?.profile_id ?? null,
        ton_venta: l.tonVenta,
        ton_compra: l.tonCompra,
        ton_total: l.tonTotal,
        nivel: l.nivel || null,
        pct_techo: l.pctTecho,
        utilidad_venta: l.utilidadVenta,
        utilidad_compra: l.utilidadCompra,
        comision_venta: l.comisionVenta,
        comision_compra: l.comisionCompra,
        total_pagar: l.totalPagar,
      })),
    );
    if (error) throw new Error(`comision_lineas: ${error.message}`);
  }

  const { error: eDelO } = await db
    .from("comision_operaciones")
    .delete()
    .eq("periodo_id", periodo.id);
  if (eDelO) throw new Error(`comision_operaciones (limpieza): ${eDelO.message}`);

  if (L.operaciones.length > 0) {
    const { error } = await db.from("comision_operaciones").insert(
      L.operaciones.map((o, i) => ({
        periodo_id: periodo.id,
        fila: i + 1,
        fecha: o.fecha,
        cliente: o.cliente || null,
        odc: o.odc || null,
        descripcion: o.descripcion || null,
        kg: o.kg,
        utilidad_bruta: o.utilidadBruta,
        proveedor: o.proveedor || null,
        vendedor: o.vendedor || null,
        comprador: o.comprador || null,
        kg_aroco: o.kgAroco,
        costo_transp_selec: o.costoTranspSelec,
        utilidad_neta: o.utilidadNeta,
        remision: o.remision || null,
        destino: o.destino || null,
        mercado: o.mercado || null,
        comision_vendedor: o.comisionVendedor,
        comision_comprador: o.comisionComprador,
      })),
    );
    if (error) throw new Error(`comision_operaciones: ${error.message}`);
  }

  const sinAsignar = L.lineas
    .filter((l) => {
      const c = porNombre.get(l.comercial.trim().toLowerCase());
      return c && !c.es_casa && !c.profile_id;
    })
    .map((l) => l.comercial);

  return {
    anio: L.anio,
    mes: L.mes,
    mesNombre: L.mesNombre,
    lineas: L.lineas.length,
    operaciones: L.operaciones.length,
    totalComisiones: L.totalComisiones,
    sumaLineas,
    sinAsignar: [...new Set(sinAsignar)],
    descuadre,
  };
}
