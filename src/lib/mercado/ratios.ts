/**
 * Ratios de producto del cacao, del reporte semanal de StoneX.
 *
 * El ratio dice cuántas veces el precio del futuro vale un derivado: si el
 * cacao está en 6.173 y la manteca europea tiene ratio 1,74, esa manteca se
 * cotiza a 10.741. Es lo que permite saber si conviene vender grano o
 * transformarlo, y hoy no está en ninguna parte del CRM.
 *
 * La forma del PDF, comprobada contra el reporte del 27-ago-2026:
 *
 *   ["Liquor","Incoterms","Futures","20-Aug","27-Aug","Change","GBP","EUR","USD"]
 *   ["Europe Liquid Liquor","ex fctry","LDN","1.41","1.41","-","£ 6,324","€ 7,377","$ 8,595"]
 *   ["Butter","Incoterms","Futures"]
 *   ["Combined"]
 *   ["Europe","ExW","LDN","2.94","3.04","0.11"]          ← sin precios
 *
 * Tres cosas que importan y no se ven de una:
 *
 *   · La categoría es un ENCABEZADO DE SECCIÓN (Liquor, Butter, Powder,
 *     Combined), igual que el origen en el reporte de diferenciales.
 *   · El ratio vigente es la SEGUNDA columna numérica: la primera es el de la
 *     semana pasada.
 *   · «Combined» no trae precios, solo ratios. Suponer nueve columnas siempre
 *     dejaría esas cinco filas fuera o mal leídas.
 */

export type FilaRatio = {
  categoria: string;
  producto: string;
  incoterm: string | null;
  /** LDN o NY: contra qué futuro se mide. */
  mercado: string | null;
  ratio: number;
  ratioAnterior: number | null;
  precioUsd: number | null;
  precioGbp: number | null;
  precioEur: number | null;
};

/** Precios de futuros y arbitraje, al pie del mismo reporte. */
export type FilaFuturo = {
  contrato: string;
  valor: number;
  valorAnterior: number | null;
  moneda: string;
};

export type Matriz = string[][];

const esMonetaria = (c: string) => /[£$€]/.test(c);

/** «(0.01)» → −0,01 · «£ 6,324» → 6324 · «-» → null (sin cambio). */
export function numero(v: string): number | null {
  const s = (v ?? "").trim();
  if (!s || !/\d/.test(s)) return null;
  const negativo = /\(.*\)/.test(s) || /^-/.test(s.replace(/[£$€\s]/g, ""));
  const limpio = s.replace(/[^\d.]/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

const moneda = (v: string) => (v.includes("£") ? "GBP" : v.includes("€") ? "EUR" : "USD");

const CATEGORIAS = /^(liquor|butter|powder|combined)$/i;
const RUIDO = /^(source|miami|cocoa|ratio|price|futures|exchange rates)$/i;

export function parsearRatios(matriz: Matriz): {
  ratios: FilaRatio[];
  futuros: FilaFuturo[];
  ignoradas: string[];
} {
  const ratios: FilaRatio[] = [];
  const futuros: FilaFuturo[] = [];
  const ignoradas: string[] = [];

  let categoria: string | null = null;
  let enFuturos = false;

  for (const cruda of matriz ?? []) {
    const celdas = (cruda ?? []).map((c) => (c ?? "").trim());
    const llenas = celdas.filter((c) => c !== "");
    if (llenas.length === 0) continue;

    // A partir de «FUTURES» empieza el bloque de futuros y divisas.
    if (llenas.some((c) => /^futures$/i.test(c) && llenas.length <= 2)) {
      enFuturos = true;
      continue;
    }

    if (enFuturos) {
      // ["NY-DEC","$6,064","$6,173","$109","EURUSD","$ 1.1671","$ 1.1651","-0.0020"]
      // Las primeras cuatro celdas son el futuro; las siguientes, la divisa.
      const etq = celdas[0];
      const anterior = numero(celdas[1] ?? "");
      const actual = numero(celdas[2] ?? "");
      if (etq && !RUIDO.test(etq) && actual !== null && !/^\d{1,2}-[A-Za-z]{3}$/.test(etq)) {
        futuros.push({
          contrato: etq,
          valor: actual,
          valorAnterior: anterior,
          moneda: moneda(celdas[2] ?? ""),
        });
      } else if (etq) {
        ignoradas.push(llenas.join(" | "));
      }
      continue;
    }

    // Encabezado de columnas: su primera celda es además la primera categoría.
    if (celdas.some((c) => /^change$/i.test(c)) && celdas.some((c) => /^\d{1,2}-[A-Za-z]{3}$/.test(c))) {
      if (CATEGORIAS.test(celdas[0])) categoria = celdas[0];
      continue;
    }

    // Encabezado de sección: «Butter | Incoterms | Futures» o «Powder» solo.
    if (CATEGORIAS.test(celdas[0]) && llenas.every((c) => !/\d/.test(c))) {
      categoria = celdas[0];
      continue;
    }

    if (!categoria) {
      ignoradas.push(llenas.join(" | "));
      continue;
    }

    // Fila de datos: texto, texto, texto, ratio anterior, ratio actual, cambio,
    // y —salvo en Combined— los tres precios.
    const numericas = celdas.slice(1).filter((c) => c !== "" && !esMonetaria(c)).map(numero);
    const ratiosCrudos = numericas.filter((n): n is number => n !== null);
    const precios = celdas.filter(esMonetaria);

    if (ratiosCrudos.length < 2) {
      ignoradas.push(llenas.join(" | "));
      continue;
    }

    const porMoneda = (m: string) => {
      const c = precios.find((x) => moneda(x) === m);
      return c ? numero(c) : null;
    };

    ratios.push({
      categoria,
      producto: celdas[0],
      incoterm: celdas[1] || null,
      mercado: /^(LDN|NY)$/i.test(celdas[2] ?? "") ? celdas[2].toUpperCase() : null,
      // El vigente es el segundo: el primero es el de la semana pasada.
      ratioAnterior: ratiosCrudos[0],
      ratio: ratiosCrudos[1],
      precioUsd: porMoneda("USD"),
      precioGbp: porMoneda("GBP"),
      precioEur: porMoneda("EUR"),
    });
  }

  return { ratios, futuros, ignoradas };
}
