import { createClient } from "@/lib/supabase/server";
import { listarCasos } from "@/lib/procesos/repo";
import { initials } from "@/lib/utils";
import type { Persona } from "@/lib/procesos/types";
import { ProcesosDashboard } from "./procesos-dashboard";
import { colorDeArea } from "@/lib/areas";

export const dynamic = "force-dynamic";

export default async function ProcesosPage() {
  const supabase = await createClient();
  const [casos, { data: team }] = await Promise.all([
    listarCasos(),
    supabase.from("team_members").select("id, name, department").eq("active", true).order("name"),
  ]);

  const personas: Persona[] = (team ?? []).map((t) => ({
    id: t.id,
    nombre: t.name,
    iniciales: initials(t.name),
    color: colorDeArea(t.department),
  }));

  return <ProcesosDashboard casos={casos} personas={personas} />;
}
