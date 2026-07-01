"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Globe,
  Sparkles,
  Loader2,
} from "lucide-react";
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
  "CASA LUKER (Alto Cadmio)",
  "Nacional de Chocolates",
];

const INTL = "Internacional (ICE)";

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(
    new Date(iso),
  );
}

export function PreciosClient({
  prices,
  international,
  canWrite,
}: {
  prices: PriceHistory[];
  international: Record<string, number>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [vals, setVals] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [analysis, setAnalysis] = React.useState<string | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);

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
    return asc.map(([d, row]) => {
      const intl = international[d];
      return { date: shortDate(d), ...row, ...(intl != null ? { [INTL]: intl } : {}) };
    });
  }, [byDate, international]);

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

  const hasIntl = Object.keys(international).length > 0;
  const chartCompanies = hasIntl ? [...companies, INTL] : companies;

  // Latest international (COP/kg) and gap vs the national average.
  const gap = React.useMemo(() => {
    const sortedDates = [...new Set(prices.map((p) => p.date))].sort((a, b) =>
      a < b ? 1 : -1,
    );
    const latestDate = sortedDates[0];
    if (!latestDate) return null;
    const intl = international[latestDate];
    const nat = prices.filter((p) => p.date === latestDate).map((p) => p.price_cop_kg);
    if (intl == null || nat.length === 0) return null;
    const natAvg = nat.reduce((s, v) => s + v, 0) / nat.length;
    return {
      intl,
      natAvg,
      diff: intl - natAvg,
      pct: natAvg !== 0 ? ((intl - natAvg) / natAvg) * 100 : 0,
    };
  }, [prices, international]);

  async function onAnalyze() {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch("/api/precios/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latest: latest.map((l) => ({ company: l.company, price: l.cur })),
          internationalCopKg: gap?.intl ?? null,
          gapPct: gap?.pct ?? null,
          series: series.slice(-12),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ tone: "error", title: "No se pudo analizar", description: data.error });
        return;
      }
      setAnalysis(data.analysis);
    } catch {
      toast({ tone: "error", title: "Error de conexión" });
    } finally {
      setAnalyzing(false);
    }
  }

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        {gap && (
          <Card className="border-accent/40 bg-accent-soft/20">
            <CardBody>
              <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                <Globe className="h-3.5 w-3.5" />
                Internacional (ICE → COP/kg)
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-fg tnum">
                {formatNumber(gap.intl)}
                <span className="text-sm font-normal text-fg-subtle"> COP/kg</span>
              </p>
              <span
                className={cn(
                  "mt-1 inline-flex items-center gap-1 text-xs font-medium",
                  gap.diff >= 0 ? "text-success" : "text-danger",
                )}
              >
                {gap.diff >= 0 ? "+" : ""}
                {formatNumber(gap.diff)} ({gap.pct >= 0 ? "+" : ""}
                {gap.pct.toFixed(1)}%) vs. nacional
              </span>
            </CardBody>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tendencia · nacional vs internacional</CardTitle>
          <Button size="sm" variant="secondary" onClick={onAnalyze} loading={analyzing}>
            <Sparkles className="h-4 w-4 text-accent" />
            Analizar con IA
          </Button>
        </CardHeader>
        <CardBody>
          {series.length > 0 ? (
            <PriceChart data={series} companies={chartCompanies} />
          ) : (
            <EmptyState title="Sin datos de precios" />
          )}
          {!hasIntl && series.length > 0 && (
            <p className="mt-2 text-xs text-fg-subtle">
              No se pudo cargar el precio internacional en este momento.
            </p>
          )}
          {(analyzing || analysis) && (
            <div className="mt-4 rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft/20 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-soft-fg">
                <Sparkles className="h-3.5 w-3.5" />
                Análisis IA
              </p>
              {analyzing ? (
                <p className="flex items-center gap-2 text-sm text-fg-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analizando precios…
                </p>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                  {analysis}
                </p>
              )}
            </div>
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
            <>
            {/* Mobile: cards */}
            <ul className="space-y-2 p-3 sm:hidden">
              {byDate.slice(0, 30).map(([d, row]) => (
                <li
                  key={d}
                  className="rounded-[var(--radius-md)] border border-border bg-surface p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-medium text-fg-subtle">
                      {formatDate(d)}
                    </span>
                    {canWrite && (
                      <button
                        onClick={() => onDeleteDate(d)}
                        className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                        aria-label="Eliminar fecha"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <dl className="mt-1.5 space-y-1">
                    {companies.map((c) => (
                      <div key={c} className="flex items-center justify-between gap-2 text-sm">
                        <dt className="min-w-0 truncate text-fg-muted">{c}</dt>
                        <dd className="shrink-0 font-mono tnum text-fg">
                          {row[c] != null ? formatNumber(row[c]) : "—"}
                        </dd>
                      </div>
                    ))}
                    {hasIntl && (
                      <div className="flex items-center justify-between gap-2 border-t border-border pt-1 text-sm">
                        <dt className="min-w-0 truncate text-accent-soft-fg">Cacao (ICE)</dt>
                        <dd className="shrink-0 font-mono tnum text-accent-soft-fg">
                          {international[d] != null ? formatNumber(international[d]) : "—"}
                        </dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                    <th className="px-4 py-3 text-left font-medium">Fecha</th>
                    {companies.map((c) => (
                      <th key={c} className="px-4 py-3 text-right font-medium">
                        {c}
                      </th>
                    ))}
                    {hasIntl && (
                      <th className="border-l border-border px-4 py-3 text-right font-medium text-accent-soft-fg">
                        Cacao (ICE)
                      </th>
                    )}
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
                      {hasIntl && (
                        <td className="border-l border-border px-4 py-2.5 text-right font-mono tnum text-accent-soft-fg">
                          {international[d] != null ? formatNumber(international[d]) : "—"}
                        </td>
                      )}
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
            </>
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
