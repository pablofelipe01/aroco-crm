/**
 * La liquidación de comisiones, calculada por el CRM.
 *
 * Hasta ahora el CRM COPIABA el resultado de la hoja, y la hoja liquida un mes
 * a la vez: solo quedaban los meses que alguien capturó a tiempo. Con esto se
 * puede rehacer cualquier mes a partir de las operaciones, que sí están todas.
 *
 * LAS REGLAS NO SON MÍAS. Están escritas en la propia hoja, en la nota del
 * maestro de asignación, y aquí se siguen al pie:
 *
 *   · Entra la operación que tenga fecha, ODC, kilos, utilidad y precio base
 *     mayor que cero.
 *   · VENTA — el cliente decide: LUKER es de Álvaro; sin cliente, sin asignar.
 *   · COMPRA — el origen decide, buscando la palabra clave del maestro.
 *   · AROCO es la casa y no cobra comisión.
 *   · MERCADO — del destino, según el maestro de la derecha.
 *   · NIVEL — Senior si el comercial movió al menos el umbral de toneladas ese
 *     mes; si no, Junior. El porcentaje sale de la matriz mercado × nivel.
 *
 * Y la comisión es `utilidad × techo × reparto`, comprobado contra los dos
 * meses que la hoja ya había liquidado: reproduce las cinco líneas al peso.
 */

/**
 * Primer mes que se liquida. Antes de mayo de 2026 no hay datos de comisiones
 * en la base: lo que salga de las operaciones de marzo o abril es una
 * reconstrucción sin nada contra qué compararla, y no se guarda ni se muestra.
 */
export const PRIMER_MES_COMISIONES = { anio: 2026, mes: 5 } as const;

export function antesDelPrimerMes(anio: number, mes: number): boolean {
  const p = PRIMER_MES_COMISIONES;
  return anio < p.anio || (anio === p.anio && mes < p.mes);
}

export type OperacionParaCalculo = {
  fecha: string | null;
  cliente: string | null;
  origen: string | null;
  destino?: string | null;
  kg: number;
  /** «Valor disponible AROCO», la columna AZ de VENTAS 2026. */
  disponibleAroco: number;
  /**
   * Kilos que pasaron por AROCO. Solo cuando esta columna trae valor se
   * descuentan el transporte y la selección — así lo dice la nota de la hoja,
   * y es lo que separa la utilidad BRUTA de la NETA. En la ODC-60 de agosto
   * son 12.524 kg × 233 = 2.918.092 de diferencia, que en la comisión del mes
   * pesa más de 50.000 pesos.
   */
  arocoKg: number;
  precioBaseProveedor: number;
  odc: string | null;
};

/** Utilidad NETA: lo que la hoja usa para la comisión. */
export function utilidadNeta(o: OperacionParaCalculo, reglas: Reglas): number {
  return o.disponibleAroco - o.arocoKg * (reglas.transporteKg + reglas.seleccionKg);
}

export type Maestro = {
  clave: string;
  vendedor: string;
  comprador: string;
};

export type Reglas = {
  /** Matriz mercado × nivel, en tanto por uno. */
  pct: Record<string, { Senior: number; Junior: number }>;
  shareVendedor: number;
  shareComprador: number;
  umbralSeniorTon: number;
  mercadoPorDefecto: string;
  /** Destino → mercado. */
  destinos: Record<string, string>;
  /** Quién es la casa y no cobra. */
  casa: string[];
  /** COP/kg que se descuentan de la utilidad cuando el cacao pasó por AROCO. */
  transporteKg: number;
  seleccionKg: number;
};

export const REGLAS_POR_DEFECTO: Reglas = {
  pct: {
    Nacional: { Senior: 0.05, Junior: 0.03 },
    Internacional: { Senior: 0.08, Junior: 0.06 },
  },
  shareVendedor: 0.6,
  shareComprador: 0.4,
  umbralSeniorTon: 50,
  mercadoPorDefecto: "Nacional",
  destinos: {},
  casa: ["AROCO"],
  transporteKg: 150,
  seleccionKg: 83,
};

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const SIN_ASIGNAR = "SIN ASIGNAR";

/**
 * A quién le toca la VENTA.
 *
 * Regla de la hoja: el cliente manda. Hoy solo LUKER está mapeado, y por eso
 * las operaciones a otros clientes quedan sin vendedor — es exactamente la
 * diferencia de agosto que Nicolás vio contra el Excel, y aquí sale igual en
 * vez de repartirse a alguien por conveniencia.
 */
export function vendedorDe(cliente: string | null, maestro: Maestro[]): string {
  const c = norm(cliente);
  if (!c) return SIN_ASIGNAR;
  // El maestro manda sobre la regla, si alguien le pone vendedor a un origen.
  const porMaestro = maestro.find((m) => m.vendedor && c.includes(norm(m.clave)));
  if (porMaestro) return porMaestro.vendedor;
  if (c.includes("LUKER")) return "Alvaro";
  return SIN_ASIGNAR;
}

/** A quién le toca la COMPRA: la palabra clave del maestro dentro del origen. */
export function compradorDe(origen: string | null, maestro: Maestro[]): string {
  const o = norm(origen);
  if (!o) return SIN_ASIGNAR;
  const m = maestro.find((x) => x.comprador && o.includes(norm(x.clave)));
  return m ? m.comprador : SIN_ASIGNAR;
}

