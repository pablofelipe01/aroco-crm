import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { MCPS } from "@/lib/mcp/config";
import { traerExtracto, diasHabiles } from "./stonex";
import { listarVencimientos, traerTablero } from "./barchart";
import { traerTrm } from "./trm";
import { sincronizarIntel } from "./intel";
import { precioEnVivo, guardarPrecio } from "./precio";
import { sincronizarDiferenciales, type ResultadoDiferenciales } from "./diferenciales-sync";
import {
  guardarExtracto,
  guardarTablero,
  TASA_POR_DEFECTO,
  type ResultadoGuardado,
} from "./guardar";

export type ResumenSync = {
  estados: ResultadoGuardado[];
  tableros: { contract_month: string; strikes: number }[];
  trm: number;
  precio: number | null;
  diferenciales: ResultadoDiferenciales | null;
  intel: { nuevos: number; resumidos: number; total: number };
  sinEstado: string[];
  fallos: { fuente: string; error: string }[];
  duration_ms: number;
};

/**
 * Sincroniza las tres fuentes de Mercado.
 *
 * Vive aquí y no dentro de la ruta del cron porque el botón de «sincronizar
 * ahora» corre exactamente lo mismo. Con dos copias, la que se usa a mano y la
 * automática se irían separando y nadie sabría cuál de las dos produjo la
 * cifra que está viendo.
 *
 * Cada fuente falla por su cuenta: que Barchart no responda no puede impedir
 * que entre la TRM. Media sincronización, con el detalle de qué faltó, es más
 * útil que ninguna.
 *
 * Las tres corren EN PARALELO. En serie tardaban 322 s —por encima del tope de
 * 300 s de la función— y el botón se cortaba a la mitad, dejando el tablero a
 * medio actualizar sin decirlo. Son fuentes distintas y no dependen entre sí,
 * así que el costo pasa de ser la suma a ser la más lenta.
 */
