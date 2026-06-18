import { NextResponse, type NextRequest } from "next/server";
import mammoth from "mammoth";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { extractActaTasks, type ActaContent } from "@/lib/ai/actas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export async function POST(request: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY." }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const meetingDate = String(form.get("meeting_date") ?? "").trim() || null;
  if (!(file instanceof File))
    return NextResponse.json({ error: "Falta el archivo del acta." }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "El archivo supera 12 MB." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name;
  const lower = name.toLowerCase();

  // Build the content for Claude: PDF read natively, Word/txt → text.
  let content: ActaContent;
  try {
    if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
      content = { kind: "pdf", base64: buffer.toString("base64") };
    } else if (lower.endsWith(".docx")) {
      const { value } = await mammoth.extractRawText({ buffer });
      content = { kind: "text", text: value };
    } else {
      content = { kind: "text", text: buffer.toString("utf-8") };
    }
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 400 });
  }

  const supabase = await createClient();

  // Store the original file (RLS: active members can upload to 'actas').
  const safe = name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${session.userId}/${Date.now()}-${safe}`;
  const up = await supabase.storage
    .from("actas")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });
  const filePath = up.error ? null : path;

  // Create the acta record.
  const { data: meeting, error: meErr } = await supabase
    .from("meetings")
    .insert({
      title: title || name.replace(/\.[^.]+$/, ""),
      meeting_date: meetingDate,
      file_path: filePath,
      file_name: name,
      created_by: session.userId,
    })
    .select("id, title")
    .single();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });

  // Team names for assignee matching.
  const { data: team } = await supabase
    .from("team_members")
    .select("id, name")
    .eq("active", true);
  const members = team ?? [];

  let extracted;
  try {
    extracted = await extractActaTasks(content, members.map((m) => m.name));
  } catch (e) {
    console.error("[actas] extract error", e);
    return NextResponse.json(
      { error: "La IA no pudo procesar el acta. Intenta de nuevo.", meeting },
      { status: 502 },
    );
  }

  // Normalize for matching: lowercase + strip diacritics so "Alarcon" matches
  // "Alarcón".
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim();

  // Resolve assignee names → team member ids.
  const proposals = extracted.map((t) => {
    let person_id: string | null = null;
    let person_name: string | null = t.assignee;
    if (t.assignee) {
      const a = norm(t.assignee);
      const m = members.find((x) => {
        const n = norm(x.name);
        return n === a || n.includes(a) || a.includes(n);
      });
      if (m) {
        person_id = m.id;
        person_name = m.name;
      }
    }
    return {
      name: t.name,
      description: t.description,
      due_date: t.due_date,
      person_id,
      person_name,
    };
  });

  return NextResponse.json({ meeting, tasks: proposals });
}
