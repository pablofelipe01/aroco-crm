import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { proveedorEnSesion } from "@/lib/proveedor-sesion";
import { PanelProveedor } from "./panel";
import { VistaEquipo } from "./vista-equipo";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const prov = await proveedorEnSesion();

  if (!prov) {
    // Alguien del equipo entrando a mirar el portal. Rebotarlo al login sería
    // mandarlo a una puerta que no es la suya: ya tiene sesión y no va a poder
    // entrar por ahí. Se le explica qué es esto y se le da el enlace que hay
    // que enviarle a los proveedores.
    const session = await getSessionContext();
    if (session?.profile) return <VistaEquipo nombre={session.profile.full_name} />;
    redirect("/portal/login");
  }

  const supabase = await createClient();
  const [{ data: ficha }, { data: documentos }, { data: cuentas }, { data: solicitudes }] =
    await Promise.all([
      supabase.from("proveedores_insumos").select("*").eq("id", prov.id).single(),
      supabase
        .from("proveedor_insumo_documentos")
        .select("*")
        .eq("proveedor_id", prov.id)
        .order("subido_en", { ascending: false }),
      supabase
        .from("cuentas_cobro")
        .select("*, cuenta_cobro_items(*)")
        .eq("proveedor_id", prov.id)
        .order("created_at", { ascending: false }),
      // Solo las aprobadas: cobrar contra una solicitud que aún no se decide
      // adelantaría un pago que nadie autorizó.
      supabase
        .from("compra_solicitudes")
        .select("id, consecutivo, titulo")
        .eq("estado", "Aprobada")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  return (
    <PanelProveedor
      ficha={ficha!}
      documentos={documentos ?? []}
      cuentas={(cuentas ?? []) as never}
      solicitudes={solicitudes ?? []}
    />
  );
}
