"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { TrendingUp, Target, Truck, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { staggerContainer } from "@/lib/motion";
import { formatNumber } from "@/lib/utils";
import { VentasChart } from "@/components/charts/ventas-chart";
import type { Ventas } from "@/lib/ventas";

const t = (kg: number) => `${formatNumber(kg / 1000, 1)} t`;

export function VentasClient({
  ventas: v,
  anio,
  anios,
}: {
  ventas: Ventas;
  anio: number;
  anios: number[];
}) {
  const router = useRouter();

  const faltan = Math.max(0, v.meta - v.kgAnio);
  const alcanza = v.proyeccionUltimosMeses >= v.meta;
  const topCliente = v.porCliente[0];
  const concentracion = topCliente && v.kgAnio > 0 ? (topCliente.kg / v.kgAnio) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventas"
        description={`Volumen despachado y avance contra la meta anual · ${anio}`}
        actions={
          <Select
            value={String(anio)}
            onChange={(e) => router.push(`/ventas?anio=${e.target.value}`)}
            className="w-auto"
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        }
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          label="Vendido en el año"
          value={Number((v.kgAnio / 1000).toFixed(1))}
          suffix=" t"
          icon={Truck}
          hint={`${v.avancePct.toFixed(1)}% de la meta`}
        />
        <StatCard
          label="Falta para la meta"
          value={Number((faltan / 1000).toFixed(1))}
          suffix=" t"
          icon={Target}
          hint={`Meta ${formatNumber(v.meta / 1000)} t`}
        />
        <StatCard
          label="Proyección de cierre"
          value={Number((v.proyeccionUltimosMeses / 1000).toFixed(1))}
          suffix=" t"
          icon={TrendingUp}
          hint={`Al ritmo de los últimos ${v.mesesUsadosEnProyeccion} meses`}
        />
        <StatCard
          label="Clientes"
          value={v.porCliente.length}
          icon={Users}
          hint={
            topCliente ? `${topCliente.cliente} concentra ${concentracion.toFixed(0)}%` : "—"
          }
        />
      </motion.div>

      {/* Avance contra la meta */}
      <Card>
        <CardBody>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-fg-muted">
              Avance <span className="font-mono tnum font-semibold text-fg">{t(v.kgAnio)}</span>{" "}
              de {t(v.meta)}
            </p>
            <Badge tone={alcanza ? "success" : "warn"}>
              {alcanza ? "La proyección alcanza la meta" : "La proyección queda corta"}
            </Badge>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${Math.min(100, v.avancePct)}%` }}
            />
          </div>

          {/* Dos métodos, porque dan resultados distintos y la diferencia
              importa: el ritmo del año arrastra el arranque flojo. */}
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-[var(--radius-md)] border border-border p-3">
              <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">
                Proyección por ritmo del año
              </dt>
              <dd className="mt-0.5 font-mono tnum text-fg">
                {t(v.proyeccionRitmoAnual)}
              </dd>
              <p className="mt-1 text-xs text-fg-subtle">
                Lo vendido dividido por los días transcurridos. Castiga si el año
                arrancó flojo.
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-border p-3">
              <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">
                Proyección por meses recientes
              </dt>
              <dd className="mt-0.5 font-mono tnum text-fg">
                {t(v.proyeccionUltimosMeses)}
              </dd>
              <p className="mt-1 text-xs text-fg-subtle">
                Promedio de los últimos {v.mesesUsadosEnProyeccion} meses con
                despachos, proyectado a fin de año.
              </p>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Despachado por mes y acumulado</CardTitle>
        </CardHeader>
        <CardBody>
          {v.kgAnio > 0 ? (
            <VentasChart meses={v.meses} metaKg={v.meta} />
          ) : (
            <EmptyState title={`Sin despachos en ${anio}`} />
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por cliente</CardTitle>
          </CardHeader>
          <CardBody>
            {v.porCliente.length === 0 ? (
              <EmptyState title="Sin ventas" />
            ) : (
              <ul className="space-y-2">
                {v.porCliente.slice(0, 10).map((c) => {
                  const pct = v.kgAnio > 0 ? (c.kg / v.kgAnio) * 100 : 0;
                  return (
                    <li key={c.cliente}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-fg">{c.cliente}</span>
                        <span className="shrink-0 font-mono tnum text-fg-muted">
                          {t(c.kg)} · {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-muted">
                        <div
                          className="h-full rounded-full bg-accent/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por clasificación</CardTitle>
          </CardHeader>
          <CardBody>
            {v.kgAnio === 0 ? (
              <EmptyState title="Sin datos de clasificación" />
            ) : (
              <ul className="space-y-2">
                {v.porClasificacion.map((c) => {
                  // Sobre el total del año, no sobre la suma de los grados: si
                  // quedan kilos sin clasificar los porcentajes tienen que
                  // sumar menos de 100, no repartirse el hueco.
                  const pct = v.kgAnio > 0 ? (c.kg / v.kgAnio) * 100 : 0;
                  return (
                    <li key={c.tipo} className={c.kg === 0 ? "opacity-50" : undefined}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-fg">{c.tipo}</span>
                        <span className="shrink-0 font-mono tnum text-fg-muted">
                          {t(c.kg)} · {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-muted">
                        <div
                          className="h-full rounded-full bg-accent/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Lo que queda fuera de la cifra. Callarlo haría que los totales no
          cuadren con el módulo de Despachos y nadie sabría por qué. */}
      {(v.kgNoVenta > 0 || v.kgSinFecha > 0) && (
        <Card>
          <CardBody>
            <p className="text-xs text-fg-subtle">
              No se cuentan como venta:{" "}
              {v.kgNoVenta > 0 && (
                <>
                  <span className="font-mono tnum text-fg-muted">
                    {formatNumber(v.kgNoVenta)} kg
                  </span>{" "}
                  de muestras, merma y selección
                </>
              )}
              {v.kgNoVenta > 0 && v.kgSinFecha > 0 && " · "}
              {v.kgSinFecha > 0 && (
                <>
                  <span className="font-mono tnum text-fg-muted">
                    {formatNumber(v.kgSinFecha)} kg
                  </span>{" "}
                  de despachos sin fecha en la hoja, que no caben en ningún mes
                </>
              )}
              . Histórico completo: {t(v.kgHistorico)}.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
