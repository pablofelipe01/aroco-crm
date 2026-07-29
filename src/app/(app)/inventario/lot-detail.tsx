"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, Plus } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { formatKg, formatDate, formatCOP, formatNumber } from "@/lib/utils";
import type { InventoryLot, InventoryMovement } from "@/lib/types/database";
import { addMovement, deleteMovement, deleteLot } from "./actions";

export function LotDetail({
  lot,
  open,
  canWrite,
  onClose,
  onEdit,
  onChanged,
}: {
  lot: InventoryLot | null;
  open: boolean;
  canWrite: boolean;
  onClose: () => void;
  onEdit: (l: InventoryLot) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [movements, setMovements] = React.useState<InventoryMovement[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [kind, setKind] = React.useState<"entrada" | "salida">("salida");
  const [qty, setQty] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async (lotId: string) => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("inventory_movements")
      .select("*")
      .eq("lot_id", lotId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    setMovements(data ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync drawer state to the opened lot */
    if (open && lot) {
      void load(lot.id);
      setQty("");
      setNote("");
      setKind("salida");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, lot, load]);

  if (!lot) return null;

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!lot || !qty) return;
    setSaving(true);
    const res = await addMovement({
      lot_id: lot.id,
      kind,
      qty_kg: Number(qty),
      notes: note || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo registrar", description: res.error });
      return;
    }
    setQty("");
    setNote("");
    await load(lot.id);
    onChanged();
    router.refresh();
  }

  async function onDeleteMovement(id: string) {
    if (!lot) return;
    const res = await deleteMovement(id);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo eliminar", description: res.error });
      return;
    }
    await load(lot.id);
    onChanged();
    router.refresh();
  }

  async function onDeleteLot() {
    if (!lot) return;
    if (!confirm(`¿Eliminar el lote ${lot.code}? Se borrarán sus movimientos.`)) return;
    const res = await deleteLot(lot.id);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo eliminar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Lote eliminado" });
    onClose();
    router.refresh();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={<span className="font-mono">{lot.code}</span>}
      subtitle={
        <div className="flex flex-wrap items-center gap-2">
          {lot.quality && <Badge tone="accent">{lot.quality}</Badge>}
          {lot.needs_review && <Badge tone="warn">Verificar snapshot</Badge>}
          {lot.entry_date && (
            <span className="text-xs text-fg-muted">{formatDate(lot.entry_date)}</span>
          )}
        </div>
      }
      footer={
        canWrite && (
          <>
            <Button variant="ghost" size="sm" onClick={onDeleteLot}>
              <Trash2 className="h-4 w-4 text-danger" />
              Eliminar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onEdit(lot)}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          </>
        )
      }
    >
      <div className="space-y-6">
        {/* Stock summary */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Ingresada" value={formatKg(lot.qty_in_kg)} />
          <Stat label="Salida" value={formatKg(lot.qty_out_kg)} />
          <Stat label="Disponible" value={formatKg(lot.qty_available_kg)} accent />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {lot.remision && <Meta label="Remisión" value={lot.remision} />}
          {lot.odc && <Meta label="ODC" value={lot.odc} />}
          {lot.recepcion && <Meta label="Recepción" value={lot.recepcion} />}
          {lot.origin && <Meta label="Procedencia" value={lot.origin} />}
          {lot.purchase_price_cop_kg != null && (
            <Meta label="Precio compra" value={`${formatCOP(lot.purchase_price_cop_kg)}/kg`} />
          )}
          {lot.qty_requested_kg != null && (
            <Meta label="Solicitada" value={formatKg(lot.qty_requested_kg)} />
          )}
          {lot.bultos_in > 0 && (
            <Meta label="Bultos" value={formatNumber(lot.bultos_in)} />
          )}
          {lot.cadmio && <Meta label="Cadmio" value={lot.cadmio} />}
          {lot.merma_kg > 0 && (
            <Meta
              label="Merma"
              value={`${formatKg(lot.merma_kg)}${lot.merma_pct != null ? ` · ${lot.merma_pct}%` : ""}`}
            />
          )}
          {lot.pasilla_kg > 0 && (
            <Meta
              label="Pasilla"
              value={`${formatKg(lot.pasilla_kg)}${lot.pasilla_pct != null ? ` · ${lot.pasilla_pct}%` : ""}`}
            />
          )}
        </dl>

        <Classification lot={lot} />
        <QualityMeasurement lot={lot} />

        {/* Add movement */}
        {canWrite && (
          <form onSubmit={onAdd} className="rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">
              Registrar movimiento
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Tipo" className="w-32">
                <Select value={kind} onChange={(e) => setKind(e.target.value as "entrada" | "salida")}>
                  <option value="salida">Salida</option>
                  <option value="entrada">Entrada</option>
                </Select>
              </Field>
              <Field label="Cantidad (kg)" className="w-32">
                <Input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="font-mono tnum" />
              </Field>
              <Field label="Nota" className="flex-1">
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Button type="submit" size="sm" loading={saving} disabled={!qty}>
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </div>
          </form>
        )}

        {/* Movements ledger */}
        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            Movimientos
          </h3>
          {loading ? (
            <p className="text-sm text-fg-subtle">Cargando…</p>
          ) : movements.length === 0 ? (
            <p className="text-sm text-fg-subtle">Sin movimientos registrados.</p>
          ) : (
            <ul className="space-y-1.5">
              {movements.map((m) => (
                <li
                  key={m.id}
                  className="group flex items-center gap-3 rounded-[var(--radius-sm)] border border-border px-3 py-2"
                >
                  <span
                    className={
                      m.kind === "entrada"
                        ? "text-success"
                        : "text-warn"
                    }
                  >
                    {m.kind === "entrada" ? (
                      <ArrowDownToLine className="h-4 w-4" />
                    ) : (
                      <ArrowUpFromLine className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">
                      {m.kind === "entrada" ? "Entrada" : "Salida"} ·{" "}
                      <span className="font-mono tnum">{formatKg(m.qty_kg)}</span>
                    </p>
                    <p className="truncate text-xs text-fg-subtle">
                      {formatDate(m.date)}
                      {m.company ? ` · ${m.company}` : ""}
                      {m.notes ? ` · ${m.notes}` : ""}
                    </p>
                  </div>
                  {canWrite && (
                    <button
                      onClick={() => onDeleteMovement(m.id)}
                      className="rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                      aria-label="Eliminar movimiento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}

/** Desglose por clasificación: qué entró y qué queda de cada tipo de cacao. */
function Classification({ lot }: { lot: InventoryLot }) {
  const rows = [
    { label: "Premium", in: lot.qty_in_premium_kg, avail: lot.qty_avail_premium_kg },
    { label: "Corriente", in: lot.qty_in_corriente_kg, avail: lot.qty_avail_corriente_kg },
    { label: "Corriente C", in: lot.qty_in_corriente_c_kg, avail: lot.qty_avail_corriente_c_kg },
    { label: "Orgánico", in: lot.qty_in_organico_kg, avail: lot.qty_avail_organico_kg },
  ].filter((r) => r.in > 0 || r.avail > 0);

  if (rows.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">
        Clasificación
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-fg-subtle">
            <th className="pb-1.5 text-left font-medium">Tipo</th>
            <th className="pb-1.5 text-right font-medium">Ingresada</th>
            <th className="pb-1.5 text-right font-medium">En bodega</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className="py-1.5 text-fg-muted">{r.label}</td>
              <td className="py-1.5 text-right font-mono tnum text-fg-muted">
                {formatNumber(r.in)}
              </td>
              <td className="py-1.5 text-right font-mono tnum font-semibold text-fg">
                {formatNumber(r.avail)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ítems de evaluación del laboratorio; solo se muestran si hay mediciones. */
function QualityMeasurement({ lot }: { lot: InventoryLot }) {
  const items = [
    { label: "Bien fermentados", value: lot.pct_bien_fermentado },
    { label: "Parcialmente ferm.", value: lot.pct_parcialmente_fermentado },
    { label: "Pizarrosos", value: lot.pct_pizarroso },
    { label: "Púrpuras", value: lot.pct_purpura },
    { label: "Sobre fermentado", value: lot.pct_sobre_fermentado },
    { label: "Grano con hongos", value: lot.pct_hongos },
    { label: "Humedad", value: lot.pct_humedad },
    { label: "Fermentación total", value: lot.pct_fermentacion_total },
  ].filter((i) => i.value != null);

  if (items.length === 0 && lot.indice_grano_100g == null) return null;

  return (
    <div>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">
        Medición de calidad
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {items.map((i) => (
          <Meta key={i.label} label={i.label} value={`${i.value}%`} />
        ))}
        {lot.indice_grano_100g != null && (
          <Meta label="Índice de grano" value={`${lot.indice_grano_100g} / 100 g`} />
        )}
      </dl>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-md)] border border-border p-3 ${accent ? "bg-accent-soft/50" : "bg-bg-subtle/40"}`}>
      <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold tnum ${accent ? "text-accent-soft-fg" : "text-fg"}`}>
        {value}
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">{value}</dd>
    </div>
  );
}
