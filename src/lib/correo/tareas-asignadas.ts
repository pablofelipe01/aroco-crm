import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { correosActivos, enviarCorreo } from "./resend";
import { agruparAsignaciones, armarCorreoTareas, type Asignacion } from "./plantilla-tareas";

/**
 * Vacía la cola `correos_tareas` (0095): un correo por persona y por acta.
 *
 * Lo llaman las acciones que asignan (con `after()`, sin demorar la
 * respuesta), el cron de actas al terminar, y un cron cada hora que recoge
 * lo que se haya escapado. Dos llamadas a la vez no mandan doble: cada fila
 * se toma pasándola a «enviando» y solo la envía quien la tomó.
 */

/** Más vieja que esto no se manda: se anotó con los correos apagados o se atrasó. */
const VIGENCIA_MS = 24 * 60 * 60 * 1000;

export interface ResumenCorreos {
  activo: boolean;
  enviados: number;
  omitidos: number;
  errores: string[];
}

export async function enviarTareasAsignadas(): Promise<ResumenCorreos> {
  const resumen: ResumenCorreos = { activo: correosActivos(), enviados: 0, omitidos: 0, errores: [] };
  // Apagados no se toca la cola: al encenderlos, lo de más de 24 h se omite
  // en vez de salir de golpe.
  if (!resumen.activo) return resumen;

  const db = createAdminClient();
  const limite = new Date(Date.now() - VIGENCIA_MS).toISOString();

  const { data: viejas } = await db
    .from("correos_tareas")
    .update({ estado: "omitido", motivo: "más de 24 horas en cola" })
    .eq("estado", "pendiente")
    .lt("created_at", limite)
    .select("id");
  resumen.omitidos += viejas?.length ?? 0;

  const { data: tomadas, error: tErr } = await db
    .from("correos_tareas")
    .update({ estado: "enviando" })
    .eq("estado", "pendiente")
    .select("id, task_id, team_member_id, asignado_por");
  if (tErr) {
    resumen.errores.push(tErr.message);
    return resumen;
  }
  if (!tomadas || tomadas.length === 0) return resumen;

  const idsTareas = [...new Set(tomadas.map((t) => t.task_id))];
  const idsMiembros = [...new Set(tomadas.map((t) => t.team_member_id))];

  const [{ data: tareas }, { data: miembros }] = await Promise.all([
    db
      .from("tasks")
      .select("id, name, description, due_date, status, unida_a, meeting_id")
      .in("id", idsTareas),
    db.from("team_members").select("id, name, profile_id").in("id", idsMiembros),
  ]);

  const idsPerfiles = [
    ...new Set([
      ...(miembros ?? []).map((m) => m.profile_id),
      ...tomadas.map((t) => t.asignado_por),
    ].filter((x): x is string => !!x)),
  ];
  const idsActas = [
    ...new Set((tareas ?? []).map((t) => t.meeting_id).filter((x): x is string => !!x)),
  ];
  const [{ data: perfiles }, { data: actas }] = await Promise.all([
    idsPerfiles.length
      ? db.from("profiles").select("id, email, full_name, active").in("id", idsPerfiles)
      : Promise.resolve({ data: [] }),
    idsActas.length
      ? db.from("meetings").select("id, title, meeting_date").in("id", idsActas)
      : Promise.resolve({ data: [] }),
  ]);

  const tareaDe = new Map((tareas ?? []).map((t) => [t.id, t]));
  const miembroDe = new Map((miembros ?? []).map((m) => [m.id, m]));
  const perfilDe = new Map((perfiles ?? []).map((p) => [p.id, p]));
  const actaDe = new Map((actas ?? []).map((a) => [a.id, a]));

  const omitir = new Map<string, string[]>();
  const anotarOmitida = (motivo: string, id: string) =>
    omitir.set(motivo, [...(omitir.get(motivo) ?? []), id]);

  const asignaciones: Asignacion[] = [];
  for (const fila of tomadas) {
    const tarea = tareaDe.get(fila.task_id);
    const miembro = miembroDe.get(fila.team_member_id);
    const perfil = miembro?.profile_id ? perfilDe.get(miembro.profile_id) : undefined;

    if (!tarea || tarea.status === "done" || tarea.unida_a) {
      anotarOmitida("la tarea ya está cerrada", fila.id);
    } else if (!perfil || !perfil.active || !perfil.email) {
      anotarOmitida("la persona no tiene cuenta activa con correo", fila.id);
    } else if (fila.asignado_por && fila.asignado_por === perfil.id) {
      anotarOmitida("se la asignó a sí misma", fila.id);
    } else {
      const acta = tarea.meeting_id ? actaDe.get(tarea.meeting_id) : undefined;
      asignaciones.push({
        id: fila.id,
        miembroId: fila.team_member_id,
        correo: perfil.email,
        nombre: perfil.full_name || miembro!.name,
        actaId: tarea.meeting_id,
        acta: acta ? { titulo: acta.title, fecha: acta.meeting_date } : null,
        asignadoPor: fila.asignado_por
          ? (perfilDe.get(fila.asignado_por)?.full_name ?? null)
          : null,
        tarea: {
          id: tarea.id,
          nombre: tarea.name,
          descripcion: tarea.description,
          vence: tarea.due_date,
        },
      });
    }
  }

  for (const [motivo, ids] of omitir) {
    await db.from("correos_tareas").update({ estado: "omitido", motivo }).in("id", ids);
    resumen.omitidos += ids.length;
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  for (const grupo of agruparAsignaciones(asignaciones)) {
    const correo = armarCorreoTareas(grupo, base);
    const r = await enviarCorreo({ para: grupo.correo, ...correo });
    if (r.ok) {
      await db
        .from("correos_tareas")
        .update({ estado: "enviado", enviado_at: new Date().toISOString(), motivo: null })
        .in("id", grupo.ids);
      resumen.enviados++;
    } else {
      await db
        .from("correos_tareas")
        .update({ estado: "error", motivo: r.error.slice(0, 500) })
        .in("id", grupo.ids);
      resumen.errores.push(`${grupo.correo}: ${r.error}`);
    }
  }

  return resumen;
}
