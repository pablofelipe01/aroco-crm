/**
 * Lectura del «REPORTE DIARIO 2026 FINCA» para la carga histórica de Labores
 * Finca. Todo puro: recibe las filas como las da `sheet_to_json(..., {header: 1,
 * raw: true})` y devuelve lo que se inserta. El script `scripts/cargar-finca.ts`
 * solo lee el archivo y escribe.
 *
 * Lo que la hoja trae y aquí se arregla (ver memoria aroco-labores-finca):
 *  - 24 escrituras para 7 personas.
 *  - ~110 escrituras para ~40 labores.
 *  - Válvulas a mano: «3;- 8 - 21», «8 a 21», «1 Frutal», «Quinta».
 *  - Años errados (2025, 2027) y fechas como texto («15//8/26»).
 *  - Horas imposibles (80 h, negativas).
 * Lo que no se puede resolver con seguridad entra marcado `dudoso` con su
 * motivo, para que alguien de la finca lo confirme.
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

/** Sin tildes, minúsculas, un solo espacio. */
export function clave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ── Trabajadores ────────────────────────────────────────────────────────────

/**
 * Nombre canónico por persona. La escritura que se deja es la más usada en la
 * hoja, salvo «Luis Enrique», que es como se escribe el nombre (la hoja
 * alterna Henrique/Enrique 201 a 104). Confirmar con la finca.
 */
const EMPLEADOS: { nombre: string; patron: RegExp }[] = [
  { nombre: "Juan Carlos García", patron: /^juan carlos g/ },
  { nombre: "Heriberto Pinzón", patron: /^heriberto pin/ },
  { nombre: "William Osorio", patron: /^willi\w* osorio/ },
  { nombre: "Luis Enrique Hernández", patron: /^luis e?h?enrique hernandez/ },
  { nombre: "Katherine Ortiz Ospina", patron: /^kathe?r?i?ne ortiz/ },
  { nombre: "Lilibeth Sanhes Florián", patron: /^lilibeth/ },
  { nombre: "Martha Liliana Pérez", patron: /^martha liliana/ },
];

export function normalizarEmpleado(raw: string): {
  nombre: string;
  conocido: boolean;
} {
  const k = clave(raw);
  const e = EMPLEADOS.find((x) => x.patron.test(k));
  if (e) return { nombre: e.nombre, conocido: true };
  // Persona nueva: se deja como viene, con mayúscula inicial por palabra.
  return {
    nombre: k.replace(/\b\p{L}/gu, (c) => c.toUpperCase()),
    conocido: false,
  };
}

// ── Labores ─────────────────────────────────────────────────────────────────

export interface LaborCanonica {
  nombre: string;
  categoria: Categoria;
  unidad: string | null;
}

/**
 * Orden importa: gana el primer patrón que encaja, así «riego con balde» se
 * resuelve antes que «riego» y «mantenimiento riego» antes que
 * «mantenimiento».
 */
