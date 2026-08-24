import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { construirPosicion, type LoteRow } from "@/lib/posicion";
import { MercadoClient } from "./mercado-client";

export const dynamic = "force-dynamic";

export default async function MercadoPage() {
  const session = await getSessionContext();

  // Esconder el módulo del menú no es un control de acceso: la ruta se puede
  // escribir a mano. El candado real está aquí.
  if (!session?.profile?.ve_mercado) {
    return (
      <div>
        <PageHeader title="Mercado" />
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="Acceso restringido"
          description="Posiciones, cobertura y P&L solo los ve quien tiene el permiso de Mercado."
        />
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_lots")
    .select(
      "code, remision, recepcion, odc, entry_date, origin, qty_in_kg, qty_out_kg, purchase_price_cop_kg, quality",
    )
    .order("entry_date", { ascending: false, nullsFirst: false });

  return (
    <MercadoClient
      posicion={construirPosicion((data ?? []) as LoteRow[], new Date())}
      error={error?.message ?? null}
    />
  );
}
