import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { AprobacionesClient } from "./aprobaciones-client";
import type { Proveedor } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type ProveedorPendiente = Pick<
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
  | "created_at"
>;

export default async function AprobacionesPage() {
  const session = await getSessionContext();
  const canApprove =
    session?.profile?.role === "admin" ||
    session?.profile?.department === "Administrativo";
  if (!canApprove) redirect("/procesos/proveedores");

  const supabase = await createClient();
  const { data } = await supabase
    .from("proveedores")
    .select(
      "id, codigo, nombre, tipo_proveedor, departamento, municipio, asociacion, celular, numero_documento, estado, created_at",
    )
    .eq("estado", "En estudio")
    .order("created_at", { ascending: true });

  return <AprobacionesClient pendientes={(data ?? []) as ProveedorPendiente[]} />;
}
