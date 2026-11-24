/**
 * Captura de labores desde el celular (/campo) — lógica pura.
 *
 * Aquí vive lo que se puede probar sin navegador: qué pide el formulario según
 * la labor, cómo se calculan las horas, cómo una cuadrilla se vuelve una fila
 * por persona y qué se valida antes de guardar en el teléfono. La base repite
 * las validaciones que importan (`finca_subir_registros`, 0118): esto es para
 * que el trabajador vea el error en la plantación y no días después.
 */

export type Categoria =
  | "cosecha"
  | "poscosecha"
  | "cultivo"
  | "riego"
  | "sanidad"
  | "mantenimiento"
  | "administracion"
  | "ausencia";

export interface CatalogoCaptura {
  /** Ficha de trabajador de quien tiene la sesión, si la tiene. */
  yo: string | null;
  /** Dirección y Finca anotan por cualquiera (el mayordomo, la cuadrilla). */
  porOtros: boolean;
  empleados: { id: string; nombre: string }[];
  labores: { id: string; nombre: string; categoria: Categoria; unidad: string | null }[];
  valvulas: string[];
  /** Fecha de hoy en Colombia según el servidor, al bajar el catálogo. */
  hoy: string;
}

/**
 * Qué cifras pide la labor. Cosecha y desgrane usan las mismas tres columnas
 * de la hoja con sentidos distintos: en cosecha son mazorcas (sanas, pasador o
 * monilia, negras); en desgrane, kg baba calidad A (sanas) y C (negras).
 */
export type Medida = "cosecha" | "desgrane" | "cantidad" | "horas";

export function medidaDe(labor: { nombre: string; unidad: string | null }): Medida {
  if (labor.nombre === "Cosecha") return "cosecha";
  if (labor.nombre.startsWith("Desgrane")) return "desgrane";
  if (labor.unidad) return "cantidad";
  return "horas";
}

/** Lo que el trabajador llena. Los números van como texto: así los teclea. */
export interface Borrador {
  fecha: string;
  empleados: string[];
  laborId: string;
  valvulas: string[];
  sitio: string;
  horaInicio: string;
  horaFin: string;
  /** Solo si no anotó inicio y fin. */
  horas: string;
  cantidad: string;
  sanas: string;
  pasador: string;
  negras: string;
  observaciones: string;
}

export function borradorVacio(hoy: string, yo: string | null): Borrador {
  return {
    fecha: hoy,
    empleados: yo ? [yo] : [],
    laborId: "",
    valvulas: [],
    sitio: "",
    horaInicio: "",
    horaFin: "",
    horas: "",
    cantidad: "",
    sanas: "",
    pasador: "",
    negras: "",
    observaciones: "",
  };
}

/** Lo que va a la cola del teléfono y de ahí a `finca_subir_registros`. */
export interface RegistroCampo {
  id: string;
  fecha: string;
  empleado_id: string;
  labor_id: string;
  valvulas: string[];
  sitio: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  horas: number;
  cantidad: number | null;
  unidad: string | null;
  sanas: number | null;
  pasador_monilia: number | null;
  negras: number | null;
  observaciones: string | null;
  registrado_en: string;
}

/** Hasta dónde atrás se puede registrar. La base pone 45 días. */
export const DIAS_ATRAS_MAX = 45;
export const HORAS_MAX = 16;

/** «7,5» y «7.5» son lo mismo; vacío es null; basura es NaN. */
export function leerNumero(s: string): number | null {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  // «1.200» (punto de miles, sin decimales) en Colombia es mil doscientos, no
  // uno coma dos. «1.200,5» también lleva punto de miles.
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  if (/^\d{1,3}(\.\d{3})*,\d+$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d+([.,]\d+)?$/.test(t)) return Number(t.replace(",", "."));
  return NaN;
}

function minutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Horas entre dos «HH:MM» del mismo día, a dos decimales. */
export function horasEntre(inicio: string, fin: string): number | null {
  const a = minutos(inicio);
  const b = minutos(fin);
  if (a == null || b == null || b <= a) return null;
  return Math.round(((b - a) / 60) * 100) / 100;
}

