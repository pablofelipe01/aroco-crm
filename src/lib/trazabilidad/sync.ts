import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { parseCsv } from "@/lib/ventas/sheet";
import {
  agruparAcopios,
  claveVereda,
  parseHojaRuta,
  type EntregaFila,
} from "./hoja";

/**
 * Ingesta de la hoja de ruta.
 *
 * La hoja es la fuente de verdad de QUIÉN ENTREGÓ QUÉ; el CRM la refleja. Por
 * eso las entregas de un acopio se reemplazan enteras en cada corrida: si
 * alguien corrigió un peso en la hoja, aquí tiene que verse corregido y no
 * duplicado.
 *
 * Lo que la corrida NO toca es el enlace con el lote de inventario. Eso lo
 * decidió una persona mirando dos cifras, y una sincronización nocturna no
 * tiene por qué deshacerlo.
 */

export type ResultadoRutas = {
  filas: number;
  acopios: number;
  entregas: number;
  veredasNuevas: string[];
  rutasNuevas: number[];
  descartadas: { fila: number; motivo: string }[];
};

/**
 * Asegura que exista un lugar de tipo vereda por cada clave que traiga la
 * hoja, y devuelve el id de cada una.
 *
 * Las veredas nacen SIN COORDENADA. Es lo correcto: la hoja trae el nombre y
 * nada más, y colocarlas «por donde caiga el municipio» daría un mapa que
 * parece preciso y no lo es. Alguien las ubica después, y hasta entonces la
 * pantalla dice cuántas faltan.
 */
async function asegurarVeredas(
  db: SupabaseClient<Database>,
  entregas: EntregaFila[],
): Promise<{ porClave: Map<string, string>; nuevas: string[] }> {
  const claves = new Map<string, string>(); // clave → nombre tal cual lo escribió la hoja
  for (const e of entregas) {
    if (!e.veredaClave) continue;
    if (!claves.has(e.veredaClave)) claves.set(e.veredaClave, e.veredaCruda);
  }

  const { data: existentes, error } = await db
    .from("trazabilidad_lugares")
    .select("id, clave")
    .eq("tipo", "vereda");
  if (error) throw new Error(`trazabilidad_lugares: ${error.message}`);

  const porClave = new Map((existentes ?? []).map((l) => [l.clave, l.id]));
  const faltan = [...claves.entries()].filter(([c]) => !porClave.has(c));

  if (faltan.length > 0) {
    const { data: creadas, error: eIns } = await db
      .from("trazabilidad_lugares")
      .insert(
        faltan.map(([clave, nombre]) => ({
          tipo: "vereda" as const,
          nombre,
          clave,
          departamento: "Cauca",
        })),
      )
      .select("id, clave");
    if (eIns) throw new Error(`trazabilidad_lugares (alta): ${eIns.message}`);
    for (const l of creadas ?? []) porClave.set(l.clave, l.id);
  }

  return { porClave, nuevas: faltan.map(([, nombre]) => nombre) };
}

/**
 * Crea las rutas que la hoja mencione y el catálogo todavía no tenga.
 *
 * Sin esto, una ruta 5 nueva haría fallar la corrida entera por una llave
 * foránea, y el motivo real —«apareció una ruta que nadie ha descrito»— se
 * leería como un error de base de datos.
 */
async function asegurarRutas(
  db: SupabaseClient<Database>,
  numeros: number[],
): Promise<number[]> {
  const { data: existentes, error } = await db
    .from("trazabilidad_rutas")
    .select("numero");
  if (error) throw new Error(`trazabilidad_rutas: ${error.message}`);

  const hay = new Set((existentes ?? []).map((r) => r.numero));
  const faltan = [...new Set(numeros)].filter((n) => !hay.has(n));
  if (faltan.length === 0) return [];

  const { error: eIns } = await db.from("trazabilidad_rutas").insert(
    faltan.map((numero) => ({
      numero,
      etiqueta: `Ruta ${numero}`,
      nota: "Apareció en la hoja de ruta y todavía no tiene municipios asignados.",
    })),
  );
  if (eIns) throw new Error(`trazabilidad_rutas (alta): ${eIns.message}`);
  return faltan;
}

