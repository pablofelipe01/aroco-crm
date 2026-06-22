/**
 * Tipos del módulo de Procesos (tablero operativo por fases).
 *
 * La PLANTILLA (estructura del flujo) vive en `template.ts`; cada caso clona la
 * parte que le corresponde según su tipo. Las INSTANCIAS se persisten en
 * Supabase (tablas proceso_*).
 */

export type TipoCaso = "proveedor" | "orden_compra";
export type EstadoCaso = "en_curso" | "bloqueado" | "completado";
export type EstadoPaso =
  | "pendiente"
  | "en_curso"
  | "completado"
  | "bloqueado"
  | "no_aplica";

// ── Plantilla (estructura del proceso, en código) ───────────────────────────

export interface PasoPlantilla {
  numero: string; // "1", "3A", "6B"…
  titulo: string;
  rol: string; // rol funcional del flujo
  esAutomatico?: boolean; // pasos del "Sistema AROCO"
  esRama?: boolean; // pertenece a una rama de decisión (inicia en no_aplica)
}

export interface OpcionPlantilla {
  id: string;
  etiqueta: string;
  activaPasos: string[]; // números de paso que activa
}

export interface DecisionPlantilla {
  clave: string;
  pregunta: string;
  rol: string;
  opciones: OpcionPlantilla[];
}

export interface FasePlantilla {
  numero: number;
  nombre: string;
  recurrente?: boolean;
  pasos: PasoPlantilla[];
  decisiones: DecisionPlantilla[];
}

export interface ProcesoPlantilla {
  key: string;
  nombre: string;
  fases: FasePlantilla[];
  /** Qué fases recorre cada tipo de caso. */
  aplica: Record<TipoCaso, number[]>;
}

// ── Instancias (runtime, mapeadas desde Supabase) ───────────────────────────

export interface Persona {
  id: string;
  nombre: string;
  iniciales: string;
  color: string;
}

export interface PasoInstancia {
  id: string;
  faseNumero: number;
  faseNombre: string;
  orden: number;
  numero: string;
  titulo: string;
  rol: string;
  esAutomatico: boolean;
  esRama: boolean;
  asignadoA: string | null;
  estado: EstadoPaso;
  notas: string | null;
  fechaLimite: string | null;
  completadoEl: string | null;
  completadoPor: string | null;
}

export interface DecisionInstancia {
  id: string;
  faseNumero: number;
  orden: number;
  clave: string;
  pregunta: string;
  rol: string;
  opciones: OpcionPlantilla[];
  elegida: string | null;
}

export interface CasoResumen {
  id: string;
  tipo: TipoCaso;
  titulo: string;
  origen: string | null;
  faseActual: number;
  estado: EstadoCaso;
  actualizadoEl: string;
  /** % global de avance (pasos completados / aplicables). */
  avance: number;
  pasosTotales: number;
  pasosCompletados: number;
  responsableActual: string | null; // id de persona del paso en curso
}

export interface CasoDetalle extends CasoResumen {
  proveedorRef: string | null;
  creadoEl: string;
  pasos: PasoInstancia[];
  decisiones: DecisionInstancia[];
}
