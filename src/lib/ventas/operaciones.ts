/**
 * Lectura de la pestaña «VENTAS 2026»: el margen de cada operación.
 *
 * Es de donde la liquidación de comisiones saca su «col AZ», y la razón por la
 * que el CRM no podía calcular la comisión por su cuenta: el precio base
 * negociado con el proveedor NO es lo que la operación cuesta. Lo que cuesta
 * es lo que AROCO termina pagándole, que sube por la bonificación de calidad y
 * baja por el descuento de humedad y las retenciones.
 *
 * La cadena completa, comprobada al peso contra la hoja de agosto:
 *
 *     AJ  pago base          = precio negociado × kg
 *     AL  − descuento por humedad
 *     AN  + bonificación al proveedor
 *     AQ  − retenciones
 *     AR  = A PAGAR AL PROVEEDOR      ← el costo de verdad
 *
 *     AB  venta a cliente
 *     AR  − pago al proveedor
 *     AU  − comisión flete cacao
 *     AY  − comisión sostenible
 *     AS  = VALOR A FAVOR DE AROCO
 *     AZ  = VALOR DISPONIBLE AROCO    ← lo que usa la liquidación
 *     BA  − costo transporte y selección
 *     BB  = UTILIDAD
 *
 * ENCABEZADOS REPETIDOS. Esta hoja tiene «Subtotal» dos veces, «FACT AROCO»
 * tres, y «Valor Bonificación» dos —una del lado de la venta y otra del lado
 * del proveedor—. Un mapa de nombre a columna se quedaría con la última y
 * mezclaría los dos lados del negocio. Por eso aquí se pide el nombre Y LA
 * OCURRENCIA, y se compara el encabezado completo en vez de por prefijo:
 * «VALOR A PAGAR» y «VALOR A PAGAR AL PROVEEDOR» son columnas distintas y una
 * comparación por prefijo las confunde.
 */

export class ColumnaFaltante extends Error {}

