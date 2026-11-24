/**
 * Lectura de la «Planilla Control Operacion combustible riego» (Drive) — 0120.
 *
 * Funciones puras: reciben filas de `sheet_to_json(..., { header: 1, raw:
 * true })` y devuelven lo que se guarda. El script `cargar-combustible.ts` lee
 * el archivo y escribe. Los tests usan filas copiadas del archivo real.
 *
 * Qué se lee:
 *  - DIESEL y GASOLINA: una compra por fila.
 *  - RIEGO: un tramo del motor por fila (grupo de válvulas de tal a tal hora)
 *    y el combustible cargado al motor ese día.
 *  - Hojas de equipo (guadaña, motosierra, bombas): un uso por fila.
 * «COMPRA» y «RIEGO (1)» son copias viejas y no se leen.
 *
 * Trampas del archivo real:
 *  - En RIEGO solo la primera fila de cada día trae la fecha: las de abajo son
 *    más válvulas del mismo día (las horas siguen en orden). Se hereda.
 *  - Años mal digitados (un 2022 entre diciembre de 2025, un enero de 2025
 *    entre 2026) y fechas como texto («31//07/21»).
 *  - Celdas con formato de fecha que guardan números: el recibo 48732 se ve
 *    «2033-06-02» y el valor 45.100 se ve «2023-06-23». Con `raw: true` llegan
 *    como número y se leen bien.
 *  - La columna de consumo de las hojas de equipo multiplica la FRACCIÓN DEL
 *    DÍA por el consumo por hora: no sirve. Se recalcula con horas reales.
 */

import { clave, fraccionAHora, parsearValvulas, serialAFecha, normalizarEmpleado } from "./hoja";

export type Combustible = "acpm" | "gasolina";

// ── Fechas ──────────────────────────────────────────────────────────────────

const ANIOS = [2025, 2026];
const DIA = 86400000;
const dias = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DIA;

/**
 * Fecha de una fila sabiendo la de la fila de arriba (las hojas van en orden).
 * Un año imposible, o una fecha que salta atrás y con el año siguiente cae en
 * su sitio, se corrige avisando. El resto del orden lo juzga
 * `fueraDeOrden`, mirando la hoja entera.
 */
