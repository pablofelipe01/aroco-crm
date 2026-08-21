/**
 * Agregación de ventas.
 *
 * La fuente es la hoja de ventas (tabla `ventas`), no los despachos. Los
 * despachos solo saben de kilos —no hay precio de venta en ninguna parte del
 * inventario— así que este módulo solo podía hablar de toneladas. La hoja de
 * ventas trae el valor negociado, la bonificación por calidad y el valor a
 * pagar de cada envío, y además separa mercado nacional de exportación.
 *
 * `valor_total + bonificacion = valor_pagar`. Los tres se llevan aparte porque
 * la bonificación es plata que se negocia por calidad del grano, y verla suelta
 * es lo que permite saber si negociar calidad rinde.
 */

/**
 * Meta anual de volumen: 900 toneladas.
 *
 * Sustituye a las ~500 t que fijó el Comité Financiero del 21-jul-2026. El
 * cambio no es cosmético: con 500 t el año iba en 51,6% y una de las dos
 * proyecciones alcanzaba; con 900 t el avance y ambas proyecciones quedan
 * bastante por debajo, y el módulo lo va a decir así.
 */
export const META_ANUAL_KG = 900_000;

export type VentaRow = {
  fecha: string;
  cliente: string;
  odc: string | null;
  kg: number;
  valor_total: number;
  bonificacion: number;
  valor_pagar: number;
  mercado: string | null;
};

export type PuntoMes = {
  mes: string; // "2026-07"
  kg: number;
  acumulado: number;
  valor: number;
};

export type Ventas = {
  meses: PuntoMes[];
  porCliente: { cliente: string; kg: number; valor: number }[];
  porMercado: { mercado: string; kg: number; valor: number }[];

  kgAnio: number;
  valorAnio: number;
  bonificacionAnio: number;
  /** Precio promedio efectivo por kilo, incluyendo bonificación. */
  precioPromedioKg: number;

  /** Kilos facturados sin valor todavía: se declaran, no se esconden. */
  kgSinValor: number;
  operacionesSinValor: number;

  kgHistorico: number;
  valorHistorico: number;

  meta: number;
  avancePct: number;
  proyeccionRitmoAnual: number;
  proyeccionUltimosMeses: number;
  mesesUsadosEnProyeccion: number;
};

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const num = (v: number | string | null) => Number(v) || 0;

/**
 * @param hoy fecha de referencia — se recibe en vez de leerla del reloj para
 *   que el cálculo sea determinista y testeable.
 */
export function agregarVentas(
  ventas: VentaRow[],
  anio: number,
  hoy: Date,
  meta = META_ANUAL_KG,
): Ventas {
  const delAnio = ventas.filter((v) => v.fecha?.startsWith(String(anio)));

  const kgAnio = suma(delAnio.map((v) => num(v.kg)));
  const valorAnio = suma(delAnio.map((v) => num(v.valor_pagar)));
  const bonificacionAnio = suma(delAnio.map((v) => num(v.bonificacion)));

  // Envíos ya despachados a los que todavía no se les puso precio. Contarlos
  // en los kilos y no decirlo haría que el precio promedio saliera bajo sin
  // explicación visible.
  const sinValor = delAnio.filter((v) => num(v.valor_pagar) === 0 && num(v.kg) > 0);

  const porMes = new Map<string, { kg: number; valor: number }>();
  for (const v of delAnio) {
    const m = v.fecha.slice(0, 7);
    const acc = porMes.get(m) ?? { kg: 0, valor: 0 };
    acc.kg += num(v.kg);
    acc.valor += num(v.valor_pagar);
    porMes.set(m, acc);
  }

  // Los doce meses, aunque estén vacíos: un hueco en la serie es información.
  const meses: PuntoMes[] = [];
  let acumulado = 0;
  for (let m = 1; m <= 12; m++) {
    const key = `${anio}-${String(m).padStart(2, "0")}`;
    const d = porMes.get(key) ?? { kg: 0, valor: 0 };
    acumulado += d.kg;
    meses.push({ mes: key, kg: d.kg, acumulado, valor: d.valor });
  }

  const agrupar = (clave: (v: VentaRow) => string) => {
    const m = new Map<string, { kg: number; valor: number }>();
    for (const v of delAnio) {
      const k = clave(v);
      const acc = m.get(k) ?? { kg: 0, valor: 0 };
      acc.kg += num(v.kg);
      acc.valor += num(v.valor_pagar);
      m.set(k, acc);
    }
    return [...m.entries()].sort((a, b) => b[1].kg - a[1].kg);
  };

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
  // cuando el arranque fue flojo.
  const hasta = corte.toISOString().slice(0, 7);
  const conActividad = meses.filter((m) => m.kg > 0 && m.mes <= hasta);
  const ultimos = conActividad.slice(-3);
  const promedioMes = ultimos.length ? suma(ultimos.map((m) => m.kg)) / ultimos.length : 0;
  const mesActual = corte.getUTCMonth() + 1;
  const diaDelMes = corte.getUTCDate();
  const diasDelMes = new Date(Date.UTC(anio, mesActual, 0)).getUTCDate();
  const mesesRestantes = 12 - mesActual + (1 - diaDelMes / diasDelMes);
  const proyeccionUltimosMeses = Math.round(kgAnio + promedioMes * mesesRestantes);

  // El promedio se calcula solo sobre los kilos que sí tienen precio; si no,
  // los envíos sin valorar lo hundirían y parecería una caída de precio.
  const kgConValor = kgAnio - suma(sinValor.map((v) => num(v.kg)));

  return {
    meses,
    porCliente: agrupar((v) => v.cliente).map(([cliente, d]) => ({ cliente, ...d })),
    porMercado: agrupar((v) => v.mercado || "Sin clasificar").map(([mercado, d]) => ({
      mercado,
      ...d,
    })),

    kgAnio,
    valorAnio,
    bonificacionAnio,
    precioPromedioKg: kgConValor > 0 ? valorAnio / kgConValor : 0,

    kgSinValor: suma(sinValor.map((v) => num(v.kg))),
    operacionesSinValor: sinValor.length,

    kgHistorico: suma(ventas.map((v) => num(v.kg))),
    valorHistorico: suma(ventas.map((v) => num(v.valor_pagar))),

    meta,
    avancePct: meta > 0 ? (kgAnio / meta) * 100 : 0,
    proyeccionRitmoAnual,
    proyeccionUltimosMeses,
    mesesUsadosEnProyeccion: ultimos.length,
  };
}
