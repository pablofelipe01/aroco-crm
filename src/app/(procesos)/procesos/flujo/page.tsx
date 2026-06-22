import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { PROCESO_CACAO } from "@/lib/procesos/template";

export const dynamic = "force-static";

/** Mapa del proceso (plantilla, no una instancia). Solo lectura. */
export default function FlujoPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Mapa del flujo"
        description={`${PROCESO_CACAO.nombre} — las 5 fases con sus ramas.`}
      />

      <div className="space-y-4">
        {PROCESO_CACAO.fases.map((fase) => (
          <section
            key={fase.numero}
            className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-soft-sm)]"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-fg">
                {fase.numero}
              </span>
              <h2 className="font-semibold text-fg">{fase.nombre}</h2>
              {fase.recurrente && <Badge tone="info">Recurrente</Badge>}
            </div>

            <ol className="space-y-1.5">
              {fase.pasos.map((p) => (
                <li key={p.numero} className="flex items-start gap-2 text-sm">
                  <span className="font-mono text-xs text-fg-subtle">{p.numero}.</span>
                  <span className="min-w-0">
                    <span className="text-fg">{p.titulo}</span>
                    <span className="ml-2 text-xs text-fg-subtle">— {p.rol}</span>
                    {p.esAutomatico && <Badge tone="info" className="ml-2">Automático</Badge>}
                    {p.esRama && <Badge tone="warn" className="ml-2">Rama</Badge>}
                  </span>
                </li>
              ))}
            </ol>

            {fase.decisiones.map((d) => (
              <div
                key={d.clave}
                className="mt-3 rounded-[var(--radius-md)] border border-amber-400/50 bg-amber-50/40 p-3 text-sm dark:bg-amber-500/5"
              >
                <p className="font-medium text-fg">◇ {d.pregunta}</p>
                <ul className="mt-1.5 space-y-1 pl-4">
                  {d.opciones.map((o) => (
                    <li key={o.id} className="text-fg-muted">
                      <span className="text-amber-600 dark:text-amber-400">→</span> {o.etiqueta}{" "}
                      <span className="text-xs text-fg-subtle">(activa {o.activaPasos.join(", ")})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
