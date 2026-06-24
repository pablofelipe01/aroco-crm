"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Warehouse, PackageCheck, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { RECEPCION_ESTADO_TONE } from "@/lib/procesos/recepcion-opts";
import type { RecepcionFila } from "./page";
import { crearRecepcion } from "./actions";

export function RecepcionClient({
  filas,
  canWrite,
}: {
  filas: RecepcionFila[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const pendientes = filas.filter((f) => f.recepcion_estado == null).length;
  const enProceso = filas.filter((f) => f.recepcion_estado === "En proceso").length;
  const cerradas = filas.filter((f) => f.recepcion_estado === "Cerrada").length;

  async function iniciar(f: RecepcionFila) {
    setBusy(f.orden_id);
    const res = await crearRecepcion(f.orden_id);
    setBusy(null);
    if (!res.ok || !res.id) {
      toast({ tone: "error", title: "No se pudo iniciar", description: res.error });
      return;
    }
    router.push(`/procesos/recepcion/${res.id}`);
  }

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("es-CO") : "—");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recepción en bodega"
        description="Fase 3 — recepción física, pesaje, calidad y cierre de reporte de las OC emitidas."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="OC emitidas" value={filas.length} icon={Warehouse} />
        <StatCard label="Por recibir" value={pendientes} />
        <StatCard label="En proceso" value={enProceso} />
        <StatCard label="Cerradas" value={cerradas} />
      </div>

      {filas.length === 0 ? (
        <EmptyState
          icon={<Warehouse className="h-6 w-6" />}
          title="Sin órdenes emitidas"
          description="Las OC aparecen aquí cuando se emiten en firme."
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 text-left font-medium">Consecutivo</th>
                <th className="px-4 py-3 text-left font-medium">Proveedor</th>
                <th className="px-4 py-3 text-right font-medium">Solicitado (kg)</th>
                <th className="px-4 py-3 text-right font-medium">Recibido (kg)</th>
                <th className="px-4 py-3 text-left font-medium">Emitida</th>
                <th className="px-4 py-3 text-left font-medium">Recepción</th>
                <th className="px-4 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.orden_id} className="border-b border-border last:border-0 hover:bg-bg-subtle/50">
                  <td className="px-4 py-3 font-mono text-xs text-fg">{f.consecutivo ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-fg">{f.proveedor_nombre}</td>
                  <td className="px-4 py-3 text-right tnum text-fg-muted">
                    {f.volumen_kg != null ? f.volumen_kg.toLocaleString("es-CO") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-fg-muted">
                    {f.peso_recibido_kg != null ? f.peso_recibido_kg.toLocaleString("es-CO") : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-muted">{fmtDate(f.emitida_en)}</td>
                  <td className="px-4 py-3">
                    {f.recepcion_estado ? (
                      <Badge tone={RECEPCION_ESTADO_TONE[f.recepcion_estado]}>{f.recepcion_estado}</Badge>
                    ) : (
                      <Badge tone="neutral">Por recibir</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {f.recepcion_id ? (
                      <Button size="sm" variant="secondary" onClick={() => router.push(`/procesos/recepcion/${f.recepcion_id}`)}>
                        {f.recepcion_estado === "Cerrada" ? "Ver" : "Continuar"} <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    ) : canWrite ? (
                      <Button size="sm" loading={busy === f.orden_id} onClick={() => iniciar(f)}>
                        <PackageCheck className="h-4 w-4" /> Iniciar
                      </Button>
                    ) : (
                      <span className="text-xs text-fg-subtle">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
