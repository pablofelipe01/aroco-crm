import Link from "next/link";
import { Wordmark } from "@/components/brand";

/**
 * Portal de proveedores.
 *
 * Deliberadamente NO usa el shell del CRM: quien entra aquí es de fuera de
 * AROCO y no debe ver siquiera los nombres de los módulos internos. Sin barra
 * lateral, sin buscador, sin asistente.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/portal" className="flex items-center gap-3">
            <Wordmark />
            <span className="hidden text-sm text-fg-muted sm:inline">Proveedores</span>
          </Link>
          <Link
            href="/auth/signout"
            className="text-sm text-fg-muted transition-colors hover:text-fg"
          >
            Salir
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-border px-4 py-6">
        <p className="mx-auto max-w-4xl text-xs text-fg-subtle">
          AROCO S.A.S · Si tienes dudas sobre tu registro o una cuenta de cobro,
          escríbenos a info@aroco.co
        </p>
      </footer>
    </div>
  );
}
