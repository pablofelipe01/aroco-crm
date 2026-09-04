"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useIdioma, useT } from "@/lib/i18n/provider";
import { cambiarIdioma } from "@/lib/i18n/actions";
import { IDIOMAS, type Idioma } from "@/lib/i18n";

/**
 * Cambio de idioma en la barra superior.
 *
 * Antes era UN botón que mostraba el idioma al que se cambiaba: estando en
 * español decía «EN». La idea era evitar la duda de «¿esto me informa o me
 * lleva?», pero en la revisión del 1-sep-2026 se leyó al revés —como el idioma
 * activo— y quedó reportado como que el selector estaba invertido. Cuando un
 * control necesita que expliquen cómo se lee, el control es el problema.
 *
 * Ahora se ven las dos opciones y una está encendida. No hay nada que deducir:
 * es el mismo patrón del selector Kanban/Lista que ya usa el resto del CRM.
 *
 * Sigue estando aquí además del menú del avatar —donde vive como preferencia de
 * cuenta— porque una función que nadie sabe que existe no se busca dentro de un
 * desplegable.
 */

const ETIQUETA: Record<Idioma, string> = { es: "ES", en: "EN" };

export function LanguageToggle({ className }: { className?: string }) {
  const idioma = useIdioma();
  const t = useT();
  const [cambiando, setCambiando] = React.useState<Idioma | null>(null);

  const nombre = (cod: Idioma) => (cod === "en" ? t.shell.ingles : t.shell.espanol);

  return (
    <div
      role="group"
      aria-label={t.shell.idioma}
      className={cn(
        "inline-flex items-center rounded-[var(--radius-md)] border border-border bg-surface p-0.5",
        className,
      )}
    >
      {IDIOMAS.map((cod) => {
        const activo = cod === idioma;
        return (
          <button
            key={cod}
            type="button"
            // `aria-pressed` y no `aria-current`: para un lector de pantalla
            // esto es un par de botones de dos estados, no una navegación.
            aria-pressed={activo}
            aria-label={nombre(cod)}
            title={nombre(cod)}
            disabled={cambiando !== null}
            onClick={async () => {
              if (activo) return;
              setCambiando(cod);
              // Hay que apagarlo a mano. `revalidatePath` vuelve a renderizar
              // los componentes de servidor, pero React conserva el estado de
              // los de cliente: este control NO se vuelve a montar. Dejarlo
              // encendido lo deshabilitaba para siempre, y el idioma se podía
              // cambiar una sola vez.
              try {
                await cambiarIdioma(cod);
              } finally {
                setCambiando(null);
              }
            }}
            className={cn(
              "rounded-[var(--radius-sm)] px-2 py-1 font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              activo
                ? "bg-accent text-accent-fg"
                : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
            )}
          >
            {ETIQUETA[cod]}
          </button>
        );
      })}
    </div>
  );
}
