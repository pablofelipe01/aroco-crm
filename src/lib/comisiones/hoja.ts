/**
 * Lectura de la pestaña «LIQUIDACION DE BONIFICACIONES COMERCIALES».
 *
 * La hoja liquida UN MES A LA VEZ: Nicolás cierra cada mes cambiando el
 * parámetro «Mes a liquidar» y toda la pestaña se recalcula. Eso manda sobre
 * cómo se sincroniza — cada corrida captura el mes que esté puesto y lo guarda
 * junto a los anteriores, sin tocarlos. Un reemplazo total, que es lo que
 * hacen los otros syncs del CRM, aquí borraría el histórico cada vez que
 * alguien cambia el desplegable.
 *
 * NO ES UNA TABLA, es una hoja de cálculo con bloques repartidos por la
 * cuadrícula: los parámetros arriba a la izquierda, el resumen en la columna
 * 6, el maestro de asignación más abajo y el detalle de operaciones al final.
 * Por eso cada bloque se busca por su ETIQUETA —«4. LIQUIDACION DEL MES»— y
 * dentro del bloque las columnas se leen por su encabezado. Fijar posiciones
 * haría que insertar una fila arriba corrompiera todo en silencio, que es
 * exactamente como se estropeó el inventario tres veces.
 */

export class BloqueFaltante extends Error {}

