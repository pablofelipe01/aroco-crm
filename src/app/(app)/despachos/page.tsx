import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { DespachosClient } from "./despachos-client";
import { disponibleDeClases } from "@/lib/inventory/carga";
import { formatNumber } from "@/lib/utils";
import type { Dispatch, InventoryLot, Lead } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type DispatchWithLinks = Dispatch & {
  lot: Pick<InventoryLot, "id" | "code"> | null;
  lead: Pick<Lead, "id" | "company"> | null;
  /** El lote del archivo del que salió: de ahí sale la bodega. */
  origen: Pick<InventoryLot, "id" | "bodega"> | null;
};

const WRITE_DEPTS = ["Bodega Central", "Comercial", "Operaciones"];

export default async function DespachosPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const canWrite =
    session?.profile?.role === "admin" ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));

  const [{ data: dispatches }, { data: lots }, { data: cfg }] = await Promise.all([
    supabase
      .from("dispatches")
      .select(
        "*, lot:inventory_lots!dispatches_lot_id_fkey(id,code), lead:leads!dispatches_lead_id_fkey(id,company), origen:inventory_lots!dispatches_lote_origen_id_fkey(id,bodega)",
      )
      .order("dispatch_date", { ascending: false }),
    supabase
      .from("inventory_lots")
      .select("*")
      .eq("source", "crm")
      .gt("qty_available_kg", 0)
      .order("entry_date", { ascending: false }),
    supabase.from("inventario_config").select("fuente").maybeSingle(),
  ]);

  return (
    <DespachosClient
      initialDispatches={(dispatches ?? []) as unknown as DispatchWithLinks[]}
      lotesConSaldo={(lots ?? []).map((l) => ({
        id: l.id,
        nombre: `${l.codigo_nuevo ?? l.code} · ${formatNumber(Number(l.qty_available_kg), 1)} kg`,
        bodega: l.bodega,
        disponible: disponibleDeClases(l),
      }))}
      canWrite={canWrite}
      modoCrm={cfg?.fuente === "crm"}
    />
  );
}
