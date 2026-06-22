import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { initials } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Carga de trabajo: pasos pendientes / en curso por persona. */
export default async function EquipoProcesosPage() {
  const supabase = await createClient();
  const [{ data: team }, { data: pasos }] = await Promise.all([
    supabase.from("team_members").select("id, name, color").eq("active", true).order("name"),
    supabase
      .from("proceso_pasos")
      .select("asignado_a, estado")
      .in("estado", ["pendiente", "en_curso"]),
  ]);

  const carga = new Map<string, { pendiente: number; en_curso: number }>();
  for (const p of pasos ?? []) {
    if (!p.asignado_a) continue;
    const c = carga.get(p.asignado_a) ?? { pendiente: 0, en_curso: 0 };
    if (p.estado === "en_curso") c.en_curso++;
    else c.pendiente++;
    carga.set(p.asignado_a, c);
  }

  const filas = (team ?? [])
    .map((t) => ({ ...t, ...(carga.get(t.id) ?? { pendiente: 0, en_curso: 0 }) }))
    .sort((a, b) => b.en_curso + b.pendiente - (a.en_curso + a.pendiente));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Equipo y carga"
        description="Pasos asignados pendientes o en curso por persona."
      />
      {filas.length === 0 ? (
        <EmptyState title="Sin equipo" />
      ) : (
        <ul className="space-y-2">
          {filas.map((p) => {
            const total = p.pendiente + p.en_curso;
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[11px] text-white"
                  style={{ backgroundColor: p.color ?? "var(--accent)" }}
                >
                  {initials(p.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{p.name}</span>
                <span className="text-xs text-fg-muted">
                  {p.en_curso} en curso · {p.pendiente} pendientes
                </span>
                <span className="w-8 text-right font-mono text-sm tnum text-fg">{total}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
