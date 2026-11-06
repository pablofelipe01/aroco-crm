/**
 * Parser del archivo de inventario de bodega (Google Sheet, export CSV).
 *
 * Archivo vigente desde 2026-11 («Inventario», gid 1872049864). Reemplazó al
 * de 2025-26, que el CRM siguió leyendo hasta que Nicolás pasó el nuevo.
 *
 * Las columnas se localizan por su ENCABEZADO, no por su posición (ver
 * `sheet-columns.ts`): leer la columna de al lado no falla, solo miente.
 *
 * Lo que trae este archivo y hay que respetar:
 * - Dos filas de encabezado (subgrupo y nombre final) bajo una de grupos.
 * - Ocho clasificaciones: Premium, Estándar, Corriente, Corriente C,
 *   Fairtrade, Rainforest, Orgánico y Pasilla.
 * - Una recepción puede venir en VARIAS filas, una por calidad, con el mismo
 *   código, remisión y recepción. Lo que las distingue es la calidad, así que
 *   la clave del lote lleva `clase` (la clasificación con más kilos de la
 *   fila). La del despacho la lleva también: las dos claves van juntas.
 * - Disponible = ingresos − salidas − merma. El trigger de la base lo calcula
 *   igual; el test lo compara contra «TOTAL DISPONIBLE EN BODEGA».
 * - Números colombianos («1.218,00»), fechas «23-sept-2025», y celdas en 0 o
 *   en «#VALUE!» donde la hoja no tiene dato.
 *
 * Todo aquí es puro para poder testearlo sin red ni DB.
 */

import {
  construirMapa,
  columna,
  columnaOpcional,
  columnaPrefijo,
  columnaPrefijoOpcional,
  ubicarEncabezado,
  normalizarEncabezado,
  ColumnaFaltante,
} from "@/lib/inventory/sheet-columns";

/** Celdas que identifican la fila de encabezado con los subgrupos. */
const MARCAS_ENCABEZADO = ["Fecha Ingreso", "CODIGO CONCATENADO PROCEDENCIA"];

/** Las ocho clasificaciones del archivo, en su orden. */
export const CLASES = [
  "premium",
  "estandar",
  "corriente",
  "corriente_c",
  "fairtrade",
  "rainforest",
  "organico",
  "pasilla",
] as const;
export type Clase = (typeof CLASES)[number];

export const NOMBRE_CLASE: Record<Clase, string> = {
  premium: "Premium",
  estandar: "Estándar",
  corriente: "Corriente",
  corriente_c: "Corriente C",
  fairtrade: "Fairtrade",
  rainforest: "Rainforest",
  organico: "Orgánico",
  pasilla: "Pasilla",
};

export type PorClase = Record<Clase, number>;

export type LotRow = {
  code: string;
  /** Clasificación dominante de la fila; parte de la clave del lote. */
  clase: Clase | "";
  codigo_nuevo: string | null;
  proveedor: string | null;
  departamento: string | null;
  municipio: string | null;
  entry_date: string | null;
  remision: string | null;
  odc: string | null;
  recepcion: string | null;
  qty_in_kg: number;
  qty_out_kg: number;
  qty_requested_kg: number | null;
  bultos_in: number;
  bultos_out: number;
  bultos_total: number;
  purchase_price_cop_kg: number | null;
  cadmio: string | null;
  /** Nombre de la clasificación dominante — rótulo para la UI. */
  quality: string | null;
  qty_in_premium_kg: number;
  qty_in_estandar_kg: number;
  qty_in_corriente_kg: number;
  qty_in_corriente_c_kg: number;
  qty_in_fairtrade_kg: number;
  qty_in_rainforest_kg: number;
  qty_in_organico_kg: number;
  qty_in_pasilla_kg: number;
  qty_avail_premium_kg: number;
  qty_avail_estandar_kg: number;
  qty_avail_corriente_kg: number;
  qty_avail_corriente_c_kg: number;
  qty_avail_fairtrade_kg: number;
  qty_avail_rainforest_kg: number;
  qty_avail_organico_kg: number;
  qty_avail_pasilla_kg: number;
  merma_kg: number;
  pasilla_kg: number;
  merma_pct: number | null;
  pasilla_pct: number | null;
  pct_bien_fermentado: number | null;
  pct_parcialmente_fermentado: number | null;
  pct_pizarroso: number | null;
  pct_purpura: number | null;
  pct_sobre_fermentado: number | null;
  pct_hongos: number | null;
  pct_humedad: number | null;
  pct_fermentacion_total: number | null;
  indice_grano_100g: number | null;
};

