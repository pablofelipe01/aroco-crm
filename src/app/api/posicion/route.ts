import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { construirPosicion, type LoteRow } from "@/lib/posicion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Posición de inventario, de solo lectura, para CacaoQ.
 *
 *   GET /api/posicion            todos los lotes
 *   GET /api/posicion?saldo=1    solo los que tienen kilos en bodega
 *
 * Autenticación por token propio (`POSICION_API_TOKEN`) y no por sesión: lo
 * consume una máquina. Token propio y no el del cron para que revocarlo no
 * apague las sincronizaciones.
 */

/** Comparación en tiempo constante: comparar con === filtra el token carácter
 *  a carácter por el tiempo de respuesta. */
function tokenValido(recibido: string | null, esperado: string): boolean {
  if (!recibido || !esperado) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const esperado = serverEnv.POSICION_API_TOKEN;
  if (!esperado) {
    // Sin token configurado el endpoint queda cerrado, no abierto: un despliegue
    // al que se le olvidó la variable no puede terminar publicando el inventario.
    return NextResponse.json(
      { error: "El endpoint no está configurado (falta POSICION_API_TOKEN)." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization");
  const recibido = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!tokenValido(recibido, esperado)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("inventory_lots")
    .select(
      "code, remision, recepcion, odc, entry_date, origin, qty_in_kg, qty_out_kg, purchase_price_cop_kg, quality",
    )
    .order("entry_date", { ascending: false, nullsFirst: false });

  if (error) {
    // El error se devuelve, no se disfraza de lista vacía: para quien consume,
    // «cero lotes» y «la consulta falló» tienen que ser distinguibles.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const posicion = construirPosicion((data ?? []) as LoteRow[], new Date());

  if (request.nextUrl.searchParams.get("saldo") === "1") {
    posicion.lotes = posicion.lotes.filter((l) => l.kg_disponible > 0);
  }

  return NextResponse.json(posicion, {
    headers: { "Cache-Control": "no-store" },
  });
}
