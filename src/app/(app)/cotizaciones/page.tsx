import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { CotizacionesClient } from "./cotizaciones-client";
import type { Quote, Lead } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type QuoteWithLead = Quote & {
  lead: Pick<Lead, "id" | "company"> | null;
};

const WRITE_DEPTS = ["Comercial", "Financiero"];

export default async function CotizacionesPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const canWrite =
    session?.profile?.role === "admin" ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));

  const [{ data: quotes }, { data: leads }] = await Promise.all([
    supabase
      .from("quotes")
      .select("*, lead:leads!quotes_lead_id_fkey(id,company)")
      .order("created_at", { ascending: false }),
    supabase.from("leads").select("id,company,market").order("company"),
  ]);

  return (
    <CotizacionesClient
      initialQuotes={(quotes ?? []) as unknown as QuoteWithLead[]}
      leads={
        (leads ?? []) as { id: string; company: string; market: string | null }[]
      }
      canWrite={canWrite}
    />
  );
}