/** Fecha de un instante en Colombia (UTC−5, sin horario de verano). */
export function fechaColombia(d: Date): string {
  return new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export type Errores = Partial<Record<keyof Borrador, string>>;

/**
 * Valida el borrador. `hoy` es la fecha del TELÉFONO en Colombia: el catálogo
 * pudo bajarse hace días y su `hoy` ya no sirve.
 *
 * `opciones` es para la corrección desde el CRM (0119): ahí se corrige
 * historia sin la ventana de 45 días, y «sin trabajador» o «sin horas» se
 * aceptan solo si la fila ya venía así de la hoja.
 */
export interface OpcionesValidar {
  desde?: string;
  permitirSinEmpleado?: boolean;
  permitirSinHoras?: boolean;
}

export function validar(
  b: Borrador,
  cat: CatalogoCaptura,
  hoy: string,
  opciones: OpcionesValidar = {},
): Errores {
  const e: Errores = {};
  const desde = opciones.desde ?? restarDias(hoy, DIAS_ATRAS_MAX);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) e.fecha = "Falta la fecha";
  else if (b.fecha > hoy) e.fecha = "La fecha no puede ser futura";
  else if (b.fecha < desde)
    e.fecha = opciones.desde ? `No antes de ${desde}` : `Solo hasta ${DIAS_ATRAS_MAX} días atrás`;

  const ids = new Set(cat.empleados.map((x) => x.id));
  if (b.empleados.length === 0) {
    if (!opciones.permitirSinEmpleado) e.empleados = "¿Quién hizo la labor?";
  }
  else if (b.empleados.some((x) => !ids.has(x))) e.empleados = "Trabajador que no está en la lista";
  else if (!cat.porOtros && b.empleados.some((x) => x !== cat.yo))
    e.empleados = "Solo puede registrar sus propias labores";

  const labor = cat.labores.find((l) => l.id === b.laborId);
  if (!labor) e.laborId = "Elija la labor";

  const validas = new Set(cat.valvulas);
  if (b.valvulas.some((v) => !validas.has(v))) e.valvulas = "Válvula que no está en la lista";

  const conHoras = b.horaInicio.trim() || b.horaFin.trim();
  if (conHoras) {
    if (minutos(b.horaInicio) == null) e.horaInicio = "Hora de inicio inválida";
    if (minutos(b.horaFin) == null) e.horaFin = "Hora de fin inválida";
    if (!e.horaInicio && !e.horaFin) {
      const h = horasEntre(b.horaInicio, b.horaFin);
      if (h == null) e.horaFin = "El fin tiene que ser después del inicio";
      else if (h > HORAS_MAX) e.horaFin = `Más de ${HORAS_MAX} horas`;
    }
  } else {
    const h = leerNumero(b.horas);
    if (h == null) {
      if (!opciones.permitirSinHoras) e.horas = "Anote las horas o el inicio y el fin";
    }
    else if (Number.isNaN(h) || h <= 0) e.horas = "Horas inválidas";
    else if (h > HORAS_MAX) e.horas = `Más de ${HORAS_MAX} horas`;
  }

  const num = (k: "cantidad" | "sanas" | "pasador" | "negras") => {
    const n = leerNumero(b[k]);
    if (n != null && (Number.isNaN(n) || n < 0)) e[k] = "Número inválido";
  };
  if (labor) {
    const m = medidaDe(labor);
    if (m === "cosecha") {
      num("sanas");
      num("pasador");
      num("negras");
    } else if (m === "desgrane") {
      num("sanas");
      num("negras");
    } else if (m === "cantidad") num("cantidad");
  }

  return e;
}

export function sinErrores(e: Errores): boolean {
  return Object.keys(e).length === 0;
}

/**
 * Del borrador a las filas: UNA POR TRABAJADOR. En cuadrilla, cada uno lleva
 * la misma cifra — el cliente confirmó que es lo de cada uno y se suma (ver
 * 0117). Debe venir validado.
 *
 * `idPara(empleado)` da el id de cada fila. Al corregir algo que estaba en la
 * cola se le pasa el id que ya tenía ese trabajador: si la versión vieja sí
 * alcanzó a llegar (subida con respuesta perdida), la base conserva una sola
 * fila en vez de dos.
 */
