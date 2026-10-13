import type { CotizadorInput } from "@/lib/calc/cotizador";
import type { Quote } from "@/lib/types/database";

/** Fila guardada → entrada del cotizador. La usan el PDF interno y el del cliente. */
export function rowToInput(q: Quote): CotizadorInput {
  return {
    incoterm: q.incoterm,
    trm: q.trm,
    precioCompraKg: q.purchase_price_cop_kg,
    cocoaUsdT: q.cocoa_usd_t,
    diferencial: q.differential,
    volumenTM: q.volume_tm,
    comisionPct: q.commission_pct,
    transporteBodega: q.transporte_bodega,
    seleccion: q.seleccion,
    fumigacion: q.fumigacion,
    estibas: q.estibas,
    costales: q.costales,
    coberturas: q.coberturas,
    costosExportacion: q.costos_exportacion,
    fncPct: q.fnc_pct,
    mermaPct: q.merma_pct,
    factorNacional: q.factor_nacional,
    bonifCalidadPct: q.bonif_calidad_pct,
    bonifCalidadProveedorPct: q.bonif_calidad_proveedor_pct,
    bonifCadmio: q.bonif_cadmio,
    bonifTrazabilidad: q.bonif_trazabilidad,
    bonifTransporte: q.bonif_transporte,
  };
}
