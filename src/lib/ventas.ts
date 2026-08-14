/**
 * Agregación de ventas a partir de los despachos.
 *
 * Los despachos son el único registro fiable de lo vendido: no guardan precio
 * de venta, así que todo aquí es en kilos. Dos cosas hay que limpiar antes de
 * contar, y ninguna es cosmética:
 *
 *   · No todo despacho es una venta. Muestras, merma y selección de pasilla
 *     salen de bodega igual, pero contarlas infla la cifra.
 *   · El mismo cliente está escrito de seis formas ("CASA LUKER", "CASALUKER",
 *     "CASA LIKER", "LUKER"…). Sin unificarlos, el ranking por cliente miente.
 */

/** Meta anual acordada en el Comité Financiero del 21-jul-2026: ~500 toneladas. */
export const META_ANUAL_KG = 500_000;

/** Salidas de bodega que no son ventas. */
const NO_ES_VENTA = /merma|muestra|pasilla|selecc?ion|movi?miento/i;

export function esVenta(destino: string | null): boolean {
  if (!destino) return false;
  return !NO_ES_VENTA.test(destino);
}

const clave = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * Variantes vistas en la hoja. Se comparan sobre la clave sin espacios ni
 * signos, así que "CASA  LUKER" y "CASALUKER" caen en el mismo patrón.
 */
const CANONICOS: [RegExp, string][] = [
  [/^casa?l[iu]ker$|^luker$/, "Casa Luker"],
  [/^nal?chocolates?$|^nacional(dechocolates)?$/, "Nacional de Chocolates"],
  [/^tiempo(de)?ch[oi]c?olate$/, "Tiempo de Chocolate"],
];

/** Unifica las variantes de un mismo cliente. */
export function clienteCanonico(destino: string): string {
  const k = clave(destino);
  for (const [re, nombre] of CANONICOS) if (re.test(k)) return nombre;
  return destino.trim();
}

export type DespachoVenta = {
  dispatch_date: string | null;
  destination: string | null;
  qty_kg: number;
  qty_premium_kg: number;
  qty_corriente_kg: number;
  qty_corriente_c_kg: number;
  qty_organico_kg: number;
};

export type PuntoMes = {
  mes: string; // "2026-07"
  kg: number;
  acumulado: number;
};

export type Ventas = {
  /** Serie mensual del año pedido, con acumulado corrido. */
  meses: PuntoMes[];
  porCliente: { cliente: string; kg: number }[];
  porClasificacion: { tipo: string; kg: number }[];
  /** Kilos vendidos en el año. */
  kgAnio: number;
  /** Kilos de todo el histórico, para dar contexto. */
  kgHistorico: number;
  /** Salidas que no son venta (merma, muestras): se reportan, no se ocultan. */
  kgNoVenta: number;
  /** Ventas sin fecha: no caben en ningún mes y hay que decirlo. */
  kgSinFecha: number;
  meta: number;
  avancePct: number;
  /** Proyección por el ritmo del año: acumulado ÷ días transcurridos × 365. */
  proyeccionRitmoAnual: number;
  /** Proyección por el promedio de los últimos meses con actividad. */
  proyeccionUltimosMeses: number;
  mesesUsadosEnProyeccion: number;
};

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * @param hoy fecha de referencia — se recibe en vez de leerla del reloj para
 *   que el cálculo sea determinista y testeable.
 */
