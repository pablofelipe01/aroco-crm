import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { LEAD_STAGES, LEAD_STAGE_WEIGHT, type LeadStage } from "@/lib/status";
import { getMarketData, getInternationalSeries } from "@/lib/market";
import { regionFromCode } from "@/lib/inventory/region";
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

/** Label for the international ICE line in the price chart. */
const INTL = "Internacional (ICE)";

function shortDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(d);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const isAdmin = session?.profile?.role === "admin";
  const dept = session?.profile?.department ?? null;

  // Próximas tareas pendientes. Ya no se filtra por departamento aquí: desde
  // 0048 la RLS recorta por rama del organigrama, así que un SuperAdmin ve
  // todo y un jefe ve lo suyo y lo de su gente. Filtrar además por área haría
  // que Dirección dejara de ver el resto de la empresa.
  const tasksQuery = supabase
    .from("tasks")
    .select(
      "id, name, status, due_date, person_name, person:team_members!tasks_person_id_fkey(name, department)",
    )
    .neq("status", "done")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(5);

  const [leadsRes, stockRes, pricesRes, dispatchRes, market, tasksRes] =
    await Promise.all([
      supabase.from("leads").select("status, potential_value_cop"),
      // Inventario real, lote por lote. Antes esto salía de `inventory_quality`
      // —la segunda pestaña de la hoja— que arrastraba filas ya despachadas y
      // mostraba 12.198 kg contra los 2.500 kg que hay de verdad.
      supabase.from("inventory_lots").select("code, qty_available_kg"),
      supabase
        .from("price_history")
        .select("company, date, price_cop_kg")
        .order("date", { ascending: true }),
      supabase.from("dispatches").select("qty_kg"),
      getMarketData(),
      tasksQuery,
    ]);

  const leads = leadsRes.data ?? [];
  const stock = stockRes.data ?? [];
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

  // Weighted pipeline value: each lead's potential value × its stage
  // probability (10% Nuevo … 100% Cerrado). `total` excludes discarded leads.
  let pipelineWeighted = 0;
  let pipelineTotal = 0;
  for (const l of leads) {
    const v = Number(l.potential_value_cop) || 0;
    if (v <= 0) continue;
    pipelineWeighted += v * (LEAD_STAGE_WEIGHT[l.status as LeadStage] ?? 0);
    if (l.status !== "Descartado") pipelineTotal += v;
  }

  // Inventario disponible por región. Solo cuentan los lotes con saldo: los
  // agotados siguen en la tabla y sumarlos al conteo daría "89 lotes" para
  // 2.500 kg, cuando en bodega solo quedan 9 con existencia.
  const regionKg = new Map<string, number>();
  let kgAvailable = 0;
  let lotsWithStock = 0;
  for (const row of stock) {
    const kg = Number(row.qty_available_kg) || 0;
    if (kg <= 0) continue;
    kgAvailable += kg;
    lotsWithStock++;
    const region = regionFromCode(row.code);
    regionKg.set(region, (regionKg.get(region) ?? 0) + kg);
  }
  const sortedRegions = [...regionKg.entries()].sort((a, b) => b[1] - a[1]);
  const topRegions = sortedRegions.slice(0, 6).map(([region, kg]) => ({ region, kg }));
  const restKg = sortedRegions.slice(6).reduce((s, [, kg]) => s + kg, 0);
  if (restKg > 0) topRegions.push({ region: "Otros", kg: restKg });

  // Price series — pivot to one row per date, overlay the international ICE
  // reference (COP/kg), keep the last 18 dates.
  const companies = [...new Set(prices.map((p) => p.company))];
  const intlByDate = await getInternationalSeries([
    ...new Set(prices.map((p) => p.date)),
  ]);
  const byDate = new Map<string, PriceSeriesPoint>();
  for (const p of prices) {
    const row = byDate.get(p.date) ?? { date: shortDate(p.date) };
    row[p.company] = Number(p.price_cop_kg);
    byDate.set(p.date, row);
  }
  for (const [iso, row] of byDate) {
    const intl = intlByDate[iso];
    if (intl != null) row[INTL] = intl;
  }
  const hasIntl = Object.keys(intlByDate).length > 0;
  const priceSeries = [...byDate.values()].slice(-18);
  const priceCompanies = hasIntl ? [...companies, INTL] : companies;

  // Market references: latest cacao price per company (prices are asc, so the
  // last seen is the latest) + TRM and international cocoa from the last quote.
  const latestPrice = new Map<string, number>();
  for (const p of prices) latestPrice.set(p.company, Number(p.price_cop_kg));
  const cacao = companies.map((c) => ({ company: c, price: latestPrice.get(c) ?? null }));

  // Upcoming tasks.
  type TaskRow = {
    id: string;
    name: string;
    status: string;
    due_date: string | null;
    person_name: string | null;
    person: { name: string | null; department: string | null } | null;
  };
  const today = new Date().toISOString().slice(0, 10);
  const upcomingTasks = ((tasksRes.data ?? []) as unknown as TaskRow[]).map((t) => ({
    id: t.id,
    name: t.name,
    person_name: t.person?.name ?? t.person_name ?? null,
    due_date: t.due_date,
    status: t.status,
    overdue: !!t.due_date && t.due_date < today,
  }));

  const data: DashboardData = {
    name: session?.profile?.full_name ?? "",
    kpis: {
      totalLeads: leads.length,
      activeLeads: leads.filter((l) => ACTIVE_STAGES.includes(l.status)).length,
      kgAvailable,
      lotsCount: lotsWithStock,
      dispatchCount: dispatches.length,
      dispatchedKg: dispatches.reduce((s, d) => s + (Number(d.qty_kg) || 0), 0),
    },
    refs: {
      trm: market.trm,
      trmDate: market.trmDate,
      spot: market.spot,
      cocoaUsdT: market.cocoaUsdT,
      cocoaContract: market.cocoaContract,
      cacao,
    },
    upcomingTasks,
    tasksScopeLabel: isAdmin && dept ? `Departamento: ${dept}` : "Próximas",
    pipeline,
    pipelineValue: { weighted: pipelineWeighted, total: pipelineTotal },
    inventory: topRegions,
    priceSeries,
    priceCompanies,
  };

  return <DashboardView data={data} />;
}
