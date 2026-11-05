import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { AREAS_FIRMAS } from "@/lib/firmas/tipos";
import { FirmasClient, type FilaSobre } from "./firmas-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Firmas" };

export default async function FirmasPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const p = session.profile;
  const puedeCrear =
    !!p?.active &&
    (p.role === "admin" || (AREAS_FIRMAS as readonly string[]).includes(p.department ?? ""));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("firmas_sobres")
    .select(
      "id, codigo, titulo, tipo, estado, created_at, enviado_en, completado_en, vence_en, firmas_firmantes(nombre, estado, orden), creador:profiles!firmas_sobres_created_by_fkey(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(300);

  const filas: FilaSobre[] = (data ?? []).map((s) => ({
    id: s.id,
    codigo: s.codigo,
    titulo: s.titulo,
    tipo: s.tipo,
    estado: s.estado,
    creadoEn: s.created_at,
    completadoEn: s.completado_en,
    venceEn: s.vence_en,
    creador: (s.creador as { full_name: string } | null)?.full_name ?? "—",
    firmantes: [...(s.firmas_firmantes ?? [])]
      .sort((a, b) => a.orden - b.orden)
      .map((f) => ({ nombre: f.nombre, estado: f.estado })),
  }));

  return (
    <FirmasClient
      filas={filas}
      error={error?.message ?? null}
      puedeCrear={puedeCrear}
      userId={session.userId}
    />
  );
}
