import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { LiquidacionClient } from "./liquidacion-client";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Administrativo", "Dirección"];

export type LiquidacionFila = {
  recepcion_id: string;
  orden_consecutivo: string | null;
  proveedor_nombre: string;
  liquidacion_id: string | null;
  estado: string | null;
  valor_total: number | null;
};

export default async function LiquidacionPage() {
  const supabase = await createClient();
  const session = await getSessionContext();
  const dep = session?.profile?.department ?? null;
  const canWrite = session?.profile?.role === "admin" || (dep != null && WRITE_DEPTS.includes(dep));

  const [{ data: recs }, { data: liqs }] = await Promise.all([
    supabase
      .from("recepciones")
      .select("id, ordenes_compra(consecutivo, proveedores(nombre))")
      .eq("estado", "Cerrada")
      .order("cerrada_en", { ascending: false }),
    supabase.from("liquidaciones").select("id, recepcion_id, estado, valor_total"),
  ]);

  const liqByRec = new Map((liqs ?? []).map((l) => [l.recepcion_id, l] as const));

  const filas: LiquidacionFila[] = (recs ?? []).map((r) => {
    const oc = r.ordenes_compra as unknown as {
      consecutivo: string | null;
      proveedores: { nombre?: string } | null;
    } | null;
    const l = liqByRec.get(r.id);
    return {
      recepcion_id: r.id,
      orden_consecutivo: oc?.consecutivo ?? null,
      proveedor_nombre: oc?.proveedores?.nombre ?? "—",
      liquidacion_id: l?.id ?? null,
      estado: l?.estado ?? null,
      valor_total: l?.valor_total ?? null,
    };
  });

  return <LiquidacionClient filas={filas} canWrite={canWrite} />;
}
