import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardList } from "lucide-react";
import type { CommissionRole } from "@/lib/calc/comisiones";

export type OcComisionRow = {
  ordenId: string;
  consecutivo: string | null;
  proveedor: string;
  valorTotal: number | null;
  estado: string;
  participantes: { nombre: string; rol: CommissionRole }[];
};

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const ROL_LABEL: Record<CommissionRole, string> = {
  "Solo Compra": "Compra",
  "Solo Venta": "Venta",
  "Compra+Venta": "Compra y venta",
};
const ROL_TONE: Record<CommissionRole, "info" | "success" | "accent"> = {
  "Solo Compra": "info",
  "Solo Venta": "success",
  "Compra+Venta": "accent",
};

/**
 * Historial de participación comercial por orden de compra — fuente única de
 * quién participó en cada operación (compra / venta). Solo visible para
 * administradores y jefes de área. Los montos en pesos se calculan aún en el
 * simulador (requieren el lado de la venta); aquí se consolida la participación.
 */
export function OcComisiones({ rows }: { rows: OcComisionRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-accent" /> Participación por orden de compra
        </CardTitle>
        <span className="text-xs text-fg-subtle">Fuente única (BD) · solo admin/jefes</span>
      </CardHeader>
      <CardBody>
        {rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title="Sin comerciales registrados en órdenes"
            description="Registra los comerciales participantes desde cada orden de compra en Procesos."
          />
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-3 text-left font-medium">Orden</th>
                  <th className="px-4 py-3 text-left font-medium">Proveedor</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                  <th className="px-4 py-3 text-left font-medium">Comerciales</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ordenId} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-fg">
                      {r.consecutivo ?? "Borrador"}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{r.proveedor}</td>
                    <td className="px-4 py-3 text-right font-mono tnum text-fg">
                      {r.valorTotal ? COP.format(r.valorTotal) : "—"}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{r.estado}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {r.participantes.map((p, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs"
                          >
                            {p.nombre}
                            <Badge tone={ROL_TONE[p.rol]}>{ROL_LABEL[p.rol]}</Badge>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
