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

  const [{ data: solicitudes, error }, { data: perfiles }, { data: proveedores }] = await Promise.all([
    // El `!solicitud_id` no es adorno: hay DOS llaves foráneas entre estas dos
    // tablas —la cotización apunta a su solicitud, y la solicitud apunta a la
    // cotización elegida— y sin decirle cuál seguir, PostgREST no adivina y
    // rechaza la consulta entera.
    supabase
      .from("compra_solicitudes")
      .select("*, compra_cotizaciones!solicitud_id(*)")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("active", true),
    // Solo los ACTIVOS: ofrecer uno sin verificar invitaría a cotizar con
    // alguien cuyos documentos y cuenta bancaria nadie ha revisado.
    supabase
      .from("proveedores_insumos")
      .select("id, tipo_persona, nombres, apellidos, razon_social, numero_documento")
      .eq("estado", "Activo")
      .order("razon_social"),
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
      // Si la consulta falla, la lista llega vacía y se ve idéntica a «no hay
      // solicitudes». Así fue como una consulta rota pasó por «se guardan pero
      // no se ven»: el error hay que mostrarlo, no tragárselo.
      error={error?.message ?? null}
      proveedores={proveedores ?? []}
      puedeAprobar={session?.profile?.aprueba_compras ?? false}
      userId={session?.userId ?? ""}
    />
  );
}
