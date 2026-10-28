"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Contenedor con scroll propio para tableros y tablas largas cuyos encabezados
 * deben quedar fijos.
 *
 * Hace falta un scroll propio porque con overflow-x un `sticky` no se pega al
 * scroll de la página. Pero un scroll dentro de otro se pelea: en la revisión
 * del 2026-10-27, con el resumen y los filtros encima, la rueda movía el
 * tablero mientras su parte de abajo seguía fuera de pantalla, y los
 * encabezados y las columnas se veían cortados.
 *
 * Por eso aquí la rueda baja primero la página hasta que el contenedor llega
 * arriba —y entonces ocupa justo el alto visible— y solo después lo mueve a
 * él. Subiendo no hace falta nada: el navegador ya pasa a la página cuando el
 * contenedor llega a su tope.
 */
export function ScrollFijo({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    const main = el?.closest("main");
    if (!el || !main) return;

    function onWheel(e: WheelEvent) {
      if (!el || !main) return;
      // Bajando y en vertical: el gesto lateral del trackpad es del tablero.
      if (e.deltaY <= 0 || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const faltaPagina = main.scrollHeight - main.clientHeight - main.scrollTop;
      const faltaArriba = el.getBoundingClientRect().top - main.getBoundingClientRect().top;
      if (faltaPagina <= 1 || faltaArriba <= 1) return;
      e.preventDefault();
      // deltaMode 1 = líneas (rueda de mouse en Firefox); 16 px por línea.
      main.scrollTop += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    }

    // passive: false, o el navegador ignora el preventDefault.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    // 6rem = barra superior (4rem) + el padding inferior de la página (2rem):
    // con la página al fondo, el contenedor arranca justo bajo la barra.
    <div ref={ref} className={cn("max-h-[calc(100dvh-6rem)] overflow-auto", className)}>
      {children}
    </div>
  );
}
