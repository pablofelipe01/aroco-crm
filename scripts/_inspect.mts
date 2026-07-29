/**
 * Prueba de extremo a extremo de las actas restringidas (0044 + 0045).
 * Cada escenario declara lo que SE ESPERA, para que el resultado no dependa
 * de cómo esté escrita la etiqueta.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const EMAIL = "prueba.rls.actas@aroco.test";
const PASS = "PruebaRls2026!";
const FILE_PATH = "prueba-rls/acta-restringida.pdf";

const existing = (await admin.auth.admin.listUsers({ page: 1, perPage: 200 })).data.users.find(
  (u) => u.email === EMAIL,
);
if (existing) await admin.auth.admin.deleteUser(existing.id);
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASS,
  email_confirm: true,
  user_metadata: { full_name: "Prueba RLS", department: "Comercial", role: "member" },
});
if (cErr) throw cErr;
const userId = created.user.id;
await admin.from("profiles").update({ active: true, onboarded: true }).eq("id", userId);

const { data: meeting } = await admin
  .from("meetings")
  .insert({
    title: "PRUEBA · Comité financiero restringido",
    notes: "Contenido sensible.",
    file_path: FILE_PATH,
    restricted: true,
  })
  .select("id")
  .single();
const meetingId = meeting!.id;

const { data: abierta } = await admin
  .from("meetings")
  .insert({ title: "PRUEBA · Acta abierta", notes: "Contenido normal." })
  .select("id")
  .single();

await admin
  .from("meeting_attendees")
  .insert({ meeting_id: meetingId, email: "otra.persona@aroco.test", name: "Otra Persona" });

const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
});
await asUser.auth.signInWithPassword({ email: EMAIL, password: PASS });

let fallos = 0;
const check = async (escenario: string, esperaVer: boolean) => {
  const { data } = await asUser.from("meetings").select("id");
  const ve = (data ?? []).some((m) => m.id === meetingId);
  const veAbierta = (data ?? []).some((m) => m.id === abierta!.id);
  const { data: archivo } = await asUser.rpc("can_read_acta_file", { p_path: FILE_PATH });
  const okActa = ve === esperaVer;
  const okArchivo = Boolean(archivo) === esperaVer;
  if (!okActa || !okArchivo || !veAbierta) fallos++;
  console.log(
    `${escenario.padEnd(26)} espera ${esperaVer ? "ver" : "no ver"} → ` +
      `acta ${ve ? "ve" : "no ve"} ${okActa ? "✓" : "✗"} · ` +
      `archivo ${archivo ? "puede" : "bloqueado"} ${okArchivo ? "✓" : "✗"} · ` +
      `acta abierta visible ${veAbierta ? "✓" : "✗"}`,
  );
};

await check("restringida, sin invitar", false);

await admin.from("meeting_attendees").insert({ meeting_id: meetingId, profile_id: userId });
await check("restringida, invitado", true);

await admin.from("meeting_attendees").delete().eq("meeting_id", meetingId).eq("profile_id", userId);
await check("restringida otra vez", false);

// El trigger de 0045 solo deja cambiar `restricted` a Dirección. Con
// service_role no hay auth.uid(), así que se comprueba si lo bloquea.
const { error: upErr } = await admin
  .from("meetings")
  .update({ restricted: false })
  .eq("id", meetingId);
console.log(
  `\nservice_role abriendo el acta: ${upErr ? `BLOQUEADO — ${upErr.message}` : "permitido"}`,
);
if (!upErr) await check("ya abierta a todos", true);

await admin.from("meetings").delete().in("id", [meetingId, abierta!.id]);
await admin.auth.admin.deleteUser(userId);
console.log(`\nfallos: ${fallos}`);
