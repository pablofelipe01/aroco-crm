/**
 * Labores por Telegram — lógica pura (0122).
 *
 * Claude devuelve lo que entendió del audio con NOMBRES (labor, trabajador,
 * equipo, válvula), porque así habla la gente. Aquí se pasa a ids del catálogo
 * y se valida con las MISMAS reglas de /campo (`validar`, `validarUso`), para
 * que un audio no pueda meter lo que el formulario no dejaría. Lo que falta o
 * no cuadra se vuelve una pregunta corta para el trabajador, no un error.
 */
import {
  armarRegistros,
  validar,
  type Borrador,
  type RegistroCampo,
} from "@/lib/finca/captura";
import {
  armarUso,
  validarUso,
  type BorradorUso,
  type CatalogoCampo,
  type UsoCampo,
} from "@/lib/finca/captura-equipos";

// ── Lo que devuelve Claude ──────────────────────────────────────────────────

export interface LaborExtraida {
  /** Nombres tal como están en el catálogo. Vacío = quien manda el audio. */
  trabajadores: string[];
  labor: string | null;
  valvulas: string[];
  sitio: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  horas: number | null;
  cantidad: number | null;
  sanas: number | null;
  pasador_monilia: number | null;
  negras: number | null;
  observaciones: string | null;
}

export interface UsoExtraido {
  /** Código del equipo (motor-riego, guadana…). */
  equipo: string | null;
  trabajador: string | null;
  valvulas: string[];
  hora_inicio: string | null;
  hora_fin: string | null;
  horas: number | null;
  carga_galones: number | null;
  observaciones: string | null;
}

export interface Extraccion {
  /** false si el mensaje no es un reporte (saludo, pregunta, otra cosa). */
  es_reporte: boolean;
  /** YYYY-MM-DD; null = hoy. */
  fecha: string | null;
  labores: LaborExtraida[];
  usos_equipo: UsoExtraido[];
  /** Lo que Claude no entendió, en preguntas cortas. */
  dudas: string[];
  /** Si no es reporte: qué contestarle. */
  respuesta: string | null;
}

// ── Lo que el bot propone y guarda al confirmar ─────────────────────────────

export interface LaborPropuesta {
  labor: string;
  trabajadores: string[];
  borrador: Borrador;
  /** Un id por trabajador, fijado al proponer: confirmar dos veces no duplica. */
  ids: Record<string, string>;
}

export interface UsoPropuesto {
  equipo: string;
  trabajador: string | null;
  borrador: BorradorUso;
  id: string;
}

export interface Propuesta {
  fecha: string;
  labores: LaborPropuesta[];
  usos: UsoPropuesto[];
  /** Si hay alguna, no se puede confirmar todavía. */
  preguntas: string[];
}

export interface Quien {
  /** Ficha del trabajador que habla, si es trabajador. */
  yo: string | null;
  /** Supervisor: registra por cualquiera. */
  porOtros: boolean;
}

// ── Utilidades ──────────────────────────────────────────────────────────────

/** Solo dígitos y con indicativo de Colombia si trae 10 dígitos que empiezan por 3. */
export function normalizarTelefono(s: string): string {
  const d = s.replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("3")) return `57${d}`;
  return d;
}

export function clave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buscar<T>(lista: T[], nombre: string | null, de: (x: T) => string): T | undefined {
  if (!nombre) return undefined;
  const k = clave(nombre);
  return (
    lista.find((x) => clave(de(x)) === k) ??
    // «William» por «William Osorio», si es el único que empieza así.
    (() => {
      const xs = lista.filter((x) => clave(de(x)).startsWith(`${k} `));
      return xs.length === 1 ? xs[0] : undefined;
    })()
  );
}

const txt = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

