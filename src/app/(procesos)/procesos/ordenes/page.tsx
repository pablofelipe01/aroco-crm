import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { OrdenesClient } from "./ordenes-client";
import type { OcCaso, OcEstado } from "@/lib/procesos/oc-opts";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Comercial", "Administrativo"];

export type OrdenLista = {
  id: string;
  consecutivo: string | null;
  estado: OcEstado;
  tipo_caso: OcCaso;
  volumen_kg: number | null;
  precio_kg: number | null;
  valor_total: number | null;
  fecha_entrega: string | null;
  created_at: string;
  proveedor_nombre: string;
};

export type ProveedorHabilitado = { id: string; nombre: string; programa: string | null };

export default async function OrdenesPage() {
  const supabase = await createClient();
  const session = await getSessionContext();
  const dep = session?.profile?.department ?? null;
  const canWrite = session?.profile?.role === "admin" || (dep != null && WRITE_DEPTS.includes(dep));
  const canApprove = canWrite; // Gerencia Comercial / Administrativa

  const [{ data: ordenes }, { data: provs }] = await Promise.all([
    supabase
      .from("ordenes_compra")
      .select(
        "id, consecutivo, estado, tipo_caso, volumen_kg, precio_kg, valor_total, fecha_entrega, created_at, proveedores(nombre)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("proveedores")
      .select("id, nombre, programa")
      .eq("estado", "Habilitado")
      .order("nombre"),
  ]);

  const lista: OrdenLista[] = (ordenes ?? []).map((o) => ({
    id: o.id,
    consecutivo: o.consecutivo,
    estado: o.estado,
    tipo_caso: o.tipo_caso,
    volumen_kg: o.volumen_kg,
    precio_kg: o.precio_kg,
    valor_total: o.valor_total,
    fecha_entrega: o.fecha_entrega,
    created_at: o.created_at,
    proveedor_nombre: (o.proveedores as unknown as { nombre?: string } | null)?.nombre ?? "—",
  }));

  return (
    <OrdenesClient
      ordenes={lista}
      proveedores={(provs ?? []) as ProveedorHabilitado[]}
      canWrite={canWrite}
      canApprove={canApprove}
    />
  );
}
