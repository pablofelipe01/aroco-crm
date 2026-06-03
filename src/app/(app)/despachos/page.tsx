import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { DespachosClient } from "./despachos-client";
import type { Dispatch, InventoryLot, Lead } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type DispatchWithLinks = Dispatch & {
  lot: Pick<InventoryLot, "id" | "code"> | null;
  lead: Pick<Lead, "id" | "company"> | null;
};

const WRITE_DEPTS = ["Bodega Central", "Comercial"];

export default async function DespachosPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const canWrite =
    session?.profile?.role === "admin" ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));

  const [{ data: dispatches }, { data: lots }, { data: leads }] = await Promise.all([
    supabase
      .from("dispatches")
      .select(
        "*, lot:inventory_lots!dispatches_lot_id_fkey(id,code), lead:leads!dispatches_lead_id_fkey(id,company)",
      )
      .order("dispatch_date", { ascending: false }),
    supabase
      .from("inventory_lots")
      .select("id,code,qty_available_kg")
      .order("code"),
    supabase.from("leads").select("id,company").order("company"),
  ]);

  return (
    <DespachosClient
      initialDispatches={(dispatches ?? []) as unknown as DispatchWithLinks[]}
      lots={(lots ?? []) as { id: string; code: string; qty_available_kg: number }[]}
      leads={(leads ?? []) as { id: string; company: string }[]}
      canWrite={canWrite}
    />
  );
}
