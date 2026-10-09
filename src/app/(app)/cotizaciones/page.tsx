import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { precioEnVivo } from "@/lib/mercado/precio";
import { parametrosDesdeFilas } from "@/lib/cotizador-parametros";
import { CotizacionesClient } from "./cotizaciones-client";
import type { Quote, Lead, CotizadorParametro } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type QuoteWithLead = Quote & {
  lead: Pick<Lead, "id" | "company"> | null;
};

/** Precio del cacao y TRM con que arranca una cotización nueva. */
export type ReferenciasMercado = {
  cocoaUsdT: number | null;
  cocoaFecha: string | null;
  cocoaEnVivo: boolean;
  trm: number | null;
  trmFecha: string | null;
};

const WRITE_DEPTS = ["Comercial", "Financiero"];

export default async function CotizacionesPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const isAdmin = session?.profile?.role === "admin";
  const canWrite =
    isAdmin ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));

  const [{ data: quotes }, { data: leads }, { data: filas }, { data: refs }, vivo] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("*, lead:leads!quotes_lead_id_fkey(id,company)")
        .order("created_at", { ascending: false }),
      supabase.from("leads").select("id,company,market").order("company"),
      supabase.from("cotizador_parametros").select("*").order("orden"),
      // market_data/trm_data son solo de Mercado; esta función expone solo el
      // último precio y la última TRM.
      supabase.rpc("cotizador_referencias"),
      // Corto: si ICE no responde, se usa el cierre guardado por el sync.
      precioEnVivo(2500).catch(() => null),
    ]);

  const ref = refs?.[0];
  const referencias: ReferenciasMercado = {
    cocoaUsdT: vivo?.usdT ?? (ref?.cocoa_usd_t != null ? Number(ref.cocoa_usd_t) : null),
    cocoaFecha: vivo?.fecha ?? ref?.cocoa_fecha ?? null,
    cocoaEnVivo: vivo != null,
    trm: ref?.trm != null ? Number(ref.trm) : null,
    trmFecha: ref?.trm_fecha ?? null,
  };

  return (
    <CotizacionesClient
      initialQuotes={(quotes ?? []) as unknown as QuoteWithLead[]}
      leads={
        (leads ?? []) as { id: string; company: string; market: string | null }[]
      }
      canWrite={canWrite}
      isAdmin={isAdmin}
      parametros={parametrosDesdeFilas(filas)}
      filasParametros={(filas ?? []) as CotizadorParametro[]}
      referencias={referencias}
    />
  );
}
