"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Target,
  Truck,
  Coins,
  AlertTriangle,
  Globe,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { staggerContainer } from "@/lib/motion";
import { useT, useFormatos } from "@/lib/i18n/provider";
import { VentasChart } from "@/components/charts/ventas-chart";
import type { Ventas } from "@/lib/ventas";


export function VentasClient({
  ventas: v,
  anio,
  anios,
  error,
  vacio,
}: {
  ventas: Ventas;
  anio: number;
  anios: number[];
  error?: string | null;
  vacio?: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const f = useFormatos();

  const ton = (kg: number) => `${f.numero(kg / 1000, 1)} t`;

  /** Millones y miles de millones: en pesos crudos la cifra deja de leerse. */
  const plata = (valor: number): string => {
    if (Math.abs(valor) >= 1_000_000_000)
      return `$ ${f.numero(valor / 1_000_000_000, 2)} ${t.ventas.milesDeMillones}`;
    if (Math.abs(valor) >= 1_000_000)
      return `$ ${f.numero(valor / 1_000_000, 1)} ${t.ventas.millones}`;
    return f.cop(valor);
  };

  const faltan = Math.max(0, v.meta - v.kgAnio);
  const alcanza = v.proyeccionUltimosMeses >= v.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.ventas.titulo}
        description={`${t.ventas.descripcion} · ${anio}`}
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

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft p-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-danger">
              {t.ventas.errorCarga}
            </p>
            <p className="mt-1 font-mono text-xs text-fg-subtle">{error}</p>
          </div>
        </div>
      )}

      {!error && vacio && (
        <div className="rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft p-4">
          <p className="text-sm font-medium text-warn">{t.ventas.tablaVacia}</p>
          <p className="mt-1 text-sm text-fg-muted">{t.ventas.tablaVaciaDetalle}</p>
        </div>
      )}

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          label={t.ventas.vendidoAnio}
          value={Number((v.kgAnio / 1000).toFixed(1))}
          suffix=" t"
          icon={Truck}
          hint={`${v.avancePct.toFixed(1)}% ${t.ventas.deLaMeta}`}
        />
        <StatCard
          label={t.ventas.facturado}
          // En millones: en pesos crudos son diez dígitos y deja de leerse.
          value={Math.round(v.valorAnio / 1_000_000)}
          prefix="$ "
          suffix=" M"
          icon={Coins}
          hint={
            v.precioPromedioKg > 0
              ? `${f.cop(v.precioPromedioKg)}/kg ${t.ventas.promedio}`
              : t.ventas.sinValores
          }
        />
        <StatCard
          label={t.ventas.faltaMeta}
          value={Number((faltan / 1000).toFixed(1))}
          suffix=" t"
          icon={Target}
          hint={`${t.ventas.meta} ${f.numero(v.meta / 1000)} t`}
        />
        <StatCard
          label={t.ventas.proyeccionCierre}
          value={Number((v.proyeccionUltimosMeses / 1000).toFixed(1))}
          suffix=" t"
          icon={TrendingUp}
          hint={`${t.ventas.alRitmoDe} ${v.mesesUsadosEnProyeccion} ${t.ventas.meses}`}
        />
      </motion.div>

      <Card>
        <CardBody>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-fg-muted">
              {t.ventas.avance}{" "}
              <span className="font-mono tnum font-semibold text-fg">
                {ton(v.kgAnio)}
              </span>{" "}
              {t.comun.de} {ton(v.meta)}
            </p>
            <Badge tone={alcanza ? "success" : "warn"}>
              {alcanza ? t.ventas.alcanzaMeta : t.ventas.quedaCorta}
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
                {t.ventas.proyRitmoAnual}
              </dt>
              <dd className="mt-0.5 font-mono tnum text-fg">
                {ton(v.proyeccionRitmoAnual)}
              </dd>
              <p className="mt-1 text-xs text-fg-subtle">
                {t.ventas.proyRitmoAnualNota}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-border p-3">
              <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">
                {t.ventas.proyMesesRecientes}
              </dt>
              <dd className="mt-0.5 font-mono tnum text-fg">
                {ton(v.proyeccionUltimosMeses)}
              </dd>
              <p className="mt-1 text-xs text-fg-subtle">
                {t.ventas.proyMesesRecientesNota1} {v.mesesUsadosEnProyeccion}{" "}
                {t.ventas.proyMesesRecientesNota2}
              </p>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.ventas.porMesTitulo}</CardTitle>
        </CardHeader>
        <CardBody>
          {v.kgAnio > 0 ? (
            <VentasChart meses={v.meses} metaKg={v.meta} />
          ) : (
            <EmptyState title={`${t.ventas.sinVentasEn} ${anio}`} />
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.ventas.porCliente}</CardTitle>
          </CardHeader>
          <CardBody>
            {v.porCliente.length === 0 ? (
              <EmptyState title={t.ventas.sinVentas} />
            ) : (
              <ul className="space-y-2">
                {v.porCliente.map((c) => {
                  const pct = v.kgAnio > 0 ? (c.kg / v.kgAnio) * 100 : 0;
                  return (
                    <li key={c.cliente}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-fg">{c.cliente}</span>
                        <span className="shrink-0 font-mono tnum text-fg-muted">
                          {ton(c.kg)} · {plata(c.valor)}
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
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Globe className="h-4 w-4 text-fg-subtle" />
                {t.ventas.nacionalVsExport}
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {v.porMercado.length === 0 ? (
              <EmptyState title={t.ventas.sinMercado} />
            ) : (
              <ul className="space-y-2">
                {v.porMercado.map((m) => {
                  const pct = v.kgAnio > 0 ? (m.kg / v.kgAnio) * 100 : 0;
                  return (
                    <li key={m.mercado}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-fg">{m.mercado}</span>
                        <span className="shrink-0 font-mono tnum text-fg-muted">
                          {ton(m.kg)} · {pct.toFixed(1)}% · {plata(m.valor)}
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

            {v.bonificacionAnio > 0 && (
              <p className="mt-4 border-t border-border pt-3 text-xs text-fg-subtle">
                {t.ventas.bonifPrefijo}{" "}
                <span className="font-mono tnum text-fg-muted">
                  {plata(v.bonificacionAnio)}
                </span>{" "}
                {t.ventas.bonifSufijo}
                {((v.bonificacionAnio / v.valorAnio) * 100).toFixed(1)}%{" "}
                {t.ventas.bonifDelTotal}
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Lo que no cuadra, dicho. Callarlo haría que el precio promedio
          pareciera bajo sin explicación. */}
      {v.kgSinValor > 0 && (
        <Card>
          <CardBody>
            <p className="text-xs text-fg-subtle">
              {v.operacionesSinValor}{" "}
              {v.operacionesSinValor === 1
                ? t.ventas.sinValorUno
                : t.ventas.sinValorVarios}{" "}
              <span className="font-mono tnum text-fg-muted">{f.kg(v.kgSinValor)}</span>{" "}
              {t.ventas.sinValorNota}
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