const LABORES: (LaborCanonica & { patron: RegExp; detalle?: boolean })[] = [
  {
    nombre: "Cosecha",
    categoria: "cosecha",
    unidad: "mazorcas",
    patron: /^cosecha$/,
  },
  {
    nombre: "Conteo de fruta",
    categoria: "cosecha",
    unidad: null,
    patron: /^conteo de fruta/,
  },
  {
    nombre: "Estimado de producción",
    categoria: "cosecha",
    unidad: null,
    patron: /^estimado produccion/,
  },
  {
    nombre: "Desgrane rajado de fruta",
    categoria: "poscosecha",
    unidad: "kg",
    patron: /^desa?grane rajado ?de fruta/,
  },
  {
    nombre: "Desgrane",
    categoria: "poscosecha",
    unidad: "kg",
    patron: /^desgrane$/,
  },
  {
    nombre: "Poscosecha invernadero",
    categoria: "poscosecha",
    unidad: null,
    patron: /^poscosecha invernadero/,
  },
  {
    nombre: "Poscosecha",
    categoria: "poscosecha",
    unidad: null,
    patron: /^poscosecha$/,
  },
  {
    nombre: "Lavado de cajones de fermentación",
    categoria: "poscosecha",
    unidad: null,
    patron: /^lavado (de )?cajo/,
  },
  {
    nombre: "Cargue y traslado de cacao",
    categoria: "poscosecha",
    unidad: null,
    patron: /^cargue y traslado/,
  },

  {
    nombre: "Riego con balde",
    categoria: "riego",
    unidad: null,
    patron: /^riego con valde/,
  },
  {
    nombre: "Lectura de tensiómetros",
    categoria: "riego",
    unidad: null,
    patron: /^lectura de tenciometros/,
  },
  {
    nombre: "Fertirriego",
    categoria: "riego",
    unidad: null,
    patron: /^fertilizacion riego/,
  },
  {
    detalle: true,
    nombre: "Mantenimiento de riego",
    categoria: "riego",
    unidad: null,
    patron:
      /^(mantenimiento|mantenmiento) (de tuberia )?riego|^mantenimiento caseta riego|^desmonte de bomba de riego|^apagado de motor de riego|^lavado del tamque/,
  },
  {
    nombre: "Inspección de riego",
    categoria: "riego",
    unidad: null,
    patron: /^inspeccion riego|^induccion riego/,
  },
  { nombre: "Riego", categoria: "riego", unidad: null, patron: /^riego$/ },

  { nombre: "Poda", categoria: "cultivo", unidad: "árboles", patron: /^poda$/ },
  {
    nombre: "Deschuponar",
    categoria: "cultivo",
    unidad: "árboles",
    patron: /^deschupon/,
  },
  {
    nombre: "Control mecánico de malezas",
    categoria: "cultivo",
    unidad: null,
    patron: /^control mecanico de ?malezas/,
  },
  {
    nombre: "Control químico de malezas",
    categoria: "cultivo",
    unidad: "bombas",
    patron: /^con?n?tr[oi]l quimico (de )?malezas/,
  },
  {
    nombre: "Control de malezas (aguateada / repique)",
    categoria: "cultivo",
    unidad: null,
    patron: /^aguateada control malezas|^control repique de malezas/,
  },
  {
    nombre: "Fertilización",
    categoria: "cultivo",
    unidad: null,
    patron: /^(preparacion )?fertilizacion$/,
  },
  {
    detalle: true,
    nombre: "Siembra y resiembra",
    categoria: "cultivo",
    unidad: null,
    patron: /^siembra|^resiembra/,
  },
  {
    nombre: "Vivero",
    categoria: "cultivo",
    unidad: null,
    patron: /^vivero$|^medicion area vivero/,
  },
  {
    detalle: true,
    nombre: "Tumba y repique de melina / matarratón",
    categoria: "cultivo",
    unidad: null,
    patron: /melina|matarraton/,
  },
  {
    detalle: true,
    nombre: "Conteo y medición de válvulas",
    categoria: "cultivo",
    unidad: null,
    patron:
      /^conteo arboles valbulas|^medicion valbulas|^recorrido por valbula/,
  },
  {
    nombre: "Revisión de lotes de cacao",
    categoria: "cultivo",
    unidad: null,
    patron: /^revicion de lotes/,
  },

  {
    detalle: true,
    nombre: "Control de monilia",
    categoria: "sanidad",
    unidad: null,
    patron: /monilia/,
  },
  {
    nombre: "Control de hormigas",
    categoria: "sanidad",
    unidad: "nidos",
    patron: /^co[mn]trol hormigas/,
  },

  {
    detalle: true,
    nombre: "Mantenimiento general lago",
    categoria: "mantenimiento",
    unidad: null,
    patron:
      /^mantenimiento general lago|^instalacion agua lago|^llenado de piscina/,
  },
  {
    detalle: true,
    nombre: "Aseo y jardín de la quinta",
    categoria: "mantenimiento",
    unidad: null,
    patron:
      /^aseo quinta|^mantenimiento jardin quinta|^instalacion hidrobomba quinta/,
  },
  {
    detalle: true,
    nombre: "Mantenimiento general",
    categoria: "mantenimiento",
    unidad: null,
    patron: /^mantenimiento general$|^mantenimiento camas|^arreglo de la bomba/,
  },
  {
    detalle: true,
    nombre: "Desmonte y limpieza",
    categoria: "mantenimiento",
    unidad: null,
    patron:
      /^desmonte y limpieza|^limpieza de nacederos|^recogida de|^sacando madera/,
  },
  {
    nombre: "Cercas y estacas",
    categoria: "mantenimiento",
    unidad: "estacas",
    patron: /estacas/,
  },
  {
    nombre: "Funciones varias",
    categoria: "mantenimiento",
    unidad: null,
    patron: /^funciones varias/,
  },

  {
    nombre: "Supervisión",
    categoria: "administracion",
    unidad: null,
    patron: /^supervision/,
  },
  {
    nombre: "Informe de oficina",
    categoria: "administracion",
    unidad: null,
    patron: /^informe oficina/,
  },
  {
    detalle: true,
    nombre: "Atención de visitas",
    categoria: "administracion",
    unidad: null,
    patron: /^atencion/,
  },
  {
    nombre: "Reunión con directivos",
    categoria: "administracion",
    unidad: null,
    patron: /^reunion/,
  },
  {
    detalle: true,
    nombre: "Compras y diligencias",
    categoria: "administracion",
    unidad: null,
    patron: /^compras|^viaje a/,
  },

  {
    nombre: "Vacaciones",
    categoria: "ausencia",
    unidad: null,
    patron: /^vacaciones/,
  },
  {
    nombre: "Compensatorio",
    categoria: "ausencia",
    unidad: null,
    patron: /^compensatorio/,
  },
  {
    detalle: true,
    nombre: "Incapacidad",
    categoria: "ausencia",
    unidad: null,
    patron: /^incapaci/,
  },
  {
    detalle: true,
    nombre: "Cita médica",
    categoria: "ausencia",
    unidad: null,
    patron: /^cita medica|^examenes medicos/,
  },
  {
    detalle: true,
    nombre: "Permiso",
    categoria: "ausencia",
    unidad: null,
    patron: /^permiso/,
  },
  {
    nombre: "Lluvia (sin labor)",
    categoria: "ausencia",
    unidad: null,
    patron: /^lluvias?$/,
  },
];

