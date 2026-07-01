import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ComisionesClient } from "./comisiones-client";
import { MonthlyTonnage } from "./monthly-tonnage";
import { OcComisiones, type OcComisionRow } from "./oc-comisiones";
import type { CommissionRule, MonthlyTonnage as MonthlyTonnageRow, TeamMember } from "@/lib/types/database";
import type { CommissionRole } from "@/lib/calc/comisiones";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Financiero", "Comercial"];

export default async function ComisionesPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const canWrite =
    session?.profile?.role === "admin" ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));
  const canEditRules =
    session?.profile?.role === "admin" ||
    session?.profile?.department === "Financiero";
  // The tonnage board is a Financiero/admin tool.
  const canEditTonnage =
    session?.profile?.role === "admin" ||
    session?.profile?.department === "Financiero";
  // Commission history (who participated per OC) is restricted to admins and
  // area heads. "Jefe de área" isn't modeled yet, so we approximate with
  // admin + Financiero (the area that owns commissions).
  const canSeeHistory =
    session?.profile?.role === "admin" ||
    session?.profile?.department === "Financiero";

  const [{ data: rules }, { data: team }, { data: tonnage }, { data: ocComerciales }] =
    await Promise.all([
      supabase.from("commission_rules").select("*").order("market").order("level"),
      supabase.from("team_members").select("*").eq("active", true).order("name"),
      supabase.from("monthly_tonnage").select("*").order("period", { ascending: false }),
      canSeeHistory
        ? supabase
            .from("oc_comerciales")
            .select(
              "orden_id, rol, team_members(name), ordenes_compra(consecutivo, valor_total, estado, created_at, proveedores(nombre))",
            )
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as never[] }),
    ]);

  // Group commercial participation by purchase order.
  const ocRows: OcComisionRow[] = [];
  if (canSeeHistory) {
    const raw = (ocComerciales ?? []) as unknown as {
      orden_id: string;
      rol: CommissionRole;
      team_members: { name?: string } | null;
      ordenes_compra: {
        consecutivo: string | null;
        valor_total: number | null;
        estado: string;
        proveedores: { nombre?: string } | null;
      } | null;
    }[];
    const byOrden = new Map<string, OcComisionRow>();
    for (const c of raw) {
      const oc = c.ordenes_compra;
      if (!oc) continue;
      let row = byOrden.get(c.orden_id);
      if (!row) {
        row = {
          ordenId: c.orden_id,
          consecutivo: oc.consecutivo,
          proveedor: oc.proveedores?.nombre ?? "—",
          valorTotal: oc.valor_total,
          estado: oc.estado,
          participantes: [],
        };
        byOrden.set(c.orden_id, row);
        ocRows.push(row);
      }
      row.participantes.push({
        nombre: c.team_members?.name ?? "—",
        rol: c.rol,
      });
    }
  }

  return (
    <div className="space-y-8">
      <ComisionesClient
        rules={(rules ?? []) as CommissionRule[]}
        team={(team ?? []) as TeamMember[]}
        canWrite={canWrite}
        canEditRules={canEditRules}
      />
      {canSeeHistory && <OcComisiones rows={ocRows} />}
      <MonthlyTonnage
        team={(team ?? []) as TeamMember[]}
        records={(tonnage ?? []) as MonthlyTonnageRow[]}
        canWrite={canEditTonnage}
      />
    </div>
  );
}
