"use client";

import { motion } from "framer-motion";
import { Users, Boxes, Truck, FileText, Sparkles } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
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
  pipeline: PipelineDatum[];
  inventory: InventoryDatum[];
  priceSeries: PriceSeriesPoint[];
  priceCompanies: string[];
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
          <CardTitle>Histórico de precios de referencia (COP/kg)</CardTitle>
          <Badge tone="neutral">{data.priceCompanies.length} compañías</Badge>
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
