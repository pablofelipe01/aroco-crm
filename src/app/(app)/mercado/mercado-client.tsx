"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Boxes, Coins, ShieldAlert, TrendingUp, AlertTriangle, Landmark,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { staggerContainer } from "@/lib/motion";
import { formatNumber, formatCOP, formatDate } from "@/lib/utils";
import type { DatosMercado } from "./riesgo-data";

const usd = (n: number | null) =>
  n === null ? "—" : `US$ ${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;

/** Millones de pesos: en pesos crudos la cifra deja de leerse. */
const cop = (n: number | null) =>
  n === null ? "—" : Math.abs(n) >= 1_000_000 ? `$ ${formatNumber(n / 1_000_000, 1)} M` : formatCOP(n);

export function MercadoClient({ datos: d }: { datos: DatosMercado }) {
  const r = d.riesgo;
  const descubierto = r.toneladasFisicas > 0 && r.coberturaPct < 100;

  return (
    <div className="space-y-6">
      <PageHeader title="Mercado" description="Posición física, cobertura y exposición al precio" />

      {d.error && (
        <div role="alert" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-danger">No se pudo cargar la posición</p>
            <p className="mt-1 font-mono text-xs text-fg-subtle">{d.error}</p>
          </div>
        </div>
      )}

      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="En bodega" value={r.toneladasFisicas} decimals={2} suffix=" t" icon={Boxes}
          hint={`${d.totales.lotes_con_saldo} lotes · costo ${formatCOP(d.totales.costo_promedio_cop_kg ?? 0)}/kg`} />
        <StatCard label="Descubierto" value={r.toneladasDescubiertas} decimals={2} suffix=" t" icon={ShieldAlert}
          hint={r.coberturaPct === 0 ? "Sin ninguna cobertura" : `${r.coberturaPct.toFixed(1)}% cubierto`} />
        <StatCard label="Cacao hoy" value={r.precioMercadoCopKg ?? 0} prefix="$ " suffix="/kg" icon={TrendingUp}
          hint={d.mercado.precioUsdT ? `${usd(d.mercado.precioUsdT)}/t · ${d.mercado.contrato}` : "Sin precio"} />
        <StatCard label="Valorización" value={Math.round((r.pnlFisicoCop ?? 0) / 1_000_000)} prefix="$ " suffix=" M" icon={Coins}
          hint="Contra el costo de compra" />
      </motion.div>

      {/* La exposición es el número que importa. Si está descubierta, tiene que
          verse como una advertencia, no como una fila más de una tabla. */}
      {descubierto && (
        <div className="rounded-[var(--radius-md)] border border-warn/50 bg-warn-soft p-4">
          <p className="text-sm font-medium text-warn">
            {r.coberturaPct === 0
              ? `Las ${formatNumber(r.toneladasFisicas, 2)} toneladas en bodega están expuestas al precio`
              : `${formatNumber(r.toneladasDescubiertas, 2)} de ${formatNumber(r.toneladasFisicas, 2)} toneladas sin cobertura`}
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            No hay puts comprados ni futuros vendidos que protejan de una caída.
            {r.pnlFisicoCop !== null && r.pnlFisicoCop > 0 && (
              <> Hoy el inventario vale <strong>{cop(r.pnlFisicoCop)}</strong> más de lo que costó; esa diferencia es lo que está en juego.</>
            )}
          </p>
        </div>
      )}

      {r.faltantes.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-info/40 bg-info-soft p-4">
          <p className="text-sm text-info">
            El cálculo está incompleto: falta {r.faltantes.join(", ")}. Las cifras que
            dependen de eso salen en blanco en vez de en cero.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Cobertura</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <div className="h-3 w-full overflow-hidden rounded-full bg-bg-muted">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, r.coberturaPct)}%` }} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Dato k="Puts comprados" v={`${r.contratos.putsLargos} contratos`} />
              <Dato k="Calls vendidos" v={`${r.contratos.callsCortos} contratos`} />
              <Dato k="Futuros vendidos" v={`${r.contratos.futurosCortos} contratos`} />
              <Dato k="Futuros comprados" v={`${r.contratos.futurosLargos} contratos`} />
            </dl>
            {r.collar ? (
              <p className="rounded-[var(--radius-md)] border border-border p-3 text-sm text-fg-muted">
                Collar armado entre <span className="font-mono tnum text-fg">{usd(r.collar.piso)}</span> y{" "}
                <span className="font-mono tnum text-fg">{usd(r.collar.techo)}</span> por tonelada.
              </p>
            ) : (
              <p className="text-xs text-fg-subtle">
                No hay collar: haría falta un put comprado y un call vendido a la vez.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Landmark className="h-4 w-4 text-fg-subtle" /> Cuenta del broker
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {!d.broker ? (
              <EmptyState title="Sin estados de cuenta cargados" />
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Dato k="Cuenta" v={d.broker.cuenta ?? "—"} />
                <Dato k="Equity" v={usd(d.broker.equity)} />
                <Dato k="Margen inicial" v={usd(d.broker.margenInicial)} />
                <Dato k={`P&L realizado (${d.broker.moneda})`} v={usd(d.broker.pnlYtd)} tono={(d.broker.pnlYtd ?? 0) < 0 ? "danger" : undefined} />
              </dl>
            )}
          </CardBody>
        </Card>
      </div>

      {d.escenarios.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Si el precio se mueve</CardTitle></CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                    <th className="pb-2 pr-3 font-medium">Escenario</th>
                    <th className="pb-2 pr-3 text-right font-medium">Cacao COP/kg</th>
                    <th className="pb-2 text-right font-medium">Valorización del inventario</th>
                  </tr>
                </thead>
                <tbody>
                  {d.escenarios.map((e) => (
                    <tr key={e.variacion} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 text-fg">
                        {e.variacion === 0 ? "Precio de hoy" : `${e.variacion > 0 ? "+" : ""}${(e.variacion * 100).toFixed(0)}%`}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tnum text-fg-muted">{formatCOP(e.precioCopKg)}</td>
                      <td className={"py-2 text-right font-mono tnum " + (e.pnlCop < 0 ? "text-danger" : "text-fg")}>{cop(e.pnlCop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-fg-subtle">
              Solo la pata física. El efecto de la cobertura depende de strikes y
              primas, y Barchart no entrega las griegas: calcularlo sin ellas daría
              una cifra que parece precisa y no lo es.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Lotes en bodega</CardTitle></CardHeader>
        <CardBody>
          {d.lotes.length === 0 ? (
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
                  {d.lotes.map((l) => (
                    <tr key={l.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">
                        <span className="text-fg">{l.code}</span>
                        {l.calidad && <Badge tone="neutral" className="ml-2">{l.calidad}</Badge>}
                      </td>
                      <td className="py-2 pr-3 font-mono tnum text-xs text-fg-muted">{l.fecha ? formatDate(l.fecha) : "—"}</td>
                      <td className="py-2 pr-3 text-right font-mono tnum text-fg">{formatNumber(l.kg_disponible)} kg</td>
                      <td className="py-2 pr-3 text-right font-mono tnum text-fg-muted">{l.precio_compra_cop_kg ? formatCOP(l.precio_compra_cop_kg) : "—"}</td>
                      <td className="py-2 text-right font-mono tnum text-fg-muted">{l.valor_cop ? formatCOP(l.valor_cop) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* De cuándo es cada cifra. Sin esto, un dato de hace tres días se ve
          idéntico a uno de hoy. */}
      <p className="text-xs text-fg-subtle">
        Inventario al día · cacao {d.mercado.fecha ? formatDate(d.mercado.fecha) : "sin dato"}
        {d.mercado.contrato ? ` (${d.mercado.contrato}, deducido por paridad put-call)` : ""} ·
        TRM {d.trm.fecha ? `${formatDate(d.trm.fecha)} $ ${formatNumber(d.trm.valor ?? 0, 2)}` : "sin dato"} ·
        broker {d.broker?.fecha ? formatDate(d.broker.fecha) : "sin estado"}
      </p>
    </div>
  );
}

function Dato({ k, v, tono }: { k: string; v: string; tono?: "danger" }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{k}</dt>
      <dd className={"mt-0.5 font-mono tnum " + (tono === "danger" ? "text-danger" : "text-fg")}>{v}</dd>
    </div>
  );
}
