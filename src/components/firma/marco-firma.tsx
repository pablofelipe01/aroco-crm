import { Wordmark } from "@/components/brand";

/**
 * Marco de las páginas públicas de firma (firma.aroco.co). Como el portal de
 * proveedores, sin nada del CRM: quien llega aquí es de fuera de AROCO.
 * Liviano a propósito: se abre desde un celular en una finca con poca señal.
 */
export function MarcoFirma({
  etiqueta,
  pie,
  children,
}: {
  etiqueta: string;
  pie: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Wordmark />
          <span className="text-sm text-fg-muted">{etiqueta}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">{children}</main>
      <footer className="border-t border-border px-4 py-5">
        <p className="mx-auto max-w-2xl text-xs text-fg-subtle">{pie}</p>
      </footer>
    </div>
  );
}
