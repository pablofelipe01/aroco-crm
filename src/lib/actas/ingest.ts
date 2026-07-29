import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractActaTasks, type ActaContent } from "@/lib/ai/actas";
import { hasGmailEnv, listActaMessageIds, fetchEmail } from "@/lib/gmail";
import { serverEnv } from "@/lib/env";

export interface IngestSummary {
  configured: boolean;
  processed: { emailId: string; title: string; meetingId: string; tasks: number }[];
  skipped: number;
  errors: { emailId?: string; error: string }[];
}

/** Máximo de correos nuevos a procesar por corrida (la IA tarda por acta). */
const BATCH = 3;

/** Asuntos de prueba/ensayo del notetaker que NO deben volverse actas. */
const TEST_RE = /\b(prueba|ensayo|test)\b/i;

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Limpia el asunto "📋 Notas de reunión: Título" → "Título". */
function titleFromSubject(subject: string): string {
  const t = subject
    .replace(/^\s*(📋\s*)?notas?\s+de\s+reuni[oó]n\s*[:\-–]?\s*/i, "")
    .trim();
  return t || subject.trim() || "Acta de reunión";
}

/**
 * Lee el buzón de Renata, toma las "Notas de reunión" que aún no se han
 * procesado, extrae las tareas con la IA existente y crea el acta + las tareas
 * (distribución). Idempotente: deduplica por meetings.source_email_id.
 */
export async function ingestActasFromGmail(): Promise<IngestSummary> {
  const summary: IngestSummary = {
    configured: hasGmailEnv(),
    processed: [],
    skipped: 0,
    errors: [],
  };
  if (!summary.configured) {
    summary.errors.push({
      error:
        "Gmail no configurado. Faltan GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN.",
    });
    return summary;
  }

  const db = createAdminClient();

  let ids: string[];
  try {
    ids = await listActaMessageIds(serverEnv.ACTAS_EMAIL_QUERY);
  } catch (e) {
    summary.errors.push({ error: e instanceof Error ? e.message : String(e) });
    return summary;
  }
  if (ids.length === 0) return summary;

  // ¿Cuáles ya se procesaron?
  const { data: existing } = await db
    .from("meetings")
    .select("source_email_id")
    .in("source_email_id", ids);
  const done = new Set((existing ?? []).map((r) => r.source_email_id));

  const { data: team } = await db
    .from("team_members")
    .select("id, name")
    .eq("active", true);
  const members = team ?? [];

  const fresh = ids.filter((id) => !done.has(id)).slice(0, BATCH);

  for (const emailId of fresh) {
    try {
      const email = await fetchEmail(emailId);
      if (!/notas?\s+de\s+reuni/i.test(email.subject) || TEST_RE.test(email.subject)) {
        summary.skipped++;
        continue;
      }

      const content: ActaContent = email.pdf
        ? { kind: "pdf", base64: email.pdf.base64 }
        : { kind: "text", text: email.bodyText };
      if (content.kind === "text" && content.text.trim().length < 20) {
        summary.skipped++;
        continue;
      }

      const title = titleFromSubject(email.subject);

      // Crea el acta (source_email_id dedup — unique parcial).
      const { data: meeting, error: meErr } = await db
        .from("meetings")
        .insert({
          title,
          meeting_date: email.date,
          notes: email.pdf ? null : email.bodyText.slice(0, 20000),
          file_name: email.pdf?.filename ?? null,
          source_email_id: emailId,
        })
        .select("id")
        .single();
      if (meErr) {
        if (meErr.code === "23505") {
          summary.skipped++;
          continue;
        }
        throw new Error(meErr.message);
      }

      // Extrae y distribuye las tareas.
      const extracted = await extractActaTasks(
        content,
        members.map((m) => m.name),
      );
      // Cada tarea puede quedar en manos de varias personas. Se resuelven
      // contra el catálogo del equipo; los nombres que no coincidan se guardan
      // como texto en `person_name` para no perderlos.
      const prepared = extracted.map((t) => {
        const matched: string[] = [];
        const unmatched: string[] = [];
        for (const raw of t.assignees) {
          const a = norm(raw);
          const m = members.find((x) => {
            const n = norm(x.name);
            return n === a || n.includes(a) || a.includes(n);
          });
          if (m) {
            if (!matched.includes(m.id)) matched.push(m.id);
          } else {
            unmatched.push(raw);
          }
        }
        return {
          row: {
            name: t.name,
            description: t.description,
            due_date: t.due_date || null,
            // person_id / person_name los deriva el trigger a partir de los
            // responsables; aquí solo se deja el texto suelto cuando nadie
            // coincidió con el equipo.
            person_name: matched.length === 0 ? (unmatched[0] ?? null) : null,
            status: "pending" as const,
            source: "Acta (email)",
            meeting_id: meeting.id,
          },
          assignees: matched,
        };
      });

      if (prepared.length > 0) {
        const { data: inserted, error: tErr } = await db
          .from("tasks")
          .insert(prepared.map((p) => p.row))
          .select("id");
        if (tErr) throw new Error(tErr.message);

        // `insert` conserva el orden de entrada, así que los ids casan 1:1.
        const links = (inserted ?? []).flatMap((task, i) =>
          (prepared[i]?.assignees ?? []).map((team_member_id) => ({
            task_id: task.id,
            team_member_id,
          })),
        );
        if (links.length > 0) {
          const { error: aErr } = await db.from("task_assignees").insert(links);
          if (aErr) throw new Error(aErr.message);
        }
      }

      summary.processed.push({
        emailId,
        title,
        meetingId: meeting.id,
        tasks: prepared.length,
      });
    } catch (e) {
      summary.errors.push({
        emailId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return summary;
}
