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
