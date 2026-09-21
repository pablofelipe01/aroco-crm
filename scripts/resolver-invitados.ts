/**
 * Liga a su cuenta los invitados de actas que quedaron solo con el nombre.
 *
 * El notetaker escribe el nombre completo («Fernando José Mejía Paz») y la
 * cuenta tiene el corto; antes eso no casaba y el invitado quedaba como texto,
 * sin acceso al acta restringida. Aquí se vuelven a emparejar con la regla de
 * `src/lib/actas/nombres.ts`, la misma que usa el ingest.
 *
 *   pnpm tsx scripts/resolver-invitados.ts [--dry]
 *
 * Si el acta ya tiene a esa persona con su cuenta, la fila suelta es un
 * duplicado y se borra. Es idempotente: solo mira filas sin cuenta.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { emparejarNombre, type Candidato } from "../src/lib/actas/nombres";
import type { Database } from "../src/lib/types/database";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const dry = process.argv.includes("--dry");
const db = createClient<Database>(url, key, { auth: { persistSession: false } });

async function main() {
  const [{ data: sueltos, error }, { data: conCuenta }, { data: profiles }, { data: team }] =
    await Promise.all([
      db.from("meeting_attendees").select("id, meeting_id, name").is("profile_id", null).not("name", "is", null),
      db.from("meeting_attendees").select("meeting_id, profile_id, email"),
      db.from("profiles").select("id, full_name, email").eq("active", true),
      db.from("team_members").select("name, profile_id").eq("active", true),
    ]);
  if (error) throw error;

  const people = profiles ?? [];
  const candidatos: Candidato[] = [
    ...people.map((p) => ({ profileId: p.id, nombre: p.full_name })),
    ...(team ?? []).flatMap((m) => (m.profile_id ? [{ profileId: m.profile_id, nombre: m.name }] : [])),
  ].filter((c) => people.some((p) => p.id === c.profileId));

  // Quién ya está, por acta: por cuenta y por correo (la clave única usa el
  // correo antes que la cuenta).
  const presentes = new Set<string>();
  for (const r of conCuenta ?? []) {
    if (r.profile_id) presentes.add(`${r.meeting_id}:${r.profile_id}`);
    if (r.email) presentes.add(`${r.meeting_id}:${r.email.toLowerCase()}`);
  }

  let ligados = 0;
  let borrados = 0;
  const sinCuenta = new Map<string, number>();

  for (const a of sueltos ?? []) {
    const profileId = emparejarNombre(a.name ?? "", candidatos);
    const perfil = people.find((p) => p.id === profileId);
    if (!perfil) {
      sinCuenta.set(a.name ?? "", (sinCuenta.get(a.name ?? "") ?? 0) + 1);
      continue;
    }
    const ya =
      presentes.has(`${a.meeting_id}:${perfil.id}`) ||
      presentes.has(`${a.meeting_id}:${perfil.email.toLowerCase()}`);

    if (ya) {
      console.log(`  duplicado  «${a.name}» → ya estaba ${perfil.full_name}; se borra`);
      if (!dry) {
        const { error: e } = await db.from("meeting_attendees").delete().eq("id", a.id);
        if (e) console.error(`  ✗ ${e.message}`);
        else borrados++;
      }
    } else {
      console.log(`  ligado     «${a.name}» → ${perfil.full_name}`);
      if (!dry) {
        const { error: e } = await db
          .from("meeting_attendees")
          .update({ profile_id: perfil.id, email: perfil.email })
          .eq("id", a.id);
        if (e) console.error(`  ✗ ${e.message}`);
        else ligados++;
      }
    }
    presentes.add(`${a.meeting_id}:${perfil.id}`);
    presentes.add(`${a.meeting_id}:${perfil.email.toLowerCase()}`);
  }

  console.log(
    `\nsiguen sin cuenta: ${[...sinCuenta].map(([n, k]) => (k > 1 ? `${n} (${k})` : n)).join(", ") || "—"}`,
  );
  console.log(dry ? "\n--dry: no se escribió nada." : `\n✓ ${ligados} ligados · ${borrados} duplicados borrados.`);
}

main().catch((e) => {
  console.error("Falló:", e.message ?? e);
  process.exit(1);
});
