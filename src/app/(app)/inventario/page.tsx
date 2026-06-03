import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { InventarioClient } from "./inventario-client";
import type { InventoryLot } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Bodega Central", "Administrativo"];

export default async function InventarioPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const canWrite =
    session?.profile?.role === "admin" ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));

  const { data: lots } = await supabase
    .from("inventory_lots")
    .select("*")
    .order("entry_date", { ascending: false, nullsFirst: false });

  return (
    <InventarioClient
      initialLots={(lots ?? []) as InventoryLot[]}
      canWrite={canWrite}
    />
  );
}
