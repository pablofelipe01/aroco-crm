import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { parseCsv } from "./sheet";
import { parseOperaciones } from "./operaciones";

/**
 * Ingesta del margen por operación desde «VENTAS 2026».
 *
 * Reemplazo completo, como el sync de ventas: la hoja es la fuente de verdad y
 * una fila que desaparece de ella tiene que desaparecer del CRM. A diferencia
 * de la liquidación de comisiones (0087), aquí NO hay que acumular nada —
 * la pestaña trae el año entero de una vez, no un mes a la vez.
 */

export type ResultadoOperaciones = {
  operaciones: number;
  descartadas: { fila: number; motivo: string }[];
  /**
   * Filas donde la cadena del proveedor no cuadra consigo misma. Es la señal
   * de que la hoja cambió de forma y se está leyendo una columna equivocada,
   * así que se reporta en vez de guardarse en silencio.
   */
  descuadres: { fila: number; odc: string; esperado: number; encontrado: number }[];
};

export async function sincronizarOperaciones(
  db: SupabaseClient<Database>,
  csv: string,
): Promise<ResultadoOperaciones> {
  const { operaciones, descartadas, descuadres } = parseOperaciones(parseCsv(csv));
  if (operaciones.length === 0) {
    throw new Error(
      "0 operaciones leídas — la estructura de «VENTAS 2026» pudo cambiar.",
    );
  }

  const porFila = new Map(descuadres.map((d) => [d.fila, d]));
  const ahora = new Date().toISOString();

  const filas = operaciones.map((o) => {
    const d = porFila.get(o.fila);
    return {
      fila: o.fila,
      fecha: o.fecha,
      cliente: o.cliente || null,
      odc: o.odc,
      remision_aroco: o.remisionAroco || null,
      recepcion: o.recepcion || null,
      origen: o.origen || null,
      peso_remision_kg: o.pesoRemisionKg,
      aroco_kg: o.arocoKg,
      recepcion_kg: o.recepcionKg,
      valor_kilo_negociado: o.valorKiloNegociado,
      valor_total: o.valorTotal,
      valor_bonificacion: o.valorBonificacion,
      valor_a_pagar: o.valorAPagar,
      precio_base_proveedor: o.precioBaseProveedor,
      pago_base: o.pagoBase,
      descuento_humedad: o.descuentoHumedad,
      bonificacion_proveedor: o.bonificacionProveedor,
      retenciones: o.retenciones,
      pago_proveedor: o.pagoProveedor,
      a_favor_aroco: o.aFavorAroco,
      comision_flete: o.comisionFlete,
      comision_sostenible: o.comisionSostenible,
      disponible_aroco: o.disponibleAroco,
      costo_transporte_seleccion: o.costoTransporteSeleccion,
      utilidad: o.utilidad,
      venta_60: o.venta60,
      compra_40: o.compra40,
      // Se guarda en la propia fila: quien la mire en una consulta ve que esa
      // cifra no es de fiar sin tener que ir al registro del sync.
      descuadre: d ? Math.round((d.encontrado - d.esperado) * 100) / 100 : null,
      synced_at: ahora,
    };
  });

  const { error } = await db
    .from("ventas_operaciones")
    .upsert(filas, { onConflict: "fila" });
  if (error) throw new Error(`ventas_operaciones: ${error.message}`);

  // Barrido: lo que ya no está en la hoja no puede quedarse en el CRM.
  const vigentes = filas.map((f) => f.fila);
  const { error: eDel } = await db
    .from("ventas_operaciones")
    .delete()
    .not("fila", "in", `(${vigentes.join(",")})`);
  if (eDel) throw new Error(`ventas_operaciones (barrido): ${eDel.message}`);

  return { operaciones: filas.length, descartadas, descuadres };
}
