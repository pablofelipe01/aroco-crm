"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Boxes, Coins, Scale, AlertTriangle, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { staggerContainer } from "@/lib/motion";
import { formatNumber, formatCOP, formatDate } from "@/lib/utils";
import type { Posicion } from "@/lib/posicion";

export function MercadoClient({
  posicion: p,
  error,
}: {
  posicion: Posicion;
  error?: string | null;
}) {
  const t = p.totales;
  const enBodega = p.lotes.filter((l) => l.kg_disponible > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mercado"
        description="Posición física, costo y exposición"
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft p-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-danger">
              No se pudo cargar la posición
            </p>
            <p className="mt-1 font-mono text-xs text-fg-subtle">{error}</p>
          </div>
        </div>
      )}

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          label="En bodega"
          value={t.toneladas_disponibles}
          decimals={2}
          suffix=" t"
          icon={Boxes}
          hint={`${t.lotes_con_saldo} lotes con saldo de ${t.lotes}`}
        />
        <StatCard
          label="Valor a costo"
          value={Math.round(t.valor_inventario_cop / 1_000_000)}
          prefix="$ "
          suffix=" M"
          icon={Coins}
          hint="Kilos en bodega × precio de compra"
        />
        <StatCard
          label="Costo promedio"
          value={t.costo_promedio_cop_kg ?? 0}
          prefix="$ "
          suffix="/kg"
          icon={Scale}
          hint="Ponderado por kilos, no por lotes"
        />
        <StatCard
          label="Despachado"
          value={Math.round(t.kg_despachado / 1000)}
          suffix=" t"
          icon={TrendingUp}
          hint={`De ${formatNumber(t.kg_ingresado / 1000, 1)} t ingresadas`}
        />
      </motion.div>

      {/* Lo que todavía no está. Una pantalla de riesgo a medias que no lo diga
          se lee como si la exposición estuviera cubierta. */}
      <div className="rounded-[var(--radius-md)] border border-info/40 bg-info-soft p-4">
        <p className="text-sm font-medium text-info">Esto es solo la pata física</p>
        <p className="mt-1 text-sm text-fg-muted">
          Posiciones de broker, cobertura con opciones y futuros, márgenes y P&L
          contra el mercado siguen en CacaoQ. Se integran en las siguientes fases;
          hasta entonces, la cobertura de esta posición <strong>no</strong> se ve
          aquí.
        </p>
      </div>

      {t.kg_sin_precio > 0 && (
        <Card>
          <CardBody>
            <p className="text-xs text-fg-subtle">
              <span className="font-mono tnum text-fg-muted">
                {formatNumber(t.kg_sin_precio)} kg
              </span>{" "}
              en bodega no tienen precio de compra en la hoja. Quedan fuera del valor
              y del costo promedio: contarlos como cero bajaría el promedio e
              inventaría un margen que no existe.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lotes en bodega</CardTitle>
        </CardHeader>
        <CardBody>
          {enBodega.length === 0 ? (
            <EmptyState title="No hay cacao en bodega" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                    <th className="pb-2 pr-3 font-medium">Lote</th>
                    <th className="pb-2 pr-3 font-medium">Ingreso</th>
                    <th className="pb-2 pr-3 text-right font-medium">Disponible</th>
                    <th className="pb-2 pr-3 text-right font-medium">Costo/kg</th>
                    <th className="pb-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {enBodega.map((l) => (
                    <tr key={l.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">
                        <span className="text-fg">{l.code}</span>
                        {l.calidad && (
                          <Badge tone="neutral" className="ml-2">
                            {l.calidad}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono tnum text-xs text-fg-muted">
                        {l.fecha ? formatDate(l.fecha) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tnum text-fg">
                        {formatNumber(l.kg_disponible)} kg
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tnum text-fg-muted">
                        {l.precio_compra_cop_kg ? formatCOP(l.precio_compra_cop_kg) : "—"}
                      </td>
                      <td className="py-2 text-right font-mono tnum text-fg-muted">
                        {l.valor_cop ? formatCOP(l.valor_cop) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
