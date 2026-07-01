import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { OrdenDetalle } from "./orden-detalle";
import type { OrdenCompra } from "@/lib/types/database";
import type { CommissionRole } from "@/lib/calc/comisiones";
import type { ProveedorHabilitado } from "../page";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Comercial", "Administrativo"];

export type ComercialOpcion = { id: string; name: string };
export type ComercialParticipante = {
  id: string;
  comercialId: string;
  nombre: string;
  rol: CommissionRole;
};

export default async function OrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const session = await getSessionContext();
  const dep = session?.profile?.department ?? null;
  const canWrite = session?.profile?.role === "admin" || (dep != null && WRITE_DEPTS.includes(dep));

  const [{ data: oc }, { data: provs }, { data: team }, { data: comerciales }] =
    await Promise.all([
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
      supabase.from("team_members").select("id, name").eq("active", true).order("name"),
      supabase
        .from("oc_comerciales")
        .select("id, comercial_id, rol, team_members(name)")
        .eq("orden_id", id)
        .order("created_at"),
    ]);
  if (!oc) notFound();

  const ocRow = oc as unknown as OrdenCompra & {
    proveedores: { id: string; nombre: string } | null;
  };
  const prov = ocRow.proveedores;

  const participantes: ComercialParticipante[] = (comerciales ?? []).map((c) => ({
    id: c.id,
    comercialId: c.comercial_id,
    nombre: (c.team_members as unknown as { name?: string } | null)?.name ?? "—",
    rol: c.rol,
  }));

  return (
    <OrdenDetalle
      orden={ocRow}
      proveedorNombre={prov?.nombre ?? "—"}
      proveedorId={prov?.id ?? null}
      proveedores={(provs ?? []) as ProveedorHabilitado[]}
      team={(team ?? []) as ComercialOpcion[]}
      participantes={participantes}
      canWrite={canWrite}
      canApprove={canWrite}
    />
  );
}
