import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { sincronizarMercado } from "@/lib/mercado/sync";
import { avisarFalloSync } from "@/lib/sync-alerta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sincroniza Mercado: estados de cuenta de StoneX, tablero de opciones de
 * Barchart y TRM oficial.
 *
 * La lógica vive en `sincronizarMercado` porque el botón de «sincronizar
 * ahora» corre exactamente lo mismo; con dos copias, la automática y la manual
 * se irían separando.
 *
 * Recorre varios días hábiles en vez de pedir solo hoy: el estado del día se
 * publica con retraso, y mirar hacia atrás recupera solo los días en que el
 * sync estuvo caído.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const db = createAdminClient();
  const dias = Number(request.nextUrl.searchParams.get("dias") ?? 5);
  // Los diferenciales son un reporte SEMANAL y traerlos obliga al agente a
  // navegar el portal y parsear un PDF. Pedirlos a diario sería cargar ese
  // trabajo cinco veces por un dato que no cambió.
  const diferenciales = request.nextUrl.searchParams.get("diferenciales") === "1";
  const r = await sincronizarMercado(db, { dias, diferenciales });
  if (diferenciales) await avisarDiferencialesViejos(db, r.fallos);

  // Solo se avisa si no entró NADA. Que falle un vencimiento o un día suelto
  // es ruido; avisar por eso enseña a ignorar la campana.
  const nadaEntro = r.estados.length === 0 && r.tableros.length === 0 && r.trm === 0;
  if (nadaEntro && r.fallos.length > 0) {
    await avisarFalloSync(
      db,
      "mercado",
      "los datos de mercado",
      r.fallos.map((f) => `${f.fuente}: ${f.error}`).join(" · "),
    );
    return NextResponse.json({ ok: false, ...r }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...r });
}

/**
 * Del 10-sep al 22-oct `get_cocoa_tables` no respondió ni un jueves y nadie lo
 * supo: la TRM y los estados sí entraban, la corrida quedaba «ok» y el CRM
 * siguió mostrando los ratios del 28 de agosto. Por eso aquí no se mira si la
 * corrida falló, sino la edad del último reporte guardado.
 *
 * StoneX lo publica los viernes y este cron corre el jueves: con el reporte al
 * día tiene 6 días. 9 deja margen para un festivo sin dejar pasar una semana.
 */
const DIAS_MAX_DIFERENCIALES = 9;

async function avisarDiferencialesViejos(
  db: ReturnType<typeof createAdminClient>,
  fallos: { fuente: string; error: string }[],
): Promise<void> {
  const { data } = await db
    .from("cocoa_differentials")
    .select("report_date")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ultimo = data?.report_date ?? null;
  const dias = ultimo ? Math.floor((Date.now() - Date.parse(ultimo)) / 86_400_000) : null;
  if (dias !== null && dias <= DIAS_MAX_DIFERENCIALES) return;

  const motivo = fallos.find((f) => f.fuente === "Diferenciales")?.error;
  await avisarFalloSync(
    db,
    "diferenciales",
    "los diferenciales y ratios de StoneX",
    `${ultimo ? `El último reporte guardado es del ${ultimo} (hace ${dias} días).` : "No hay ningún reporte guardado."}${
      motivo ? ` Esta semana: ${motivo}` : ""
    }`,
  );
}
