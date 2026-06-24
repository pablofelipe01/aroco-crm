import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ProveedorDetalle } from "./proveedor-detalle";
import type { Contrato, Departamento, Proveedor, ProveedorDocumento } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Comercial"];

export default async function ProveedorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const session = await getSessionContext();
  const canWrite =
    session?.profile?.role === "admin" ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));

  const [{ data: prov }, { data: deptos }, { data: munis }, { data: docs }, { data: contrato }] =
    await Promise.all([
      supabase.from("proveedores").select("*").eq("id", id).maybeSingle(),
      supabase.from("departamentos").select("*").order("nombre"),
      supabase.from("municipios").select("departamento, nombre").order("nombre"),
      supabase
        .from("proveedor_documentos")
        .select("*")
        .eq("proveedor_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("contratos").select("*").eq("proveedor_id", id).maybeSingle(),
    ]);
  if (!prov) notFound();

  return (
    <ProveedorDetalle
      proveedor={prov as Proveedor}
      departamentos={(deptos ?? []) as Departamento[]}
      municipios={(munis ?? []) as { departamento: string; nombre: string }[]}
      documentos={(docs ?? []) as ProveedorDocumento[]}
      contrato={(contrato ?? null) as Contrato | null}
      canWrite={canWrite}
    />
  );
}
