/**
 * TRM — Tasa Representativa del Mercado, de la fuente oficial.
 *
 * Se lee de datos.gov.co, que publica la serie de la Superintendencia
 * Financiera. No necesita MCP ni credenciales: es un dataset público.
 *
 * La particularidad está en cómo la publican: cada registro trae
 * `vigenciadesde` y `vigenciahasta`, y una misma tasa cubre varios días. La del
 * viernes 22-ago-2026, por ejemplo, rige hasta el lunes 24. Guardar solo el día
 * de inicio dejaría el sábado y el domingo sin tasa, y cualquier cálculo de esos
 * días —un despacho del sábado, un cierre de mes en domingo— se quedaría sin
 * con qué convertir. Por eso el rango se expande a una fila por día.
 */

const FUENTE = "https://www.datos.gov.co/resource/32sa-8pi3.json";

export type FilaTrm = { date: string; trm: number };

type RegistroOficial = {
  valor?: string | number;
  vigenciadesde?: string;
  vigenciahasta?: string;
};

const soloFecha = (iso: string) => iso.slice(0, 10);

/**
 * Expande `[desde, hasta]` a una fila por día.
 *
 * Se limita a 31 días por registro: si la fuente publicara una fecha absurda
 * —ya pasó con `vigenciahasta` mal digitado— un rango sin tope generaría miles
 * de filas antes de que alguien lo note.
 */
export function expandirRango(r: RegistroOficial): FilaTrm[] {
  const valor = Number(r.valor);
  if (!Number.isFinite(valor) || valor <= 0 || !r.vigenciadesde) return [];

  const desde = new Date(`${soloFecha(r.vigenciadesde)}T00:00:00Z`);
  const hastaIso = r.vigenciahasta ? soloFecha(r.vigenciahasta) : soloFecha(r.vigenciadesde);
  const hasta = new Date(`${hastaIso}T00:00:00Z`);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || hasta < desde) {
    return [{ date: soloFecha(r.vigenciadesde), trm: valor }];
  }

  const filas: FilaTrm[] = [];
  const d = new Date(desde);
  while (d <= hasta && filas.length < 31) {
    filas.push({ date: d.toISOString().slice(0, 10), trm: valor });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return filas;
}

export function normalizarTrm(registros: RegistroOficial[]): FilaTrm[] {
  const porFecha = new Map<string, number>();
  for (const r of registros) {
    for (const f of expandirRango(r)) {
      // Si dos registros pisan el mismo día, gana el primero: la fuente viene
      // ordenada de más reciente a más antigua y el más reciente es el vigente.
      if (!porFecha.has(f.date)) porFecha.set(f.date, f.trm);
    }
  }
  return [...porFecha.entries()]
    .map(([date, trm]) => ({ date, trm }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function traerTrm(dias = 60): Promise<FilaTrm[]> {
  const url = `${FUENTE}?$order=vigenciadesde%20DESC&$limit=${dias}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`TRM: HTTP ${res.status} al leer datos.gov.co`);

  const cuerpo = await res.json();
  if (!Array.isArray(cuerpo)) throw new Error("TRM: la fuente no devolvió una lista.");

  const filas = normalizarTrm(cuerpo as RegistroOficial[]);
  if (filas.length === 0) throw new Error("TRM: 0 tasas utilizables en la respuesta.");
  return filas;
}
