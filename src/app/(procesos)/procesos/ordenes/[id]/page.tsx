import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { OrdenDetalle } from "./orden-detalle";
import type { OrdenCompra } from "@/lib/types/database";
import type { ProveedorHabilitado } from "../page";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Comercial", "Administrativo"];

export default async function OrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const session = await getSessionContext();
  const dep = session?.profile?.department ?? null;
  const canWrite = session?.profile?.role === "admin" || (dep != null && WRITE_DEPTS.includes(dep));

  const [{ data: oc }, { data: provs }] = await Promise.all([
    supabase
      .from("ordenes_compra")
      .select("*, proveedores(id, nombre, programa)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("proveedores")
      .select("id, nombre, programa")
      .eq("estado", "Habilitado")
      .order("nombre"),
  ]);
  if (!oc) notFound();

  const ocRow = oc as unknown as OrdenCompra & {
    proveedores: { id: string; nombre: string } | null;
  };
  const prov = ocRow.proveedores;

  return (
    <OrdenDetalle
      orden={ocRow}
      proveedorNombre={prov?.nombre ?? "—"}
      proveedorId={prov?.id ?? null}
      proveedores={(provs ?? []) as ProveedorHabilitado[]}
      canWrite={canWrite}
      canApprove={canWrite}
    />
  );
}
