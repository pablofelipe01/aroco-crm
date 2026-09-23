import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { diaEnBogota } from "@/lib/tareas/fechas";
import { correosActivos, enviarCorreo } from "./resend";
import {
  armarResumenDiario,
  armarResumenSemanal,
  clasificarDiario,
  diaSemana,
  hayAlgoQueContar,
  resumirSemana,
  type TareaResumen,
} from "./resumenes";

/**
 * Envía los resúmenes de tareas (0096): el diario a cada persona con cuenta,
 * el semanal a cada jefe de área (quien figura como `manager_id` de alguien),
 * solo con sus reportes directos.
 *
 * Lo llama el cron `/api/cron/resumen-tareas`. Cada resumen se toma
 * insertando su fila en `correos_resumenes`; si ya existe, otro envío lo tiene
 * y este lo salta.
 */

type Db = ReturnType<typeof createAdminClient>;

export interface ResumenEnvio {
  activo: boolean;
  tipo: "diario" | "semanal";
  periodo: string | null;
  enviados: number;
  sinNada: number;
  yaEnviados: number;
  errores: string[];
  /** Solo con `simular`: los correos que habrían salido. */
  vistas?: { para: string; asunto: string; texto: string }[];
}

/** PostgREST devuelve 1000 filas como mucho: se pide por páginas. */
async function todas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pagina(desde, desde + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

interface Miembro {
  id: string;
  name: string;
  profile_id: string | null;
  manager_id: string | null;
}

async function cargarBase(db: Db) {
  const [miembrosRes, perfilesRes, abiertas] = await Promise.all([
    db.from("team_members").select("id, name, profile_id, manager_id").eq("active", true),
    db.from("profiles").select("id, email, full_name").eq("active", true),
    todas((a, b) =>
      db
        .from("tasks")
        .select("id, name, due_date, task_assignees(team_member_id, created_at)")
        .neq("status", "done")
        .is("unida_a", null)
        .order("id")
        .range(a, b),
    ),
  ]);
  if (miembrosRes.error) throw new Error(miembrosRes.error.message);
  if (perfilesRes.error) throw new Error(perfilesRes.error.message);

  const perfilDe = new Map((perfilesRes.data ?? []).map((p) => [p.id, p]));
  const tareasDe = new Map<string, TareaResumen[]>();
  type Abierta = {
    id: string;
    name: string;
    due_date: string | null;
    task_assignees: { team_member_id: string; created_at: string }[] | null;
  };
  for (const t of abiertas as unknown as Abierta[]) {
    for (const a of t.task_assignees ?? []) {
      tareasDe.set(a.team_member_id, [
        ...(tareasDe.get(a.team_member_id) ?? []),
        { id: t.id, nombre: t.name, vence: t.due_date, asignadaEl: a.created_at },
      ]);
    }
  }
  return { miembros: (miembrosRes.data ?? []) as Miembro[], perfilDe, tareasDe };
}

/** Toma el resumen; false si otro envío ya lo tiene (o ya salió). */
async function tomar(db: Db, tipo: "diario" | "semanal", miembroId: string, periodo: string) {
  const { data, error } = await db
    .from("correos_resumenes")
    .upsert(
      { tipo, team_member_id: miembroId, periodo },
      { onConflict: "tipo,team_member_id,periodo", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(error.message);
  return data?.[0]?.id ?? null;
}

async function enviarYAnotar(
  db: Db,
  id: string,
  para: string,
  correo: { asunto: string; html: string; texto: string },
  r: ResumenEnvio,
) {
  const envio = await enviarCorreo({ para, ...correo });
  if (envio.ok) {
    await db
      .from("correos_resumenes")
      .update({ estado: "enviado", enviado_at: new Date().toISOString() })
      .eq("id", id);
    r.enviados++;
  } else {
    await db
      .from("correos_resumenes")
      .update({ estado: "error", motivo: envio.error.slice(0, 500) })
      .eq("id", id);
    r.errores.push(`${para}: ${envio.error}`);
  }
}

/**
 * Con `simular` arma los correos con los datos reales y los devuelve en
 * `vistas`, sin tomar el registro ni mandar nada, aunque los correos estén
 * apagados. Es para revisar el contenido antes de encenderlos.
 */
export async function enviarResumenes(
  tipo: "diario" | "semanal",
  ahora = new Date(),
  { simular = false }: { simular?: boolean } = {},
): Promise<ResumenEnvio> {
  const periodo = diaEnBogota(ahora.toISOString());
  const r: ResumenEnvio = {
    activo: correosActivos(),
    tipo,
    periodo,
    enviados: 0,
    sinNada: 0,
    yaEnviados: 0,
    errores: [],
  };
  if ((!r.activo && !simular) || !periodo) return r;
  if (simular) r.vistas = [];

  // El fin de semana no hay resumen diario, aunque alguien dispare el cron a mano.
  const dia = diaSemana(periodo);
  if (tipo === "diario" && (dia === 0 || dia === 6)) return r;

  const db = createAdminClient();
  const { miembros, perfilDe, tareasDe } = await cargarBase(db);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  if (tipo === "diario") {
    // El lunes, «nuevas» viene desde el viernes: el fin de semana no hubo resumen.
    const horas = dia === 1 ? 72 : 24;
    const desdeNuevas = new Date(ahora.getTime() - horas * 3_600_000).toISOString();

    for (const m of miembros) {
      const perfil = m.profile_id ? perfilDe.get(m.profile_id) : undefined;
      if (!perfil?.email) continue;
      const c = clasificarDiario(tareasDe.get(m.id) ?? [], periodo, desdeNuevas);
      if (!hayAlgoQueContar(c)) {
        r.sinNada++;
        continue;
      }
      try {
        const correo = armarResumenDiario(
          { nombre: perfil.full_name || m.name, clasificacion: c, hoy: periodo },
          base,
          ahora,
        );
        if (r.vistas) {
          r.vistas.push({ para: perfil.email, asunto: correo.asunto, texto: correo.texto });
          continue;
        }
        const id = await tomar(db, "diario", m.id, periodo);
        if (!id) {
          r.yaEnviados++;
          continue;
        }
        await enviarYAnotar(db, id, perfil.email, correo, r);
      } catch (e) {
        r.errores.push(`${m.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return r;
  }

  // Semanal: cada jefe recibe a toda su área, directos e indirectos.
  const cerradas = await todas((a, b) =>
    db
      .from("tasks")
      .select("id, task_assignees(team_member_id)")
      .eq("status", "done")
      .is("unida_a", null)
      .gte("completed_at", new Date(ahora.getTime() - 7 * 86_400_000).toISOString())
      .order("id")
      .range(a, b),
  );
  const cerradasDe = new Map<string, string[]>();
  for (const t of cerradas as unknown as { id: string; task_assignees: { team_member_id: string }[] | null }[]) {
    for (const a of t.task_assignees ?? []) {
      cerradasDe.set(a.team_member_id, [...(cerradasDe.get(a.team_member_id) ?? []), t.id]);
    }
  }

  const hijos = new Map<string, Miembro[]>();
  for (const m of miembros) {
    if (m.manager_id) hijos.set(m.manager_id, [...(hijos.get(m.manager_id) ?? []), m]);
  }
  // Solo los reportes directos: con todo el subárbol, el semanal de Álvaro
  // traía a la empresa entera (decisión del 23-sep).
  const area = (jefeId: string): Miembro[] => (hijos.get(jefeId) ?? []).filter((m) => m.id !== jefeId);

  for (const jefe of miembros.filter((m) => hijos.has(m.id))) {
    const perfil = jefe.profile_id ? perfilDe.get(jefe.profile_id) : undefined;
    if (!perfil?.email) continue;
    const filas = resumirSemana(
      area(jefe.id).map((m) => ({
        nombre: m.name,
        abiertas: tareasDe.get(m.id) ?? [],
        cerradasSemana: cerradasDe.get(m.id) ?? [],
      })),
      periodo,
    );
    if (filas.length === 0) {
      r.sinNada++;
      continue;
    }
    try {
      const correo = armarResumenSemanal(
        { nombre: perfil.full_name || jefe.name, filas, hoy: periodo },
        base,
        ahora,
      );
      if (r.vistas) {
        r.vistas.push({ para: perfil.email, asunto: correo.asunto, texto: correo.texto });
        continue;
      }
      const id = await tomar(db, "semanal", jefe.id, periodo);
      if (!id) {
        r.yaEnviados++;
        continue;
      }
      await enviarYAnotar(db, id, perfil.email, correo, r);
    } catch (e) {
      r.errores.push(`${jefe.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return r;
}