/** Mercado del destino; si no está en el maestro, el de por defecto. */
export function mercadoDe(destino: string | null, reglas: Reglas): string {
  const d = norm(destino);
  if (!d) return reglas.mercadoPorDefecto;
  for (const [nombre, mercado] of Object.entries(reglas.destinos)) {
    if (d === norm(nombre) || d.includes(norm(nombre))) return mercado;
  }
  return reglas.mercadoPorDefecto;
}

/**
 * ¿Entra la operación?
 *
 * Es la «regla de entrada» de la hoja, al pie. Sin precio base no hay costo
 * conocido, y sin utilidad no hay de qué sacar comisión: incluirlas metería
 * ceros que bajan el promedio sin que se vea por qué.
 */
export function entra(o: OperacionParaCalculo): boolean {
  return Boolean(o.fecha) && Boolean(o.odc) && o.kg > 0 && o.precioBaseProveedor > 0;
}

export type LineaCalculada = {
  comercial: string;
  tonVenta: number;
  tonCompra: number;
  tonTotal: number;
  nivel: "Senior" | "Junior";
  pctTecho: number;
  utilidadVenta: number;
  utilidadCompra: number;
  comisionVenta: number;
  comisionCompra: number;
  totalPagar: number;
};

export type Calculo = {
  toneladas: number;
  utilidad: number;
  totalComisiones: number;
  lineas: LineaCalculada[];
  /** Operaciones que la regla de entrada dejó fuera, y por qué. */
  excluidas: { odc: string | null; motivo: string }[];
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function calcularMes(
  operaciones: OperacionParaCalculo[],
  maestro: Maestro[],
  reglas: Reglas = REGLAS_POR_DEFECTO,
): Calculo {
  const excluidas: Calculo["excluidas"] = [];
  const buenas = operaciones.filter((o) => {
    if (entra(o)) return true;
    excluidas.push({
      odc: o.odc,
      motivo: !o.fecha
        ? "sin fecha"
        : !o.odc
          ? "sin ODC"
          : o.kg <= 0
            ? "sin kilos"
            : "sin precio base negociado",
    });
    return false;
  });

  type Acc = {
    tonVenta: number;
    tonCompra: number;
    utilidadVenta: number;
    utilidadCompra: number;
    /** El mercado con más kilos, que es el que decide el porcentaje. */
    kgPorMercado: Record<string, number>;
  };
  const porComercial = new Map<string, Acc>();
  const nuevo = (): Acc => ({
    tonVenta: 0,
    tonCompra: 0,
    utilidadVenta: 0,
    utilidadCompra: 0,
    kgPorMercado: {},
  });

  for (const o of buenas) {
    const toneladas = o.kg / 1000;
    const utilidad = utilidadNeta(o, reglas);
    const mercado = mercadoDe(o.destino ?? o.cliente, reglas);

    const vendedor = vendedorDe(o.cliente, maestro);
    const comprador = compradorDe(o.origen, maestro);

    const v = porComercial.get(vendedor) ?? nuevo();
    v.tonVenta += toneladas;
    v.utilidadVenta += utilidad;
    v.kgPorMercado[mercado] = (v.kgPorMercado[mercado] ?? 0) + o.kg;
    porComercial.set(vendedor, v);

    const c = porComercial.get(comprador) ?? nuevo();
    c.tonCompra += toneladas;
    c.utilidadCompra += utilidad;
    c.kgPorMercado[mercado] = (c.kgPorMercado[mercado] ?? 0) + o.kg;
    porComercial.set(comprador, c);
  }

  const lineas: LineaCalculada[] = [...porComercial.entries()]
    .map(([comercial, a]) => {
      const tonTotal = a.tonVenta + a.tonCompra;
      const nivel: "Senior" | "Junior" =
        tonTotal >= reglas.umbralSeniorTon ? "Senior" : "Junior";

      // El mercado que más pesa en el mes decide el porcentaje. La hoja lo
      // toma del destino de cada operación; con un solo mercado —que es el
      // caso real— las dos formas dan lo mismo.
      const mercado =
        Object.entries(a.kgPorMercado).sort((x, y) => y[1] - x[1])[0]?.[0] ??
        reglas.mercadoPorDefecto;

      const esCasa = reglas.casa.some((c) => norm(c) === norm(comercial));
      const sinAsignar = norm(comercial) === norm(SIN_ASIGNAR);
      const pctTecho =
        esCasa || sinAsignar ? 0 : (reglas.pct[mercado]?.[nivel] ?? 0);

      const comisionVenta = r2(a.utilidadVenta * pctTecho * reglas.shareVendedor);
      const comisionCompra = r2(a.utilidadCompra * pctTecho * reglas.shareComprador);

      return {
        comercial,
        tonVenta: r2(a.tonVenta),
        tonCompra: r2(a.tonCompra),
        tonTotal: r2(tonTotal),
        nivel,
        pctTecho,
        utilidadVenta: r2(a.utilidadVenta),
        utilidadCompra: r2(a.utilidadCompra),
        comisionVenta,
        comisionCompra,
        totalPagar: r2(comisionVenta + comisionCompra),
      };
    })
    .sort((a, b) => b.totalPagar - a.totalPagar);

  return {
    // Las toneladas del mes son las DESPACHADAS, no la suma de los dos lados:
    // cada operación tiene un vendedor y un comprador, así que sumar ambos
    // contaría los kilos dos veces.
    toneladas: r2(buenas.reduce((s, o) => s + o.kg, 0) / 1000),
    utilidad: r2(buenas.reduce((s, o) => s + utilidadNeta(o, reglas), 0)),
    totalComisiones: r2(lineas.reduce((s, l) => s + l.totalPagar, 0)),
    lineas,
    excluidas,
  };
}
