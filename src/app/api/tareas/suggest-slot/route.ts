import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { suggestTaskSlot } from "@/lib/ai/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY." }, { status: 503 });

  let body: {
    name?: string;
    description?: string | null;
    due_date?: string | null;
    person_id?: string | null;
    person_name?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }
  if (!body.name?.trim())
    return NextResponse.json({ error: "Falta la tarea." }, { status: 400 });

  const supabase = await createClient();

  // Workload context: the assignee's other open tasks + nearest due dates.
  let pendingCount = 0;
  let upcomingDue: string[] = [];
  if (body.person_id) {
    const { data } = await supabase
      .from("tasks")
      .select("due_date")
      .eq("person_id", body.person_id)
      .neq("status", "done");
    const rows = data ?? [];
    pendingCount = rows.length;
    upcomingDue = rows
      .map((r) => r.due_date)
      .filter((d): d is string => !!d)
      .sort()
      .slice(0, 5);
  }

  try {
    const suggestion = await suggestTaskSlot(
      {
        name: body.name,
        description: body.description ?? null,
        due_date: body.due_date ?? null,
        person_name: body.person_name ?? null,
      },
      {
        today: new Date().toISOString().slice(0, 10),
        pendingCount,
        upcomingDue,
      },
    );
    return NextResponse.json(suggestion);
  } catch (e) {
    console.error("[suggest-slot]", e);
    return NextResponse.json(
      { error: "La IA no pudo sugerir una franja." },
      { status: 502 },
    );
  }
}
