/**
 * /campo — riego, uso de equipos y compras de combustible (0121). Lógica pura.
 *
 * Igual que `captura.ts` para las labores: qué pide cada formulario, cómo se
 * valida antes de guardar en el teléfono y qué fila sale. La base repite las
 * validaciones que importan (`finca_subir_usos`, `finca_subir_compras`).
 */

import {
  DIAS_ATRAS_MAX,
  HORAS_MAX,
  horasEntre,
  leerNumero,
  type CatalogoCaptura,
} from "./captura";

export type Combustible = "acpm" | "gasolina";

export interface EquipoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  combustible: Combustible;
}

/** El catálogo de 0121 trae equipos; una página guardada antes, no. */
export type CatalogoCampo = CatalogoCaptura & { equipos?: EquipoCatalogo[] };

export const MOTOR_RIEGO = "motor-riego";

/** Galones que caben en una carga razonable de un equipo (la base pone 200). */
export const CARGA_MAX = 200;

const fechaValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function errorFecha(fecha: string, hoy: string): string | undefined {
  if (!fechaValida(fecha)) return "Falta la fecha";
  if (fecha > hoy) return "La fecha no puede ser futura";
  if (fecha < restarDias(hoy, DIAS_ATRAS_MAX)) return `Solo hasta ${DIAS_ATRAS_MAX} días atrás`;
  return undefined;
}

const sinNaN = (x: number | null) => (x == null || Number.isNaN(x) ? null : x);

// ── Uso de equipos (riego incluido) ─────────────────────────────────────────

export interface BorradorUso {
  fecha: string;
  equipoId: string;
  valvulas: string[];
  sitio: string;
  horaInicio: string;
  horaFin: string;
  horas: string;
  /** Galones que se le echaron al equipo. Vacío si no se tanqueó. */
  carga: string;
  empleadoId: string;
  actividad: string;
  observaciones: string;
}

export function usoVacio(hoy: string, cat: CatalogoCampo): BorradorUso {
  const motor = cat.equipos?.find((e) => e.codigo === MOTOR_RIEGO);
  return {
    fecha: hoy,
    equipoId: motor?.id ?? "",
    valvulas: [],
    sitio: "",
    horaInicio: "",
    horaFin: "",
    horas: "",
    carga: "",
    empleadoId: cat.porOtros ? "" : (cat.yo ?? ""),
    actividad: "",
    observaciones: "",
  };
}

export type ErroresUso = Partial<Record<keyof BorradorUso, string>>;

/**
 * Un uso necesita horas, o una carga de combustible, o las dos: el día que se
 * tanquea el motor sin regar también se anota (así la carga cuadra).
 */
export function validarUso(b: BorradorUso, cat: CatalogoCampo, hoy: string): ErroresUso {
  const e: ErroresUso = {};
  const f = errorFecha(b.fecha, hoy);
  if (f) e.fecha = f;

  if (!cat.equipos?.some((q) => q.id === b.equipoId)) e.equipoId = "Elija el equipo";

  if (b.empleadoId) {
    if (!cat.empleados.some((x) => x.id === b.empleadoId)) e.empleadoId = "Trabajador que no está en la lista";
    else if (!cat.porOtros && b.empleadoId !== cat.yo) e.empleadoId = "Solo puede registrar lo suyo";
  } else if (!cat.porOtros) {
    e.empleadoId = "¿Quién usó el equipo?";
  }

  const validas = new Set(cat.valvulas);
  if (b.valvulas.some((v) => !validas.has(v))) e.valvulas = "Válvula que no está en la lista";

  let hayHoras = false;
  if (b.horaInicio.trim() || b.horaFin.trim()) {
    const h = horasEntre(b.horaInicio, b.horaFin);
    if (!/^\d{1,2}:\d{2}$/.test(b.horaInicio.trim())) e.horaInicio = "Hora de inicio inválida";
    else if (!/^\d{1,2}:\d{2}$/.test(b.horaFin.trim())) e.horaFin = "Hora de fin inválida";
    else if (h == null) e.horaFin = "El fin tiene que ser después del inicio";
    else if (h > HORAS_MAX) e.horaFin = `Más de ${HORAS_MAX} horas`;
    else hayHoras = true;
  } else {
    const h = leerNumero(b.horas);
    if (h != null) {
      if (Number.isNaN(h) || h <= 0) e.horas = "Horas inválidas";
      else if (h > HORAS_MAX) e.horas = `Más de ${HORAS_MAX} horas`;
      else hayHoras = true;
    }
  }

  const c = leerNumero(b.carga);
  if (c != null && (Number.isNaN(c) || c < 0)) e.carga = "Galones inválidos";
  else if (c != null && c > CARGA_MAX) e.carga = `Más de ${CARGA_MAX} galones`;

  if (!hayHoras && !(c && c > 0) && !e.horas && !e.horaInicio && !e.horaFin && !e.carga)
    e.horas = "Anote las horas, o los galones que se le echaron";

  return e;
}

export interface UsoCampo {
  id: string;
  fecha: string;
  equipo_id: string;
  actividad: string | null;
  valvulas: string[];
  sitio: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  horas: number | null;
  carga_galones: number | null;
  empleado_id: string | null;
  observaciones: string | null;
  registrado_en: string;
}

