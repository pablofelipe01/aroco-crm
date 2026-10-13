import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { correosActivos, enviarCorreo } from "./resend";
import { armarCorreoCompra, type SolicitudCorreo } from "./plantilla-compra";
import type { ResumenCorreos } from "./tareas-asignadas";

/**
 * Vacía la cola `correos_compras` (0107): un correo por aprobador y por
 * solicitud que pide aprobación.
 *
 * Lo llama `enviarAAprobacion` con `after()` y el cron horario de correos,
 * que recoge lo que se haya escapado. Igual que con las tareas, cada fila se
 * toma pasándola a «enviando» y solo la manda quien la tomó.
 */

/** Más vieja que esto no se manda: se anotó con los correos apagados o se atrasó. */
const VIGENCIA_MS = 24 * 60 * 60 * 1000;

export async function enviarCorreosCompras(): Promise<ResumenCorreos> {
  const resumen: ResumenCorreos = { activo: correosActivos(), enviados: 0, omitidos: 0, errores: [] };
  if (!resumen.activo) return resumen;

  const db = createAdminClient();
  const limite = new Date(Date.now() - VIGENCIA_MS).toISOString();

  const { data: viejas } = await db
    .from("correos_compras")
    .update({ estado: "omitido", motivo: "más de 24 horas en cola" })
    .eq("estado", "pendiente")
    .lt("created_at", limite)
    .select("id");
  resumen.omitidos += viejas?.length ?? 0;

  const { data: tomadas, error: tErr } = await db
    .from("correos_compras")
    .update({ estado: "enviando" })
    .eq("estado", "pendiente")
    .select("id, solicitud_id, profile_id");
  if (tErr) {
    resumen.errores.push(tErr.message);
    return resumen;
  }
  if (!tomadas || tomadas.length === 0) return resumen;

  const idsSolicitudes = [...new Set(tomadas.map((t) => t.solicitud_id))];
  const [{ data: solicitudes }, { data: cotizaciones }] = await Promise.all([
    db
      .from("compra_solicitudes")
      .select("id, consecutivo, titulo, categoria, area, justificacion, estado, created_by")
      .in("id", idsSolicitudes),
    db
      .from("compra_cotizaciones")
      .select("solicitud_id, proveedor, monto, moneda, incluye_iva, tiempo_entrega")
      .in("solicitud_id", idsSolicitudes),
  ]);

  const idsPerfiles = [
    ...new Set(
      [...tomadas.map((t) => t.profile_id), ...(solicitudes ?? []).map((s) => s.created_by)].filter(
        (x): x is string => !!x,
      ),
    ),
  ];
  const { data: perfiles } = await db
    .from("profiles")
    .select("id, email, full_name, active")
    .in("id", idsPerfiles);

  const solicitudDe = new Map((solicitudes ?? []).map((s) => [s.id, s]));
  const perfilDe = new Map((perfiles ?? []).map((p) => [p.id, p]));

  const omitir = new Map<string, string[]>();
  const anotarOmitida = (motivo: string, id: string) =>
    omitir.set(motivo, [...(omitir.get(motivo) ?? []), id]);

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const envios: { id: string; para: string; correo: ReturnType<typeof armarCorreoCompra> }[] = [];

  for (const fila of tomadas) {
    const s = solicitudDe.get(fila.solicitud_id);
    const aprobador = perfilDe.get(fila.profile_id);

    if (!s || s.estado !== "Pendiente") {
      // Se decidió o se retiró antes de que saliera el correo: ya no hay nada que aprobar.
      anotarOmitida("la solicitud ya no está pendiente", fila.id);
    } else if (!aprobador || !aprobador.active || !aprobador.email) {
      anotarOmitida("el aprobador no tiene cuenta activa con correo", fila.id);
    } else if (s.created_by === aprobador.id) {
      anotarOmitida("la pidió el mismo aprobador", fila.id);
    } else {
      const datos: SolicitudCorreo = {
        consecutivo: s.consecutivo,
        titulo: s.titulo,
        categoria: s.categoria,
        area: s.area,
        justificacion: s.justificacion,
        solicitante: s.created_by ? (perfilDe.get(s.created_by)?.full_name ?? null) : null,
        cotizaciones: (cotizaciones ?? [])
          .filter((c) => c.solicitud_id === s.id)
          .map((c) => ({
            proveedor: c.proveedor,
            monto: Number(c.monto),
            moneda: c.moneda,
            incluyeIva: c.incluye_iva,
            tiempoEntrega: c.tiempo_entrega,
          })),
      };
      envios.push({
        id: fila.id,
        para: aprobador.email,
        correo: armarCorreoCompra(datos, aprobador.full_name ?? aprobador.email, base),
      });
    }
  }

  for (const [motivo, ids] of omitir) {
    await db.from("correos_compras").update({ estado: "omitido", motivo }).in("id", ids);
    resumen.omitidos += ids.length;
  }

  for (const e of envios) {
    const r = await enviarCorreo({ para: e.para, ...e.correo });
    if (r.ok) {
      await db
        .from("correos_compras")
        .update({ estado: "enviado", enviado_at: new Date().toISOString(), motivo: null })
        .eq("id", e.id);
      resumen.enviados++;
    } else {
      await db
        .from("correos_compras")
        .update({ estado: "error", motivo: r.error.slice(0, 500) })
        .eq("id", e.id);
      resumen.errores.push(`${e.para}: ${r.error}`);
    }
  }

  return resumen;
}