/**
 * `detalle` es el texto original cuando la labor canónica agrupa varias
 * («Atencion Visita Belgica» → Atención de visitas): va a observaciones.
 */
export function normalizarLabor(raw: string): {
  labor: LaborCanonica;
  conocida: boolean;
  detalle: string | null;
} {
  const k = clave(raw);
  const l = LABORES.find((x) => x.patron.test(k));
  if (l) {
    const labor = {
      nombre: l.nombre,
      categoria: l.categoria,
      unidad: l.unidad,
    };
    // El texto original solo se guarda donde dice algo que el nombre agrupado
    // pierde (a quién se atendió, qué se reparó).
    return {
      labor,
      conocida: true,
      detalle:
        l.detalle && clave(l.nombre) !== k
          ? raw.trim().replace(/\s+/g, " ")
          : null,
    };
  }
  return {
    labor: {
      nombre: raw
        .trim()
        .replace(/\s+/g, " ")
        .replace(/^\p{L}/u, (c) => c.toUpperCase()),
      categoria: "mantenimiento",
      unidad: null,
    },
    conocida: false,
    detalle: null,
  };
}

/** Las labores del catálogo, para sembrarlas aunque la hoja no las use. */
export function catalogoLabores(): LaborCanonica[] {
  return LABORES.map(({ nombre, categoria, unidad }) => ({
    nombre,
    categoria,
    unidad,
  }));
}

// ── Válvulas ────────────────────────────────────────────────────────────────

export const VALVULAS_OFICIALES = [
  "1",
  "1 Frutal",
  "2",
  "3",
  "8",
  "9",
  "10",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
] as const;

const NUMERICAS = VALVULAS_OFICIALES.filter((v) => /^\d+$/.test(v)).map(Number);

/** Sitios que aparecen en la columna VALVULAS y no son válvulas. */
const SITIOS: Record<string, string> = {
  quinta: "Quinta",
  vivero: "Vivero",
  escombros: "Escombros",
  invernadero: "Invernadero",
  lago: "Lago",
  carreteable: "Carreteable",
  piscina: "Piscina",
  perimetros: "Perímetros",
};

export interface ValvulasLeidas {
  valvulas: string[];
  sitio: string | null;
  duda: string | null;
}