function normalizar(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** «$ 19.198.800,00» · «-$ 3.836.839,85» · «8.939,6» → número. */
export function numero(v: string): number {
  const s = (v ?? "").trim();
  if (!s) return 0;
  const negativo = /^-/.test(s.replace(/[\s$]/g, "")) || /^\(.*\)$/.test(s);
  const limpio = s.replace(/[^\d,.]/g, "");
  if (!limpio) return 0;
  const n = Number(limpio.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

/** «13/08/2026» → «2026-08-13»; también acepta ya-ISO. */
export function fechaISO(v: string): string | null {
  const s = (v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export type OperacionVenta = {
  fila: number;
  fecha: string | null;
  cliente: string;
  odc: string;
  remisionAroco: string;
  recepcion: string;
  origen: string;

  pesoRemisionKg: number;
  arocoKg: number;
  recepcionKg: number;

  /** Lado de la venta. */
  valorKiloNegociado: number;
  valorTotal: number;
  valorBonificacion: number;
  valorAPagar: number;

  /** Lado del proveedor: de dónde sale el COSTO real. */
  precioBaseProveedor: number;
  pagoBase: number;
  descuentoHumedad: number;
  bonificacionProveedor: number;
  retenciones: number;
  pagoProveedor: number;

  /** Margen. */
  aFavorAroco: number;
  comisionFlete: number;
  comisionSostenible: number;
  disponibleAroco: number;
  costoTransporteSeleccion: number;
  utilidad: number;
  venta60: number;
  compra40: number;
};

export type HojaOperaciones = {
  operaciones: OperacionVenta[];
  descartadas: { fila: number; motivo: string }[];
  /**
   * Filas donde `pago al proveedor` no coincide con su propia cadena. Es la
   * comprobación que avisa si la hoja cambia de forma: la identidad
   * `AJ − AL + AN − AQ = AR` sale exacta al centavo en los datos reales, así
   * que si deja de salir es que se está leyendo una columna equivocada.
   */
  descuadres: { fila: number; odc: string; esperado: number; encontrado: number }[];
};

/** Índice de la columna cuyo encabezado es exactamente `nombre`, n-ésima vez. */
function indice(
  encabezado: string[],
  nombre: string,
  ocurrencia = 1,
  obligatoria = true,
): number {
  const objetivo = normalizar(nombre);
  let vistas = 0;
  for (let i = 0; i < encabezado.length; i++) {
    if (normalizar(encabezado[i]) === objetivo) {
      vistas += 1;
      if (vistas === ocurrencia) return i;
    }
  }
  if (!obligatoria) return -1;
  throw new ColumnaFaltante(
    `«VENTAS 2026» no tiene la columna «${nombre}»${
      ocurrencia > 1 ? ` (ocurrencia ${ocurrencia})` : ""
    }.`,
  );
}

/**
 * Localiza la fila de encabezados.
 *
 * No está en la primera fila: encima hay dos filas de rótulos sueltos y
 * porcentajes («VALOR KILO PAGADO», «7,50 %»). Se busca la que trae de verdad
 * las columnas, en vez de dar por hecho que es la tercera.
 */
function filaEncabezado(matriz: string[][]): number {
  for (let i = 0; i < Math.min(matriz.length, 12); i++) {
    const fila = (matriz[i] ?? []).map((c) => normalizar(c));
    if (fila.includes("odc") && fila.includes("cliente destino")) return i;
  }
  throw new ColumnaFaltante(
    "No se encontró la fila de encabezados de «VENTAS 2026» (falta «ODC» o «CLIENTE DESTINO»).",
  );
}

export function parseOperaciones(matriz: string[][]): HojaOperaciones {
  const iEnc = filaEncabezado(matriz);
  const enc = matriz[iEnc];

  const C = {
    cliente: indice(enc, "CLIENTE DESTINO"),
    fecha: indice(enc, "FECHA LLEGADA BTA"),
    odc: indice(enc, "ODC"),
    remision: indice(enc, "REMISION AROCO"),
    recepcion: indice(enc, "RECEPCION"),
    origen: indice(enc, "ORIGEN"),
    pesoRemision: indice(enc, "PESO REMISION (Kg)", 1, false),
    arocoKg: indice(enc, "AROCO Kg", 1, false),
    recepcionKg: indice(enc, "RECEPCION CACAO Kg"),

    valorKilo: indice(enc, "Valor Kilo Negociado", 1, false),
    valorTotal: indice(enc, "Valor Total"),
    // Primera vez = lado de la venta. La segunda es la del proveedor.
    valorBonif: indice(enc, "Valor Bonificacion"),
    valorAPagar: indice(enc, "VALOR A PAGAR"),

    precioBase: indice(enc, "Precio base negociado con proveedor"),
    pagoBase: indice(enc, "pago Base negociado"),
    descuento: indice(enc, "Valor Descuento"),
    bonifProveedor: indice(enc, "Valor Bonificacion", 2),
    retenciones: indice(enc, "Valor Retenciones"),
    pagoProveedor: indice(enc, "VALOR A PAGAR AL PROVEEDOR"),

    aFavor: indice(enc, "VALOR A FAVOR DE AROCO"),
    flete: indice(enc, "COMISION FLETE CACAO", 1, false),
    sostenible: indice(enc, "COMISION SOSTENIBLE", 1, false),
    // La segunda vez: la primera es la de antes de la comisión sostenible.
    disponible: indice(enc, "VALOR DISPONIBLE AROCO", 2, false),
    costoTransp: indice(enc, "COSTO TRANSPORTE Y SELECCION", 1, false),
    utilidad: indice(enc, "UTILIDAD", 1, false),
    venta60: indice(enc, "VENTA (60%)", 1, false),
    compra40: indice(enc, "COMPRA (40%)", 1, false),
  };

  const celda = (f: string[], i: number) => (i < 0 ? "" : (f[i] ?? "").trim());
  const n = (f: string[], i: number) => numero(celda(f, i));

  const operaciones: OperacionVenta[] = [];
  const descartadas: { fila: number; motivo: string }[] = [];
  const descuadres: HojaOperaciones["descuadres"] = [];

  for (let r = iEnc + 1; r < matriz.length; r++) {
    const f = matriz[r] ?? [];
    const numeroFila = r + 1;
    const odc = celda(f, C.odc);
    const cliente = celda(f, C.cliente);

    if (!odc && !cliente) continue; // fila vacía

    // Sin ODC la operación no se puede cruzar con nada del CRM, que es para lo
    // único que sirve traerla.
    if (!odc) {
      descartadas.push({ fila: numeroFila, motivo: "sin ODC" });
      continue;
    }
    const kg = n(f, C.recepcionKg);
    if (kg <= 0) {
      descartadas.push({ fila: numeroFila, motivo: `sin kilos de recepción (ODC ${odc})` });
      continue;
    }

    const pagoBase = n(f, C.pagoBase);
    const descuentoHumedad = n(f, C.descuento);
    const bonificacionProveedor = n(f, C.bonifProveedor);
    const retenciones = n(f, C.retenciones);
    const pagoProveedor = n(f, C.pagoProveedor);

    // La identidad de la cadena del proveedor. Si deja de cumplirse, se está
    // leyendo una columna equivocada y hay que enterarse.
    const esperado = pagoBase - descuentoHumedad + bonificacionProveedor - retenciones;
    if (pagoProveedor !== 0 && Math.abs(esperado - pagoProveedor) > 1) {
      descuadres.push({
        fila: numeroFila,
        odc,
        esperado: Math.round(esperado),
        encontrado: Math.round(pagoProveedor),
      });
    }

    operaciones.push({
      fila: numeroFila,
      fecha: fechaISO(celda(f, C.fecha)),
      cliente,
      odc,
      remisionAroco: celda(f, C.remision),
      recepcion: celda(f, C.recepcion),
      origen: celda(f, C.origen),
      pesoRemisionKg: n(f, C.pesoRemision),
      arocoKg: n(f, C.arocoKg),
      recepcionKg: kg,
      valorKiloNegociado: n(f, C.valorKilo),
      valorTotal: n(f, C.valorTotal),
      valorBonificacion: n(f, C.valorBonif),
      valorAPagar: n(f, C.valorAPagar),
      precioBaseProveedor: n(f, C.precioBase),
      pagoBase,
      descuentoHumedad,
      bonificacionProveedor,
      retenciones,
      pagoProveedor,
      aFavorAroco: n(f, C.aFavor),
      comisionFlete: n(f, C.flete),
      comisionSostenible: n(f, C.sostenible),
      disponibleAroco: n(f, C.disponible),
      costoTransporteSeleccion: n(f, C.costoTransp),
      utilidad: n(f, C.utilidad),
      venta60: n(f, C.venta60),
      compra40: n(f, C.compra40),
    });
  }

  return { operaciones, descartadas, descuadres };
}

/**
 * Costo real por kilo de una operación.
 *
 * Es la cifra que el CRM no tenía. El precio base negociado se queda corto: no
 * incluye la bonificación de calidad que se le paga al proveedor ni el
 * descuento de humedad ni las retenciones.
 */
export function costoRealPorKg(o: OperacionVenta): number | null {
  if (o.recepcionKg <= 0 || o.pagoProveedor === 0) return null;
  return Math.round((o.pagoProveedor / o.recepcionKg) * 100) / 100;
}
