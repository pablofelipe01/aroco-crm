import { Boxes, Sprout, Truck, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatKg, formatCOP, formatDate } from "@/lib/utils";
import type { InventoryQuality } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const kg = (v: number) => (v > 0 ? formatKg(v) : "—");

export default async function InventarioCalidadPage() {
  const supabase = await createClient();
  await getSessionContext();

  const { data } = await supabase
    .from("inventory_quality")
    .select("*")
    .order("position", { ascending: true });
  const rows = (data ?? []) as InventoryQuality[];

  const sum = (k: keyof InventoryQuality) =>
    rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const enBodega = sum("en_bodega_kg");
  const porLlegar = sum("por_llegar_kg");
  const premium = sum("qty_premium_kg");
  const syncedAt = rows[0]?.synced_at ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario por calidad"
        description="Stock actual por procedencia, ubicación y calidad — sincronizado a diario desde la hoja."
        actions={
          syncedAt && (
            <Badge tone="neutral">Actualizado {formatDate(syncedAt)}</Badge>
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="Sin datos sincronizados"
          description="Aún no se ha cargado el inventario por calidad desde la hoja."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="En bodega" value={enBodega} suffix=" kg" icon={Boxes} hint={`${rows.length} lotes`} />
            <StatCard label="Premium" value={premium} suffix=" kg" icon={Sprout} />
            <StatCard
              label="Por llegar"
              value={porLlegar}
              suffix=" kg"
              icon={Truck}
            />
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
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-bg-subtle/50">
                      <td className="px-4 py-3 font-medium text-fg">{r.procedencia}</td>
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
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium text-fg">
                    <td className="px-4 py-3 text-xs uppercase tracking-wide text-fg-subtle" colSpan={3}>
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
                  </tr>
                </tfoot>
              </table>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
