/**
 * Rellena `meeting_attendees` en las actas anteriores a la restricción (0044).
 *
 * La captura automática solo corre cuando entra un acta nueva, así que las que
 * ya estaban quedaron sin invitados — y un acta restringida sin invitados solo
 * la ve Dirección. El encabezado con los participantes sí está: viene dentro
 * del texto que se guardó en `notes`.
 *
 *   pnpm tsx --conditions=react-server scripts/backfill-acta-invitados.ts [--dry]
 *
 * Con --dry imprime lo que haría sin escribir nada. Es idempotente: salta las
 * actas que ya tienen invitados.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { extractActaAttendees } from "../src/lib/ai/actas";
import type { Database } from "../src/lib/types/database";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY.");
  process.exit(1);
}

const dry = process.argv.includes("--dry");
const db = createClient<Database>(url, key, { auth: { persistSession: false } });

/** minúsculas sin tildes, para que "Nicolás Rodríguez" case con "Nicolas Rodriguez". */
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

async function main() {
  const [{ data: meetings }, { data: profiles }, { data: attendees }] = await Promise.all([
    db.from("meetings").select("id, title, meeting_date, notes").not("notes", "is", null),
    db.from("profiles").select("id, full_name, email").eq("active", true),
    db.from("meeting_attendees").select("meeting_id"),
  ]);

  const yaTienen = new Set((attendees ?? []).map((a) => a.meeting_id));
  const pendientes = (meetings ?? []).filter((m) => !yaTienen.has(m.id));
  const people = profiles ?? [];

  console.log(
    `actas con texto: ${(meetings ?? []).length} · ya con invitados: ${yaTienen.size} · por procesar: ${pendientes.length}`,
  );
  if (pendientes.length === 0) return;

  let insertadas = 0;
  let sinIdentificar = 0;

  for (const m of pendientes) {
    const { attendees: asistieron, mentionedOnly } = await extractActaAttendees(
      m.notes ?? "",
      people.map((p) => p.full_name),
    );

    const rows: Database["public"]["Tables"]["meeting_attendees"]["Insert"][] = [];
    const vistos = new Set<string>();
    const noResueltos: string[] = [];

    for (const raw of asistieron) {
      const isEmail = raw.includes("@");
      const perfil = people.find((p) =>
        isEmail
          ? p.email.toLowerCase() === raw.toLowerCase()
          : norm(p.full_name) === norm(raw) ||
            // "Luis Ernesto Barrios" en el acta vs "Luis Barrios" en el perfil.
            norm(p.full_name).split(" ").every((w) => norm(raw).includes(w)),
      );
      const clave = (perfil?.id ?? norm(raw)).toString();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      if (!perfil) noResueltos.push(raw);
      rows.push({
        meeting_id: m.id,
        profile_id: perfil?.id ?? null,
        email: perfil?.email ?? (isEmail ? raw.toLowerCase() : null),
        name: perfil?.full_name ?? (isEmail ? null : raw),
      });
    }

    const conCuenta = rows.filter((r) => r.profile_id).length;
    sinIdentificar += noResueltos.length;
    console.log(
      `\n${m.title} (${m.meeting_date ?? "—"})\n  asistieron: ${asistieron.join(", ") || "—"}` +
        `\n  con cuenta: ${conCuenta}/${rows.length}` +
        (noResueltos.length ? `\n  sin perfil: ${noResueltos.join(", ")}` : "") +
        (mentionedOnly.length ? `\n  solo mencionados (excluidos): ${mentionedOnly.join(", ")}` : ""),
    );

    if (!dry && rows.length > 0) {
      const { error } = await db.from("meeting_attendees").insert(rows);
      if (error) console.error(`  ✗ ${error.message}`);
      else insertadas += rows.length;
    }
  }

  console.log(
    dry
      ? "\n--dry: no se escribió nada."
      : `\n✓ ${insertadas} invitados registrados · ${sinIdentificar} nombres sin perfil (quedan como texto, no dan acceso).`,
  );
}

main().catch((e) => {
  console.error("Backfill falló:", e.message ?? e);
  process.exit(1);
});