export function parsearValvulas(raw: unknown): ValvulasLeidas {
  if (raw == null || raw === "")
    return { valvulas: [], sitio: null, duda: null };

  // Número suelto: o es una válvula, o Excel convirtió el texto en fecha/hora.
  if (typeof raw === "number") {
    if (NUMERICAS.includes(raw))
      return { valvulas: [String(raw)], sitio: null, duda: null };
    return { valvulas: [], sitio: null, duda: `válvula ilegible «${raw}»` };
  }

  const texto = String(raw);
  const k = clave(texto);
  const sitio = SITIOS[k];
  if (sitio) return { valvulas: [], sitio, duda: null };
  if (/^todas/.test(k))
    return { valvulas: [...VALVULAS_OFICIALES], sitio: null, duda: null };
  if (k === "riego")
    return { valvulas: [], sitio: null, duda: "válvula «Riego» (sin válvula)" };

  const out = new Set<string>();
  const fuera: number[] = [];
  // «1 Frutal» / «1fr» primero, para que su 1 no se lea como la válvula 1.
  const sinFrutal = k.replace(/\b1 ?fr(utal)?\b/g, () => {
    out.add("1 Frutal");
    return " ";
  });

  // «!8» es «18» con el dedo corrido (Shift+1).
  const limpio = sinFrutal.replace(/!/g, "1");

  // Rangos: «8 a 21», «1a 16», «1 a la 21» → las oficiales dentro del rango.
  const sinRangos = limpio.replace(
    /(\d+)\s*a\s*(?:la\s*)?(\d+)/g,
    (_m, a: string, b: string) => {
      const [lo, hi] = [Number(a), Number(b)].sort((x, y) => x - y);
      for (const n of NUMERICAS) if (n >= lo && n <= hi) out.add(String(n));
      return " ";
    },
  );

  for (const m of sinRangos.match(/\d+/g) ?? []) {
    const n = Number(m);
    if (NUMERICAS.includes(n)) out.add(String(n));
    else fuera.push(n);
  }

  const valvulas = VALVULAS_OFICIALES.filter((v) => out.has(v));
  let duda: string | null = null;
  if (fuera.length) duda = `válvula fuera de la lista (${fuera.join(", ")})`;
  else if (!valvulas.length) duda = `válvula ilegible «${texto.trim()}»`;
  return { valvulas, sitio: null, duda };
}

// ── Fechas y horas ──────────────────────────────────────────────────────────

/** Serial de Excel → AAAA-MM-DD (la parte entera es el día local). */
export function serialAFecha(serial: number): string {
  return new Date(Math.round((Math.floor(serial) - 25569) * 86400000))
    .toISOString()
    .slice(0, 10);
}

