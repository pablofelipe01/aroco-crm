import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { LEAD_STAGES, type LeadStage } from "@/lib/status";
import { DashboardView, type DashboardData } from "./dashboard-view";
import type { PriceSeriesPoint } from "@/components/charts/price-chart";

export const dynamic = "force-dynamic";

const STAGE_COLOR: Record<LeadStage, string> = {
  Nuevo: "#74A57F",
  Cotización: "#40916C",
  Negociación: "#B45309",
  Enviado: "#2D6A4F",
  "En espera": "#9B9790",
  Cerrado: "#1B4332",
  Descartado: "#991B1B",
};

const ACTIVE_STAGES = ["Cotización", "Negociación", "Enviado"];

/** Map a lot code like "CO-ANT-URA-050525" → region segment "ANT". */
function regionFromCode(code: string): string {
  const parts = code.split("-");
  return parts[1]?.trim() || "Otro";
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(d);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const [leadsRes, lotsRes, pricesRes, dispatchRes] = await Promise.all([
    supabase.from("leads").select("status"),
    supabase.from("inventory_lots").select("code, qty_available_kg"),
    supabase
      .from("price_history")
      .select("company, date, price_cop_kg")
      .order("date", { ascending: true }),
    supabase.from("dispatches").select("qty_kg"),
  ]);

  const leads = leadsRes.data ?? [];
  const lots = lotsRes.data ?? [];
  const prices = pricesRes.data ?? [];
  const dispatches = dispatchRes.data ?? [];

  // Pipeline by stage.
  const stageCount = new Map<string, number>();
  leads.forEach((l) => stageCount.set(l.status, (stageCount.get(l.status) ?? 0) + 1));
  const pipeline = LEAD_STAGES.map((stage) => ({
    stage,
    count: stageCount.get(stage) ?? 0,
    color: STAGE_COLOR[stage],
  }));

  // Inventory by region (top 8 + Otros).
  const regionKg = new Map<string, number>();
  let kgAvailable = 0;
  for (const lot of lots) {
    const kg = Number(lot.qty_available_kg) || 0;
    kgAvailable += kg;
    if (kg <= 0) continue;
    const region = regionFromCode(lot.code);
    regionKg.set(region, (regionKg.get(region) ?? 0) + kg);
  }
  const sortedRegions = [...regionKg.entries()].sort((a, b) => b[1] - a[1]);
  const topRegions = sortedRegions.slice(0, 8).map(([region, kg]) => ({ region, kg }));
  const restKg = sortedRegions.slice(8).reduce((s, [, kg]) => s + kg, 0);
  if (restKg > 0) topRegions.push({ region: "Otros", kg: restKg });

  // Price series — pivot to one row per date (last 18 dates).
  const companies = [...new Set(prices.map((p) => p.company))];
  const byDate = new Map<string, PriceSeriesPoint>();
  for (const p of prices) {
    const row = byDate.get(p.date) ?? { date: shortDate(p.date) };
    row[p.company] = Number(p.price_cop_kg);
    byDate.set(p.date, row);
  }
  const priceSeries = [...byDate.values()].slice(-18);

  const data: DashboardData = {
    name: session?.profile?.full_name ?? "",
    kpis: {
      totalLeads: leads.length,
      activeLeads: leads.filter((l) => ACTIVE_STAGES.includes(l.status)).length,
      kgAvailable,
      lotsCount: lots.length,
      dispatchCount: dispatches.length,
      dispatchedKg: dispatches.reduce((s, d) => s + (Number(d.qty_kg) || 0), 0),
    },
    pipeline,
    inventory: topRegions,
    priceSeries,
    priceCompanies: companies,
  };

  return <DashboardView data={data} />;
}
