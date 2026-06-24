"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, ShoppingCart, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { OC_ESTADO_TONE, OC_CASO_LABEL, COP } from "@/lib/procesos/oc-opts";
import type { OcEstado } from "@/lib/procesos/oc-opts";
import type { OrdenLista, ProveedorHabilitado } from "./page";
import { OrdenForm } from "./orden-form";

const ESTADOS: OcEstado[] = ["Borrador", "En revisión", "Aprobada", "Emitida", "Rechazada"];

export function OrdenesClient({
  ordenes,
  proveedores,
  canWrite,
}: {
  ordenes: OrdenLista[];
  proveedores: ProveedorHabilitado[];
  canWrite: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [estado, setEstado] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);

  const filtradas = React.useMemo(
    () => ordenes.filter((o) => !estado || o.estado === estado),
    [ordenes, estado],
  );

  const cuenta = (e: OcEstado) => ordenes.filter((o) => o.estado === e).length;
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("es-CO") : "—");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Órdenes de compra"
        description="Fase 2 — creación, aprobación y emisión de OC de cacao."
        actions={
          canWrite && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Nueva orden
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Órdenes" value={ordenes.length} icon={ShoppingCart} />
        <StatCard label="En revisión" value={cuenta("En revisión")} />
        <StatCard label="Aprobadas" value={cuenta("Aprobada")} />
        <StatCard label="Emitidas" value={cuenta("Emitida")} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-auto">
          <option value="">Todo estado</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Select>
        {estado && (
          <Button variant="ghost" size="sm" onClick={() => setEstado("")}>
            <X className="h-3.5 w-3.5" /> Limpiar
          </Button>
        )}
        <span className="ml-auto self-center text-xs text-fg-subtle">
          {filtradas.length} de {ordenes.length}
        </span>
      </div>

      {filtradas.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-6 w-6" />}
          title="Sin órdenes"
          description={canWrite ? "Crea la primera orden de compra." : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 text-left font-medium">Consecutivo</th>
                <th className="px-4 py-3 text-left font-medium">Proveedor</th>
                <th className="px-4 py-3 text-left font-medium">Caso</th>
                <th className="px-4 py-3 text-right font-medium">Volumen (kg)</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-left font-medium">Entrega</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/procesos/ordenes/${o.id}`)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-fg">{o.consecutivo ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-fg">{o.proveedor_nombre}</td>
                  <td className="px-4 py-3 text-xs text-fg-muted">{OC_CASO_LABEL[o.tipo_caso]}</td>
                  <td className="px-4 py-3 text-right tnum text-fg-muted">
                    {o.volumen_kg != null ? o.volumen_kg.toLocaleString("es-CO") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-fg">
                    {o.valor_total ? COP.format(o.valor_total) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-muted">{fmtDate(o.fecha_entrega)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={OC_ESTADO_TONE[o.estado]}>{o.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <OrdenForm open={formOpen} onClose={() => setFormOpen(false)} proveedores={proveedores} />
    </div>
  );
}
