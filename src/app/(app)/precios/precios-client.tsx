"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { PriceChart, type PriceSeriesPoint } from "@/components/charts/price-chart";
import { formatNumber, formatDate, cn } from "@/lib/utils";
import type { PriceHistory } from "@/lib/types/database";
import { addPrices, deletePriceDate } from "./actions";

const PREFERRED_ORDER = [
  "CASA LUKER",
  "NAC. CHOCOLATE BTA",
  "NAC. CHOCOLATE IBAGUÉ",
];

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(
    new Date(iso),
  );
}

export function PreciosClient({
  prices,
  canWrite,
}: {
  prices: PriceHistory[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [vals, setVals] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const companies = React.useMemo(() => {
    const set = new Set(prices.map((p) => p.company));
    const ordered = PREFERRED_ORDER.filter((c) => set.has(c));
    const extra = [...set].filter((c) => !PREFERRED_ORDER.includes(c));
    const all = [...ordered, ...extra];
    return all.length ? all : PREFERRED_ORDER;
  }, [prices]);

  // Pivot by date.
  const byDate = React.useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const p of prices) {
      const row = map.get(p.date) ?? {};
      row[p.company] = p.price_cop_kg;
      map.set(p.date, row);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)); // desc
  }, [prices]);

  const series: PriceSeriesPoint[] = React.useMemo(() => {
    const asc = [...byDate].reverse().slice(-24);
    return asc.map(([d, row]) => ({ date: shortDate(d), ...row }));
  }, [byDate]);

  // Latest + delta per company.
  const latest = React.useMemo(() => {
    return companies.map((c) => {
      const points = prices
        .filter((p) => p.company === c)
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      const cur = points[0]?.price_cop_kg ?? null;
      const prev = points[1]?.price_cop_kg ?? null;
      const delta = cur != null && prev != null && prev !== 0 ? ((cur - prev) / prev) * 100 : null;
      return { company: c, cur, delta };
    });
  }, [companies, prices]);

  async function onSubmit() {
    setSaving(true);
    const entries = companies
      .map((c) => ({ company: c, price_cop_kg: Number(vals[c]) }))
      .filter((e) => Number.isFinite(e.price_cop_kg) && e.price_cop_kg > 0);
    const res = await addPrices({ date, entries });
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Precios registrados" });
    setOpen(false);
    setVals({});
    router.refresh();
  }

  async function onDeleteDate(d: string) {
    if (!confirm(`¿Eliminar los precios del ${formatDate(d)}?`)) return;
    for (const c of companies) await deletePriceDate(c, d);
    toast({ tone: "success", title: "Precios eliminados" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histórico de precios"
        description="Precios de referencia semanales por compañía (COP/kg)."
        actions={
          canWrite && (
            <Button
              size="sm"
              onClick={() => {
                setVals({});
                setDate(new Date().toISOString().slice(0, 10));
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Cargar precios
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {latest.map((l) => (
          <Card key={l.company}>
            <CardBody>
              <p className="text-xs font-medium text-fg-muted">{l.company}</p>
              <p className="mt-1 font-mono text-2xl font-bold text-fg tnum">
                {l.cur != null ? formatNumber(l.cur) : "—"}
                <span className="text-sm font-normal text-fg-subtle"> COP/kg</span>
              </p>
              {l.delta != null && (
                <span
                  className={cn(
                    "mt-1 inline-flex items-center gap-1 text-xs font-medium",
                    l.delta >= 0 ? "text-success" : "text-danger",
                  )}
                >
                  {l.delta >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  {Math.abs(l.delta).toFixed(1)}% vs. anterior
                </span>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tendencia</CardTitle>
        </CardHeader>
        <CardBody>
          {series.length > 0 ? (
            <PriceChart data={series} companies={companies} />
          ) : (
            <EmptyState title="Sin datos de precios" />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registros ({byDate.length} fechas)</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {byDate.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">Sin registros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                    <th className="px-4 py-3 text-left font-medium">Fecha</th>
                    {companies.map((c) => (
                      <th key={c} className="px-4 py-3 text-right font-medium">
                        {c}
                      </th>
                    ))}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {byDate.slice(0, 30).map(([d, row]) => (
                    <tr key={d} className="border-b border-border last:border-0 hover:bg-bg-subtle/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-fg-subtle">
                        {formatDate(d)}
                      </td>
                      {companies.map((c) => (
                        <td key={c} className="px-4 py-2.5 text-right font-mono tnum text-fg">
                          {row[c] != null ? formatNumber(row[c]) : "—"}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right">
                        {canWrite && (
                          <button
                            onClick={() => onDeleteDate(d)}
                            className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                            aria-label="Eliminar fecha"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cargar precios"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onSubmit} loading={saving}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {companies.map((c) => (
            <Field key={c} label={`${c} (COP/kg)`}>
              <Input
                type="number"
                step="any"
                value={vals[c] ?? ""}
                onChange={(e) => setVals((p) => ({ ...p, [c]: e.target.value }))}
                className="font-mono tnum"
              />
            </Field>
          ))}
        </div>
      </Modal>
    </div>
  );
}
