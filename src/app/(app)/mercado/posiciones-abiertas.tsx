"use client";

import * as React from "react";
import { AlertTriangle, Briefcase, CalendarClock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatNumber, cn } from "@/lib/utils";
import type { DatosMercado } from "./riesgo-data";

/**
 * Los contratos abiertos en el bróker, uno por uno.
 *
 * Antes la pantalla solo tenía un contador —«futuros comprados: 1»— que no
 * responde nada de lo que uno se pregunta mirando una posición: a cómo entré,
 * cuánto llevo, cuándo vence, desde qué precio vuelvo a cero.
 *
 * Es del EXTRACTO, o sea del cierre del día. Lo que se abrió o cerró después
 * vive en «Movimientos del día», que es la tarjeta de al lado: mezclarlos aquí
 * daría filas a medias, porque un apunte a mano no trae precio de apertura ni
 * vencimiento.
 */

const USD = (v: number | null, decimales = 0) =>
  v === null ? "—" : `${v < 0 ? "−" : ""}$ ${formatNumber(Math.abs(v), decimales)}`;

/** Días que faltan para el último día de negociación. */
function diasPara(vence: string | null): number | null {
  if (!vence) return null;
  const hoy = new Date();
  const fin = new Date(`${vence}T00:00:00Z`);
  if (Number.isNaN(fin.getTime())) return null;
  return Math.ceil((fin.getTime() - Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())) / 86_400_000);
}

export function PosicionesAbiertas({
  contratos,
  fechaExtracto,
}: {
  contratos: DatosMercado["contratos"];
  fechaExtracto: string | null;
}) {
  // La lección del primer collar: las opciones se volvieron futuros porque
  // nadie miró la fecha. Treinta días es el margen para poder rodar la
  // posición sin prisa.
  const porVencer = contratos.filter((c) => {
    const d = diasPara(c.vence);
    return d !== null && d <= 30;
  });
  const sinLado = contratos.filter((c) => c.lado === null);
  const flotanteTotal = contratos.reduce((s, c) => s + (c.flotante ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-fg-subtle" /> Contratos abiertos
            {contratos.length > 0 && (
              <span className="font-mono text-xs text-fg-subtle tnum">
                {contratos.length}
              </span>
            )}
          </span>
        </CardTitle>
        {fechaExtracto && (
          <span className="font-mono text-[11px] text-fg-subtle">
            extracto del {formatDate(fechaExtracto)}
          </span>
        )}
      </CardHeader>

      <CardBody className="space-y-4">
        {contratos.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="h-6 w-6" />}
            title="Sin contratos abiertos"
            description={
              fechaExtracto
                ? `El extracto del ${formatDate(fechaExtracto)} no declara ninguna posición abierta.`
                : "Todavía no hay ningún extracto del bróker."
            }
          />
        ) : (
          <>
            {porVencer.length > 0 && (
              <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft/40 p-3">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <p className="text-xs text-fg-muted">
                  {porVencer.length === 1 ? "Un contrato vence" : `${porVencer.length} contratos vencen`}{" "}
                  en menos de 30 días
                  {porVencer.map((c) => ` · ${c.contrato} el ${formatDate(c.vence)}`).join("")}.
                  Una opción que llega al vencimiento sin rodarse se convierte
                  en futuro.
                </p>
              </div>
            )}

            {sinLado.length > 0 && (
              <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft/40 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <p className="text-xs text-fg-muted">
                  El extracto trae {sinLado.length}{" "}
                  {sinLado.length === 1 ? "contrato" : "contratos"} sin decir de
                  qué lado está. No se cuentan en la cobertura — inventarle un
                  lado convertiría una protección en una exposición. Hay que
                  mirarlo en el bróker.
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                    <th className="pb-2 pr-3 font-medium">Contrato</th>
                    <th className="pb-2 pr-3 font-medium">Lado</th>
                    <th className="pb-2 pr-3 text-right font-medium">Cant.</th>
                    <th className="pb-2 pr-3 text-right font-medium">Abrió</th>
                    <th className="pb-2 pr-3 text-right font-medium">Cierre</th>
                    <th className="pb-2 pr-3 text-right font-medium">Flotante</th>
                    <th className="pb-2 font-medium">Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {contratos.map((c, i) => {
                    const dias = diasPara(c.vence);
                    const comprado = c.lado === "comprado";
                    return (
                      <tr
                        key={`${c.contrato}-${c.instrumento}-${c.strike ?? ""}-${i}`}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="py-2 pr-3 text-fg">
                          {c.instrumento} {c.contrato}
                          {c.strike !== null && ` ${formatNumber(c.strike, 0)}`}
                          <span className="block text-[11px] text-fg-subtle">
                            {formatNumber(c.toneladas, 0)} t
                            {c.fecha ? ` · desde ${formatDate(c.fecha)}` : ""}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {c.lado === null ? (
                            <Badge tone="danger">sin lado</Badge>
                          ) : (
                            <Badge tone={comprado ? "info" : "success"}>
                              {c.lado}
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono tnum">
                          {c.cantidad}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono tnum text-fg-muted">
                          {c.apertura === null ? "—" : formatNumber(c.apertura, 0)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono tnum text-fg">
                          {c.cierre === null ? "—" : formatNumber(c.cierre, 0)}
                          {/* Cuánto le falta al contrato para volver al precio
                              de entrada. Es la pregunta que se hace cualquiera
                              mirando una posición en pérdida. */}
                          {c.paraEmpatar !== null && c.paraEmpatar !== 0 && (
                            <span className="block text-[11px] text-fg-subtle">
                              {comprado ? "+" : "−"}
                              {formatNumber(Math.abs(c.paraEmpatar), 0)} para
                              empatar
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            "py-2 pr-3 text-right font-mono tnum font-medium",
                            (c.flotante ?? 0) < 0 ? "text-danger" : "text-success",
                          )}
                        >
                          {USD(c.flotante)}
                        </td>
                        <td className="py-2 text-xs">
                          {c.vence ? (
                            <>
                              <span className="font-mono tnum text-fg-muted">
                                {formatDate(c.vence)}
                              </span>
                              {dias !== null && (
                                <span
                                  className={cn(
                                    "block",
                                    dias <= 30 ? "text-warn" : "text-fg-subtle",
                                  )}
                                >
                                  {dias} días
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3 text-sm">
              <span className="text-fg-muted">Flotante total</span>
              <span
                className={cn(
                  "font-mono tnum font-semibold",
                  flotanteTotal < 0 ? "text-danger" : "text-success",
                )}
              >
                {USD(flotanteTotal)}
              </span>
            </div>

            <p className="text-xs text-fg-subtle">
              Es la foto del cierre. Lo que se abrió o cerró después del
              extracto se anota en «Movimientos del día».
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
