import { createClient } from "@/lib/supabase/server";
import { todas } from "@/lib/supabase/todas";
import { getSessionContext } from "@/lib/auth";
import { getInternationalSeries } from "@/lib/market";
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

  // Más de 1000 filas: sin paginar, PostgREST cortaba las fechas recientes.
  const prices = await todas<PriceHistory>((a, b) =>
    supabase
      .from("price_history")
      .select("*")
      .order("date", { ascending: true })
      .order("company", { ascending: true })
      .range(a, b),
  );

  // International cocoa converted to COP/kg for the same dates we have nationally.
  const dates = [...new Set(prices.map((p) => p.date))];
  const international = await getInternationalSeries(dates);

  return (
    <PreciosClient
      prices={prices}
      international={international}
      canWrite={canWrite}
    />
  );
}
