import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { InventarioCalidadClient } from "./inventario-calidad-client";
import type { InventoryQuality } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function InventarioCalidadPage() {
  const supabase = await createClient();
  await getSessionContext();

  const { data } = await supabase
    .from("inventory_quality")
    .select("*")
    .order("position", { ascending: true });

  return <InventarioCalidadClient rows={(data ?? []) as InventoryQuality[]} />;
}