export async function sincronizarMercado(
  db: SupabaseClient<Database>,
  opciones: { dias?: number; vencimientos?: number; diferenciales?: boolean } = {},
): Promise<ResumenSync> {
  const inicio = Date.now();
  const dias = opciones.dias ?? 5;
  const vencimientos = opciones.vencimientos ?? 3;
  const hoy = new Date().toISOString().slice(0, 10);

  const estados: ResultadoGuardado[] = [];
  const tableros: { contract_month: string; strikes: number }[] = [];
  const sinEstado: string[] = [];
  const fallos: { fuente: string; error: string }[] = [];
  const texto = (e: unknown) => (e instanceof Error ? e.message.slice(0, 200) : "desconocido");

  let trm = 0;
  let intel = { nuevos: 0, resumidos: 0, total: 0 };
  let precio: number | null = null;
  let diferenciales: ResultadoDiferenciales | null = null;

  const conStonex = async () => {
    if (!MCPS.stonex.url) return;
    // Los días sí van en serie: es el mismo MCP y pedirle varios PDF a la vez
    // lo pone a competir consigo mismo.
    for (const fecha of diasHabiles(new Date(), dias)) {
      try {
        const extracto = await traerExtracto(MCPS.stonex, fecha);
        if (!extracto) {
          sinEstado.push(fecha);
          continue;
        }
        estados.push(await guardarExtracto(db, extracto));
      } catch (e) {
        fallos.push({ fuente: `StoneX ${fecha}`, error: texto(e) });
      }
    }
  };

  const conBarchart = async () => {
    if (!MCPS.barchart.url || vencimientos <= 0) return;
    try {
      // La tasa con la que se despeja el delta desde la prima. Configurable
      // (ajustes_mercado, migración 0081) porque una tasa escrita en el código
      // es una tasa que nadie actualiza; si falta, el respaldo del módulo.
      const { data: ajusteTasa } = await db
        .from("ajustes_mercado")
        .select("valor")
        .eq("clave", "tasa_libre_riesgo")
        .maybeSingle();
      const tasa = Number(ajusteTasa?.valor ?? TASA_POR_DEFECTO) || TASA_POR_DEFECTO;

      const vencs = await listarVencimientos(MCPS.barchart);
      const pedidos = vencs.slice(0, vencimientos);

      // EN PARALELO, no en serie.
      //
      // Cada tablero tarda ~100 s (Playwright abriendo Chromium del otro lado),
      // así que tres seguidos son ~300 s y la sincronización entera llegaba a
      // 352 s — por encima del tope de 300 s de Vercel. La función moría en el
      // ÚLTIMO vencimiento, que es justo el más lejano y el más líquido: el
      // 31-ago quedaron guardados Oct y Nov, y Dic no. No dejaba error, solo
      // faltaba una fila, y en pantalla se veía igual que si Barchart no lo
      // ofreciera.
      //
      // Comprobado que el MCP aguanta las tres a la vez: 100 s en total y los
      // tres tableros completos (82, 60 y 237 strikes).
      const resultados = await Promise.allSettled(
        pedidos.map((v) => traerTablero(MCPS.barchart, v)),
      );

      // El guardado sí va en serie: son escrituras rápidas y así el orden de
      // `tableros` sigue al de los vencimientos.
      for (const [i, r] of resultados.entries()) {
        const v = pedidos[i];
        if (r.status === "rejected") {
          // Un vencimiento que falla no cancela los otros.
          fallos.push({ fuente: `Barchart ${v.label}`, error: texto(r.reason) });
          continue;
        }
        try {
          if (r.value) tableros.push(await guardarTablero(db, r.value, hoy, tasa));
        } catch (e) {
          fallos.push({ fuente: `Barchart ${v.label} (guardado)`, error: texto(e) });
        }
      }
    } catch (e) {
      fallos.push({ fuente: "Barchart", error: texto(e) });
    }
  };

  const conTrm = async () => {
    try {
      const filas = await traerTrm(60);
      const { error } = await db.from("trm_data").upsert(filas, { onConflict: "date" });
      if (error) throw new Error(error.message);
      trm = filas.length;
    } catch (e) {
      fallos.push({ fuente: "TRM", error: texto(e) });
    }
  };

  const conIntel = async () => {
    if (!MCPS.stonex.url) return;
    try {
      intel = await sincronizarIntel(db, MCPS.stonex);
    } catch (e) {
      fallos.push({ fuente: "Inteligencia de mercado", error: texto(e) });
    }
  };

  const conPrecio = async () => {
    try {
      // Rápido y sin credenciales. Se guarda para tener histórico y para poder
      // responder si Yahoo no contesta cuando alguien abra la pantalla.
      const p = await precioEnVivo(10_000);
      await guardarPrecio(db, p);
      precio = p.usdT;
    } catch (e) {
      fallos.push({ fuente: "Precio del cacao", error: texto(e) });
    }
  };

  const conDiferenciales = async () => {
    if (!MCPS.stonex.url || !opciones.diferenciales) return;
    try {
      diferenciales = await sincronizarDiferenciales(db, MCPS.stonex);
      if (diferenciales.aviso) fallos.push({ fuente: "Diferenciales", error: diferenciales.aviso });
    } catch (e) {
      fallos.push({ fuente: "Diferenciales", error: texto(e) });
    }
  };

  // allSettled y no all: una fuente que reviente no puede tumbar a las otras
  // dos antes de que terminen.
  await Promise.allSettled([
    conStonex(), conBarchart(), conTrm(), conIntel(), conPrecio(), conDiferenciales(),
  ]);

  const duration_ms = Date.now() - inicio;

  // Que no entre NADA es una avería. Que no haya estados es un festivo.
  const nadaEntro =
    estados.length === 0 && tableros.length === 0 && trm === 0 && intel.total === 0 && precio === null;
  await db.from("inventory_sync_runs").insert({
    source: "mercado",
    status: nadaEntro && fallos.length > 0 ? "error" : "ok",
    rows_read: estados.length + tableros.length + trm + intel.total,
    duration_ms,
    error: fallos.length
      ? fallos.map((f) => `${f.fuente}: ${f.error}`).join(" · ").slice(0, 900)
      : null,
  });

  return { estados, tableros, trm, precio, diferenciales, intel, sinEstado, fallos, duration_ms };
}

/** Cuándo terminó la última sincronización de Mercado, para mostrarla. */
export async function ultimaSync(
  db: SupabaseClient<Database>,
): Promise<{ ran_at: string; status: string; error: string | null } | null> {
  const { data } = await db
    .from("inventory_sync_runs")
    .select("ran_at, status, error")
    .in("source", ["mercado", "stonex_mcp"])
    .order("ran_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}