export type DispatchRow = {
  source_key: string;
  dispatch_date: string | null;
  destination: string | null;
  /** Orden de compra del cliente. */
  oc: string | null;
  qty_kg: number;
  qty_premium_kg: number;
  qty_estandar_kg: number;
  qty_corriente_kg: number;
  qty_corriente_c_kg: number;
  qty_fairtrade_kg: number;
  qty_rainforest_kg: number;
  qty_organico_kg: number;
  qty_pasilla_kg: number;
  bultos: number | null;
  remision_salida: string | null;
  remision_entrada: string | null;
  /**
   * Lo que costó el kilo que salió: el mismo valor de compra del lote,
   * copiado porque sale de la misma fila. Cruzarlo por código no es fiable
   * (hay códigos repetidos con precios distintos).
   */
  purchase_price_cop_kg: number | null;
  origin: string;
  /** Clave del lote del que sale, para enlazarlo (y saber su bodega). */
  lot_code: string;
  lot_remision: string | null;
  lot_recepcion: string | null;
  lot_clase: Clase | "";
};

export type ParsedSheet = {
  lots: LotRow[];
  dispatches: DispatchRow[];
  rowsRead: number;
};

const ES_MONTHS: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};

/**
 * Parse a Spanish abbreviated date like "5-may-2025" or "18-jun-26" → ISO
 * ("2025-05-05" / "2026-06-18"). A 2-digit year is assumed to be 20YY.
 * Returns null when the value is empty or unrecognized.
 */