export function agregarVentas(
  despachos: DespachoVenta[],
  anio: number,
  hoy: Date,
  meta = META_ANUAL_KG,
): Ventas {
  const ventas = despachos.filter((d) => esVenta(d.destination));
  const kgNoVenta = suma(
    despachos.filter((d) => !esVenta(d.destination)).map((d) => Number(d.qty_kg) || 0),
  );

  const porMes = new Map<string, number>();
  let kgSinFecha = 0;
  for (const d of ventas) {
    const kg = Number(d.qty_kg) || 0;
    if (!d.dispatch_date) {
      kgSinFecha += kg;
      continue;
    }
    const m = d.dispatch_date.slice(0, 7);
    porMes.set(m, (porMes.get(m) ?? 0) + kg);
  }

  // Los doce meses del año, aunque estén vacíos: un hueco en la serie es
  // información (en 2026 no hubo despachos en marzo).
  const meses: PuntoMes[] = [];
  let acumulado = 0;
  for (let m = 1; m <= 12; m++) {
    const key = `${anio}-${String(m).padStart(2, "0")}`;
    const kg = porMes.get(key) ?? 0;
    acumulado += kg;
    meses.push({ mes: key, kg, acumulado });
  }

  const delAnio = (d: DespachoVenta) => d.dispatch_date?.startsWith(String(anio));
  const ventasAnio = ventas.filter(delAnio);
  const kgAnio = suma(ventasAnio.map((d) => Number(d.qty_kg) || 0));

  const clientes = new Map<string, number>();
  for (const d of ventasAnio) {
    const c = clienteCanonico(d.destination!);
    clientes.set(c, (clientes.get(c) ?? 0) + (Number(d.qty_kg) || 0));
  }

  // Los cuatro grados van SIEMPRE, aunque den cero. Filtrar los vacíos hacía
  // que la vista mostrara «Premium 100 %» a secas, que se lee como si la app
  // solo conociera un grado; con los ceros a la vista se lee lo que de verdad
  // pasa, que es que AROCO vende premium y deja el resto en bodega.
  const clasif: [string, number][] = [
    ["Premium", suma(ventasAnio.map((d) => Number(d.qty_premium_kg) || 0))],
    ["Corriente", suma(ventasAnio.map((d) => Number(d.qty_corriente_kg) || 0))],
    ["Corriente C", suma(ventasAnio.map((d) => Number(d.qty_corriente_c_kg) || 0))],
    ["Orgánico", suma(ventasAnio.map((d) => Number(d.qty_organico_kg) || 0))],
  ];

  // Un despacho creado a mano en el CRM solo trae qty_kg: si nadie eligió
  // grado, esos kilos no están en ninguna de las cuatro columnas. Antes se
  // perdían del desglose mientras seguían contando en el total, así que los
  // porcentajes cuadraban con una cifra que no era la del año. Ahora se
  // nombran.
  const kgSinClasificar = Math.max(0, kgAnio - suma(clasif.map(([, kg]) => kg)));

  // ── Proyecciones ──────────────────────────────────────────────────────────
  const inicio = new Date(Date.UTC(anio, 0, 1));
  const finAnio = new Date(Date.UTC(anio, 11, 31));
  const corte = hoy < finAnio ? hoy : finAnio;
  const diasTranscurridos = Math.max(
    1,
    Math.round((corte.getTime() - inicio.getTime()) / 86_400_000) + 1,
  );
  const proyeccionRitmoAnual = Math.round((kgAnio / diasTranscurridos) * 365);

  // Promedio de los últimos meses CON actividad: el ritmo del año se hunde
  // cuando el arranque fue flojo, y en 2026 enero-marzo fueron casi cero.
  const conActividad = meses.filter((m) => m.kg > 0 && m.mes <= corte.toISOString().slice(0, 7));
  const ultimos = conActividad.slice(-3);
  const promedioMes = ultimos.length ? suma(ultimos.map((m) => m.kg)) / ultimos.length : 0;
  const mesActual = corte.getUTCMonth() + 1;
  const diaDelMes = corte.getUTCDate();
  const diasDelMes = new Date(Date.UTC(anio, mesActual, 0)).getUTCDate();
  const mesesRestantes = 12 - mesActual + (1 - diaDelMes / diasDelMes);
  const proyeccionUltimosMeses = Math.round(kgAnio + promedioMes * mesesRestantes);

  return {
    meses,
    porCliente: [...clientes.entries()]
      .map(([cliente, kg]) => ({ cliente, kg }))
      .sort((a, b) => b.kg - a.kg),
    porClasificacion: [
      ...clasif,
      ...(kgSinClasificar > 0
        ? ([["Sin clasificar", kgSinClasificar]] as [string, number][])
        : []),
    ].map(([tipo, kg]) => ({ tipo, kg })),
    kgAnio,
    kgHistorico: suma(ventas.map((d) => Number(d.qty_kg) || 0)),
    kgNoVenta,
    kgSinFecha,
    meta,
    avancePct: meta > 0 ? (kgAnio / meta) * 100 : 0,
    proyeccionRitmoAnual,
    proyeccionUltimosMeses,
    mesesUsadosEnProyeccion: ultimos.length,
  };
}
