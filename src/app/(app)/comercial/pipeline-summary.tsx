"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LEAD_STAGES,
  LEAD_STAGE_TONE,
  LEAD_STAGE_WEIGHT,
} from "@/lib/status";
import { formatCOP } from "@/lib/utils";
import type { LeadWithOwner } from "./page";

const ACTIVE_STAGES = LEAD_STAGES.filter((s) => s !== "Descartado");

const fmtTon = (t: number) => `${t.toLocaleString("es-CO", { maximumFractionDigits: 1 })} TM`;

/**
 * Totaliza el pipeline por probabilidad de cierre: por cada etapa (10% … 100%),
 * cuántas toneladas y qué valor hay, y el valor ponderado (valor × probabilidad).
 */
export function PipelineSummary({ leads }: { leads: LeadWithOwner[] }) {
  const rows = ACTIVE_STAGES.map((stage) => {
    const ls = leads.filter((l) => l.status === stage);
    const tons = ls.reduce((s, l) => s + (l.toneladas ?? 0), 0);
    const value = ls.reduce((s, l) => s + (l.potential_value_cop ?? 0), 0);
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
        <CardTitle>Pipeline por probabilidad</CardTitle>
        <span className="text-xs text-fg-subtle">
          Valor esperado:{" "}
          <span className="font-mono tnum font-semibold text-fg">
            {formatCOP(total.weighted)}
          </span>
        </span>
      </CardHeader>
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 text-left font-medium">Etapa</th>
                <th className="px-4 py-3 text-right font-medium">Prob.</th>
                <th className="px-4 py-3 text-right font-medium">Leads</th>
                <th className="px-4 py-3 text-right font-medium">Toneladas</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                <th className="px-4 py-3 text-right font-medium">Ponderado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.stage} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <Badge tone={LEAD_STAGE_TONE[r.stage]} dot>
                      {r.stage}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tnum font-semibold text-accent-soft-fg">
                    {r.prob}%
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tnum text-fg-muted">
                    {r.count}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tnum text-fg">
                    {r.tons > 0 ? fmtTon(r.tons) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tnum text-fg">
                    {r.value > 0 ? formatCOP(r.value) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tnum text-fg">
                    {r.weighted > 0 ? formatCOP(r.weighted) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong font-semibold">
                <td className="px-4 py-2.5 text-fg">Total</td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right font-mono tnum text-fg-muted">
                  {total.count}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tnum text-fg">
                  {total.tons > 0 ? fmtTon(total.tons) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tnum text-fg">
                  {total.value > 0 ? formatCOP(total.value) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tnum text-fg">
                  {total.weighted > 0 ? formatCOP(total.weighted) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
