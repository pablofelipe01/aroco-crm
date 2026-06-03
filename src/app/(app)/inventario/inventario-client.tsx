"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Boxes, Package, Layers } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { staggerContainer } from "@/lib/motion";
import { motion } from "framer-motion";
import { formatDate, formatNumber } from "@/lib/utils";
import type { InventoryLot } from "@/lib/types/database";
import { LotDetail } from "./lot-detail";
import { LotForm } from "./lot-form";

export function InventarioClient({
  initialLots,
  canWrite,
}: {
  initialLots: InventoryLot[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<InventoryLot | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<InventoryLot | null>(null);

  // Deep link from the command palette (?lot=<id>).
  const searchParams = useSearchParams();
  React.useEffect(() => {
    const lotId = searchParams.get("lot");
    if (!lotId) return;
    const l = initialLots.find((x) => x.id === lotId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open from deep link
    if (l) setSelected(l);
    router.replace("/inventario");
  }, [searchParams, initialLots, router]);

  // Keep the selected lot in sync with refreshed data.
  const selectedId = selected?.id;
  const liveSelected = selectedId
    ? initialLots.find((l) => l.id === selectedId) ?? null
    : null;

  const totals = React.useMemo(() => {
    const available = initialLots.reduce((s, l) => s + (l.qty_available_kg || 0), 0);
    const withStock = initialLots.filter((l) => l.qty_available_kg > 0).length;
    return { available, withStock, count: initialLots.length };
  }, [initialLots]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialLots;
    return initialLots.filter((l) =>
      `${l.code} ${l.origin ?? ""} ${l.quality ?? ""} ${l.remision ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [initialLots, query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario"
        description="Lotes en bodega por procedencia y ledger de movimientos."
        actions={
          canWrite && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nuevo lote
            </Button>
          )
        }
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <StatCard label="Disponible total" value={totals.available} suffix=" kg" icon={Boxes} />
        <StatCard label="Lotes con stock" value={totals.withStock} icon={Package} />
        <StatCard label="Lotes totales" value={totals.count} icon={Layers} />
      </motion.div>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar código, procedencia…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Boxes className="h-6 w-6" />} title="Sin lotes" />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 text-left font-medium">Código</th>
                <th className="px-4 py-3 text-left font-medium">Ingreso</th>
                <th className="px-4 py-3 text-right font-medium">Ingresada</th>
                <th className="px-4 py-3 text-right font-medium">Salida</th>
                <th className="px-4 py-3 text-right font-medium">Disponible</th>
                <th className="px-4 py-3 text-left font-medium">Calidad</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelected(l)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-fg">{l.code}</span>
                    {l.needs_review && (
                      <Badge tone="warn" className="ml-2 align-middle">
                        verificar
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-subtle">
                    {l.entry_date ? formatDate(l.entry_date) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">
                    {formatNumber(l.qty_in_kg)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">
                    {formatNumber(l.qty_out_kg)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tnum font-semibold text-fg">
                    {formatNumber(l.qty_available_kg)}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{l.quality ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LotDetail
        lot={liveSelected}
        open={selected !== null}
        canWrite={canWrite}
        onClose={() => setSelected(null)}
        onEdit={(l) => {
          setSelected(null);
          setEditing(l);
          setFormOpen(true);
        }}
        onChanged={() => router.refresh()}
      />

      <LotForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editing}
        onSaved={() => {
          setFormOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
