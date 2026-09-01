import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { diccionario, normalizarIdioma } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { cargarMercado } from "./riesgo-data";
import { ultimaSync } from "@/lib/mercado/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { MercadoClient } from "./mercado-client";
import { fotoMercado } from "@/lib/mercado/foto";

export const dynamic = "force-dynamic";
// El botón de sincronizar corre en esta ruta y Barchart tarda: con el tope por
// defecto se cortaría a la mitad y dejaría el tablero incompleto sin decirlo.
export const maxDuration = 300;

export default async function MercadoPage({
  searchParams,
}: {
  searchParams: Promise<{ contrato?: string }>;
}) {
  const session = await getSessionContext();

  // Esconder el módulo del menú no es un control de acceso: la ruta se puede
  // escribir a mano. El candado real está aquí.
  if (!session?.profile?.ve_mercado) {
    // Componente de servidor: no hay hooks, así que el diccionario se resuelve
    // a mano desde el perfil que ya se cargó.
    const t = diccionario(normalizarIdioma(session?.profile?.idioma));
    return (
      <div>
        <PageHeader title={t.nav.mercado} />
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title={t.mercado.accesoRestringido}
          description={t.mercado.accesoRestringidoNota}
        />
      </div>
    );
  }

  const { contrato } = await searchParams;
  const supabase = await createClient();
  const [datos, sync] = await Promise.all([
    cargarMercado(supabase, contrato),
    ultimaSync(createAdminClient()),
  ]);
  // La foto se arma aquí, del mismo objeto que se acaba de renderizar: así el
  // analista cita exactamente las cifras que quedaron en pantalla.
  return <MercadoClient datos={datos} sync={sync} foto={fotoMercado(datos)} />;
}
