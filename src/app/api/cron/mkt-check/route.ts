import { NextResponse } from "next/server";
import { getInternationalSeries, getMarketData } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnóstico temporal (público vía prefijo /api/cron): verifica que la fuente
// de cacao (Yahoo) funcione desde Vercel y que el internacional sea diario.
export async function GET() {
  const fechas = [
    "2026-06-01",
    "2026-06-12",
    "2026-06-18",
    "2026-06-23",
    "2026-06-24",
  ];
  const [market, intl] = await Promise.all([
    getMarketData(),
    getInternationalSeries(fechas),
  ]);
  return NextResponse.json({ market, intl });
}
