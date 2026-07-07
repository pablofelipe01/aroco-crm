"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Boxes, Sprout, Truck, Layers, Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatKg, formatCOP, formatDate } from "@/lib/utils";
import type { InventoryQuality } from "@/lib/types/database";
import { QualityForm } from "./quality-form";
import { deleteQualityRow } from "./actions";

const kg = (v: number) => (v > 0 ? formatKg(v) : "—");

export function InventarioCalidadClient({
  rows,
  canWrite = false,
}: {
  rows: InventoryQuality[];
  canWrite?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<InventoryQuality | null>(null);

  const sum = (k: keyof InventoryQuality) =>
    rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const enBodega = sum("en_bodega_kg");
  const porLlegar = sum("por_llegar_kg");
  const premium = sum("qty_premium_kg");
  const syncedAt = rows.find((r) => r.source !== "manual")?.synced_at ?? null;
  const manualCount = rows.filter((r) => r.source === "manual").length;

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  async function onDelete(r: InventoryQuality) {
    if (!confirm(`¿Eliminar la fila manual "${r.procedencia}"?`)) return;
    const res = await deleteQualityRow(r.id);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo eliminar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Fila eliminada" });
    router.refresh();
  }

  const colSpan = canWrite ? 4 : 3;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario por calidad"
        description="Stock actual por procedencia, ubicación y calidad — sincronizado a diario desde la hoja."
        actions={
          <div className="flex items-center gap-2">
            {syncedAt && (
              <Badge tone="neutral">Actualizado {formatDate(syncedAt)}</Badge>
            )}
            {canWrite && (
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Nueva fila
              </Button>
            )}
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="Sin datos"
          description={
            canWrite
              ? "Aún no hay inventario por calidad. Agrega una fila manual o espera el sync de la hoja."
              : "Aún no se ha cargado el inventario por calidad desde la hoja."
          }
          action={
            canWrite ? (
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Nueva fila
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="En bodega" value={enBodega} suffix=" kg" icon={Boxes} hint={`${rows.length} lotes`} />
            <StatCard label="Premium" value={premium} suffix=" kg" icon={Sprout} />
            <StatCard label="Por llegar" value={porLlegar} suffix=" kg" icon={Truck} />
            <StatCard
              label="Otras calidades"
              value={sum("qty_b_kg") + sum("qty_c_kg") + sum("qty_organico_kg")}
              suffix=" kg"
              icon={Layers}
              hint="B · C · Orgánico"
            />
          </div>

          <Card>
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                    <th className="px-4 py-3 text-left font-medium">Procedencia</th>
                    <th className="px-4 py-3 text-left font-medium">Fecha</th>
                    <th className="px-4 py-3 text-left font-medium">OC</th>
                    <th className="px-4 py-3 text-right font-medium">Por llegar</th>
                    <th className="px-4 py-3 text-right font-medium">En bodega</th>
                    <th className="px-4 py-3 text-right font-medium">Valor compra</th>
                    <th className="px-4 py-3 text-right font-medium">B</th>
                    <th className="px-4 py-3 text-right font-medium">C</th>
                    <th className="px-4 py-3 text-right font-medium">Premium</th>
                    <th className="px-4 py-3 text-right font-medium">Orgánico</th>
                    <th className="px-4 py-3 text-left font-medium">Cadmio</th>
                    {canWrite && <th className="px-4 py-3 text-right font-medium">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const manual = r.source === "manual";
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-bg-subtle/50">
                        <td className="px-4 py-3 font-medium text-fg">
                          <span className="flex items-center gap-2">
                            {r.procedencia}
                            {manual && (
                              <Badge tone="accent" className="shrink-0">
                                Manual
                              </Badge>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-fg-subtle">
                          {r.entry_date ? formatDate(r.entry_date) : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-fg-subtle">{r.oc ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">{kg(r.por_llegar_kg)}</td>
                        <td className="px-4 py-3 text-right font-mono tnum font-medium text-fg">{kg(r.en_bodega_kg)}</td>
                        <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">
                          {r.purchase_price_cop_kg != null ? formatCOP(r.purchase_price_cop_kg) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">{kg(r.qty_b_kg)}</td>
                        <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">{kg(r.qty_c_kg)}</td>
                        <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">{kg(r.qty_premium_kg)}</td>
                        <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">{kg(r.qty_organico_kg)}</td>
                        <td className="px-4 py-3">
                          {r.cadmio ? <Badge tone="warn">{r.cadmio}</Badge> : <span className="text-fg-subtle">—</span>}
                        </td>
                        {canWrite && (
                          <td className="px-4 py-3">
                            {manual ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    setEditing(r);
                                    setFormOpen(true);
                                  }}
                                  className="rounded p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                                  aria-label="Editar"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => onDelete(r)}
                                  className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                                  aria-label="Eliminar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="block text-right text-xs text-fg-subtle">Hoja</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium text-fg">
                    <td className="px-4 py-3 text-xs uppercase tracking-wide text-fg-subtle" colSpan={colSpan}>
                      Total
                    </td>
                    <td className="px-4 py-3 text-right font-mono tnum">{kg(porLlegar)}</td>
                    <td className="px-4 py-3 text-right font-mono tnum">{kg(enBodega)}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right font-mono tnum">{kg(sum("qty_b_kg"))}</td>
                    <td className="px-4 py-3 text-right font-mono tnum">{kg(sum("qty_c_kg"))}</td>
                    <td className="px-4 py-3 text-right font-mono tnum">{kg(premium)}</td>
                    <td className="px-4 py-3 text-right font-mono tnum">{kg(sum("qty_organico_kg"))}</td>
                    <td className="px-4 py-3" />
                    {canWrite && <td className="px-4 py-3" />}
                  </tr>
                </tfoot>
              </table>
            </CardBody>
          </Card>

          {canWrite && manualCount > 0 && (
            <p className="text-xs text-fg-subtle">
              {manualCount} fila{manualCount === 1 ? "" : "s"} manual
              {manualCount === 1 ? "" : "es"} · las filas de la hoja se
              actualizan solas a diario y no se pueden editar aquí.
            </p>
          )}
        </>
      )}

      {canWrite && (
        <QualityForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          initial={editing}
          onSaved={() => {
            setFormOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
