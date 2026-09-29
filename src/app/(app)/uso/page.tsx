import { AlertTriangle, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { diccionario, normalizarIdioma } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { usoCrmSchema } from "@/lib/uso";
import { UsoClient } from "./uso-client";

export const dynamic = "force-dynamic";

/** Semanas que se muestran. La función acepta hasta 26. */
const SEMANAS = 12;

export default async function UsoPage() {
  const session = await getSessionContext();
  const t = diccionario(normalizarIdioma(session?.profile?.idioma));

  // Esconderlo del menú no es control de acceso: la ruta se puede escribir a
  // mano. Este es el primer candado; el segundo es uso_crm(), que se niega a
  // responder sin el permiso aunque alguien llame la función directo.
  if (!session?.profile?.ve_uso) {
    return (
      <div>
        <PageHeader title={t.uso.titulo} />
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title={t.uso.accesoRestringido}
          description={t.uso.accesoRestringidoNota}
        />
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("uso_crm", { p_semanas: SEMANAS });
  const parsed = error ? null : usoCrmSchema.safeParse(data);

  if (!parsed?.success) {
    return (
      <div>
        <PageHeader title={t.uso.titulo} description={t.uso.descripcion} />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title={t.uso.errorCarga}
          description={error?.message ?? parsed?.error.issues[0]?.message}
        />
      </div>
    );
  }

  return <UsoClient datos={parsed.data} />;
}