/** Debe venir validado. */
export function armarUso(b: BorradorUso, ahora: Date, id: string): UsoCampo {
  const ini = b.horaInicio.trim() || null;
  const fin = b.horaFin.trim() || null;
  const horas = ini && fin ? horasEntre(ini, fin) : sinNaN(leerNumero(b.horas));
  const carga = sinNaN(leerNumero(b.carga));
  return {
    id,
    fecha: b.fecha,
    equipo_id: b.equipoId,
    actividad: b.actividad.trim() || null,
    valvulas: [...b.valvulas],
    sitio: b.sitio.trim() || null,
    hora_inicio: ini && fin ? ini : null,
    hora_fin: ini && fin ? fin : null,
    horas,
    carga_galones: carga && carga > 0 ? carga : null,
    empleado_id: b.empleadoId || null,
    observaciones: b.observaciones.trim() || null,
    registrado_en: ahora.toISOString(),
  };
}

const coma = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

export function usoABorrador(u: UsoCampo): BorradorUso {
  return {
    fecha: u.fecha,
    equipoId: u.equipo_id,
    valvulas: [...u.valvulas],
    sitio: u.sitio ?? "",
    horaInicio: u.hora_inicio ?? "",
    horaFin: u.hora_fin ?? "",
    horas: u.hora_inicio ? "" : coma(u.horas),
    carga: coma(u.carga_galones),
    empleadoId: u.empleado_id ?? "",
    actividad: u.actividad ?? "",
    observaciones: u.observaciones ?? "",
  };
}

// ── Compras de combustible ──────────────────────────────────────────────────

export interface BorradorCompra {
  fecha: string;
  combustible: Combustible;
  galones: string;
  precio: string;
  valor: string;
  recibo: string;
  proveedor: string;
  destino: string;
  observaciones: string;
}

/** Lo que la finca escribe en la planilla, para no empezar de cero. */
export const PROVEEDORES = ["E.S. El Porvenir", "Cooperativa Veracruz"];
export const DESTINOS = [
  "Sistema de riego",
  "Control mecánico de malezas",
  "Transporte de ACPM",
  "Equipos finca",
  "Planta eléctrica",
];

export function compraVacia(hoy: string): BorradorCompra {
  return {
    fecha: hoy,
    combustible: "acpm",
    galones: "",
    precio: "",
    valor: "",
    recibo: "",
    proveedor: PROVEEDORES[0],
    destino: DESTINOS[0],
    observaciones: "",
  };
}

export type ErroresCompra = Partial<Record<keyof BorradorCompra, string>>;

export function validarCompra(b: BorradorCompra, hoy: string): ErroresCompra {
  const e: ErroresCompra = {};
  const f = errorFecha(b.fecha, hoy);
  if (f) e.fecha = f;
  const g = leerNumero(b.galones);
  const p = leerNumero(b.precio);
  const v = leerNumero(b.valor);
  if (g != null && (Number.isNaN(g) || g < 0)) e.galones = "Galones inválidos";
  else if (g != null && g > 1000) e.galones = "Más de 1.000 galones";
  if (p != null && (Number.isNaN(p) || p < 0)) e.precio = "Precio inválido";
  if (v != null && (Number.isNaN(v) || v < 0)) e.valor = "Valor inválido";
  if (g == null && v == null && !e.galones && !e.valor) e.valor = "Anote el valor pagado o los galones";
  return e;
}

export interface CompraCampo {
  id: string;
  fecha: string;
  combustible: Combustible;
  recibo: string | null;
  galones: number | null;
  precio_galon: number | null;
  valor: number | null;
  proveedor: string | null;
  destino: string | null;
  observaciones: string | null;
  registrado_en: string;
}

/**
 * Lo que falte de galones, precio o valor se calcula con los otros dos (el
 * recibo trae dos de los tres casi siempre). Debe venir validado.
 */
export function completarCompra(g: number | null, p: number | null, v: number | null) {
  if (g != null && p != null && v == null) v = Math.round(g * p);
  else if (v != null && p != null && p > 0 && g == null) g = Math.round((v / p) * 1000) / 1000;
  else if (g != null && v != null && g > 0 && p == null) p = Math.round(v / g);
  return { galones: g, precio: p, valor: v };
}

export function armarCompra(b: BorradorCompra, ahora: Date, id: string): CompraCampo {
  const c = completarCompra(
    sinNaN(leerNumero(b.galones)),
    sinNaN(leerNumero(b.precio)),
    sinNaN(leerNumero(b.valor)),
  );
  return {
    id,
    fecha: b.fecha,
    combustible: b.combustible,
    recibo: b.recibo.trim() || null,
    galones: c.galones,
    precio_galon: c.precio,
    valor: c.valor,
    proveedor: b.proveedor.trim() || null,
    destino: b.destino.trim() || null,
    observaciones: b.observaciones.trim() || null,
    registrado_en: ahora.toISOString(),
  };
}

export function compraABorrador(c: CompraCampo): BorradorCompra {
  return {
    fecha: c.fecha,
    combustible: c.combustible,
    galones: coma(c.galones),
    precio: c.precio_galon == null ? "" : String(c.precio_galon),
    valor: c.valor == null ? "" : String(c.valor),
    recibo: c.recibo ?? "",
    proveedor: c.proveedor ?? "",
    destino: c.destino ?? "",
    observaciones: c.observaciones ?? "",
  };
}
