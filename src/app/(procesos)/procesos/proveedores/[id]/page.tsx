import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ProveedorDetalle } from "./proveedor-detalle";
import type { Departamento, Proveedor } from "@/lib/types/database";

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

  const [{ data: prov }, { data: deptos }, { data: munis }] = await Promise.all([
    supabase.from("proveedores").select("*").eq("id", id).maybeSingle(),
    supabase.from("departamentos").select("*").order("nombre"),
    supabase.from("municipios").select("departamento, nombre").order("nombre"),
  ]);
  if (!prov) notFound();

  return (
    <ProveedorDetalle
      proveedor={prov as Proveedor}
      departamentos={(deptos ?? []) as Departamento[]}
      municipios={(munis ?? []) as { departamento: string; nombre: string }[]}
      canWrite={canWrite}
    />
  );
}
