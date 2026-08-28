import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { llamarHerramienta, type McpConfig } from "@/lib/mcp/client";
import { parsearMatriz, estimarColombia, POSICION_COLOMBIA, type Matriz } from "./diferenciales";

/**
 * Trae los diferenciales semanales de StoneX por el agente del servidor.
 *
 * El agente hace el trabajo que Vercel no puede: navegar el portal con sesión,
 * hacer scroll hasta el reporte y sacar la tabla de un PDF sin líneas de
 * grilla. El CRM solo pide el resultado, lo guarda y calcula lo de Colombia.
 *
 * Se guarda SIEMPRE la matriz cruda además de las filas interpretadas. Si el
 * parseo resulta equivocado —y con un PDF sin grilla es probable que alguna
 * semana lo sea— se puede volver a leer sin esperar al reporte siguiente.
 */

export type ResultadoDiferenciales = {
  report_date: string | null;
  filas: number;
  colombia: number | null;
  ignoradas: number;
  aviso: string | null;
};

type Tabla = { published_date?: string; pdf_url?: string; matrix?: Matriz; rows?: Matriz };

const fecha = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export async function sincronizarDiferenciales(
  db: SupabaseClient<Database>,
  mcp: McpConfig,
): Promise<ResultadoDiferenciales> {
  const r = await llamarHerramienta(mcp, "get_cocoa_tables", {}, 240_000);
  if (typeof r === "string") throw new Error(r);

  const payload = r as { differentials?: Tabla; missing?: string[] };
  const t = payload.differentials;
  // `missing` es la señal del propio agente de que no alcanzó el reporte en el
  // scroll. Es distinto de un fallo: hay que decirlo, no reintentar a ciegas.
  if (!t) {
    const faltan = payload.missing?.join(", ");
    throw new Error(
      faltan
        ? `El agente no encontró: ${faltan}. Subir max_scrolls.`
        : "get_cocoa_tables no devolvió la tabla de diferenciales.",
    );
  }

  const matriz = t.matrix ?? t.rows;
  if (!Array.isArray(matriz) || matriz.length === 0) {
    throw new Error("La tabla de diferenciales llegó vacía.");
  }
  const reportDate = fecha(t.published_date) ?? new Date().toISOString().slice(0, 10);

  // 1) El crudo, antes de interpretarlo.
  const { error: eRaw } = await db.from("cocoa_report_tables").upsert(
    { reporte: "differentials", report_date: reportDate, pdf_url: t.pdf_url ?? null, matriz },
    { onConflict: "reporte,report_date" },
  );
  if (eRaw) throw new Error(`cocoa_report_tables: ${eRaw.message}`);

  // 2) Las filas interpretadas.
  const { filas, ignoradas } = parsearMatriz(matriz);
  if (filas.length === 0) {
    throw new Error(
      `No se reconoció ninguna fila de origen en la matriz (${ignoradas.length} líneas ignoradas). ` +
        "El crudo quedó guardado para revisarlo.",
    );
  }

  await db
    .from("cocoa_differentials")
    .delete()
    .eq("report_date", reportDate)
    .eq("fuente", "stonex");

  const { error: eFilas } = await db.from("cocoa_differentials").insert(
    filas.map((f) => ({
      report_date: reportDate,
      origen: f.origen,
      valor: f.valor,
      unidad: f.moneda,
      grado: f.incoterm,
      fuente: "stonex",
    })),
  );
  if (eFilas) throw new Error(`cocoa_differentials: ${eFilas.message}`);

  // 3) Colombia. Tanto la posición como QUÉ DOS FILAS comparar salen de la
  // base: las dos son juicios de Comercial, y la segunda resultó ser más
  // delicada de lo que parecía —Ecuador aparece en tres incoterms y solo uno
  // es comparable con Perú.
  const { data: ajustes } = await db
    .from("ajustes_mercado")
    .select("clave, valor, texto")
    .in("clave", ["posicion_colombia", "ref_baja", "ref_alta"]);

  const buscar = (c: string) => ajustes?.find((a) => a.clave === c);
  const posicion = Number(buscar("posicion_colombia")?.valor ?? POSICION_COLOMBIA);
  const refBaja = buscar("ref_baja")?.texto ?? "Peru Grade 1";
  const refAlta = buscar("ref_alta")?.texto ?? "Ecuador Grade 2 ExW US";

  const est = estimarColombia(filas, refBaja, refAlta, posicion);
  let colombia: number | null = null;
  let aviso: string | null = null;

  if ("error" in est) {
    // Que falte una referencia no invalida el resto del reporte: las demás
    // filas ya están guardadas y sirven. Se avisa y se sigue.
    aviso = `Colombia no se pudo estimar: ${est.error}`;
  } else {
    await db
      .from("cocoa_differentials")
      .delete()
      .eq("report_date", reportDate)
      .eq("fuente", "aroco");

    const { error: eCol } = await db.from("cocoa_differentials").insert({
      report_date: reportDate,
      origen: "Colombia",
      grado: null,
      valor: est.valor,
      unidad: est.moneda,
      fuente: "aroco",
      // La advertencia va pegada al método: si las referencias no son
      // comparables, quien lea el número tiene que verlo junto al número.
      metodo: est.advertencia ? `${est.metodo} ${est.advertencia}` : est.metodo,
    });
    if (eCol) throw new Error(`Colombia: ${eCol.message}`);
    colombia = est.valor;
  }

  return {
    report_date: reportDate,
    filas: filas.length,
    colombia,
    ignoradas: ignoradas.length,
    aviso,
  };
}
