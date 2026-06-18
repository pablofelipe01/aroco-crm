"use client";

import * as React from "react";
import { ArrowUpFromLine, PackageSearch, Sprout } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatKg, formatDate, formatCOP } from "@/lib/utils";
import type { Dispatch, InventoryLot } from "@/lib/types/database";

/**
 * Traceability drawer for a dispatch (salida): reconstructs the source lot row
 * from the inventory sheet — the entrada it came from plus every salida of that
 * lot. The link is dispatch.origin/remision_entrada → inventory_lots
 * code/remision (sheet-synced dispatches carry no lot_id).
 */
export function DispatchTrace({
  dispatch,
  open,
  onClose,
}: {
  dispatch: Dispatch | null;
  open: boolean;
  onClose: () => void;
}) {
  const [lot, setLot] = React.useState<InventoryLot | null>(null);
  const [siblings, setSiblings] = React.useState<Dispatch[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async (d: Dispatch) => {
    setLoading(true);
    const supabase = createClient();

    // 1) Source lot — by FK when present, else match the sheet keys.
    let foundLot: InventoryLot | null = null;
    if (d.lot_id) {
      const { data } = await supabase
        .from("inventory_lots")
        .select("*")
        .eq("id", d.lot_id)
        .maybeSingle();
      foundLot = data ?? null;
    } else if (d.origin) {
      let q = supabase.from("inventory_lots").select("*").eq("code", d.origin);
      q = d.remision_entrada
        ? q.eq("remision", d.remision_entrada)
        : q.is("remision", null);
      const { data } = await q.limit(1).maybeSingle();
      foundLot = data ?? null;
    }
    setLot(foundLot);

    // 2) Every salida of the same lot (siblings + this one).
    let sib: Dispatch[] = [];
    if (d.origin) {
      let q = supabase.from("dispatches").select("*").eq("origin", d.origin);
      q = d.remision_entrada
        ? q.eq("remision_entrada", d.remision_entrada)
        : q.is("remision_entrada", null);
      const { data } = await q.order("dispatch_date", { ascending: true });
      sib = (data ?? []) as Dispatch[];
    } else if (d.lot_id) {
      const { data } = await supabase
        .from("dispatches")
        .select("*")
        .eq("lot_id", d.lot_id)
        .order("dispatch_date", { ascending: true });
      sib = (data ?? []) as Dispatch[];
    }
    setSiblings(sib);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync drawer to the opened dispatch */
    if (open && dispatch) {
      setLot(null);
      setSiblings([]);
      void load(dispatch);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, dispatch, load]);

  if (!dispatch) return null;

  const distributed = siblings.reduce((s, x) => s + (Number(x.qty_kg) || 0), 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={
        <span className="font-mono">
          Remisión {dispatch.remision_salida ?? "—"}
        </span>
      }
      subtitle={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-fg">{dispatch.destination ?? "Sin destino"}</span>
          <span className="font-mono text-xs text-fg-muted">
            {formatDate(dispatch.dispatch_date)}
          </span>
          {dispatch.source === "sheet" && <Badge tone="neutral">Hoja</Badge>}
        </div>
      }
    >
      <div className="space-y-6">
        {/* This salida */}
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            <ArrowUpFromLine className="h-3.5 w-3.5" /> Esta salida
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Cantidad" value={formatKg(dispatch.qty_kg)} accent />
            <Stat label="Destino" value={dispatch.destination ?? "—"} />
            <Stat
              label="Precio compra"
              value={
                dispatch.purchase_price_cop_kg != null
                  ? `${formatCOP(dispatch.purchase_price_cop_kg)}/kg`
                  : "—"
              }
            />
          </div>
        </section>

        {/* Source lot (entrada) */}
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            <Sprout className="h-3.5 w-3.5" /> Lote de origen (entrada)
          </h3>
          {loading && !lot ? (
            <p className="text-sm text-fg-subtle">Cargando trazabilidad…</p>
          ) : lot ? (
            <div className="space-y-3 rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent" className="font-mono">
                  {lot.code}
                </Badge>
                {lot.quality && <Badge tone="neutral">{lot.quality}</Badge>}
                {lot.entry_date && (
                  <span className="text-xs text-fg-muted">
                    Ingresó {formatDate(lot.entry_date)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Ingresada" value={formatKg(lot.qty_in_kg)} />
                <Stat label="Salida" value={formatKg(lot.qty_out_kg)} />
                <Stat label="Disponible" value={formatKg(lot.qty_available_kg)} accent />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {lot.remision && <Meta label="Remisión entrada" value={lot.remision} />}
                {dispatch.origin && <Meta label="Procedencia" value={dispatch.origin} />}
                {lot.samples_pasilla_merma_kg > 0 && (
                  <Meta label="Muestras/merma" value={formatKg(lot.samples_pasilla_merma_kg)} />
                )}
                {lot.purchase_price_cop_kg != null && (
                  <Meta label="Precio compra" value={`${formatCOP(lot.purchase_price_cop_kg)}/kg`} />
                )}
              </dl>
              {lot.notes && <p className="text-xs text-fg-muted">{lot.notes}</p>}
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-dashed border-border p-4 text-sm text-fg-subtle">
              <PackageSearch className="mb-1 h-4 w-4" />
              No se encontró el lote de origen
              {dispatch.origin ? (
                <span className="font-mono"> ({dispatch.origin})</span>
              ) : null}
              . Puede que aún no esté en el inventario sincronizado.
            </div>
          )}
        </section>

        {/* All salidas of this lot */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              Salidas del lote ({siblings.length})
            </h3>
            {distributed > 0 && (
              <span className="font-mono text-xs text-fg-subtle tnum">
                {formatKg(distributed)} despachados
              </span>
            )}
          </div>
          {loading && siblings.length === 0 ? (
            <p className="text-sm text-fg-subtle">Cargando…</p>
          ) : siblings.length === 0 ? (
            <p className="text-sm text-fg-subtle">Sin salidas registradas.</p>
          ) : (
            <ul className="space-y-1.5">
              {siblings.map((s) => {
                const current = s.id === dispatch.id;
                return (
                  <li
                    key={s.id}
                    className={
                      "flex items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2 " +
                      (current
                        ? "border-accent/50 bg-accent-soft/30"
                        : "border-border")
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">
                        {s.destination ?? "—"}
                        {current && (
                          <span className="ml-2 text-[11px] font-normal text-accent-soft-fg">
                            (esta salida)
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-fg-subtle">
                        {formatDate(s.dispatch_date)}
                        {s.remision_salida ? ` · Rem. ${s.remision_salida}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm tnum text-fg">
                      {formatKg(s.qty_kg)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-[var(--radius-md)] border border-border p-3 ${accent ? "bg-accent-soft/50" : "bg-bg-subtle/40"}`}
    >
      <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</p>
      <p
        className={`mt-0.5 truncate font-mono text-sm font-semibold tnum ${accent ? "text-accent-soft-fg" : "text-fg"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-fg">{value}</dd>
    </div>
  );
}
