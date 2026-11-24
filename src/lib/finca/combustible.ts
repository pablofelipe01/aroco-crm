/**
 * Riego y combustible (0120) — cuentas del tablero. Funciones puras.
 *
 * La pregunta de control: ¿lo que se le cargó al motor de riego se parece a
 * lo que debió gastar? Lo esperado es horas × consumo por hora (0,97 gal/h,
 * medido en la finca). Si se carga mucho más de lo esperado, o faltan horas
 * por anotar o se está yendo combustible.
 *
 * La comparación se hace contra la CARGA al motor y no contra la compra: el
 * ACPM se compra por tandas y queda en tanque, así que un mes de compra
 * grande no es un mes de consumo grande.
 */

export interface CompraVista {
  fecha: string;
  combustible: "acpm" | "gasolina";
  galones: number | null;
  valor: number | null;
}

export interface UsoVista {
  fecha: string;
  equipo: string; // código: motor-riego, guadana…
  valvulas: string[];
  horas: number | null;
  carga: number | null;
}

export interface EquipoVista {
  codigo: string;
  nombre: string;
  combustible: "acpm" | "gasolina";
  consumoGalH: number | null;
}

export const MOTOR = "motor-riego";

/** Diferencia carga vs. esperado a partir de la cual el mes se marca. */
export const TOLERANCIA = 0.2;

export interface MesCombustible {
  mes: string; // AAAA-MM
  acpmGal: number;
  acpmValor: number;
  /** Precio promedio pagado: valor ÷ galones de las compras con ambos. */
  acpmPrecio: number | null;
  gasolinaGal: number;
  gasolinaValor: number;
  horasRiego: number;
  cargaMotor: number;
  esperadoMotor: number;
  /** (carga − esperado) ÷ esperado. Null sin horas. */
  desvio: number | null;
}

const sumar = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);

export function resumenMensual(
  compras: CompraVista[],
  usos: UsoVista[],
  consumoMotor: number,
): MesCombustible[] {
  const meses = new Set<string>();
  for (const c of compras) meses.add(c.fecha.slice(0, 7));
  for (const u of usos) if (u.equipo === MOTOR) meses.add(u.fecha.slice(0, 7));

  return [...meses].sort().map((mes) => {
    const cm = compras.filter((c) => c.fecha.startsWith(mes));
    const acpm = cm.filter((c) => c.combustible === "acpm");
    const gas = cm.filter((c) => c.combustible === "gasolina");
    const conAmbos = acpm.filter((c) => c.galones && c.valor);
    const galAmbos = sumar(conAmbos.map((c) => c.galones));
    const motor = usos.filter((u) => u.equipo === MOTOR && u.fecha.startsWith(mes));
    const horas = sumar(motor.map((u) => u.horas));
    const carga = sumar(motor.map((u) => u.carga));
    const esperado = horas * consumoMotor;
    return {
      mes,
      acpmGal: sumar(acpm.map((c) => c.galones)),
      acpmValor: sumar(acpm.map((c) => c.valor)),
      acpmPrecio: galAmbos ? sumar(conAmbos.map((c) => c.valor)) / galAmbos : null,
      gasolinaGal: sumar(gas.map((c) => c.galones)),
      gasolinaValor: sumar(gas.map((c) => c.valor)),
      horasRiego: horas,
      cargaMotor: carga,
      esperadoMotor: esperado,
      desvio: esperado > 0 ? (carga - esperado) / esperado : null,
    };
  });
}

/**
 * Horas de riego por válvula. Un grupo («9, 10») riega sus válvulas A LA VEZ:
 * cada una recibe las horas completas del tramo. Por eso la suma por válvula
 * es mayor que las horas del motor, y está bien.
 */
export function horasPorValvula(usos: UsoVista[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of usos) {
    if (u.equipo !== MOTOR || !u.horas) continue;
    for (const v of u.valvulas) m.set(v, (m.get(v) ?? 0) + u.horas);
  }
  return m;
}

export interface ResumenEquipo {
  codigo: string;
  nombre: string;
  combustible: "acpm" | "gasolina";
  usos: number;
  horas: number;
  /** Horas × consumo por hora. Null si el equipo no tiene consumo cargado. */
  esperadoGal: number | null;
}

export function resumenEquipos(equipos: EquipoVista[], usos: UsoVista[]): ResumenEquipo[] {
  return equipos.map((e) => {
    const us = usos.filter((u) => u.equipo === e.codigo && u.horas);
    const horas = sumar(us.map((u) => u.horas));
    return {
      codigo: e.codigo,
      nombre: e.nombre,
      combustible: e.combustible,
      usos: us.length,
      horas,
      esperadoGal: e.consumoGalH != null ? horas * e.consumoGalH : null,
    };
  });
}

/** Costo del ACPM por hora de riego en un periodo: valor comprado ÷ horas. */
export function costoPorHora(meses: MesCombustible[]): number | null {
  const horas = sumar(meses.map((m) => m.horasRiego));
  const valor = sumar(meses.map((m) => m.acpmValor));
  return horas > 0 ? valor / horas : null;
}
