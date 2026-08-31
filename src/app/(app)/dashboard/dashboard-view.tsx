"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users,
  Boxes,
  Truck,
  FileText,
  Sparkles,
  DollarSign,
  Coins,
  ListChecks,
  Calendar,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TASK_STATUS_META, etiquetaTarea, type TaskStatus } from "@/lib/status";
import { useT, useFormatos } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { staggerContainer } from "@/lib/motion";
import {
  PipelineChart,
  type PipelineDatum,
} from "@/components/charts/pipeline-chart";
import {
  InventoryChart,
  type InventoryDatum,
} from "@/components/charts/inventory-chart";
import {
  PriceChart,
  type PriceSeriesPoint,
} from "@/components/charts/price-chart";

export interface DashboardData {
  name: string;
  kpis: {
    totalLeads: number;
    activeLeads: number;
    kgAvailable: number;
    lotsCount: number;
    dispatchCount: number;
    dispatchedKg: number;
  };
  refs: {
    trm: number | null;
    trmDate: string | null;
    spot: number | null;
    cocoaUsdT: number | null;
    cocoaContract: string | null;
    cacao: { company: string; price: number | null }[];
  };
  upcomingTasks: {
    id: string;
    name: string;
    person_name: string | null;
    due_date: string | null;
    status: string;
    overdue: boolean;
  }[];
  /** El área cuyas tareas se están mirando, o null si son las propias. */
  tasksScopeDept: string | null;
  pipeline: PipelineDatum[];
  pipelineValue: { weighted: number; total: number };
  inventory: InventoryDatum[];
  priceSeries: PriceSeriesPoint[];
  priceCompanies: string[];
}

function shortCompany(c: string): string {
  const u = c.toUpperCase();
  if (u.includes("LUKER")) return u.includes("ALTO") ? "Casa Luker (Alto Cd)" : "Casa Luker";
  if (u.includes("IBAGU")) return "Ibagué";
  if (u.includes("NACIONAL") || u.includes("BTA") || u.includes("BOGOT"))
    return "Nal. Chocolate";
  return c;
}

