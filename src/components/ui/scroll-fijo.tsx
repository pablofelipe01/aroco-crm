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
 *
 * Con `llenar` el contenedor toma justo el alto que queda bajo lo que tiene
 * encima, así la página no se mueve y el título y los filtros siguen a la
 * vista (revisión del 2026-10-30, Tareas). Si lo de encima deja menos de
 * MINIMO —un celular con los filtros apilados— vuelve al modo de arriba: un
 * tablero de dos tarjetas de alto no sirve.
 *
 * Si la página tiene una barra fija encima del contenedor (marcada con
 * `data-fijo-encima`, p. ej. los filtros de Comercial), el contenedor se para
 * bajo ella en vez de en el borde de arriba, y su alto descuenta el de la
 * barra (revisión del 2026-10-30). Solo cuenta mientras la barra es `sticky`:
 * en celular no lo es y ocuparía media pantalla.
 */
const MINIMO = 320;

export function ScrollFijo({
  className,
  llenar = false,
  children,
}: {
  className?: string;
  llenar?: boolean;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [alto, setAlto] = React.useState<number | null>(null);
  // Alto de la barra fija de encima más su margen; 0 si no hay o no está fija.
  const [tope, setTope] = React.useState(0);
  const topeRef = React.useRef(0);

  React.useEffect(() => {
    const main = ref.current?.closest("main");
    const barra = main?.querySelector<HTMLElement>("[data-fijo-encima]");
    if (!barra) return;
    const b = barra;

    function medir() {
      const css = getComputedStyle(b);
      const t =
        css.position === "sticky"
          ? Math.ceil(b.getBoundingClientRect().height + (parseFloat(css.marginBottom) || 0))
          : 0;
      topeRef.current = t;
      setTope(t);
    }

    medir();
    // Cambia si los filtros pasan a otra línea, aparece «Limpiar» o la ventana
    // cruza el ancho en que la barra deja de ser fija.
    const ro = new ResizeObserver(medir);
    ro.observe(b);
    window.addEventListener("resize", medir);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    const main = el?.closest("main");
    if (!llenar || !el || !main) return;
    const pagina = main.firstElementChild;

    function medir() {
      if (!el || !main) return;
      const arriba = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      const abajo = pagina ? parseFloat(getComputedStyle(pagina).paddingBottom) || 0 : 0;
      const libre = Math.floor(main.clientHeight - arriba - abajo);
      setAlto(libre >= MINIMO ? libre : null);
    }

    medir();
    // El alto de encima cambia si los filtros pasan a otra línea o aparece un
    // botón; el de abajo, al girar o redimensionar la ventana.
    const ro = new ResizeObserver(medir);
    ro.observe(main);
    if (pagina) ro.observe(pagina);
    return () => ro.disconnect();
  }, [llenar]);

  React.useEffect(() => {
    const el = ref.current;
    const main = el?.closest("main");
    if (!el || !main) return;

    function onWheel(e: WheelEvent) {
      if (!el || !main) return;
      // Bajando y en vertical: el gesto lateral del trackpad es del tablero.
      if (e.deltaY <= 0 || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const faltaPagina = main.scrollHeight - main.clientHeight - main.scrollTop;
      const faltaArriba =
        el.getBoundingClientRect().top - main.getBoundingClientRect().top - topeRef.current;
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
    <div
      ref={ref}
      className={cn("max-h-[calc(100dvh-6rem)] overflow-auto", className)}
      style={
        alto != null
          ? { maxHeight: alto }
          : tope > 0
            ? { maxHeight: `calc(100dvh - 6rem - ${tope}px)` }
            : undefined
      }
    >
      {children}
    </div>
  );
}