export function armarRegistros(
  b: Borrador,
  cat: CatalogoCaptura,
  ahora: Date,
  idPara: (empleadoId: string) => string,
): RegistroCampo[] {
  const d = datosDe(b, cat);
  if (d.horas == null) throw new Error("Horas inválidas");
  const horas = d.horas;

  const unicos = [...new Set(b.empleados)];
  return unicos.map((empleado_id) => ({
    ...d,
    id: idPara(empleado_id),
    empleado_id,
    horas,
    registrado_en: ahora.toISOString(),
  }));
}

/** Los datos de UNA fila según el borrador (sin trabajador ni id). */
export interface DatosRegistro {
  fecha: string;
  labor_id: string;
  valvulas: string[];
  sitio: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  horas: number | null;
  cantidad: number | null;
  unidad: string | null;
  sanas: number | null;
  pasador_monilia: number | null;
  negras: number | null;
  observaciones: string | null;
}

/**
 * Del borrador a las columnas. Solo guarda las cifras que la labor usa: si se
 * corrige una fila de Cosecha a Riego, las mazorcas no quedan colgando.
 * Debe venir validado.
 */
export function datosDe(b: Borrador, cat: CatalogoCaptura): DatosRegistro {
  const labor = cat.labores.find((l) => l.id === b.laborId);
  if (!labor) throw new Error("Labor desconocida");
  const m = medidaDe(labor);

  const ini = b.horaInicio.trim() || null;
  const fin = b.horaFin.trim() || null;
  const h = ini && fin ? horasEntre(ini, fin) : leerNumero(b.horas);
  if (h != null && Number.isNaN(h)) throw new Error("Horas inválidas");

  const n = (s: string) => {
    const x = leerNumero(s);
    return x == null || Number.isNaN(x) ? null : x;
  };
  let sanas: number | null = null;
  let pasador: number | null = null;
  let negras: number | null = null;
  let cantidad: number | null = null;
  if (m === "cosecha") {
    sanas = n(b.sanas);
    pasador = n(b.pasador);
    negras = n(b.negras);
  } else if (m === "desgrane") {
    sanas = n(b.sanas);
    negras = n(b.negras);
  } else if (m === "cantidad") {
    cantidad = n(b.cantidad);
  }
  if (m === "cosecha" || m === "desgrane") {
    const partes = [sanas, pasador, negras].filter((x): x is number => x != null);
    cantidad = partes.length ? partes.reduce((a, x) => a + x, 0) : null;
  }

  return {
    fecha: b.fecha,
    labor_id: labor.id,
    valvulas: [...b.valvulas],
    sitio: b.sitio.trim() || null,
    hora_inicio: ini,
    hora_fin: fin,
    horas: h,
    cantidad,
    unidad: labor.unidad,
    sanas,
    pasador_monilia: pasador,
    negras,
    observaciones: b.observaciones.trim() || null,
  };
}

/** Lo que ya está guardado, de vuelta a borrador (para corregirlo). */
export function borradorDesde(r: {
  fecha: string;
  empleado_id: string | null;
  labor_id: string;
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
}): Borrador {
  const s = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
  const ini = r.hora_inicio?.slice(0, 5) ?? "";
  const fin = r.hora_fin?.slice(0, 5) ?? "";
  return {
    fecha: r.fecha,
    empleados: r.empleado_id ? [r.empleado_id] : [],
    laborId: r.labor_id,
    valvulas: [...r.valvulas],
    sitio: r.sitio ?? "",
    horaInicio: ini && fin ? ini : "",
    horaFin: ini && fin ? fin : "",
    horas: ini && fin ? "" : s(r.horas),
    cantidad: s(r.cantidad),
    sanas: s(r.sanas),
    pasador: s(r.pasador_monilia),
    negras: s(r.negras),
    observaciones: r.observaciones ?? "",
  };
}
