import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { LiquidacionDetalle } from "./liquidacion-detalle";
import type { Liquidacion } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Administrativo", "Dirección"];

export default async function LiquidacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const session = await getSessionContext();
  const dep = session?.profile?.department ?? null;
  const canWrite = session?.profile?.role === "admin" || (dep != null && WRITE_DEPTS.includes(dep));

  const { data: liq } = await supabase
    .from("liquidaciones")
    .select("*, ordenes_compra(id, consecutivo, proveedores(nombre))")
    .eq("id", id)
    .maybeSingle();
  if (!liq) notFound();

  const oc = (liq.ordenes_compra ?? null) as unknown as {
    id: string;
    consecutivo: string | null;
    proveedores: { nombre?: string } | null;
  } | null;

  return (
    <LiquidacionDetalle
      liquidacion={liq as unknown as Liquidacion}
      ordenId={oc?.id ?? null}
      consecutivo={oc?.consecutivo ?? null}
      proveedorNombre={oc?.proveedores?.nombre ?? "—"}
      canWrite={canWrite}
    />
  );
}
