import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaColombia } from "@/lib/finca/captura";
import { enviar } from "@/lib/telegram/api";
import { escapar, fechaLarga } from "./reporte";

type Db = ReturnType<typeof createAdminClient>;

/**
 * Apunta el envío; true si es la primera vez hoy. Así un cron que corre dos
 * veces no le escribe dos veces a nadie.
 */
async function primeraVez(db: Db, fecha: string, tipo: string, usuarioId: string) {
  const { data, error } = await db
    .from("finca_telegram_envios")
    .upsert({ fecha, tipo, usuario_id: usuarioId }, { onConflict: "fecha,tipo,usuario_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/** Quién tiene hoy algo registrado, y quién tiene hoy una ausencia (vacaciones…). */
async function estadoDelDia(db: Db, fecha: string) {
  const { data, error } = await db
    .from("finca_registros")
    .select("empleado_id, finca_labores(categoria)")
    .eq("fecha", fecha)
    .is("anulado_en", null)
    .not("empleado_id", "is", null);
  if (error) throw new Error(error.message);
  const reportaron = new Set<string>();
  const ausentes = new Set<string>();
  for (const r of data ?? []) {
    reportaron.add(r.empleado_id!);
    if ((r.finca_labores as { categoria: string } | null)?.categoria === "ausencia") ausentes.add(r.empleado_id!);
  }
  return { reportaron, ausentes };
}

async function usuarios(db: Db) {
  const { data, error } = await db
    .from("finca_telegram_usuarios")
    .select("id, nombre, empleado_id, rol, recibe_avisos, chat_id")
    .eq("activo", true);
  if (error) throw new Error(error.message);
  return data ?? [];
}

const primerNombre = (n: string) => n.split(" ")[0];

export interface ResultadoEnvio {
  enviados: number;
  omitidos: number;
  errores: string[];
}

/** 6:00 a. m.: a cada trabajador con Telegram, qué decir en el audio de hoy. */
export async function recordatorioManana(): Promise<ResultadoEnvio> {
  const db = createAdminClient();
  const hoy = fechaColombia(new Date());
  const { ausentes } = await estadoDelDia(db, hoy);
  const r: ResultadoEnvio = { enviados: 0, omitidos: 0, errores: [] };
  for (const u of await usuarios(db)) {
    if (u.rol !== "trabajador" || !u.chat_id || !u.empleado_id) continue;
    if (ausentes.has(u.empleado_id)) {
      r.omitidos++;
      continue;
    }
    try {
      if (!(await primeraVez(db, hoy, "recordatorio", u.id))) {
        r.omitidos++;
        continue;
      }
      await enviar(
        u.chat_id,
        [
          `☀️ Buenos días, ${escapar(primerNombre(u.nombre))}.`,
          "",
          "Hoy, al terminar, mándeme un <b>audio 🎤</b> contando:",
          "• Qué hizo y en qué válvula",
          "• A qué hora empezó y terminó",
          "• Cuánto sacó (mazorcas sanas, con monilia y negras, o kilos de baba)",
          "",
          "Si no tiene señal, grábelo igual: sale solo al llegar a la oficina.",
        ].join("\n"),
      );
      r.enviados++;
    } catch (e) {
      r.errores.push(`${u.nombre}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return r;
}

/**
 * 5:00 p. m.: a Angela (y a cada supervisor con avisos) la lista de quién no
 * ha mandado labores hoy, y a cada uno de esos un segundo recordatorio.
 */
export async function avisoTarde(): Promise<ResultadoEnvio & { faltan: string[] }> {
  const db = createAdminClient();
  const hoy = fechaColombia(new Date());
  const { reportaron, ausentes } = await estadoDelDia(db, hoy);
  const us = await usuarios(db);
  const { data: empleados, error } = await db
    .from("finca_empleados")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre");
  if (error) throw new Error(error.message);

  const porEmpleado = new Map(us.filter((u) => u.empleado_id).map((u) => [u.empleado_id!, u]));
  const faltan = (empleados ?? []).filter((e) => !reportaron.has(e.id) && !ausentes.has(e.id));
  const r: ResultadoEnvio & { faltan: string[] } = {
    enviados: 0,
    omitidos: 0,
    errores: [],
    faltan: faltan.map((e) => e.nombre),
  };

  for (const e of faltan) {
    const u = porEmpleado.get(e.id);
    if (!u?.chat_id) continue;
    try {
      if (!(await primeraVez(db, hoy, "insistencia", u.id))) continue;
      await enviar(
        u.chat_id,
        `${escapar(primerNombre(u.nombre))}, todavía no me ha mandado las labores de hoy 🙏\n\nMántenga oprimido el 🎤 y cuénteme qué hizo, en qué válvula, de qué hora a qué hora y cuánto sacó.`,
      );
      r.enviados++;
    } catch (err) {
      r.errores.push(`${u.nombre}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const lineas = faltan.length
    ? [
        `<b>Labores de ${escapar(fechaLarga(hoy, hoy))}: faltan ${faltan.length} de ${(empleados ?? []).length - ausentes.size}</b>`,
        "",
        ...faltan.map((e) => {
          const u = porEmpleado.get(e.id);
          const nota = !u ? " — <i>sin número en el CRM</i>" : !u.chat_id ? " — <i>no ha abierto el bot</i>" : "";
          return `• ${escapar(e.nombre)}${nota}`;
        }),
        "",
        "Ya les volví a escribir a los que tienen Telegram. Si alguno no puede, mándeme usted el audio diciendo su nombre.",
      ]
    : [`✅ Todos mandaron las labores de ${escapar(fechaLarga(hoy, hoy))}.`];
  if (ausentes.size) {
    const nombres = (empleados ?? []).filter((e) => ausentes.has(e.id)).map((e) => e.nombre);
    lineas.push("", `<i>Con ausencia hoy: ${escapar(nombres.join(", "))}</i>`);
  }

  for (const s of us) {
    if (s.rol !== "supervisor" || !s.recibe_avisos || !s.chat_id) continue;
    try {
      if (!(await primeraVez(db, hoy, "aviso", s.id))) {
        r.omitidos++;
        continue;
      }
      await enviar(s.chat_id, lineas.join("\n"));
      r.enviados++;
    } catch (err) {
      r.errores.push(`${s.nombre}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return r;
}
