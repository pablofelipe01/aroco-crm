"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LEAD_STAGES,
  LEAD_STAGE_TONE,
  LEAD_STAGE_WEIGHT,
} from "@/lib/status";
import { useT, useFormatos } from "@/lib/i18n/provider";
import { leadDisplayValue, type Market } from "@/lib/calc/lead-value";
import type { ReferencePrices } from "@/lib/calc/lead-value";
import type { LeadWithOwner } from "./page";

const ACTIVE_STAGES = LEAD_STAGES.filter((s) => s !== "Descartado");

/**
 * Totaliza el pipeline por probabilidad de cierre: por cada etapa (10% … 100%),
 * cuántas toneladas y qué valor hay, y el valor ponderado (valor × probabilidad).
 */
export function PipelineSummary({
  leads,
  prices,
}: {
  leads: LeadWithOwner[];
  prices: ReferencePrices;
}) {
  const t = useT();
  const f = useFormatos();
  const ton = (v: number) => `${f.numero(v, 1)} ${t.unidades.tm}`;

  const rows = ACTIVE_STAGES.map((stage) => {
    const ls = leads.filter((l) => l.status === stage);
    const tons = ls.reduce((s, l) => s + (l.toneladas ?? 0), 0);
    const value = ls.reduce(
      (s, l) =>
        s + leadDisplayValue({ ...l, market: l.market as Market | null }, prices),
      0,
    );
    const weight = LEAD_STAGE_WEIGHT[stage] ?? 0;
    return {
      stage,
      prob: Math.round(weight * 100),
      count: ls.length,
      tons,
      value,
      weighted: value * weight,
    };
  });

  const total = rows.reduce(
    (a, r) => ({
      count: a.count + r.count,
      tons: a.tons + r.tons,
      value: a.value + r.value,
      weighted: a.weighted + r.weighted,
    }),
    { count: 0, tons: 0, value: 0, weighted: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.comercial.pipelineProbabilidad}</CardTitle>
        <span className="text-xs text-fg-subtle">
          {t.comercial.valorEsperado}{" "}
          <span className="font-mono tnum font-semibold text-fg">
            {f.cop(total.weighted)}
          </span>
        </span>
      </CardHeader>
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 text-left font-medium">
                  {t.comercial.etapa}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t.comercial.prob}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t.comercial.leads}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t.comercial.toneladas}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t.comercial.valor}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t.comercial.ponderado}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.stage} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <Badge tone={LEAD_STAGE_TONE[r.stage]} dot>
                      {t.etapas[r.stage]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tnum font-semibold text-accent-soft-fg">
                    {r.prob}%
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tnum text-fg-muted">
                    {r.count}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tnum text-fg">
                    {r.tons > 0 ? ton(r.tons) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tnum text-fg">
                    {r.value > 0 ? f.cop(r.value) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tnum text-fg">
                    {r.weighted > 0 ? f.cop(r.weighted) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong font-semibold">
                <td className="px-4 py-2.5 text-fg">{t.comun.total}</td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right font-mono tnum text-fg-muted">
                  {total.count}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tnum text-fg">
                  {total.tons > 0 ? ton(total.tons) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tnum text-fg">
                  {total.value > 0 ? f.cop(total.value) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tnum text-fg">
                  {total.weighted > 0 ? f.cop(total.weighted) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
