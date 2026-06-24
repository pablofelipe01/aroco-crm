import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { RecepcionClient } from "./recepcion-client";
import type { RecepcionEstado } from "@/lib/procesos/recepcion-opts";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Bodega Central", "Dirección", "Administrativo"];

export type RecepcionFila = {
  orden_id: string;
  consecutivo: string | null;
  proveedor_nombre: string;
  volumen_kg: number | null;
  emitida_en: string | null;
  recepcion_id: string | null;
  recepcion_estado: RecepcionEstado | null;
  peso_recibido_kg: number | null;
};

export default async function RecepcionPage() {
  const supabase = await createClient();
  const session = await getSessionContext();
  const dep = session?.profile?.department ?? null;
  const canWrite = session?.profile?.role === "admin" || (dep != null && WRITE_DEPTS.includes(dep));

  const [{ data: ocs }, { data: recs }] = await Promise.all([
    supabase
      .from("ordenes_compra")
      .select("id, consecutivo, volumen_kg, emitida_en, proveedores(nombre)")
      .eq("estado", "Emitida")
      .order("emitida_en", { ascending: false }),
    supabase.from("recepciones").select("id, orden_id, estado, peso_recibido_kg"),
  ]);

  const recByOrden = new Map(
    (recs ?? []).map((r) => [r.orden_id, r] as const),
  );

  const filas: RecepcionFila[] = (ocs ?? []).map((o) => {
    const r = recByOrden.get(o.id);
    return {
      orden_id: o.id,
      consecutivo: o.consecutivo,
      proveedor_nombre: (o.proveedores as unknown as { nombre?: string } | null)?.nombre ?? "—",
      volumen_kg: o.volumen_kg,
      emitida_en: o.emitida_en,
      recepcion_id: r?.id ?? null,
      recepcion_estado: (r?.estado as RecepcionEstado | undefined) ?? null,
      peso_recibido_kg: r?.peso_recibido_kg ?? null,
    };
  });

  return <RecepcionClient filas={filas} canWrite={canWrite} />;
}
