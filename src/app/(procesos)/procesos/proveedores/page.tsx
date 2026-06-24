import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ProveedoresClient } from "./proveedores-client";
import type { Departamento, Proveedor } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Comercial"];

export type ProveedorLista = Pick<
  Proveedor,
  | "id"
  | "codigo"
  | "nombre"
  | "tipo_proveedor"
  | "departamento"
  | "municipio"
  | "asociacion"
  | "celular"
  | "numero_documento"
  | "estado"
>;

export default async function ProveedoresPage() {
  const supabase = await createClient();
  const session = await getSessionContext();
  const canWrite =
    session?.profile?.role === "admin" ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));
  const canApprove =
    session?.profile?.role === "admin" ||
    session?.profile?.department === "Administrativo";

  const [{ data: provs }, { data: deptos }, { data: munis }, { data: cats }] =
    await Promise.all([
      supabase
        .from("proveedores")
        .select(
          "id, codigo, nombre, tipo_proveedor, departamento, municipio, asociacion, celular, numero_documento, estado",
        )
        .order("nombre", { ascending: true }),
      supabase.from("departamentos").select("*").order("nombre"),
      supabase.from("municipios").select("departamento, nombre").order("nombre"),
      supabase
        .from("catalogos")
        .select("tipo, valor")
        .eq("activo", true)
        .order("orden", { ascending: true }),
    ]);

  const catOf = (tipo: string) =>
    (cats ?? []).filter((c) => c.tipo === tipo).map((c) => c.valor);

  return (
    <ProveedoresClient
      proveedores={(provs ?? []) as ProveedorLista[]}
      departamentos={(deptos ?? []) as Departamento[]}
      municipios={(munis ?? []) as { departamento: string; nombre: string }[]}
      canWrite={canWrite}
      canApprove={canApprove}
      certOpts={catOf("certificacion")}
      selloOpts={catOf("sello")}
    />
  );
}