export function DashboardView({ data }: { data: DashboardData }) {
  const { kpis } = data;
  const t = useT();
  const f = useFormatos();
  return (
    <div className="space-y-8">
      <PageHeader
        title={`${t.dashboard.saludo}, ${data.name.split(" ")[0] || t.dashboard.equipo}`}
        description={t.dashboard.descripcion}
        actions={
          <Badge tone="accent">
            <Sparkles className="h-3 w-3" />
            {t.dashboard.enVivo}
          </Badge>
        }
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label={t.dashboard.leadsPipeline}
          value={kpis.totalLeads}
          icon={Users}
          hint={`${kpis.activeLeads} ${t.dashboard.activos}`}
        />
        <StatCard
          label={t.dashboard.disponibleBodega}
          value={kpis.kgAvailable}
          suffix=" kg"
          icon={Boxes}
          hint={`${kpis.lotsCount} ${t.dashboard.lotes}`}
        />
        <StatCard
          label={t.dashboard.despachosRegistrados}
          value={kpis.dispatchCount}
          icon={Truck}
          hint={f.kg(Math.round(kpis.dispatchedKg))}
        />
        <StatCard
          label={t.dashboard.kgDespachados}
          value={kpis.dispatchedKg}
          suffix=" kg"
          icon={FileText}
        />
      </motion.div>

      {/* Market references + upcoming tasks */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.referencias}</CardTitle>
            <DollarSign className="h-4 w-4 text-fg-subtle" />
          </CardHeader>
          <CardBody className="space-y-2.5">
            <RefRow
              icon={<DollarSign className="h-4 w-4" />}
              label={t.dashboard.trmOficial}
              value={data.refs.trm != null ? `$${f.numero(data.refs.trm, 2)}` : "—"}
              hint={data.refs.trmDate ? `Banrep · ${f.fecha(data.refs.trmDate)}` : "Banrep"}
            />
            <RefRow
              icon={<DollarSign className="h-4 w-4" />}
              label={t.dashboard.spot}
              value={data.refs.spot != null ? `$${f.numero(data.refs.spot, 2)}` : "—"}
              hint={
                data.refs.spot != null && data.refs.trm != null
                  ? `${data.refs.spot >= data.refs.trm ? "+" : ""}${f.numero(
                      data.refs.spot - data.refs.trm,
                    )} vs TRM`
                  : "Yahoo"
              }
            />
            <RefRow
              icon={<Coins className="h-4 w-4" />}
              label={t.dashboard.cacaoIce}
              value={data.refs.cocoaUsdT != null ? `$${f.numero(data.refs.cocoaUsdT)}` : "—"}
              hint={data.refs.cocoaContract ? `${data.refs.cocoaContract} · USD/T` : "USD/T"}
            />
            <div className="border-t border-border pt-2.5">
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-fg-subtle">
                {t.dashboard.cacaoNacional}
              </p>
              {data.refs.cacao.length === 0 ? (
                <p className="text-sm text-fg-subtle">{t.dashboard.sinPrecios}</p>
              ) : (
                data.refs.cacao.map((c) => (
                  <div key={c.company} className="flex items-center justify-between py-0.5 text-sm">
                    <span className="truncate text-fg-muted">{shortCompany(c.company)}</span>
                    <span className="font-mono tnum text-fg">
                      {c.price != null ? f.numero(c.price) : "—"}
                    </span>
                  </div>
                ))
              )}
            </div>
            <p className="text-[11px] text-fg-subtle">
              {t.dashboard.fuentes}
            </p>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-accent" />
              {t.dashboard.proximasTareas}
            </CardTitle>
            <Badge tone="neutral">
              {data.tasksScopeDept
                ? `${t.dashboard.departamento}: ${data.tasksScopeDept}`
                : t.dashboard.proximas}
            </Badge>
          </CardHeader>
          <CardBody className="p-0">
            {data.upcomingTasks.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-fg-subtle">
                {t.dashboard.sinTareas}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.upcomingTasks.map((tarea) => (
                  <li key={tarea.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Badge
                      tone={
                        TASK_STATUS_META[tarea.status as TaskStatus]?.tone ?? "neutral"
                      }
                      dot
                    >
                      {etiquetaTarea(tarea.status, t)}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{tarea.name}</p>
                      {tarea.person_name && (
                        <p className="truncate text-xs text-fg-muted">{tarea.person_name}</p>
                      )}
                    </div>
                    {tarea.due_date && (
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 font-mono text-xs",
                          tarea.overdue ? "font-medium text-danger" : "text-fg-subtle",
                        )}
                      >
                        <Calendar className="h-3 w-3" />
                        {f.fecha(tarea.due_date)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-border px-5 py-2.5 text-right">
              <Link href="/tareas" className="text-xs text-accent hover:underline">
                {t.dashboard.verTareas}
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.dashboard.embudo}</CardTitle>
            <Badge tone="neutral">
              {kpis.totalLeads} {t.dashboard.leads}
            </Badge>
          </CardHeader>
          <CardBody>
            {data.pipelineValue.weighted > 0 && (
              <div className="mb-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-fg-subtle">
                    {t.dashboard.valorPonderado}
                  </p>
                  <p className="mt-0.5 font-mono text-2xl font-bold tnum text-fg">
                    {f.cop(data.pipelineValue.weighted)}
                  </p>
                </div>
                {data.pipelineValue.total > 0 && (
                  <p className="text-xs text-fg-subtle">
                    {t.comun.de} {f.cop(data.pipelineValue.total)}{" "}
                    {t.dashboard.dePotencial}
                  </p>
                )}
              </div>
            )}
            {data.pipeline.some((p) => p.count > 0) ? (
              <PipelineChart data={data.pipeline} />
            ) : (
              <EmptyState title={t.dashboard.sinLeads} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.inventarioProcedencia}</CardTitle>
          </CardHeader>
          <CardBody>
            {data.inventory.length > 0 ? (
              <InventoryChart data={data.inventory} />
            ) : (
              <EmptyState title={t.dashboard.sinInventario} />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.dashboard.tendencia}</CardTitle>
          <Badge tone="neutral">
            {data.priceCompanies.filter((c) => !c.toUpperCase().includes("INTERNACIONAL")).length}{" "}
            {t.dashboard.companias}
          </Badge>
        </CardHeader>
        <CardBody>
          {data.priceSeries.length > 0 ? (
            <PriceChart data={data.priceSeries} companies={data.priceCompanies} />
          ) : (
            <EmptyState title={t.dashboard.sinHistorico} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function RefRow({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent-soft-fg">
        {icon}
      </span>
      <span className="text-sm text-fg-muted">{label}</span>
      <span className="ml-auto font-mono text-sm font-semibold tnum text-fg">{value}</span>
      {hint && <span className="text-[10px] uppercase tracking-wide text-fg-subtle">{hint}</span>}
    </div>
  );
}
