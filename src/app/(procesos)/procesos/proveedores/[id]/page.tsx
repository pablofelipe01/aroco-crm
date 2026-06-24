import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ProveedorDetalle } from "./proveedor-detalle";
import type {
  Contrato,
  Departamento,
  Proveedor,
  ProveedorDocumento,
  ProveedorEstadoLog,
} from "@/lib/types/database";

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
  const canApprove =
    session?.profile?.role === "admin" || session?.profile?.department === "Administrativo";

  const [
    { data: prov },
    { data: deptos },
    { data: munis },
    { data: docs },
    { data: contrato },
    { data: estadoLog },
    { data: cats },
  ] = await Promise.all([
    supabase.from("proveedores").select("*").eq("id", id).maybeSingle(),
    supabase.from("departamentos").select("*").order("nombre"),
    supabase.from("municipios").select("departamento, nombre").order("nombre"),
    supabase
      .from("proveedor_documentos")
      .select("*")
      .eq("proveedor_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("contratos").select("*").eq("proveedor_id", id).maybeSingle(),
    supabase
      .from("proveedor_estado_log")
      .select("*")
      .eq("proveedor_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("catalogos")
      .select("tipo, valor")
      .eq("activo", true)
      .order("orden", { ascending: true }),
  ]);
  if (!prov) notFound();

  const catOf = (tipo: string) =>
    (cats ?? []).filter((c) => c.tipo === tipo).map((c) => c.valor);

  return (
    <ProveedorDetalle
      proveedor={prov as Proveedor}
      departamentos={(deptos ?? []) as Departamento[]}
      municipios={(munis ?? []) as { departamento: string; nombre: string }[]}
      documentos={(docs ?? []) as ProveedorDocumento[]}
      contrato={(contrato ?? null) as Contrato | null}
      estadoLog={(estadoLog ?? []) as ProveedorEstadoLog[]}
      canWrite={canWrite}
      canApprove={canApprove}
      certOpts={catOf("certificacion")}
      selloOpts={catOf("sello")}
    />
  );
}
