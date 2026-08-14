import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ComprasClient } from "./compras-client";
import type { CompraSolicitud, CompraCotizacion } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type SolicitudConCotizaciones = CompraSolicitud & {
  compra_cotizaciones: CompraCotizacion[];
  /** Nombres resueltos, para no cargar el perfil en cada fila del listado. */
  autor: string | null;
  decidio: string | null;
};

export default async function ComprasPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const [{ data: solicitudes }, { data: perfiles }] = await Promise.all([
    supabase
      .from("compra_solicitudes")
      .select("*, compra_cotizaciones(*)")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("active", true),
  ]);

  const nombre = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]));

  const filas: SolicitudConCotizaciones[] = (
    (solicitudes ?? []) as unknown as (CompraSolicitud & {
      compra_cotizaciones: CompraCotizacion[];
    })[]
  ).map((s) => ({
    ...s,
    // Las cotizaciones se ordenan de la más barata a la más cara: comparar es
    // el motivo por el que se guardan juntas.
    compra_cotizaciones: [...(s.compra_cotizaciones ?? [])].sort(
      (a, b) => Number(a.monto) - Number(b.monto),
    ),
    autor: s.created_by ? (nombre.get(s.created_by) ?? null) : null,
    decidio: s.aprobada_por ? (nombre.get(s.aprobada_por) ?? null) : null,
  }));

  return (
    <ComprasClient
      solicitudes={filas}
      puedeAprobar={session?.profile?.aprueba_compras ?? false}
      userId={session?.userId ?? ""}
    />
  );
}
