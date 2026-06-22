import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerCaso } from "@/lib/procesos/repo";
import { initials } from "@/lib/utils";
import type { Persona } from "@/lib/procesos/types";
import { CasoDetalle } from "./caso-detalle";

export const dynamic = "force-dynamic";

export default async function CasoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [caso, { data: team }, { data: eventos }] = await Promise.all([
    obtenerCaso(id),
    supabase.from("team_members").select("id, name, color").eq("active", true).order("name"),
    supabase
      .from("proceso_eventos")
      .select("id, descripcion, paso_numero, created_at")
      .eq("caso_id", id)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  if (!caso) notFound();

  const personas: Persona[] = (team ?? []).map((t) => ({
    id: t.id,
    nombre: t.name,
    iniciales: initials(t.name),
    color: t.color ?? "var(--accent)",
  }));

  return (
    <CasoDetalle
      caso={caso}
      personas={personas}
      eventos={(eventos ?? []) as {
        id: string;
        descripcion: string;
        paso_numero: string | null;
        created_at: string;
      }[]}
    />
  );
}
