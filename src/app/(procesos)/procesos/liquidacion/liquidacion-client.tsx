"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Calculator, ArrowRight, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import type { LiquidacionFila } from "./page";
import { crearLiquidacion } from "./actions";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function LiquidacionClient({
  filas,
  canWrite,
}: {
  filas: LiquidacionFila[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const pendientes = filas.filter((f) => f.estado == null).length;
  const porRevision = filas.filter((f) => f.estado === "Por revisión").length;
  const aprobadas = filas.filter((f) => f.estado === "Aprobada").length;

  async function generar(f: LiquidacionFila) {
    setBusy(f.recepcion_id);
    const res = await crearLiquidacion(f.recepcion_id);
    setBusy(null);
    if (!res.ok || !res.id) {
      toast({ tone: "error", title: "No se pudo generar", description: res.error });
      return;
    }
    router.push(`/procesos/liquidacion/${res.id}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Liquidación / Pago"
        description="Fase 4 — confronta la calidad recibida con el contrato y liquida el valor a pagar."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Recepciones" value={filas.length} icon={Calculator} />
        <StatCard label="Por liquidar" value={pendientes} />
        <StatCard label="Por revisión" value={porRevision} />
        <StatCard label="Aprobadas" value={aprobadas} />
      </div>

      {filas.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet className="h-6 w-6" />}
          title="Sin recepciones cerradas"
          description="Las liquidaciones aparecen cuando una recepción se cierra en bodega."
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 text-left font-medium">Consecutivo</th>
                <th className="px-4 py-3 text-left font-medium">Proveedor</th>
                <th className="px-4 py-3 text-right font-medium">Valor a pagar</th>
                <th className="px-4 py-3 text-left font-medium">Liquidación</th>
                <th className="px-4 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.recepcion_id} className="border-b border-border last:border-0 hover:bg-bg-subtle/50">
                  <td className="px-4 py-3 font-mono text-xs text-fg">{f.orden_consecutivo ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-fg">{f.proveedor_nombre}</td>
                  <td className="px-4 py-3 text-right tnum text-fg">
                    {f.valor_total != null ? COP.format(f.valor_total) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {f.estado ? (
                      <Badge tone={f.estado === "Aprobada" ? "success" : "warn"}>{f.estado}</Badge>
                    ) : (
                      <Badge tone="neutral">Por liquidar</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {f.liquidacion_id ? (
                      <Button size="sm" variant="secondary" onClick={() => router.push(`/procesos/liquidacion/${f.liquidacion_id}`)}>
                        {f.estado === "Aprobada" ? "Ver" : "Continuar"} <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    ) : canWrite ? (
                      <Button size="sm" loading={busy === f.recepcion_id} onClick={() => generar(f)}>
                        <Calculator className="h-4 w-4" /> Liquidar
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
