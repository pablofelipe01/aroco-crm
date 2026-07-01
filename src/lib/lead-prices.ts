import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getMarketData } from "@/lib/market";
import type { ReferencePrices } from "@/lib/calc/lead-value";

/**
 * Precios de referencia actuales para valorar leads (COP/kg):
 *   Luker → última cotización de "CASA LUKER" (excluye la variante Alto Cadmio).
 *   ICE   → cacao internacional convertido: cocoa(USD/T) × TRM ÷ 1000.
 */
export async function getReferencePrices(): Promise<ReferencePrices> {
  const supabase = await createClient();
  const [{ data: luker }, market] = await Promise.all([
    supabase
      .from("price_history")
      .select("price_cop_kg")
      .ilike("company", "%luker%")
      .not("company", "ilike", "%alto%")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getMarketData(),
  ]);

  const ice =
    market.cocoaUsdT != null && market.trm != null
      ? (market.cocoaUsdT * market.trm) / 1000
      : null;

  return {
    luker: luker?.price_cop_kg != null ? Number(luker.price_cop_kg) : null,
    ice,
  };
}
