import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { proveedorEnSesion } from "@/lib/proveedor-sesion";
import { PanelProveedor } from "./panel";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const prov = await proveedorEnSesion();
  if (!prov) redirect("/portal/login");

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
