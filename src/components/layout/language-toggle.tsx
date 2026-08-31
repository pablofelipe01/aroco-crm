"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useIdioma, useT } from "@/lib/i18n/provider";
import { cambiarIdioma } from "@/lib/i18n/actions";

/**
 * Cambio de idioma en la barra superior.
 *
 * También vive en el menú del avatar, que es donde uno esperaría una
 * preferencia de cuenta. Está además aquí porque una función que nadie sabe
 * que existe no se busca en un desplegable: se descubre viéndola. Muestra el
 * idioma AL QUE SE CAMBIA, no el activo — un botón que dice «ES» estando en
 * español no dice si informa o si es un botón para volver.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const idioma = useIdioma();
  const t = useT();
  const [cambiando, setCambiando] = React.useState(false);

  const otro = idioma === "es" ? "en" : "es";
  const etiqueta = otro === "en" ? "EN" : "ES";

  return (
    <button
      type="button"
      disabled={cambiando}
      aria-label={`${t.shell.idioma}: ${otro === "en" ? t.shell.ingles : t.shell.espanol}`}
      title={otro === "en" ? t.shell.ingles : t.shell.espanol}
      onClick={async () => {
        setCambiando(true);
        // Hay que apagarlo a mano. `revalidatePath` vuelve a renderizar los
        // componentes de servidor, pero React conserva el estado de los de
        // cliente: este botón NO se vuelve a montar. Dejarlo encendido lo
        // deshabilitaba para siempre, y el idioma se podía cambiar una sola vez.
        try {
          await cambiarIdioma(otro);
        } finally {
          setCambiando(false);
        }
      }}
      className={cn(
        "flex h-9 min-w-9 items-center justify-center rounded-[var(--radius-md)] px-2 font-mono text-xs font-semibold text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
    >
      {etiqueta}
    </button>
  );
}
