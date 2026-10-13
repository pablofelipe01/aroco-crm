"use client";

import * as React from "react";
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
import type { EstadoEquilibrio, Lado, Negocio } from "@/lib/calc/equilibrio";
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

export interface UpcomingTask {
  id: string;
  name: string;
  person_name: string | null;
  due_date: string | null;
  status: string;
  overdue: boolean;
}

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
  /** Próximas tareas propias y de mi área, por responsable. */
  upcomingTasks: { mias: UpcomingTask[]; area: UpcomingTask[] };
  /** Mi área, o null si no tengo: entonces no hay selector. */
  tasksDept: string | null;
  pipeline: PipelineDatum[];
  /** Ventas y compras por separado (no se suman). */
  negocios: Record<Negocio, Lado>;
  equilibrio: { estado: EstadoEquilibrio; cobertura: number | null };
  inventory: InventoryDatum[];
  priceSeries: PriceSeriesPoint[];
  priceCompanies: string[];
}

const TONO_EQUILIBRIO = {
  falta: "warn",
  sobra: "info",
  equilibrado: "success",
  sin_datos: "neutral",
} as const;

/** Toneladas por comprar frente a toneladas por vender (±20 % es parejo). */
function Equilibrio({
  estado,
  cobertura,
  compras,
  ventas,
}: {
  estado: EstadoEquilibrio;
  cobertura: number | null;
  compras: number;
  ventas: number;
}) {
  const t = useT();
  const f = useFormatos();
  const ton = (v: number) => `${f.numero(v, 0)} ${t.unidades.tm}`;
  const etiqueta = {
    falta: t.dashboard.faltaOferta,
    sobra: t.dashboard.sobraOferta,
    equilibrado: t.dashboard.equilibrado,
    sin_datos: t.dashboard.sinToneladas,
  }[estado];
  return (
    <div className="mb-4 rounded-[var(--radius-md)] border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-fg-subtle">
          {t.dashboard.equilibrio}
        </p>
        <Badge tone={TONO_EQUILIBRIO[estado]}>
          {etiqueta}
          {cobertura != null && (
            <span className="font-mono tnum"> · {f.numero(cobertura * 100, 0)} %</span>
          )}
        </Badge>
      </div>
      {estado !== "sin_datos" && (
        <>
          {/* La marca del medio es 1:1; la barra llega a 2:1. */}
          <div
            className="relative mt-2 h-2 overflow-hidden rounded-full bg-bg-subtle"
            role="img"
            aria-label={etiqueta}
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min((cobertura ?? 2) / 2, 1) * 100}%` }}
            />
            <div className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
          </div>
          <p className="mt-1.5 text-xs text-fg-muted">
            {t.dashboard.equilibrioDetalle
              .replace("{compras}", ton(compras))
              .replace("{ventas}", ton(ventas))}
          </p>
        </>
      )}
    </div>
  );
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
  const [vista, setVista] = React.useState<"mias" | "area">("mias");
  const tareas = vista === "mias" ? data.upcomingTasks.mias : data.upcomingTasks.area;
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
            {data.tasksDept ? (
              <div
                role="group"
                aria-label={t.dashboard.proximasTareas}
                className="inline-flex items-center rounded-[var(--radius-md)] border border-border bg-surface p-0.5"
              >
                {(["mias", "area"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={vista === v}
                    onClick={() => setVista(v)}
                    className={cn(
                      "rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      vista === v
                        ? "bg-accent text-accent-fg"
                        : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
                    )}
                  >
                    {v === "mias" ? t.dashboard.mias : data.tasksDept}
                  </button>
                ))}
              </div>
            ) : (
              <Badge tone="neutral">{t.dashboard.mias}</Badge>
            )}
          </CardHeader>
          <CardBody className="p-0">
            {tareas.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-fg-subtle">
                {t.dashboard.sinTareas}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {tareas.map((tarea) => (
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
            <CardTitle>{t.dashboard.embudoVentas}</CardTitle>
            <Badge tone="neutral">
              {kpis.totalLeads} {t.dashboard.leads}
            </Badge>
          </CardHeader>
          <CardBody>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(["Venta", "Compra"] as const).map((n) => {
                const lado = data.negocios[n];
                return (
                  <div
                    key={n}
                    className="rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-fg-subtle">
                      {n === "Venta" ? t.dashboard.potencialVentas : t.dashboard.potencialCompras}
                      {" · "}
                      {t.dashboard.valorPonderado}
                    </p>
                    <p className="mt-0.5 font-mono text-xl font-bold tnum text-fg">
                      {f.cop(lado.ponderado)}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {t.comun.de} <span className="font-mono tnum">{f.cop(lado.total)}</span>{" "}
                      {t.dashboard.dePotencial} ·{" "}
                      <span className="font-mono tnum">
                        {f.numero(lado.toneladas, 0)} {t.unidades.tm}
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
            <Equilibrio
              estado={data.equilibrio.estado}
              cobertura={data.equilibrio.cobertura}
              compras={data.negocios.Compra.toneladas}
              ventas={data.negocios.Venta.toneladas}
            />
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
