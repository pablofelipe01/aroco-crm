import Link from "next/link";
import { Boxes, Workflow, ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * Selector tras el login: el usuario elige a qué vertiente entrar — la
 * Operación (CRM / Inventario actual) o el tablero de Procesos.
 */
export default function ElegirPage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-10 overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-accent-soft opacity-50 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent-soft opacity-40 blur-3xl" />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <Wordmark />
        <p className="text-sm text-fg-muted">¿A dónde quieres entrar?</p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Opcion
          href="/dashboard"
          icon={<Boxes className="h-6 w-6" />}
          titulo="Operación"
          descripcion="CRM, inventario, despachos, cotizaciones, precios y comisiones."
        />
        <Opcion
          href="/procesos"
          icon={<Workflow className="h-6 w-6" />}
          titulo="Procesos"
          descripcion="Tablero de seguimiento de procesos por fases y checklist."
        />
      </div>
    </div>
  );
}

function Opcion({
  href,
  icon,
  titulo,
  descripcion,
}: {
  href: string;
  icon: React.ReactNode;
  titulo: string;
  descripcion: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-[var(--shadow-soft-sm)] transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[var(--shadow-soft-md)]"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent-soft-fg">
        {icon}
      </span>
      <div>
        <p className="flex items-center gap-1.5 text-lg font-semibold text-fg">
          {titulo}
          <ArrowRight className="h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
        </p>
        <p className="mt-1 text-sm text-fg-muted">{descripcion}</p>
      </div>
    </Link>
  );
}