/** «7:00», «07:00», «7» → «07:00». Lo demás, tal cual (lo rechaza validar). */
export function hora(s: string | null): string {
  if (!s) return "";
  const t = s.trim();
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(t);
  if (!m) return t;
  return `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
}

function valvulasDe(xs: string[], cat: CatalogoCampo): { ok: string[]; malas: string[] } {
  const ok: string[] = [];
  const malas: string[] = [];
  for (const v of xs) {
    const c = cat.valvulas.find((x) => clave(x) === clave(v));
    if (c) {
      if (!ok.includes(c)) ok.push(c);
    } else malas.push(v);
  }
  return { ok, malas };
}

// ── Extracción → propuesta ──────────────────────────────────────────────────

/** Preguntas en el idioma de la finca para cada error de `validar`. */
const PREGUNTA_LABOR: Record<string, string> = {
  empleados: "¿Quién hizo la labor de {labor}?",
  laborId: "¿Qué labor hizo?",
  horas: "¿Cuántas horas trabajó en {labor}, o a qué hora empezó y terminó?",
  horaInicio: "¿A qué hora empezó {labor}?",
  horaFin: "¿A qué hora terminó {labor}?",
  fecha: "¿De qué día es el reporte?",
  valvulas: "¿En qué válvula fue {labor}?",
};

/** Jornal de la finca (cliente, 2026-11-23). */
export const JORNAL_H = 7.5;

export function proponer(
  ext: Extraccion,
  cat: CatalogoCampo,
  quien: Quien,
  hoy: string,
  nuevoId: () => string,
): Propuesta {
  const fecha = ext.fecha && /^\d{4}-\d{2}-\d{2}$/.test(ext.fecha) ? ext.fecha : hoy;
  const preguntas: string[] = [...ext.dudas.filter((d) => d.trim())];
  const catQuien: CatalogoCampo = { ...cat, yo: quien.yo, porOtros: quien.porOtros };
  const nombreDe = (id: string) => cat.empleados.find((e) => e.id === id)?.nombre ?? id;
  // Al supervisor hay que decirle de quiénes puede escoger: si contesta «yo»
  // y no tiene ficha de trabajador, la misma pregunta sin la lista lo deja en
  // un círculo (pasó en la primera prueba, 2026-11-27).
  const lista = cat.empleados.map((e) => e.nombre).join(", ");
  const conLista = (q: string) => (quien.porOtros ? `${q} Diga el nombre de uno de estos trabajadores: ${lista}.` : q);

  const labores: LaborPropuesta[] = [];
  for (const l of ext.labores) {
    const labor = buscar(cat.labores, l.labor, (x) => x.nombre);
    const nombreLabor = labor?.nombre ?? l.labor ?? "la labor";

    let empleados: string[] = [];
    const desconocidos: string[] = [];
    if (!quien.porOtros) {
      // El trabajador registra solo lo suyo. Si nombra a otros, ellos mandan
      // su propio audio (si no, la cosecha de la cuadrilla se contaría doble).
      empleados = quien.yo ? [quien.yo] : [];
    } else {
      for (const n of l.trabajadores) {
        const e = buscar(cat.empleados, n, (x) => x.nombre);
        if (e) {
          if (!empleados.includes(e.id)) empleados.push(e.id);
        } else desconocidos.push(n);
      }
      if (empleados.length === 0 && quien.yo) empleados = [quien.yo];
    }
    for (const n of desconocidos)
      preguntas.push(conLista(`No encuentro a «${n}» en la lista de trabajadores.`));

    const v = valvulasDe(l.valvulas, cat);
    for (const m of v.malas) preguntas.push(`La válvula «${m}» no está en la lista. ¿Cuál fue?`);

    const ini = hora(l.hora_inicio);
    const fin = hora(l.hora_fin);
    // Vacaciones, incapacidad…: si no dice horas, cuenta el jornal entero.
    const horasAusencia = labor?.categoria === "ausencia" && !(ini && fin) && l.horas == null ? JORNAL_H : null;
    const borrador: Borrador = {
      fecha,
      empleados,
      laborId: labor?.id ?? "",
      valvulas: v.ok,
      sitio: l.sitio ?? "",
      horaInicio: ini && fin ? ini : "",
      horaFin: ini && fin ? fin : "",
      horas: ini && fin ? "" : txt(l.horas ?? horasAusencia),
      cantidad: txt(l.cantidad),
      sanas: txt(l.sanas),
      pasador: txt(l.pasador_monilia),
      negras: txt(l.negras),
      observaciones: l.observaciones ?? "",
    };
    // Dijo solo una de las dos horas y además el total: vale el total.
    if (!(ini && fin) && (ini || fin) && l.horas == null)
      preguntas.push(
        PREGUNTA_LABOR[ini ? "horaFin" : "horaInicio"].replace("{labor}", nombreLabor),
      );

    const errores = validar(borrador, catQuien, hoy);
    for (const k of Object.keys(errores) as (keyof Borrador)[]) {
      const p = PREGUNTA_LABOR[k];
      if (k === "empleados" && desconocidos.length) continue;
      if (k === "valvulas" && v.malas.length) continue;
      let q = p ? p.replace("{labor}", nombreLabor) : `${nombreLabor}: ${errores[k]}`;
      if (k === "empleados") q = conLista(q);
      if (!preguntas.includes(q)) preguntas.push(q);
    }

    const ids: Record<string, string> = {};
    for (const e of empleados) ids[e] = nuevoId();
    labores.push({
      labor: nombreLabor,
      trabajadores: empleados.map(nombreDe),
      borrador,
      ids,
    });
  }

  const usos: UsoPropuesto[] = [];
  for (const u of ext.usos_equipo) {
    const equipo =
      (cat.equipos ?? []).find((q) => q.codigo === u.equipo) ??
      buscar(cat.equipos ?? [], u.equipo, (q) => q.nombre);
    const nombreEquipo = equipo?.nombre ?? u.equipo ?? "el equipo";
    let empleadoId = "";
    if (!quien.porOtros) empleadoId = quien.yo ?? "";
    else {
      const e = buscar(cat.empleados, u.trabajador, (x) => x.nombre);
      if (e) empleadoId = e.id;
      else if (u.trabajador)
        preguntas.push(conLista(`No encuentro a «${u.trabajador}» en la lista de trabajadores.`));
    }
    const v = valvulasDe(u.valvulas, cat);
    for (const m of v.malas) preguntas.push(`La válvula «${m}» no está en la lista. ¿Cuál fue?`);
    const ini = hora(u.hora_inicio);
    const fin = hora(u.hora_fin);
    const borrador: BorradorUso = {
      fecha,
      equipoId: equipo?.id ?? "",
      valvulas: v.ok,
      sitio: "",
      horaInicio: ini && fin ? ini : "",
      horaFin: ini && fin ? fin : "",
      horas: ini && fin ? "" : txt(u.horas),
      carga: txt(u.carga_galones),
      empleadoId,
      actividad: "",
      observaciones: u.observaciones ?? "",
    };
    const errores = validarUso(borrador, catQuien, hoy);
    if (errores.equipoId) preguntas.push("¿Qué equipo usó? (motor de riego, guadaña, motosierra, bombas…)");
    if (errores.horas || errores.horaInicio || errores.horaFin)
      preguntas.push(`¿Cuántas horas trabajó ${nombreEquipo}, o a qué hora prendió y apagó?`);
    if (errores.carga) preguntas.push(`¿Cuántos galones le echó a ${nombreEquipo}?`);
    if (errores.fecha) preguntas.push("¿De qué día es el reporte?");
    if (errores.empleadoId && !u.trabajador) preguntas.push(conLista(`¿Quién usó ${nombreEquipo}?`));
    usos.push({
      equipo: nombreEquipo,
      trabajador: empleadoId ? nombreDe(empleadoId) : null,
      borrador,
      id: nuevoId(),
    });
  }

  if (labores.length === 0 && usos.length === 0 && preguntas.length === 0)
    preguntas.push("¿Qué labor hizo hoy, en qué válvula y cuántas horas?");

  return { fecha, labores, usos, preguntas: [...new Set(preguntas)] };
}

// ── Propuesta → filas ───────────────────────────────────────────────────────

export function filasDe(
  p: Propuesta,
  cat: CatalogoCampo,
  registradoEn: Date,
): { registros: RegistroCampo[]; usos: UsoCampo[] } {
  if (p.preguntas.length) throw new Error("La propuesta tiene preguntas sin resolver");
  const registros = p.labores.flatMap((l) =>
    armarRegistros(l.borrador, cat, registradoEn, (e) => l.ids[e]),
  );
  const usos = p.usos.map((u) => armarUso(u.borrador, registradoEn, u.id));
  return { registros, usos };
}

// ── Lo que lee el trabajador ────────────────────────────────────────────────

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function fechaLarga(f: string, hoy: string): string {
  if (f === hoy) return "hoy";
  const d = new Date(`${f}T12:00:00Z`);
  const ayer = new Date(`${hoy}T12:00:00Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  const base = `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
  return ayer.toISOString().slice(0, 10) === f ? `ayer (${base})` : base;
}

function num(s: string): string {
  return s ? s : "";
}

function tiempo(b: { horaInicio: string; horaFin: string; horas: string }): string {
  if (b.horaInicio && b.horaFin) return `de ${b.horaInicio} a ${b.horaFin}`;
  if (b.horas) return `${b.horas} h`;
  return "sin horas";
}

export function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Resumen para Telegram (HTML). */
export function resumen(p: Propuesta, hoy: string, porOtros: boolean): string {
  const l: string[] = [`<b>Esto entendí, ${escapar(fechaLarga(p.fecha, hoy))}:</b>`, ""];
  for (const x of p.labores) {
    const b = x.borrador;
    const partes = [`• <b>${escapar(x.labor)}</b>`];
    if (porOtros && x.trabajadores.length) partes.push(`(${escapar(x.trabajadores.join(", "))})`);
    l.push(partes.join(" "));
    const det: string[] = [tiempo(b)];
    if (b.valvulas.length) det.push(`válvula ${b.valvulas.join(", ")}`);
    if (b.sitio) det.push(b.sitio);
    if (b.sanas || b.pasador || b.negras) {
      const desgrane = x.labor.startsWith("Desgrane");
      if (desgrane) {
        if (b.sanas) det.push(`${num(b.sanas)} kg baba A`);
        if (b.negras) det.push(`${num(b.negras)} kg baba C`);
      } else {
        if (b.sanas) det.push(`${num(b.sanas)} sanas`);
        if (b.pasador) det.push(`${num(b.pasador)} pasador/monilia`);
        if (b.negras) det.push(`${num(b.negras)} negras`);
      }
    } else if (b.cantidad) det.push(`cantidad ${num(b.cantidad)}`);
    l.push(`   ${escapar(det.join(" · "))}`);
    if (b.observaciones) l.push(`   <i>${escapar(b.observaciones)}</i>`);
  }
  for (const u of p.usos) {
    const b = u.borrador;
    const det: string[] = [];
    if (b.horaInicio || b.horas) det.push(tiempo(b));
    if (b.valvulas.length) det.push(`válvula ${b.valvulas.join(", ")}`);
    if (b.carga) det.push(`le echó ${b.carga} gal`);
    const quien = porOtros && u.trabajador ? ` (${u.trabajador})` : "";
    l.push(`• <b>${escapar(u.equipo)}</b>${escapar(quien)}`);
    if (det.length) l.push(`   ${escapar(det.join(" · "))}`);
  }
  if (p.preguntas.length) {
    l.push("", "<b>Me falta saber:</b>");
    for (const q of p.preguntas) l.push(`❓ ${escapar(q)}`);
    l.push("", "Contésteme con otro audio y lo completo.");
  } else {
    l.push("", "¿Está bien? Si algo está mal, mándeme otro audio diciendo qué cambiar.");
  }
  return l.join("\n");
}

/** Palabras que el transcriptor debe escribir bien (nombres, labores, válvulas). */
export function vocabulario(cat: CatalogoCampo): string {
  const nombres = cat.empleados.map((e) => e.nombre).join(", ");
  const labores = cat.labores.map((l) => l.nombre).join(", ");
  return (
    `Reporte de labores de una finca de cacao en Colombia. Trabajadores: ${nombres}. ` +
    `Labores: ${labores}. Válvulas: ${cat.valvulas.join(", ")}. ` +
    "Mazorcas sanas, pasador, monilia, negras, kilos de baba, guadaña, motosierra, bomba, motor de riego, galones, ACPM."
  );
}