export async function sincronizarHojaRuta(
  db: SupabaseClient<Database>,
  csv: string,
): Promise<ResultadoRutas> {
  const { entregas, descartadas } = parseHojaRuta(parseCsv(csv));
  if (entregas.length === 0) {
    throw new Error(
      "0 entregas leídas — la estructura de la hoja de ruta pudo cambiar.",
    );
  }

  const rutasNuevas = await asegurarRutas(db, entregas.map((e) => e.ruta));
  const { porClave, nuevas } = await asegurarVeredas(db, entregas);
  const acopios = agruparAcopios(entregas);

  let totalEntregas = 0;

  for (const a of acopios) {
    // Se busca antes de escribir para conservar el enlace con el lote: un
    // upsert con la fila completa lo pondría en null en cada corrida.
    const { data: previo } = await db
      .from("trazabilidad_acopios")
      .select("id")
      .eq("fecha", a.fecha)
      .eq("ruta", a.ruta)
      .maybeSingle();

    const cifras = {
      kg_primera: a.kgPrimera,
      kg_segunda: a.kgSegunda,
      kg_total: a.kgTotal,
      productores: a.productores,
      veredas: a.veredas,
      total_venta: a.totalVenta,
      synced_at: new Date().toISOString(),
    };

    let acopioId: string;
    if (previo) {
      const { error } = await db
        .from("trazabilidad_acopios")
        .update(cifras)
        .eq("id", previo.id);
      if (error) throw new Error(`trazabilidad_acopios: ${error.message}`);
      acopioId = previo.id;
    } else {
      const { data, error } = await db
        .from("trazabilidad_acopios")
        .insert({ fecha: a.fecha, ruta: a.ruta, ...cifras })
        .select("id")
        .single();
      if (error) throw new Error(`trazabilidad_acopios: ${error.message}`);
      acopioId = data.id;
    }

    const suyas = entregas.filter((e) => e.fecha === a.fecha && e.ruta === a.ruta);

    // Reemplazo completo: la hoja manda. Un upsert por fila dejaría vivas las
    // entregas de alguien a quien borraron de la hoja.
    const { error: eDel } = await db
      .from("trazabilidad_entregas")
      .delete()
      .eq("acopio_id", acopioId);
    if (eDel) throw new Error(`trazabilidad_entregas (limpieza): ${eDel.message}`);

    const { error: eIns } = await db.from("trazabilidad_entregas").insert(
      suyas.map((e) => ({
        acopio_id: acopioId,
        fila: e.fila,
        productor: e.productor,
        cedula: e.cedula || null,
        tipo_productor: e.tipoProductor || null,
        vereda_cruda: e.veredaCruda || null,
        vereda_clave: e.veredaClave || null,
        vereda_id: porClave.get(e.veredaClave) ?? null,
        calidad: e.calidad || null,
        kg_primera: e.kgPrimera,
        kg_segunda: e.kgSegunda,
        precio_base: e.precioBase || null,
        bonificacion_calidad: e.bonificacionCalidad || null,
        precio_kg_primera: e.precioKgPrimera || null,
        total_primera: e.totalPrimera || null,
        precio_kg_segunda: e.precioKgSegunda || null,
        total_segunda: e.totalSegunda || null,
        total_venta: e.totalVenta || null,
      })),
    );
    if (eIns) throw new Error(`trazabilidad_entregas: ${eIns.message}`);
    totalEntregas += suyas.length;
  }

  return {
    filas: entregas.length,
    acopios: acopios.length,
    entregas: totalEntregas,
    veredasNuevas: nuevas,
    rutasNuevas,
    descartadas,
  };
}

/** Reexportada para que el cron no tenga que conocer el parser. */
export { claveVereda };
