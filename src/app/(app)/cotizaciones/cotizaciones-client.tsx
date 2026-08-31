"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, FileText, Pencil, Trash2, FileDown } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { QUOTE_STATUS_META } from "@/lib/status";
import { formatUSD } from "@/lib/utils";
import { useT, useFormatos } from "@/lib/i18n/provider";
import type { QuoteStatus } from "@/lib/types/database";
import type { QuoteWithLead } from "./page";
import { QuoteCalculator } from "./quote-calculator";
import { deleteQuote, setQuoteStatus } from "./actions";

const STATUSES: QuoteStatus[] = ["borrador", "enviada", "aceptada", "rechazada"];

export function CotizacionesClient({
  initialQuotes,
  leads,
  canWrite,
}: {
  initialQuotes: QuoteWithLead[];
  leads: { id: string; company: string; market: string | null }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const f = useFormatos();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<QuoteWithLead | null>(null);

  // Deep links from the command palette (?new=1 / ?quote=<id>).
  const searchParams = useSearchParams();
  React.useEffect(() => {
    const quoteId = searchParams.get("quote");
    const isNew = searchParams.get("new");
    if (!quoteId && !isNew) return;
    if (!canWrite) return;
    if (quoteId) {
      const q = initialQuotes.find((x) => x.id === quoteId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open from deep link
      if (q) setEditing(q);
    } else {
      setEditing(null);
    }
    setOpen(true);
    router.replace("/cotizaciones");
  }, [searchParams, initialQuotes, canWrite, router]);

  async function onStatus(id: string, status: QuoteStatus) {
    const res = await setQuoteStatus(id, status);
    if (!res.ok) {
      toast({
        tone: "error",
        title: t.cotizaciones.noSeActualizo,
        description: res.error,
      });
      return;
    }
    if (status === "enviada")
      toast({
        tone: "success",
        title: t.cotizaciones.enviada,
        description: t.cotizaciones.leadMovido,
      });
    router.refresh();
  }

  async function onDelete(q: QuoteWithLead) {
    if (
      !confirm(
        `${t.cotizaciones.confirmarEliminar} ${
          q.quote_number ?? t.cotizaciones.estaCotizacion
        }?`,
      )
    )
      return;
    const res = await deleteQuote(q.id);
    if (!res.ok) {
      toast({
        tone: "error",
        title: t.cotizaciones.noSeElimino,
        description: res.error,
      });
      return;
    }
    toast({ tone: "success", title: t.cotizaciones.eliminada });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.cotizaciones.titulo}
        description={`${initialQuotes.length} ${t.cotizaciones.enHistorial}`}
        actions={
          canWrite && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {t.cotizaciones.nueva}
            </Button>
          )
        }
      />

      {initialQuotes.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title={t.cotizaciones.sinCotizaciones}
          description={t.cotizaciones.creaPrimera}
          action={
            canWrite && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                {t.cotizaciones.nueva}
              </Button>
            )
          }
        />
      ) : (
        <>
        {/* Mobile: cards */}
        <ul className="space-y-2 sm:hidden">
          {initialQuotes.map((q) => (
            <li
              key={q.id}
              className="rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-[var(--shadow-soft-sm)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-medium text-fg">
                    {q.quote_number ?? "—"}
                  </p>
                  <p className="truncate text-sm text-fg">
                    {q.client_name ?? q.lead?.company ?? "—"}
                  </p>
                </div>
                <Badge tone="neutral">{q.incoterm}</Badge>
              </div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div>
                  <p className="font-mono text-base font-semibold tnum text-fg">
                    {q.precio_final_usd_tm != null ? formatUSD(q.precio_final_usd_tm) : "—"}
                  </p>
                  <p className="text-xs text-fg-subtle">
                    {t.cotizaciones.utilidad}{" "}
                    {q.utilidad_pct != null ? `${(q.utilidad_pct * 100).toFixed(2)}%` : "—"}
                    {" · "}
                    {f.fecha(q.created_at)}
                  </p>
                </div>
                {canWrite ? (
                  <Select
                    value={q.status}
                    onChange={(e) => onStatus(q.id, e.target.value as QuoteStatus)}
                    className="h-8 w-auto py-0 text-xs"
                  >
                    {STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {t.cotizacionEstados[st]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge tone={QUOTE_STATUS_META[q.status].tone}>
                    {QUOTE_STATUS_META[q.status].label}
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex items-center justify-end gap-1 border-t border-border pt-2">
                <a
                  href={`/print/cotizacion/${q.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                  title={t.cotizaciones.exportarPdf}
                >
                  <FileDown className="h-4 w-4" />
                </a>
                {canWrite && (
                  <>
                    <button
                      onClick={() => {
                        setEditing(q);
                        setOpen(true);
                      }}
                      className="rounded p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                      title={t.comun.editar}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(q)}
                      className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                      title={t.comun.eliminar}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Desktop: table */}
        <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface sm:block">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 text-left font-medium">
                  {t.cotizaciones.numero}
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  {t.cotizaciones.cliente}
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  {t.cotizaciones.incoterm}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t.cotizaciones.precioFinal}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t.cotizaciones.utilidad}
                </th>
                <th className="px-4 py-3 text-left font-medium">{t.comun.estado}</th>
                <th className="px-4 py-3 text-left font-medium">{t.comun.fecha}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {initialQuotes.map((q) => (
                <tr key={q.id} className="border-b border-border last:border-0 hover:bg-bg-subtle/50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-fg">
                    {q.quote_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-fg">
                    {q.client_name ?? q.lead?.company ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{q.incoterm}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-fg tnum">
                    {q.precio_final_usd_tm != null ? formatUSD(q.precio_final_usd_tm) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">
                    {q.utilidad_pct != null ? `${(q.utilidad_pct * 100).toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {canWrite ? (
                      <Select
                        value={q.status}
                        onChange={(e) => onStatus(q.id, e.target.value as QuoteStatus)}
                        className="h-8 w-auto py-0 text-xs"
                      >
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {t.cotizacionEstados[st]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge tone={QUOTE_STATUS_META[q.status].tone}>
                        {QUOTE_STATUS_META[q.status].label}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-subtle">
                    {f.fecha(q.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/print/cotizacion/${q.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                        title={t.cotizaciones.exportarPdf}
                      >
                        <FileDown className="h-4 w-4" />
                      </a>
                      {canWrite && (
                        <>
                          <button
                            onClick={() => {
                              setEditing(q);
                              setOpen(true);
                            }}
                            className="rounded p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                            title={t.comun.editar}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => onDelete(q)}
                            className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                            title={t.comun.eliminar}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <QuoteCalculator
        open={open}
        onClose={() => setOpen(false)}
        leads={leads}
        initial={editing}
        onSaved={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