export function fechaPlanilla(
  raw: unknown,
  anterior: string | null,
): { fecha: string | null; duda: string | null } {
  let f: string | null = null;
  const dudas: string[] = [];

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 30000) {
    f = serialAFecha(raw);
  } else if (typeof raw === "string" && raw.trim()) {
    const m = /^(\d{1,2})\D+(\d{1,2})/.exec(raw.trim());
    const anio = anterior ? Number(anterior.slice(0, 4)) : 2025;
    if (m && Number(m[1]) <= 31 && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
      f = `${anio}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      if (Number.isNaN(Date.parse(f))) f = null;
    }
    if (!f) return { fecha: null, duda: `fecha ilegible «${raw}»` };
    dudas.push(`fecha escrita como texto «${raw}»`);
  } else {
    return { fecha: null, duda: null };
  }

  const anio = Number(f.slice(0, 4));
  const conAnio = (a: number) => `${a}${f!.slice(4)}`;

  if (!ANIOS.includes(anio)) {
    const a = anterior ? Number(anterior.slice(0, 4)) : 2025;
    dudas.push(`año corregido ${anio}→${a}`);
    f = conAnio(a);
  } else if (anterior && dias(anterior, f) < -3) {
    // Salta atrás: ¿con el año siguiente al de la anterior cae en su sitio?
    const a = Number(anterior.slice(0, 4));
    for (const cand of [a, a + 1]) {
      const g = conAnio(cand);
      if (g !== f && dias(anterior, g) >= 0 && dias(anterior, g) <= 60) {
        dudas.push(`año corregido ${anio}→${cand}`);
        f = g;
        break;
      }
    }
  }

  return { fecha: f, duda: dudas.join(" · ") || null };
}

/**
 * Qué fechas rompen el orden de la hoja. Se queda con la secuencia en orden
 * más larga y marca lo demás: así un solo día mal escrito marca ese día, no
 * todo lo que viene después (que es lo que pasa comparando con «la anterior»).
 * Los huecos hacia adelante no son error: hay meses sin compras.
 */
export function fueraDeOrden(fechas: string[]): boolean[] {
  const n = fechas.length;
  // Subsecuencia no decreciente más larga, O(n log n), con reconstrucción.
  const colas: number[] = []; // índice del último elemento de cada largo
  const previo = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let lo = 0;
    let hi = colas.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (fechas[colas[m]] <= fechas[i]) lo = m + 1;
      else hi = m;
    }
    previo[i] = lo > 0 ? colas[lo - 1] : -1;
    colas[lo] = i;
  }
  const fuera = new Array<boolean>(n).fill(true);
  for (let k = colas.length ? colas[colas.length - 1] : -1; k >= 0; k = previo[k]) fuera[k] = false;
  return fuera;
}

const DUDA_ORDEN = "fecha fuera de orden con las filas vecinas";

// ── Utilidades ──────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function texto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s === "" ? null : s;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Fracción de día válida (una hora del día). 1200 no lo es. */
function esHora(v: unknown): v is number {
  return typeof v === "number" && v >= 0 && v < 1;
}

/**
 * Horas de un tramo: de inicio y fin si los dos son horas válidas; si no, de
 * la columna de horas. Imposibles → null con duda.
 */
function leerTramo(
  ini: unknown,
  fin: unknown,
  horasCol: unknown,
): { hora_inicio: string | null; hora_fin: string | null; horas: number | null; duda: string | null } {
  const hi = esHora(ini) ? fraccionAHora(ini) : null;
  const hf = esHora(fin) ? fraccionAHora(fin) : null;
  if (esHora(ini) && esHora(fin) && fin > ini) {
    return { hora_inicio: hi, hora_fin: hf, horas: r2((fin - ini) * 24), duda: null };
  }
  const h = num(horasCol);
  if (h != null && h > 0 && h <= 16) return { hora_inicio: hi, hora_fin: hf, horas: r2(h), duda: null };
  if (h != null && h !== 0) return { hora_inicio: hi, hora_fin: hf, horas: null, duda: `horas imposibles (${r2(h)})` };
  return { hora_inicio: hi, hora_fin: hf, horas: null, duda: null };
}

// ── Compras (DIESEL / GASOLINA) ─────────────────────────────────────────────

/** Columnas de DIESEL y GASOLINA (idénticas). */
const C = { fecha: 0, recibo: 1, nit: 3, proveedor: 4, galones: 5, precio: 7, destino: 8, valor: 9, obs: 10 };

export interface CompraHoja {
  fila: number;
  fecha: string;
  combustible: Combustible;
  recibo: string | null;
  galones: number | null;
  precio_galon: number | null;
  valor: number | null;
  proveedor: string | null;
  destino: string | null;
  observaciones: string | null;
  dudas: string[];
  original: Record<string, unknown>;
}

/** Proveedor con mayúsculas uniformes: «E.S EL PORVENIR» y «Cooperativa Veracruz». */
function proveedor(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  const k = clave(t);
  if (k.includes("porvenir")) return "E.S. El Porvenir";
  if (k.includes("veracruz")) return "Cooperativa Veracruz";
  return t;
}

export function leerCompra(
  r: unknown[],
  fila: number,
  combustible: Combustible,
  anterior: string | null,
): CompraHoja | null {
  const valor = num(r[C.valor]);
  const galones = num(r[C.galones]);
  // Filas de plantilla: traen NIT y precio por defecto pero ni fecha ni plata.
  if (r[C.fecha] == null && valor == null) return null;
  if (valor == null && !galones) return null;

  const fe = fechaPlanilla(r[C.fecha], anterior);
  const dudas: string[] = [];
  if (fe.duda) dudas.push(fe.duda);
  if (!fe.fecha) return null;

  const precio = num(r[C.precio]);
  if (galones == null) dudas.push("sin galones");
  if (valor == null) dudas.push("sin valor pagado");
  // Galones que no cuadran con valor ÷ precio (más de 3 %).
  if (galones && valor && precio && Math.abs(galones * precio - valor) / valor > 0.03)
    dudas.push(`galones × precio = ${Math.round(galones * precio)} y el valor dice ${valor}`);

  const recibo = num(r[C.recibo]);
  return {
    fila,
    fecha: fe.fecha,
    combustible,
    recibo: recibo != null ? String(Math.round(recibo)) : texto(r[C.recibo]),
    galones: galones != null ? Math.round(galones * 1000) / 1000 : null,
    precio_galon: precio,
    valor,
    proveedor: proveedor(r[C.proveedor]),
    destino: texto(r[C.destino]),
    observaciones: texto(r[C.obs]),
    dudas,
    original: Object.fromEntries(
      Object.entries(C).map(([k, i]) => [k, r[i] ?? null]),
    ),
  };
}

/** Todas las compras de una hoja, encadenando la fecha anterior buena. */
export function leerCompras(filas: unknown[][], combustible: Combustible): CompraHoja[] {
  const out: CompraHoja[] = [];
  let anterior: string | null = null;
  filas.forEach((r, i) => {
    if (i === 0) return; // encabezado
    const c = leerCompra(r, i + 1, combustible, anterior);
    if (!c) return;
    out.push(c);
    anterior = c.fecha;
  });
  fueraDeOrden(out.map((c) => c.fecha)).forEach((f, i) => {
    if (f) out[i].dudas.push(DUDA_ORDEN);
  });
  return out;
}

// ── Riego y equipos ─────────────────────────────────────────────────────────

export interface UsoHoja {
  fila: number;
  fecha: string;
  actividad: string | null;
  valvulas: string[];
  sitio: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  horas: number | null;
  carga_galones: number | null;
  /** Nombre canónico si la observación es un trabajador conocido. */
  empleado: string | null;
  observaciones: string | null;
  dudas: string[];
  original: Record<string, unknown>;
}

function valvulasDe(raw: unknown): { valvulas: string[]; sitio: string | null; duda: string | null } {
  const t = texto(raw);
  if (t && clave(t) === "motor") return { valvulas: [], sitio: "Motor", duda: null };
  if (t && clave(t).startsWith("casa")) return { valvulas: [], sitio: "Quinta", duda: null };
  const v = parsearValvulas(typeof raw === "string" ? raw.replace(/[_;]/g, ",") : raw);
  // Un lugar escrito sin números («Lago Alrededor», «Potrero de los cabros»,
  // «poscosecha») no es una válvula mal escrita: es el sitio.
  if (typeof raw === "string" && t && !/\d/.test(t) && v.valvulas.length === 0 && !v.sitio)
    return { valvulas: [], sitio: t.charAt(0).toUpperCase() + t.slice(1), duda: null };
  return v;
}

/** Columnas de RIEGO. */
const R = { fecha: 0, carga: 3, valvula: 6, inicio: 7, fin: 8, horas: 9, obs: 10 };

/**
 * Hoja RIEGO. La fecha se hereda hacia abajo dentro del día. Una fila cuenta
 * si trae válvula, horas o carga de combustible.
 */
export function leerRiego(filas: unknown[][]): UsoHoja[] {
  const out: UsoHoja[] = [];
  let anterior: string | null = null; // fecha de la última fila con fecha
  let delDia: string | null = null; // fecha que heredan las filas sin fecha
  let dudaDelDia: string | null = null;
  // Una entrada por fila CON fecha (las heredadas siguen a su día).
  const dias: { fecha: string; usos: UsoHoja[] }[] = [];

  filas.forEach((r, i) => {
    if (i === 0) return;
    const carga = num(r[R.carga]);
    const tieneValvula = texto(r[R.valvula]) != null;
    const horasCol = num(r[R.horas]);
    const tieneAlgo = tieneValvula || (carga != null && carga > 0) || (horasCol != null && horasCol !== 0);
    if (r[R.fecha] == null || r[R.fecha] === "") {
      if (!tieneAlgo || !delDia) return;
    } else {
      const fe = fechaPlanilla(r[R.fecha], anterior);
      if (!fe.fecha) {
        delDia = null;
        return;
      }
      delDia = fe.fecha;
      dudaDelDia = fe.duda;
      anterior = fe.fecha;
      dias.push({ fecha: fe.fecha, usos: [] });
      if (!tieneAlgo) return;
    }

    const v = valvulasDe(r[R.valvula]);
    const t = leerTramo(r[R.inicio], r[R.fin], r[R.horas]);
    const dudas = [dudaDelDia, v.duda, t.duda].filter((x): x is string => !!x);
    const uso: UsoHoja = {
      fila: i + 1,
      fecha: delDia!,
      actividad: "Riego",
      valvulas: v.valvulas,
      sitio: v.sitio,
      hora_inicio: t.hora_inicio,
      hora_fin: t.hora_fin,
      horas: t.horas,
      carga_galones: carga != null && carga > 0 ? carga : null,
      empleado: null,
      observaciones: texto(r[R.obs]),
      dudas,
      original: Object.fromEntries(Object.entries(R).map(([k, j]) => [k, r[j] ?? null])),
    };
    out.push(uso);
    dias.at(-1)?.usos.push(uso);
  });
  fueraDeOrden(dias.map((d) => d.fecha)).forEach((f, i) => {
    if (f) for (const u of dias[i].usos) u.dudas.push(DUDA_ORDEN);
  });
  return out;
}

/** Columnas de las hojas de equipo (desde la columna B: índice 0 = B). */
const E = { fecha: 1, actividad: 2, inicio: 3, fin: 4, valvula: 6, obs: 11 };

/**
 * Hoja de un equipo (guadaña, motosierra, bombas). `offset` = número de fila
 * de Excel del índice 0 (las hojas empiezan en B3). Filas sin fecha pero con
 * horario: se toma la del renglón anterior y se marca, porque a diferencia de
 * RIEGO aquí no es la costumbre y puede ser un renglón de plantilla.
 */
export function leerEquipo(filas: unknown[][], offset: number): UsoHoja[] {
  const out: UsoHoja[] = [];
  let anterior: string | null = null;
  filas.forEach((r, i) => {
    const inicio = r[E.inicio];
    const fin = r[E.fin];
    if (!esHora(inicio) || !esHora(fin)) return; // encabezados, totales, firmas
    const dudas: string[] = [];
    let fecha: string | null;
    if (r[E.fecha] == null || r[E.fecha] === "") {
      // Renglón de plantilla: horario por defecto y nada más.
      if (texto(r[E.actividad]) == null && texto(r[E.valvula]) == null) return;
      if (!anterior) return;
      fecha = anterior;
      dudas.push("sin fecha: se tomó la del renglón anterior");
    } else {
      const fe = fechaPlanilla(r[E.fecha], anterior);
      if (!fe.fecha) return;
      fecha = fe.fecha;
      if (fe.duda) dudas.push(fe.duda);
      anterior = fe.fecha;
    }
    const v = valvulasDe(r[E.valvula]);
    if (v.duda) dudas.push(v.duda);
    const t = leerTramo(inicio, fin, null);
    if (t.duda) dudas.push(t.duda);
    const obs = texto(r[E.obs]);
    // «Consumo de 0,3 Litro Hr» es una nota del consumo esperado, no del uso.
    const esNota = obs != null && /^consumo de/i.test(obs);
    // En bombas, la observación suele ser quién fumigó.
    const posible = obs && !esNota && obs.split(" ").length <= 3 ? normalizarEmpleado(obs) : null;
    out.push({
      fila: i + offset,
      fecha,
      actividad: texto(r[E.actividad]),
      valvulas: v.valvulas,
      sitio: v.sitio,
      hora_inicio: t.hora_inicio,
      hora_fin: t.hora_fin,
      horas: t.horas,
      carga_galones: null,
      empleado: posible?.conocido ? posible.nombre : null,
      observaciones: esNota ? null : obs,
      dudas,
      original: Object.fromEntries(Object.entries(E).map(([k, j]) => [k, r[j] ?? null])),
    });
  });
  fueraDeOrden(out.map((u) => u.fecha)).forEach((f, i) => {
    if (f) out[i].dudas.push(DUDA_ORDEN);
  });
  return out;
}
