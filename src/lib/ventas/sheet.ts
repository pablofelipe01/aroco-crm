/**
 * Lectura de la pestaña `Dashboard_Data` de la hoja de ventas.
 *
 * Se leen las columnas por su ENCABEZADO y no por su posición. Con la hoja de
 * inventario esa lección salió cara tres veces: bastó que alguien insertara una
 * columna para que el sync siguiera diciendo "ok" mientras escribía el campo de
 * al lado. Aquí, una columna nueva es inofensiva; y si desaparece una que hace
 * falta, la corrida falla de frente en vez de guardar basura.
 *
 * La pestaña se pide por NOMBRE (endpoint gviz) y no por gid: el gid es un
 * número opaco que nadie puede verificar de un vistazo, y si alguien recrea la
 * pestaña cambia sin avisar.
 */

export class ColumnaFaltante extends Error {}

/** minúsculas, sin tildes ni espacios de más, para comparar encabezados. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** CSV con comillas y comas dentro de campo, que es como llega el de Google. */
export function parseCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') enComillas = true;
    else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (c !== "\r") campo += c;
  }
  if (campo !== "" || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

/**
 * Números como los formatea la hoja en español: "8739,0" y "$ 104.868.000".
 * El punto es separador de miles y la coma es la decimal, al revés de JS.
 */
export function numero(v: string): number {
  const limpio = (v ?? "").replace(/[^\d,.-]/g, "");
  if (!limpio) return 0;
  const n = Number(limpio.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export type VentaFila = {
  fecha: string;
  cliente: string;
  odc: string;
  kg: number;
  valor_total: number;
  bonificacion: number;
  valor_pagar: number;
  origen: string;
  bultos: string;
  mercado: string;
  fila: number;
};

export type HojaVentas = {
  filas: VentaFila[];
  /** Filas con datos que se descartaron, y por qué. Se reportan, no se ocultan. */
  descartadas: { fila: number; motivo: string }[];
};

function indice(encabezado: string[], ...nombres: string[]): number {
  const normalizados = encabezado.map(normalizar);
  for (const n of nombres) {
    const i = normalizados.indexOf(normalizar(n));
    if (i >= 0) return i;
  }
  throw new ColumnaFaltante(
    `La hoja de ventas no tiene la columna «${nombres[0]}». Encontradas: ${encabezado
      .filter(Boolean)
      .join(", ")}`,
  );
}

function indiceOpcional(encabezado: string[], ...nombres: string[]): number {
  try {
    return indice(encabezado, ...nombres);
  } catch {
    return -1;
  }
}

export function parseVentasSheet(csv: string): HojaVentas {
  const matriz = parseCsv(csv);
  if (matriz.length < 2) {
    throw new ColumnaFaltante("La hoja de ventas llegó vacía.");
  }

  const enc = matriz[0];
  const C = {
    fecha: indice(enc, "Fecha"),
    cliente: indice(enc, "Cliente"),
    kg: indice(enc, "KG Vendidos", "Kg Vendidos"),
    valorTotal: indice(enc, "Valor Total"),
    bonificacion: indice(enc, "Bonificación", "Bonificacion"),
    valorPagar: indice(enc, "Valor a Pagar"),
    odc: indiceOpcional(enc, "ODC"),
    origen: indiceOpcional(enc, "Origen"),
    bultos: indiceOpcional(enc, "Bultos"),
    mercado: indiceOpcional(enc, "Mercado"),
  };

  const celda = (f: string[], i: number) => (i < 0 ? "" : (f[i] ?? "").trim());

  const filas: VentaFila[] = [];
  const descartadas: { fila: number; motivo: string }[] = [];

  for (let r = 1; r < matriz.length; r++) {
    const f = matriz[r];
    const numeroFila = r + 1; // 1-indexado y contando el encabezado, como en la hoja
    const fecha = celda(f, C.fecha);
    const cliente = celda(f, C.cliente);

    if (!fecha && !cliente) continue; // fila en blanco al final

    // La hoja arrastra alguna fila de encabezado repetida y filas sin fecha.
    // Sin fecha no caben en ningún mes, y meterlas con una inventada sería
    // peor que dejarlas fuera declarándolo.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      descartadas.push({ fila: numeroFila, motivo: `fecha ilegible: «${fecha}»` });
      continue;
    }
    if (!cliente) {
      descartadas.push({ fila: numeroFila, motivo: "sin cliente" });
      continue;
    }

    filas.push({
      fecha,
      cliente,
      odc: celda(f, C.odc),
      kg: numero(celda(f, C.kg)),
      valor_total: numero(celda(f, C.valorTotal)),
      bonificacion: numero(celda(f, C.bonificacion)),
      valor_pagar: numero(celda(f, C.valorPagar)),
      origen: celda(f, C.origen),
      bultos: celda(f, C.bultos).replace(/[^\d]/g, ""),
      mercado: celda(f, C.mercado),
      fila: numeroFila,
    });
  }

  return { filas, descartadas };
}
