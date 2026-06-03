import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { PreciosClient } from "./precios-client";
import type { PriceHistory } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Financiero", "Comercial"];

export default async function PreciosPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const canWrite =
    session?.profile?.role === "admin" ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));

  const { data: prices } = await supabase
    .from("price_history")
    .select("*")
    .order("date", { ascending: true });

  return (
    <PreciosClient
      prices={(prices ?? []) as PriceHistory[]}
      canWrite={canWrite}
    />
  );
}
