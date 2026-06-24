import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { RecepcionDetalle } from "./recepcion-detalle";
import type { Recepcion, RecepcionFoto } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Bodega Central", "Dirección", "Administrativo"];

export default async function RecepcionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const session = await getSessionContext();
  const dep = session?.profile?.department ?? null;
  const canWrite = session?.profile?.role === "admin" || (dep != null && WRITE_DEPTS.includes(dep));

  const [{ data: rec }, { data: fotos }] = await Promise.all([
    supabase
      .from("recepciones")
      .select("*, ordenes_compra(id, consecutivo, volumen_kg, precio_kg, proveedores(nombre))")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("recepcion_fotos")
      .select("*")
      .eq("recepcion_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!rec) notFound();

  const oc = (rec.ordenes_compra ?? null) as unknown as {
    id: string;
    consecutivo: string | null;
    volumen_kg: number | null;
    precio_kg: number | null;
    proveedores: { nombre?: string } | null;
  } | null;

  return (
    <RecepcionDetalle
      recepcion={rec as unknown as Recepcion}
      fotos={(fotos ?? []) as RecepcionFoto[]}
      ordenId={oc?.id ?? null}
      consecutivo={oc?.consecutivo ?? null}
      proveedorNombre={oc?.proveedores?.nombre ?? "—"}
      precioKg={oc?.precio_kg ?? null}
      canWrite={canWrite}
    />
  );
}
