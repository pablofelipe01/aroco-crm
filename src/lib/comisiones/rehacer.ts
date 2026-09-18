import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { parseCsv } from "@/lib/ventas/sheet";
import { parseLiquidacion } from "./hoja";
import { calcularMes, REGLAS_POR_DEFECTO, type Reglas } from "./calcular";

/**
 * Rehace los meses que la hoja nunca alcanzó a dejar en el CRM.
 *
 * La hoja liquida un mes a la vez y Nicolás cierra varios en una sesión, así
 * que abril a julio existen en las operaciones pero nunca quedaron liquidados
 * aquí. Esto los calcula con las reglas de la propia hoja.
 *
 * NO PISA LO QUE VIENE DE LA HOJA. Un mes cerrado por Nicolás es la
 * afirmación de lo que se paga; uno calculado es una reconstrucción. Cuando
 * los dos existen, manda el de la hoja — y al revés nunca.
 *
 * COMPROBADO contra los dos meses que sí estaban:
 *   · septiembre reproduce la liquidación al peso, las dos líneas;
 *   · agosto reproduce a Álvaro exacto y se aparta en John por 2.318, que es
 *     UNA operación —la ODC-64 a Tiempo de Chocolate— que la hoja deja fuera
 *     porque ese cliente no tiene vendedor asignado. Es la misma diferencia
 *     que Nicolás reportó el 15-sep contra su Excel.
 */

export type ResultadoRehacer = {
  calculados: { anio: number; mes: number; total: number; lineas: number }[];
  respetados: { anio: number; mes: number }[];
  sinDatos: { anio: number; mes: number; motivo: string }[];
};

export async function rehacerMesesFaltantes(
  db: SupabaseClient<Database>,
  csvLiquidacion: string,
): Promise<ResultadoRehacer> {
  // Las reglas salen de la hoja, no del código: el umbral, los repartos y el
  // maestro de asignación son decisiones de Comercial y cambian sin avisar.
  const L = parseLiquidacion(parseCsv(csvLiquidacion));
  const reglas: Reglas = {
    ...REGLAS_POR_DEFECTO,
    umbralSeniorTon: L.umbralSeniorTon || REGLAS_POR_DEFECTO.umbralSeniorTon,
    shareVendedor: L.shareVendedor || REGLAS_POR_DEFECTO.shareVendedor,
    shareComprador: L.shareComprador || REGLAS_POR_DEFECTO.shareComprador,
    mercadoPorDefecto: L.mercadoPorDefecto || REGLAS_POR_DEFECTO.mercadoPorDefecto,
    transporteKg: L.transporteKg || REGLAS_POR_DEFECTO.transporteKg,
    seleccionKg: L.seleccionKg || REGLAS_POR_DEFECTO.seleccionKg,
    destinos: Object.fromEntries(L.destinos.map((d) => [d.destino, d.mercado])),
  };

  const { data: ops, error: eOps } = await db
    .from("ventas_operaciones")
    .select(
      "fecha, cliente, origen, odc, recepcion_kg, aroco_kg, disponible_aroco, precio_base_proveedor",
    );
  if (eOps) throw new Error(`ventas_operaciones: ${eOps.message}`);

  const { data: periodos, error: ePer } = await db
    .from("comision_periodos")
    .select("id, anio, mes, origen");
  if (ePer) throw new Error(`comision_periodos: ${ePer.message}`);

  const deLaHoja = new Set(
    (periodos ?? []).filter((p) => p.origen === "hoja").map((p) => `${p.anio}-${p.mes}`),
  );

  const { data: catalogo } = await db
    .from("comision_comerciales")
    .select("nombre, profile_id");
  const perfilDe = new Map(
    (catalogo ?? []).map((c) => [c.nombre.trim().toLowerCase(), c.profile_id]),
  );

  const meses = [
    ...new Set((ops ?? []).filter((o) => o.fecha).map((o) => o.fecha!.slice(0, 7))),
  ].sort();

  const resultado: ResultadoRehacer = { calculados: [], respetados: [], sinDatos: [] };

  for (const ym of meses) {
    const anio = Number(ym.slice(0, 4));
    const mes = Number(ym.slice(5, 7));
    if (deLaHoja.has(`${anio}-${mes}`)) {
      resultado.respetados.push({ anio, mes });
      continue;
    }

    const delMes = (ops ?? [])
      .filter((o) => o.fecha?.startsWith(ym))
      .map((o) => ({
        fecha: o.fecha,
        cliente: o.cliente,
        origen: o.origen,
        destino: o.cliente,
        kg: Number(o.recepcion_kg) || 0,
        disponibleAroco: Number(o.disponible_aroco) || 0,
        arocoKg: Number(o.aroco_kg) || 0,
        precioBaseProveedor: Number(o.precio_base_proveedor) || 0,
        odc: o.odc,
      }));

    const c = calcularMes(delMes, L.maestro, reglas);
    // Un mes donde ninguna operación pasa la regla de entrada no se guarda:
    // una liquidación en ceros se ve igual que un mes en el que nadie cobró, y
    // no es lo mismo.
    if (c.lineas.length === 0 || c.toneladas === 0) {
      resultado.sinDatos.push({
        anio,
        mes,
        motivo: `${c.excluidas.length} operaciones sin los datos que exige la regla de entrada`,
      });
      continue;
    }

    const { data: periodo, error } = await db
      .from("comision_periodos")
      .upsert(
        {
          anio,
          mes,
          mes_nombre: null,
          origen: "crm",
          mercado_por_defecto: reglas.mercadoPorDefecto,
          umbral_senior_ton: reglas.umbralSeniorTon,
          share_vendedor: reglas.shareVendedor,
          share_comprador: reglas.shareComprador,
          transporte_kg: reglas.transporteKg,
          seleccion_kg: reglas.seleccionKg,
          toneladas: c.toneladas,
          utilidad: c.utilidad,
          total_comisiones: c.totalComisiones,
          suma_lineas: c.totalComisiones,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "anio,mes" },
      )
      .select("id")
      .single();
    if (error) throw new Error(`comision_periodos (${ym}): ${error.message}`);

    await db.from("comision_lineas").delete().eq("periodo_id", periodo.id);
    const { error: eLin } = await db.from("comision_lineas").insert(
      c.lineas.map((l) => ({
        periodo_id: periodo.id,
        anio,
        mes,
        origen: "crm",
        comercial: l.comercial,
        profile_id: perfilDe.get(l.comercial.trim().toLowerCase()) ?? null,
        ton_venta: l.tonVenta,
        ton_compra: l.tonCompra,
        ton_total: l.tonTotal,
        nivel: l.nivel,
        pct_techo: l.pctTecho,
        utilidad_venta: l.utilidadVenta,
        utilidad_compra: l.utilidadCompra,
        comision_venta: l.comisionVenta,
        comision_compra: l.comisionCompra,
        total_pagar: l.totalPagar,
      })),
    );
    if (eLin) throw new Error(`comision_lineas (${ym}): ${eLin.message}`);

    resultado.calculados.push({
      anio,
      mes,
      total: c.totalComisiones,
      lineas: c.lineas.length,
    });
  }

  return resultado;
}
