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
import { TASK_STATUS_META, type TaskStatus } from "@/lib/status";
import { formatNumber, formatDate, cn } from "@/lib/utils";
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
  tasksScopeLabel: string;
  pipeline: PipelineDatum[];
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
  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hola, ${data.name.split(" ")[0] || "equipo"}`}
        description="Resumen general de la operación comercial de AROCO."
        actions={
          <Badge tone="accent">
            <Sparkles className="h-3 w-3" />
            En vivo
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
          label="Leads en pipeline"
          value={kpis.totalLeads}
          icon={Users}
          hint={`${kpis.activeLeads} activos`}
        />
        <StatCard
          label="Disponible en bodega"
          value={kpis.kgAvailable}
          suffix=" kg"
          icon={Boxes}
          hint={`${kpis.lotsCount} lotes`}
        />
        <StatCard
          label="Despachos registrados"
          value={kpis.dispatchCount}
          icon={Truck}
          hint={`${Math.round(kpis.dispatchedKg).toLocaleString("es-CO")} kg`}
        />
        <StatCard
          label="Kg despachados"
          value={kpis.dispatchedKg}
          suffix=" kg"
          icon={FileText}
        />
      </motion.div>

      {/* Market references + upcoming tasks */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Referencias de mercado</CardTitle>
            <DollarSign className="h-4 w-4 text-fg-subtle" />
          </CardHeader>
          <CardBody className="space-y-2.5">
            <RefRow
              icon={<DollarSign className="h-4 w-4" />}
              label="TRM oficial"
              value={data.refs.trm != null ? `$${formatNumber(data.refs.trm, 2)}` : "—"}
              hint={data.refs.trmDate ? `Banrep · ${formatDate(data.refs.trmDate)}` : "Banrep"}
            />
            <RefRow
              icon={<DollarSign className="h-4 w-4" />}
              label="USD/COP spot"
              value={data.refs.spot != null ? `$${formatNumber(data.refs.spot, 2)}` : "—"}
              hint={
                data.refs.spot != null && data.refs.trm != null
                  ? `${data.refs.spot >= data.refs.trm ? "+" : ""}${formatNumber(
                      data.refs.spot - data.refs.trm,
                      0,
                    )} vs TRM`
                  : "Yahoo"
              }
            />
            <RefRow
              icon={<Coins className="h-4 w-4" />}
              label="Cacao ICE"
              value={data.refs.cocoaUsdT != null ? `$${formatNumber(data.refs.cocoaUsdT)}` : "—"}
              hint={data.refs.cocoaContract ? `${data.refs.cocoaContract} · USD/T` : "USD/T"}
            />
            <div className="border-t border-border pt-2.5">
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-fg-subtle">
                Cacao nacional (COP/kg)
              </p>
              {data.refs.cacao.length === 0 ? (
                <p className="text-sm text-fg-subtle">Sin precios cargados.</p>
              ) : (
                data.refs.cacao.map((c) => (
                  <div key={c.company} className="flex items-center justify-between py-0.5 text-sm">
                    <span className="truncate text-fg-muted">{shortCompany(c.company)}</span>
                    <span className="font-mono tnum text-fg">
                      {c.price != null ? formatNumber(c.price) : "—"}
                    </span>
                  </div>
                ))
              )}
            </div>
            <p className="text-[11px] text-fg-subtle">
              TRM: Banco de la República · Spot y Cacao ICE: Yahoo Finance.
            </p>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-accent" />
              Próximas tareas
            </CardTitle>
            <Badge tone="neutral">{data.tasksScopeLabel}</Badge>
          </CardHeader>
          <CardBody className="p-0">
            {data.upcomingTasks.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-fg-subtle">
                No hay tareas pendientes. 🎉
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.upcomingTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Badge tone={TASK_STATUS_META[t.status as TaskStatus]?.tone ?? "neutral"} dot>
                      {TASK_STATUS_META[t.status as TaskStatus]?.label ?? t.status}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{t.name}</p>
                      {t.person_name && (
                        <p className="truncate text-xs text-fg-muted">{t.person_name}</p>
                      )}
                    </div>
                    {t.due_date && (
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 font-mono text-xs",
                          t.overdue ? "font-medium text-danger" : "text-fg-subtle",
                        )}
                      >
                        <Calendar className="h-3 w-3" />
                        {formatDate(t.due_date)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-border px-5 py-2.5 text-right">
              <Link href="/tareas" className="text-xs text-accent hover:underline">
                Ver todas las tareas →
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Embudo del pipeline</CardTitle>
            <Badge tone="neutral">{kpis.totalLeads} leads</Badge>
          </CardHeader>
          <CardBody>
            {data.pipeline.some((p) => p.count > 0) ? (
              <PipelineChart data={data.pipeline} />
            ) : (
              <EmptyState title="Sin leads aún" />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inventario por procedencia</CardTitle>
          </CardHeader>
          <CardBody>
            {data.inventory.length > 0 ? (
              <InventoryChart data={data.inventory} />
            ) : (
              <EmptyState title="Sin inventario" />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tendencia · nacional vs internacional</CardTitle>
          <Badge tone="neutral">
            {data.priceCompanies.filter((c) => !c.toUpperCase().includes("INTERNACIONAL")).length}{" "}
            compañías
          </Badge>
        </CardHeader>
        <CardBody>
          {data.priceSeries.length > 0 ? (
            <PriceChart data={data.priceSeries} companies={data.priceCompanies} />
          ) : (
            <EmptyState title="Sin histórico de precios" />
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
