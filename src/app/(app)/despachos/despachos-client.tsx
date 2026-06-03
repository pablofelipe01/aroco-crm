"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Plus, Truck, Trash2, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatKg, formatDate, formatCOP } from "@/lib/utils";
import type { DispatchWithLinks } from "./page";
import { createDispatch, deleteDispatch } from "./actions";

interface FormValues {
  dispatch_date: string;
  remision_salida: string;
  destination: string;
  oc: string;
  lot_id: string;
  lead_id: string;
  origin: string;
  qty_kg: string;
  purchase_price_cop_kg: string;
  remision_entrada: string;
}

const EMPTY: FormValues = {
  dispatch_date: new Date().toISOString().slice(0, 10),
  remision_salida: "",
  destination: "",
  oc: "",
  lot_id: "",
  lead_id: "",
  origin: "",
  qty_kg: "",
  purchase_price_cop_kg: "",
  remision_entrada: "",
};

export function DespachosClient({
  initialDispatches,
  lots,
  leads,
  canWrite,
}: {
  initialDispatches: DispatchWithLinks[];
  lots: { id: string; code: string; qty_available_kg: number }[];
  leads: { id: string; company: string }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: EMPTY,
  });
  const [prevOpen, setPrevOpen] = React.useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) reset(EMPTY);
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialDispatches;
    return initialDispatches.filter((d) =>
      `${d.destination ?? ""} ${d.origin ?? ""} ${d.remision_salida ?? ""} ${d.lot?.code ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [initialDispatches, query]);

  const onSubmit = handleSubmit(async (values) => {
    const res = await createDispatch({
      ...values,
      lot_id: values.lot_id || null,
      lead_id: values.lead_id || null,
    });
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo crear", description: res.error });
      return;
    }
    toast({
      tone: "success",
      title: "Despacho creado",
      description: values.lot_id ? "El inventario se descontó automáticamente." : undefined,
    });
    setOpen(false);
    router.refresh();
  });

  async function onDelete(d: DispatchWithLinks) {
    if (!confirm(`¿Eliminar el despacho ${d.remision_salida ?? ""}?`)) return;
    const res = await deleteDispatch(d.id);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo eliminar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Despacho eliminado" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Despachos"
        description={`${initialDispatches.length} salidas registradas`}
        actions={
          canWrite && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Nuevo despacho
            </Button>
          )
        }
      />

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar destino, procedencia…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Truck className="h-6 w-6" />} title="Sin despachos" />
      ) : (
        <>
        {/* Mobile: card list */}
        <ul className="space-y-2 sm:hidden">
          {filtered.map((d) => (
            <li
              key={d.id}
              className="rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-[var(--shadow-soft-sm)]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 font-medium text-fg">
                  {d.destination ?? "—"}
                </span>
                <span className="font-mono text-sm font-semibold tnum text-fg">
                  {formatKg(d.qty_kg)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                <span className="font-mono">{formatDate(d.dispatch_date)}</span>
                {d.remision_salida && <span className="font-mono">Rem. {d.remision_salida}</span>}
                {d.purchase_price_cop_kg != null && (
                  <span className="font-mono">{formatCOP(d.purchase_price_cop_kg)}/kg</span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-fg-muted">
                  {d.origin ?? "—"}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {d.lot && (
                    <Badge tone="accent" className="font-mono">
                      {d.lot.code}
                    </Badge>
                  )}
                  {canWrite && (
                    <button
                      onClick={() => onDelete(d)}
                      className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Desktop: table */}
        <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface sm:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 text-left font-medium">Fecha</th>
                <th className="px-4 py-3 text-left font-medium">Remisión</th>
                <th className="px-4 py-3 text-left font-medium">Destino</th>
                <th className="px-4 py-3 text-left font-medium">Procedencia / Lote</th>
                <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                <th className="px-4 py-3 text-right font-medium">Precio compra</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-bg-subtle/50">
                  <td className="px-4 py-3 font-mono text-xs text-fg-subtle">
                    {formatDate(d.dispatch_date)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg">
                    {d.remision_salida ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-fg">{d.destination ?? "—"}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    {d.origin ?? "—"}
                    {d.lot && (
                      <Badge tone="accent" className="ml-2 align-middle font-mono">
                        {d.lot.code}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tnum font-medium text-fg">
                    {formatKg(d.qty_kg)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">
                    {d.purchase_price_cop_kg != null ? formatCOP(d.purchase_price_cop_kg) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && (
                      <button
                        onClick={() => onDelete(d)}
                        className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                        aria-label="Eliminar"
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Nuevo despacho"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onSubmit} loading={formState.isSubmitting}>
              Crear despacho
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fecha salida">
            <Input type="date" {...register("dispatch_date")} />
          </Field>
          <Field label="Remisión salida">
            <Input {...register("remision_salida")} />
          </Field>
          <Field label="Destino (cliente)" className="sm:col-span-2">
            <Input {...register("destination")} placeholder="CASA LUKER, NAL. CHOCOLATES…" />
          </Field>
          <Field label="Lote (descuenta inventario)">
            <Select {...register("lot_id")} defaultValue="">
              <option value="">— Sin lote —</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} ({formatKg(l.qty_available_kg)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lead (opcional)">
            <Select {...register("lead_id")} defaultValue="">
              <option value="">— Sin lead —</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.company}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Procedencia (texto)">
            <Input {...register("origin")} />
          </Field>
          <Field label="Cantidad (kg) *">
            <Input type="number" step="any" {...register("qty_kg", { required: true })} className="font-mono tnum" />
          </Field>
          <Field label="OC">
            <Input {...register("oc")} />
          </Field>
          <Field label="Precio compra (COP/kg)">
            <Input type="number" step="any" {...register("purchase_price_cop_kg")} className="font-mono tnum" />
          </Field>
          <p className="text-xs text-fg-subtle sm:col-span-2">
            Si eliges un lote, se genera un movimiento de salida y se descuenta el
            disponible automáticamente.
          </p>
        </form>
      </Modal>
    </div>
  );
}