export function parseEsDate(value: string | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})[-/ ]([a-záéíóú]{3,})\.?[-/ ](\d{2}|\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = ES_MONTHS[m[2].slice(0, 3)];
  if (!month) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${month}-${day}`;
}

/**
 * Parse a Colombian-formatted number ("172.444,38", "764,25", "$9.200") →
 * number. Dots are thousands separators, comma is the decimal mark; currency
 * symbols are ignored. Returns null for empty / non-numeric input.
 */
export function parseCoNumber(value: string | undefined): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  // Drop everything but digits, separators and sign; then CO → JS number.
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned || /^[-.,]+$/.test(cleaned)) return null;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Minimal RFC-4180 CSV parser: handles quoted fields, embedded commas/newlines
 * and "" escapes. Returns a matrix of string cells.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Normalize newlines so CRLF and lone CR both count as one row break.
  const s = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Flush trailing field/row (file may not end with a newline).
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Índice -1 = columna opcional que la hoja no trae. */
const cell = (row: string[], i: number): string =>
  i < 0 ? "" : (row[i] ?? "").trim().replace(/\s+/g, " ");
const num = (row: string[], i: number): number => parseCoNumber(cell(row, i)) ?? 0;
const optNum = (row: string[], i: number): number | null => parseCoNumber(cell(row, i));
/** Texto de la celda; el archivo escribe 0 donde no hay dato (ODC, recepción). */
const texto = (row: string[], i: number): string | null => {
  const v = cell(row, i);
  return v === "" || v === "0" ? null : v;
};

/** La clasificación con más kilos, o "" si no hay ninguna. */
export function claseDominante(kilos: PorClase): Clase | "" {
  let mejor: Clase | "" = "";
  let max = 0;
  for (const c of CLASES) {
    if (kilos[c] > max) {
      max = kilos[c];
      mejor = c;
    }
  }
  return mejor;
}

const ALIAS_CLASE: Record<Clase, string[]> = {
  premium: ["PREMIUM"],
  estandar: ["ESTANDAR"],
  corriente: ["CORRIENTE"],
  corriente_c: ["CORRIENTE C"],
  fairtrade: ["FAIRTRADE"],
  rainforest: ["RAINFOREST"],
  organico: ["ORGANICO", "ORGANNICO"],
  pasilla: ["PASILLA"],
};

/** Campo de un bloque SALIDA: exacto, o por prefijo si `prefijo`. */
function campo(
  bloque: { campos: Map<string, number> },
  alternativas: string[],
  prefijo = false,
): number {
  for (const alt of alternativas) {
    const a = normalizarEncabezado(alt);
    if (!prefijo) {
      const i = bloque.campos.get(a);
      if (i != null) return i;
      continue;
    }
    for (const [k, i] of bloque.campos) if (k.startsWith(a)) return i;
  }
  return -1;
}

/**
 * Lee el archivo completo y devuelve los lotes y las salidas listos para el
 * RPC import_inventory_sheet. Las filas sin código (separadores, TOTALES) se
 * saltan.
 */
export function parseInventorySheet(csv: string): ParsedSheet {
  const matrix = parseCsv(csv);
  const filaSub = ubicarEncabezado(matrix, MARCAS_ENCABEZADO);
  if (filaSub < 0) {
    throw new ColumnaFaltante(
      "No se encontró la fila de encabezado (con «Fecha Ingreso» y «CODIGO CONCATENADO PROCEDENCIA»).",
    );
  }
  const mapa = construirMapa(matrix[filaSub] ?? [], matrix[filaSub + 1] ?? []);

  const porClase = (grupo: string, obligatoria: boolean, extra: Partial<Record<Clase, string[]>> = {}) =>
    Object.fromEntries(
      CLASES.map((c) => {
        const alts = (extra[c] ?? ALIAS_CLASE[c]).map((a) => `${grupo}|${a}`);
        return [c, obligatoria ? columna(mapa, ...alts) : columnaOpcional(mapa, ...alts)];
      }),
    ) as Record<Clase, number>;

  // Todo se resuelve ANTES de recorrer filas: si cambió un encabezado, la
  // corrida falla aquí y no después de escribir 150 filas corridas.
  const C = {
    fecha: columna(mapa, "Fecha Ingreso"),
    remision: columna(mapa, "# Remision / # Lote", "# Remisión / # Lote"),
    odc: columnaOpcional(mapa, "# ODC AROCO"),
    recepcion: columna(mapa, "# Recepcion Bodega", "# Recepción Bodega"),
    code: columna(mapa, "CODIGO CONCATENADO PROCEDENCIA"),
    codigoNuevo: columnaOpcional(mapa, "CODIGO CONCATENADO NUEVO"),
    departamento: columnaOpcional(mapa, "CODIGO DEPARTAMENTO"),
    municipio: columnaOpcional(mapa, "CODIGO MUNICIPIO"),
    proveedor: columnaOpcional(mapa, "PROVEEDOR"),
    valorBase: columnaOpcional(mapa, "Valor de Compra|Valor Base"),
    bonificacion: columnaOpcional(mapa, "Valor de Compra|Bonificación"),
    qtyRequested: columnaPrefijoOpcional(mapa, "Cantidad Teórica OC"),
    qtyIn: columnaPrefijo(mapa, "CANTIDAD INGRESOS"),
    bultosIn: columnaPrefijoOpcional(mapa, "NUM BULTOS INGRESADOS"),
    qtyOut: columnaPrefijo(mapa, "CANTIDAD SALIDAS"),
    bultosOut: columnaPrefijoOpcional(mapa, "NUM BULTOS SALIDAS"),
    merma: columnaPrefijo(mapa, "CANTIDAD MERMA"),
    pasilla: columnaPrefijoOpcional(mapa, "CANTIDAD PASILLA"),
    bultosDisp: columnaOpcional(mapa, "CANTIDAD DISPONIBLE EN BODEGA|NUM BULTOS"),
    cadmio: columnaOpcional(mapa, "CADMIO"),
    entra: porClase("CANTIDAD INGRESADA", true, { pasilla: ["PASILLA RECIBIDA EN ENTREGA"] }),
    queda: porClase("CANTIDAD DISPONIBLE EN BODEGA", true, {
      pasilla: ["PASILLA RECIBIDA Y GENERADA"],
    }),
    bienFermentado: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Bien fermentados"),
    parcialmenteFermentado: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Parcialmente fermentado"),
    pizarroso: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Pizarrosos"),
    purpura: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Purpuras"),
    sobreFermentado: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Sobre fermentado"),
    hongos: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Grano con hongos"),
    humedad: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Humedad"),
    indiceGrano: columnaOpcional(mapa, "ITEMS DE EVALUACION|Indice de grano x 100 grm"),
    fermentacionTotal: columnaOpcional(mapa, "ITEMS DE EVALUACION|Total fermentación"),
  };

  if (mapa.salidas.length === 0) {
    throw new ColumnaFaltante("La hoja no tiene bloques «SALIDA n».");
  }
  const salidas = mapa.salidas.map((b) => ({
    fecha: campo(b, ["FECHA"]),
    kilos: Object.fromEntries(CLASES.map((c) => [c, campo(b, ALIAS_CLASE[c])])) as Record<Clase, number>,
    total: campo(b, ["TOTAL SALIDA"], true),
    bultos: campo(b, ["BULTOS"], true),
    empresa: campo(b, ["EMPRESA"], true),
    remision: campo(b, ["REMISION"], true),
    oc: campo(b, ["ORDEN DE COMPRA"], true),
  }));

  const lots: LotRow[] = [];
  const dispatches: DispatchRow[] = [];
  let rowsRead = 0;

  for (let r = filaSub + 2; r < matrix.length; r++) {
    const row = matrix[r];
    const code = cell(row, C.code);
    if (!code) continue; // separadores y TOTALES no tienen código.
    rowsRead++;

    const remision = texto(row, C.remision);
    const recepcion = texto(row, C.recepcion);
    const qtyIn = num(row, C.qtyIn);
    // Sin remisión, sin recepción y sin kilos es una orden de compra que aún
    // no llega, no un lote (dos de Chocomet del 14-sep chocan en la clave).
    if (!remision && !recepcion && qtyIn === 0) continue;

    const entra = Object.fromEntries(CLASES.map((c) => [c, num(row, C.entra[c])])) as PorClase;
    const queda = Object.fromEntries(CLASES.map((c) => [c, num(row, C.queda[c])])) as PorClase;
    const clase = claseDominante(entra) || claseDominante(queda);

    const base = optNum(row, C.valorBase);
    const bonif = optNum(row, C.bonificacion);
    const precio = base && base > 0 ? base + (bonif ?? 0) : null;
    const merma = num(row, C.merma);
    const pasilla = num(row, C.pasilla);
    const pct = (x: number) => (qtyIn > 0 ? Math.round((x / qtyIn) * 10000) / 100 : null);

    lots.push({
      code,
      clase,
      codigo_nuevo: texto(row, C.codigoNuevo),
      proveedor: texto(row, C.proveedor),
      departamento: texto(row, C.departamento),
      municipio: texto(row, C.municipio),
      entry_date: parseEsDate(cell(row, C.fecha)),
      remision,
      odc: texto(row, C.odc),
      recepcion,
      qty_in_kg: qtyIn,
      qty_out_kg: num(row, C.qtyOut),
      qty_requested_kg: optNum(row, C.qtyRequested),
      bultos_in: num(row, C.bultosIn),
      bultos_out: num(row, C.bultosOut),
      bultos_total: num(row, C.bultosDisp),
      purchase_price_cop_kg: precio,
      cadmio: texto(row, C.cadmio),
      quality: clase ? NOMBRE_CLASE[clase] : null,
      qty_in_premium_kg: entra.premium,
      qty_in_estandar_kg: entra.estandar,
      qty_in_corriente_kg: entra.corriente,
      qty_in_corriente_c_kg: entra.corriente_c,
      qty_in_fairtrade_kg: entra.fairtrade,
      qty_in_rainforest_kg: entra.rainforest,
      qty_in_organico_kg: entra.organico,
      qty_in_pasilla_kg: entra.pasilla,
      qty_avail_premium_kg: queda.premium,
      qty_avail_estandar_kg: queda.estandar,
      qty_avail_corriente_kg: queda.corriente,
      qty_avail_corriente_c_kg: queda.corriente_c,
      qty_avail_fairtrade_kg: queda.fairtrade,
      qty_avail_rainforest_kg: queda.rainforest,
      qty_avail_organico_kg: queda.organico,
      qty_avail_pasilla_kg: queda.pasilla,
      merma_kg: merma,
      pasilla_kg: pasilla,
      // La hoja repite «% MERMA SOBRE INGRESOS» también sobre la pasilla; se
      // calculan aquí para no depender de cuál de las dos se lee.
      merma_pct: pct(merma),
      pasilla_pct: pct(pasilla),
      pct_bien_fermentado: optNum(row, C.bienFermentado),
      pct_parcialmente_fermentado: optNum(row, C.parcialmenteFermentado),
      pct_pizarroso: optNum(row, C.pizarroso),
      pct_purpura: optNum(row, C.purpura),
      pct_sobre_fermentado: optNum(row, C.sobreFermentado),
      pct_hongos: optNum(row, C.hongos),
      pct_humedad: optNum(row, C.humedad),
      pct_fermentacion_total: optNum(row, C.fermentacionTotal),
      indice_grano_100g: optNum(row, C.indiceGrano),
    });

    salidas.forEach((s, idx) => {
      const k = Object.fromEntries(CLASES.map((c) => [c, num(row, s.kilos[c])])) as PorClase;
      const suma = CLASES.reduce((t, c) => t + k[c], 0);
      const qty = suma > 0 ? suma : num(row, s.total);
      if (qty <= 0) return; // bloque de salida vacío.

      dispatches.push({
        // La clave del lote + la casilla de salida. Si cambia una, cambia la
        // otra: el sync estuvo caído seis días por separarlas (0078).
        source_key: `${code}#${remision ?? ""}#${recepcion ?? ""}#${clase}#s${idx + 1}`,
        dispatch_date: parseEsDate(cell(row, s.fecha)),
        destination: texto(row, s.empresa),
        oc: texto(row, s.oc),
        qty_kg: Math.round(qty * 1000) / 1000,
        qty_premium_kg: k.premium,
        qty_estandar_kg: k.estandar,
        qty_corriente_kg: k.corriente,
        qty_corriente_c_kg: k.corriente_c,
        qty_fairtrade_kg: k.fairtrade,
        qty_rainforest_kg: k.rainforest,
        qty_organico_kg: k.organico,
        qty_pasilla_kg: k.pasilla,
        bultos: optNum(row, s.bultos),
        remision_salida: texto(row, s.remision),
        remision_entrada: remision,
        origin: code,
        purchase_price_cop_kg: precio,
        lot_code: code,
        lot_remision: remision,
        lot_recepcion: recepcion,
        lot_clase: clase,
      });
    });
  }

  // Dos filas con la misma clave hacen abortar el upsert entero con un error
  // de Postgres que no dice cuál fila. Se detecta aquí para nombrarla.
  const claves = new Map<string, string[]>();
  for (const l of lots) {
    const k = `${l.code}|${l.remision ?? ""}|${l.recepcion ?? ""}|${l.clase}`;
    if (!claves.has(k)) claves.set(k, []);
    claves.get(k)!.push(`${l.entry_date ?? "sin fecha"} · ${l.qty_in_kg} kg`);
  }
  const chocan = [...claves.entries()].filter(([, v]) => v.length > 1);
  if (chocan.length > 0) {
    const detalle = chocan
      .map(([k, v]) => {
        const [code, remision, recepcion, clase] = k.split("|");
        return `«${code}» (remisión ${remision || "vacía"}, recepción ${recepcion || "vacía"}, ${
          clase ? NOMBRE_CLASE[clase as Clase] : "sin clasificar"
        }) aparece ${v.length} veces: ${v.join("; ")}`;
      })
      .join(" — ");
    throw new ColumnaFaltante(
      `La hoja tiene filas que el CRM no puede distinguir entre sí: ${detalle}. ` +
        `Mismo código, remisión, recepción y calidad son la misma fila para el CRM. ` +
        `Corrige el número de recepción en la hoja para separarlas.`,
    );
  }

  return { lots, dispatches, rowsRead };
}
