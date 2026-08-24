/**
 * Posición de inventario para consumo externo (CacaoQ).
 *
 * CacaoQ calcula exposición no cubierta y P&L contra el mercado, y para eso
 * necesita tres cosas por lote: cuánto hay, a qué precio se compró y en qué
 * estado está. Hoy las saca de la misma hoja de Google que el CRM, con un
 * emparejamiento de columnas por aproximación — dos parsers distintos sobre la
 * misma hoja que van a divergir. Este contrato lo reemplaza: el CRM ya
 * reconcilió la hoja y publica el resultado.
 *
 * Tres decisiones de forma, todas para evitar errores que ya nos costaron:
 *
 *   · Las unidades van en el NOMBRE del campo (`kg_disponible`, `toneladas`).
 *     El campo de CacaoQ se llama `tonnes` y su heurística lo puede llenar con
 *     una columna en kilos; en el motor de riesgo eso es un error de 1000×, y
 *     no se ve —da un número plausible— hasta que alguien compara contra la
 *     realidad.
 *   · Cada lote trae un `id` estable derivado de su identidad real. CacaoQ hoy
 *     deduplica por número de fila del sheet: insertar una fila en el medio le
 *     corre la identidad a todas las de abajo y el upsert sobrescribe lo que no
 *     era.
 *   · Las fechas salen en ISO. El `_coerce_date` de CacaoQ no entiende
 *     «2-may-2025», que es como la hoja escribe las fechas, y descarta la fila
 *     en silencio.
 */

/** Estados que el CRM puede afirmar. `tránsito`, `puerto` y `embarcado` son
 *  parte del ciclo logístico y no se registran en ninguna parte todavía: no se
 *  emiten en vez de adivinarlos. */
export type EstadoLote = "bodega" | "entregado";

export type LotePosicion = {
  /** Identidad estable del lote — la misma clave con la que el CRM lo indexa. */
  id: string;
  code: string;
  remision: string | null;
  recepcion: string | null;
  odc: string | null;
  fecha: string | null;
  origen: string | null;

  kg_ingresado: number;
  kg_despachado: number;
  kg_disponible: number;
  /** Redundante con kg_disponible a propósito: CacaoQ trabaja en toneladas y
   *  la conversión hecha aquí es una conversión menos donde equivocarse. */
  toneladas: number;

  precio_compra_cop_kg: number | null;
  /** kg_disponible × precio. null si el lote no tiene precio en la hoja. */
  valor_cop: number | null;

  estado: EstadoLote;
  calidad: string | null;
};

export type Posicion = {
  generado: string;
  lotes: LotePosicion[];
  totales: {
    lotes: number;
    lotes_con_saldo: number;
    kg_ingresado: number;
    kg_despachado: number;
    kg_disponible: number;
    toneladas_disponibles: number;
    /** Ponderado por kilos, sobre los lotes con saldo Y con precio. */
    costo_promedio_cop_kg: number | null;
    valor_inventario_cop: number;
    /** Kilos en bodega sin precio de compra: no entran en el promedio ni en el
     *  valor, y callarlo haría que el inventario pareciera valer menos. */
    kg_sin_precio: number;
  };
};

export type LoteRow = {
  code: string;
  remision: string | null;
  recepcion: string | null;
  odc: string | null;
  entry_date: string | null;
  origin: string | null;
  qty_in_kg: number | string;
  qty_out_kg: number | string;
  purchase_price_cop_kg: number | string | null;
  quality: string | null;
};

const n = (v: number | string | null | undefined) => Number(v) || 0;
const redondear = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** La misma clave con la que la base identifica un lote: código, remisión y
 *  recepción. Estable frente a inserciones y reordenamientos de la hoja. */
export function idLote(l: Pick<LoteRow, "code" | "remision" | "recepcion">): string {
  return [l.code, l.remision ?? "", l.recepcion ?? ""].join("|");
}

export function construirPosicion(lotes: LoteRow[], generado: Date): Posicion {
  const filas: LotePosicion[] = lotes.map((l) => {
    const entrada = n(l.qty_in_kg);
    const salida = n(l.qty_out_kg);
    const disponible = redondear(entrada - salida);
    const precio = l.purchase_price_cop_kg == null ? null : n(l.purchase_price_cop_kg);

    return {
      id: idLote(l),
      code: l.code,
      remision: l.remision,
      recepcion: l.recepcion,
      odc: l.odc,
      fecha: l.entry_date,
      origen: l.origin,

      kg_ingresado: redondear(entrada),
      kg_despachado: redondear(salida),
      kg_disponible: disponible,
      toneladas: redondear(disponible / 1000, 4),

      precio_compra_cop_kg: precio,
      valor_cop: precio && disponible > 0 ? Math.round(disponible * precio) : null,

      // Un lote sin saldo salió completo. El CRM no sabe si llegó a destino,
      // pero sí que ya no está en bodega, y para la exposición eso es lo que
      // importa: dejó de ser riesgo físico.
      estado: disponible > 0 ? "bodega" : "entregado",
      calidad: l.quality,
    };
  });

  const conSaldo = filas.filter((l) => l.kg_disponible > 0);
  const conPrecio = conSaldo.filter((l) => l.precio_compra_cop_kg);
  const kgConPrecio = conPrecio.reduce((a, l) => a + l.kg_disponible, 0);
  const valor = conPrecio.reduce((a, l) => a + (l.valor_cop ?? 0), 0);

  return {
    generado: generado.toISOString(),
    lotes: filas,
    totales: {
      lotes: filas.length,
      lotes_con_saldo: conSaldo.length,
      kg_ingresado: redondear(filas.reduce((a, l) => a + l.kg_ingresado, 0)),
      kg_despachado: redondear(filas.reduce((a, l) => a + l.kg_despachado, 0)),
      kg_disponible: redondear(conSaldo.reduce((a, l) => a + l.kg_disponible, 0)),
      toneladas_disponibles: redondear(
        conSaldo.reduce((a, l) => a + l.kg_disponible, 0) / 1000,
        4,
      ),
      costo_promedio_cop_kg: kgConPrecio > 0 ? Math.round(valor / kgConPrecio) : null,
      valor_inventario_cop: valor,
      kg_sin_precio: redondear(
        conSaldo.filter((l) => !l.precio_compra_cop_kg).reduce((a, l) => a + l.kg_disponible, 0),
      ),
    },
  };
}