/** Fracción de día → HH:MM. */
export function fraccionAHora(f: unknown): string | null {
  if (typeof f !== "number" || !Number.isFinite(f)) return null;
  const dia = f - Math.floor(f);
  const min = Math.round(dia * 24 * 60);
  if (min >= 24 * 60) return null;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * Fecha de la hoja → fecha 2026. Toda la hoja es de 2026: un año distinto es
 * un error de digitación (el 2-ene salió como 2025, junio como 2027) y se
 * corrige al 2026, avisando.
 *
 * Texto: «15//8/26», «21/1/206», «11/05726» → día/mes con año 2026.
 */
export function leerFecha(
  raw: unknown,
  anio = 2026,
): { fecha: string | null; duda: string | null } {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const f = serialAFecha(raw);
    if (Number(f.slice(0, 4)) === anio) return { fecha: f, duda: null };
    return {
      fecha: `${anio}${f.slice(4)}`,
      duda: `año corregido ${f.slice(0, 4)}→${anio}`,
    };
  }
  if (typeof raw === "string") {
    const m = /^(\d{1,2})\D+(\d{1,2})/.exec(raw.trim());
    if (m) {
      const d = Number(m[1]);
      const mes = Number(m[2]);
      if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) {
        const f = `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (!Number.isNaN(Date.parse(f)))
          return { fecha: f, duda: `fecha escrita como texto «${raw}»` };
      }
    }
    return { fecha: null, duda: `fecha ilegible «${raw}»` };
  }
  return { fecha: null, duda: null };
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
    return Number(v);
  return null;
}

function texto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

const UNIDADES: Record<string, string> = {
  kg: "kg",
  mzc: "mazorcas",
  mazorca: "mazorcas",
  mazorcas: "mazorcas",
  arboles: "árboles",
  plantas: "plantas",
  bombas: "bombas",
  nidos: "nidos",
  estacas: "estacas",
};

export function normalizarUnidad(raw: unknown): string | null {
  const t = texto(raw);
  if (!t) return null;
  return UNIDADES[clave(t)] ?? clave(t);
}

// ── Fila del reporte diario ─────────────────────────────────────────────────

/** Columnas de «Reporte Labores x Empleado» (fila 3 de la hoja). */
const C = {
  fecha: 5,
  nombre: 6,
  actividad: 7,
  valvulas: 8,
  sanas: 9,
  pasador: 10,
  negras: 11,
  cantidad: 12,
  unidad: 13,
  inicio: 14,
  fin: 15,
  horas: 17,
  obs: 19,
} as const;

export interface RegistroHoja {
  filaHoja: number;
  fecha: string;
  empleado: string;
  labor: LaborCanonica;
  valvulas: string[];
  sitio: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  horas: number | null;
  cantidad: number | null;
  unidad: string | null;
  sanas: number | null;
  pasadorMonilia: number | null;
  negras: number | null;
  observaciones: string | null;
  dudas: string[];
  original: Record<string, unknown>;
}

/** Jornada más larga que se acepta sin dudar. */
const HORAS_MAX = 14;

/**
 * Una fila de la hoja → registro. `null` si la fila no es un registro (vacía,
 * encabezado). `filaHoja` es el número de fila de Excel (1 = primera).
 */
export function leerFilaRegistro(
  r: unknown[],
  filaHoja: number,
): RegistroHoja | null {
  const nombre = texto(r[C.nombre]);
  const actividad = texto(r[C.actividad]);
  if (!nombre || !actividad || clave(nombre) === "nombre") return null;

  const dudas: string[] = [];
  const f = leerFecha(r[C.fecha]);
  if (f.duda) dudas.push(f.duda);
  if (!f.fecha) return null;

  // La columna «Mes» no se usa: desde julio la fórmula se corrió y cuenta
  // filas (llega a 69), así que no sirve para validar la fecha.

  const emp = normalizarEmpleado(nombre);
  if (!emp.conocido) dudas.push(`trabajador nuevo «${nombre}»`);

  const lab = normalizarLabor(actividad);
  if (!lab.conocida) dudas.push(`labor sin catálogo «${actividad}»`);

  const v = parsearValvulas(r[C.valvulas]);
  if (v.duda) dudas.push(v.duda);

  const horaInicio = fraccionAHora(r[C.inicio]);
  const horaFin = fraccionAHora(r[C.fin]);
  // Las horas se recalculan desde inicio y fin cuando hay ambos: la columna
  // HORAS de la hoja es una fórmula que a veces falta o da negativa.
  let horas: number | null = null;
  const ini = num(r[C.inicio]);
  const fin = num(r[C.fin]);
  if (ini != null && fin != null)
    horas = Math.round((fin - ini) * 24 * 100) / 100;
  else horas = num(r[C.horas]);
  if (horas == null) dudas.push("sin horas");
  else if (horas < 0 || horas > HORAS_MAX) {
    dudas.push(`horas imposibles (${horas})`);
    horas = null;
  }

  const obs = [lab.detalle, texto(r[C.obs])].filter(Boolean).join(" · ");

  return {
    filaHoja,
    fecha: f.fecha,
    empleado: emp.nombre,
    labor: lab.labor,
    valvulas: v.valvulas,
    sitio: v.sitio,
    horaInicio,
    horaFin,
    horas,
    cantidad: num(r[C.cantidad]) || null,
    unidad: normalizarUnidad(r[C.unidad]) ?? lab.labor.unidad,
    sanas: num(r[C.sanas]),
    pasadorMonilia: num(r[C.pasador]),
    negras: num(r[C.negras]),
    observaciones: obs || null,
    dudas,
    original: {
      fecha: r[C.fecha],
      nombre,
      actividad,
      valvulas: r[C.valvulas] ?? null,
      hora_inicio: r[C.inicio] ?? null,
      hora_fin: r[C.fin] ?? null,
      horas: r[C.horas] ?? null,
    },
  };
}

// ── Poscosecha ──────────────────────────────────────────────────────────────

export interface BacheHoja {
  numero: number;
  valvulasTexto: string | null;
  variedad: string | null;
  calidad: "A" | "C" | null;
  fechaInicio: string | null;
  pesoBaba: number | null;
  fechaSalidaSecado: string | null;
  pesoFermentado: number | null;
  pesoFinal: number | null;
  fechaFin: string | null;
  fechaDespacho: string | null;
  pesoSalida: number | null;
  observaciones: string | null;
  dudas: string[];
  original: Record<string, unknown>;
}

/**
 * Fila de «Poscosecha» → bache. `null` si el bache está vacío (la hoja trae
 * numerados de antemano hasta el 1910, sin datos).
 */
export function leerFilaBache(r: unknown[]): BacheHoja | null {
  const numero = num(r[0]);
  if (numero == null) return null;
  const pesoBaba = num(r[5]);
  const calidadTxt = texto(r[3])?.toUpperCase() ?? null;
  if (pesoBaba == null && !calidadTxt) return null;

  const dudas: string[] = [];
  const fecha = (i: number, nombre: string) => {
    const f = leerFecha(r[i]);
    if (f.duda) dudas.push(`${nombre}: ${f.duda}`);
    return f.fecha;
  };
  const fechaInicio = fecha(4, "inicio");
  const fechaSalidaSecado = fecha(6, "salida de secado");
  const fechaFin = fecha(9, "fin");
  const fechaDespacho = fecha(11, "despacho");

  const orden: [string | null, string][] = [
    [fechaInicio, "inicio"],
    [fechaSalidaSecado, "salida de secado"],
    [fechaFin, "fin"],
    [fechaDespacho, "despacho"],
  ];
  const conFecha = orden.filter((x): x is [string, string] => x[0] != null);
  for (let i = 1; i < conFecha.length; i++) {
    if (conFecha[i][0] < conFecha[i - 1][0]) {
      dudas.push(
        `${conFecha[i][1]} (${conFecha[i][0]}) antes que ${conFecha[i - 1][1]} (${conFecha[i - 1][0]})`,
      );
    }
  }

  const calidad = calidadTxt === "A" || calidadTxt === "C" ? calidadTxt : null;
  if (calidadTxt && !calidad) dudas.push(`calidad «${calidadTxt}»`);

  const pesoFermentado = num(r[7]);
  const pesoFinal = num(r[8]);
  if (pesoBaba != null && pesoFinal != null && pesoFinal > pesoBaba)
    dudas.push("peso seco mayor que el baba");

  return {
    numero,
    valvulasTexto: texto(r[1]),
    variedad: texto(r[2]),
    calidad,
    fechaInicio,
    pesoBaba,
    fechaSalidaSecado,
    pesoFermentado,
    pesoFinal,
    fechaFin,
    fechaDespacho,
    pesoSalida: num(r[12]),
    observaciones: texto(r[13]),
    dudas,
    original: {
      fecha_inicio: r[4] ?? null,
      fecha_salida_secado: r[6] ?? null,
      fecha_fin: r[9] ?? null,
      fecha_despacho: r[11] ?? null,
    },
  };
}

// ── Desgrane de mayo ────────────────────────────────────────────────────────

export interface DesgraneDia {
  fecha: string;
  kgA: number | null;
  kgC: number | null;
  duda: string | null;
}

/**
 * «Cosecha Mayo» trae el desgrane de mayo por día y sin trabajador, porque
 * mayo casi no está en el reporte diario. Las fechas salieron con el DÍA en el
 * lugar del año (6-may quedó «2006-05-01»), así que el día se saca del año.
 * «masy 9» es el 9 de mayo.
 *
 * Busca la fila «DESGRASNE en Baba» y lee las dos siguientes (A y C).
 */
export function leerDesgraneMayo(filas: unknown[][]): DesgraneDia[] {
  const i = filas.findIndex((r) => /desgra/i.test(String(r[0] ?? "")));
  if (i < 0) return [];
  const encabezado = filas[i + 1] ?? [];
  const filaA =
    filas.find((r, j) => j > i && /cacao a/i.test(String(r[0] ?? ""))) ?? [];
  const filaC =
    filas.find((r, j) => j > i && /cacao c/i.test(String(r[0] ?? ""))) ?? [];

  const out: DesgraneDia[] = [];
  for (let c = 1; c < encabezado.length; c++) {
    const h = encabezado[c];
    let dia: number | null = null;
    let duda: string | null = null;
    if (typeof h === "number") {
      const f = serialAFecha(h);
      dia = Number(f.slice(0, 4)) - 2000;
      if (f.slice(5, 7) !== "05") duda = `encabezado de fecha raro «${f}»`;
    } else if (typeof h === "string") {
      const m = /(\d{1,2})/.exec(h);
      if (m) {
        dia = Number(m[1]);
        duda = `encabezado escrito «${h}»`;
      }
    }
    if (dia == null || dia < 1 || dia > 31) continue;
    const kgA = num(filaA[c]);
    const kgC = num(filaC[c]);
    if (kgA == null && kgC == null) continue;
    out.push({
      fecha: `2026-05-${String(dia).padStart(2, "0")}`,
      kgA,
      kgC,
      duda,
    });
  }
  return out;
}