function normalizar(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** «$13.718.684» · «39,37» · «-$3.944.526» → número. */
export function numero(v: string): number {
  const s = (v ?? "").trim();
  if (!s) return 0;
  const negativo = /^-|\(.*\)/.test(s.replace(/\s/g, ""));
  const limpio = s.replace(/[^\d,.]/g, "");
  if (!limpio) return 0;
  const n = Number(limpio.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

/** «3,00%» → 0.03 · «5%» → 0.05. */
export function porcentaje(v: string): number {
  return Math.round(numero(v) * 1_000_000) / 100_000_000;
}

/** «13/08/2026» → «2026-08-13». Devuelve null si no encaja. */
export function fechaISO(v: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((v ?? "").trim());
  if (!m) return null;
  const [, d, mes, a] = m;
  return `${a}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

export function numeroDeMes(nombre: string): number | null {
  return MESES[normalizar(nombre)] ?? null;
}

type Matriz = string[][];

const celda = (m: Matriz, f: number, c: number) => (m[f]?.[c] ?? "").trim();

/** Fila cuyo primer campo con texto empieza por la etiqueta dada. */
function buscarFila(m: Matriz, etiqueta: string, desde = 0): number {
  const objetivo = normalizar(etiqueta);
  for (let i = desde; i < m.length; i++) {
    const primera = (m[i] ?? []).find((c) => (c ?? "").trim() !== "");
    if (primera && normalizar(primera).startsWith(objetivo)) return i;
  }
  return -1;
}

/**
 * Valor a la derecha de una etiqueta, en cualquier parte de la cuadrícula.
 *
 * Los parámetros no están en una columna fija: «Mes a liquidar» está en la 0 y
 * «Toneladas despachadas» en la 6. Se busca la etiqueta y se toma la siguiente
 * celda con contenido de esa misma fila.
 */
function valorDe(m: Matriz, etiqueta: string): string {
  const objetivo = normalizar(etiqueta);
  for (const fila of m) {
    for (let c = 0; c < (fila?.length ?? 0); c++) {
      if (normalizar(fila[c] ?? "").startsWith(objetivo)) {
        for (let d = c + 1; d < fila.length; d++) {
          if ((fila[d] ?? "").trim() !== "") return fila[d].trim();
        }
      }
    }
  }
  return "";
}

export type LineaComercial = {
  comercial: string;
  tonVenta: number;
  tonCompra: number;
  tonTotal: number;
  nivel: string;
  pctTecho: number;
  utilidadVenta: number;
  utilidadCompra: number;
  comisionVenta: number;
  comisionCompra: number;
  totalPagar: number;
};

export type OperacionComision = {
  fecha: string | null;
  cliente: string;
  odc: string;
  descripcion: string;
  kg: number;
  utilidadBruta: number;
  proveedor: string;
  vendedor: string;
  comprador: string;
  kgAroco: number;
  costoTranspSelec: number;
  utilidadNeta: number;
  remision: string;
  destino: string;
  mercado: string;
  comisionVendedor: number;
  comisionComprador: number;
};

export type Liquidacion = {
  anio: number;
  mes: number;
  mesNombre: string;
  mercadoPorDefecto: string;
  umbralSeniorTon: number;
  toneladas: number;
  utilidad: number;
  totalComisiones: number;
  shareVendedor: number;
  shareComprador: number;
  transporteKg: number;
  seleccionKg: number;
  lineas: LineaComercial[];
  operaciones: OperacionComision[];
};

/**
 * Índices de las columnas de un bloque, por nombre de encabezado.
 * Devuelve -1 para las que no aparezcan: los opcionales se toleran.
 */
function indices(encabezado: string[], nombres: string[]): number[] {
  const norm = encabezado.map((c) => normalizar(c));
  return nombres.map((n) => norm.findIndex((c) => c.startsWith(normalizar(n))));
}

export function parseLiquidacion(m: Matriz): Liquidacion {
  const mesNombre = valorDe(m, "Mes a liquidar");
  const mes = numeroDeMes(mesNombre);
  const anio = Math.trunc(numero(valorDe(m, "Año")));
  if (!mes || !anio) {
    throw new BloqueFaltante(
      `No se pudo leer el periodo de la hoja (mes «${mesNombre}», año «${anio}»).`,
    );
  }

  // ── 4. Liquidación por comercial ──────────────────────────────────────────
  const iBloque = buscarFila(m, "4. LIQUIDACION DEL MES");
  if (iBloque < 0) {
    throw new BloqueFaltante("No se encontró el bloque «4. LIQUIDACION DEL MES».");
  }
  const iEnc = buscarFila(m, "Comercial", iBloque);
  if (iEnc < 0) {
    throw new BloqueFaltante("El bloque de liquidación no tiene su fila de encabezado.");
  }
  const C = indices(m[iEnc], [
    "Comercial", "Ton Venta", "Ton Compra", "Ton Total", "Nivel",
    "% Techo efectivo", "Utilidad Venta", "Utilidad Compra",
    "Comision Venta", "Comision Compra", "TOTAL A PAGAR",
  ]);
  if (C.some((i) => i < 0)) {
    throw new BloqueFaltante(
      `Faltan columnas en el bloque de liquidación: ${m[iEnc].filter(Boolean).join(", ")}`,
    );
  }

  const lineas: LineaComercial[] = [];
  for (let i = iEnc + 1; i < m.length; i++) {
    const nombre = celda(m, i, C[0]);
    // «TOTAL GENERAL» cierra el bloque: es la suma, no un comercial.
    if (normalizar(nombre).startsWith("total general")) break;
    if (!nombre) continue;
    lineas.push({
      comercial: nombre,
      tonVenta: numero(celda(m, i, C[1])),
      tonCompra: numero(celda(m, i, C[2])),
      tonTotal: numero(celda(m, i, C[3])),
      nivel: celda(m, i, C[4]),
      pctTecho: porcentaje(celda(m, i, C[5])),
      utilidadVenta: numero(celda(m, i, C[6])),
      utilidadCompra: numero(celda(m, i, C[7])),
      comisionVenta: numero(celda(m, i, C[8])),
      comisionCompra: numero(celda(m, i, C[9])),
      totalPagar: numero(celda(m, i, C[10])),
    });
  }

  // ── 5. Detalle de operaciones ─────────────────────────────────────────────
  //
  // Es el respaldo de cada cifra: sin él, «te tocan $103.509» no se puede
  // explicar y la liquidación vuelve a ser una caja negra, que es justo lo que
  // se quiere dejar atrás.
  const operaciones: OperacionComision[] = [];
  const iDet = buscarFila(m, "5. DETALLE DE OPERACIONES");
  if (iDet >= 0) {
    const iEncDet = buscarFila(m, "Fecha", iDet);
    if (iEncDet >= 0) {
      const D = indices(m[iEncDet], [
        "Fecha", "Cliente", "ODC", "Origen / Descripcion", "Kg (col M)",
        "Utilidad bruta", "Proveedor", "Vendedor", "Comprador",
        "Kg AROCO", "Costo transp", "UTILIDAD NETA", "Remision",
        "Destino", "Mercado",
      ]);
      // Las dos últimas columnas del detalle son las comisiones repartidas y
      // no traen encabezado propio en todas las versiones de la hoja.
      const iComVend = D[14] >= 0 ? D[14] + 3 : -1;
      const iComComp = D[14] >= 0 ? D[14] + 4 : -1;

      for (let i = iEncDet + 1; i < m.length; i++) {
        const f = fechaISO(celda(m, i, D[0]));
        const cliente = celda(m, i, D[1]);
        if (!f && !cliente) continue;
        operaciones.push({
          fecha: f,
          cliente,
          odc: celda(m, i, D[2]),
          descripcion: celda(m, i, D[3]),
          kg: numero(celda(m, i, D[4])),
          utilidadBruta: numero(celda(m, i, D[5])),
          proveedor: celda(m, i, D[6]),
          vendedor: celda(m, i, D[7]),
          comprador: celda(m, i, D[8]),
          kgAroco: numero(celda(m, i, D[9])),
          costoTranspSelec: numero(celda(m, i, D[10])),
          utilidadNeta: numero(celda(m, i, D[11])),
          remision: celda(m, i, D[12]),
          destino: celda(m, i, D[13]),
          mercado: celda(m, i, D[14]),
          comisionVendedor: iComVend >= 0 ? numero(celda(m, i, iComVend)) : 0,
          comisionComprador: iComComp >= 0 ? numero(celda(m, i, iComComp)) : 0,
        });
      }
    }
  }

  return {
    anio,
    mes,
    mesNombre: mesNombre.trim(),
    mercadoPorDefecto: valorDe(m, "Mercado por defecto") || "Nacional",
    umbralSeniorTon: numero(valorDe(m, "Umbral Senior")),
    toneladas: numero(valorDe(m, "Toneladas despachadas")),
    utilidad: numero(valorDe(m, "Utilidad del mes")),
    totalComisiones: numero(valorDe(m, "Total comisiones a pagar")),
    shareVendedor: porcentaje(valorDe(m, "% del techo para el VENDEDOR")),
    shareComprador: porcentaje(valorDe(m, "% del techo para el COMPRADOR")),
    transporteKg: numero(valorDe(m, "Transporte")),
    seleccionKg: numero(valorDe(m, "Seleccion")),
    lineas,
    operaciones,
  };
}
