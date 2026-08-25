import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { cargarMercado } from "./riesgo-data";
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
  return <MercadoClient datos={await cargarMercado(supabase)} />;
}
