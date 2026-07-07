import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { InventarioCalidadClient } from "./inventario-calidad-client";
import type { InventoryQuality } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Bodega Central", "Administrativo", "Operaciones"];

export default async function InventarioCalidadPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const canWrite =
    session?.profile?.role === "admin" ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));

  const { data } = await supabase
    .from("inventory_quality")
    .select("*")
    .order("position", { ascending: true });

  return (
    <InventarioCalidadClient
      rows={(data ?? []) as InventoryQuality[]}
      canWrite={canWrite}
    />
  );
}
