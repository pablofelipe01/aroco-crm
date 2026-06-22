import { createClient } from "@/lib/supabase/server";
import { listarCasos } from "@/lib/procesos/repo";
import { initials } from "@/lib/utils";
import type { Persona } from "@/lib/procesos/types";
import { ProcesosDashboard } from "./procesos-dashboard";

export const dynamic = "force-dynamic";

export default async function ProcesosPage() {
  const supabase = await createClient();
  const [casos, { data: team }] = await Promise.all([
    listarCasos(),
    supabase.from("team_members").select("id, name, color").eq("active", true).order("name"),
  ]);

  const personas: Persona[] = (team ?? []).map((t) => ({
    id: t.id,
    nombre: t.name,
    iniciales: initials(t.name),
    color: t.color ?? "var(--accent)",
  }));

  return <ProcesosDashboard casos={casos} personas={personas} />;
}
