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
import { formatUSD, formatDate } from "@/lib/utils";
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
      toast({ tone: "error", title: "No se pudo actualizar", description: res.error });
      return;
    }
    if (status === "enviada")
      toast({ tone: "success", title: "Cotización enviada", description: "El lead se movió a “Enviado”." });
    router.refresh();
  }

  async function onDelete(q: QuoteWithLead) {
    if (!confirm(`¿Eliminar ${q.quote_number ?? "esta cotización"}?`)) return;
    const res = await deleteQuote(q.id);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo eliminar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Cotización eliminada" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cotizaciones"
        description={`${initialQuotes.length} cotizaciones en el historial`}
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
              Nueva cotización
            </Button>
          )
        }
      />

      {initialQuotes.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Sin cotizaciones"
          description="Crea la primera con la calculadora del cotizador."
          action={
            canWrite && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Nueva cotización
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 text-left font-medium">Número</th>
                <th className="px-4 py-3 text-left font-medium">Cliente</th>
                <th className="px-4 py-3 text-left font-medium">Incoterm</th>
                <th className="px-4 py-3 text-right font-medium">Precio final</th>
                <th className="px-4 py-3 text-right font-medium">Utilidad</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3 text-left font-medium">Fecha</th>
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
                            {QUOTE_STATUS_META[st].label}
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
                    {formatDate(q.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/print/cotizacion/${q.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                        title="Exportar PDF"
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
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => onDelete(q)}
                            className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                            title="Eliminar"
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
