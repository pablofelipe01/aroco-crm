"use client";

import * as React from "react";
import {
  diccionario,
  localeDe,
  IDIOMA_POR_DEFECTO,
  type Diccionario,
  type Idioma,
} from "./index";
import {
  formatCOP,
  formatDate,
  formatKg,
  formatNumber,
} from "@/lib/utils";

type Contexto = {
  idioma: Idioma;
  t: Diccionario;
  locale: string;
};

/**
 * El valor por defecto es español, no `null`.
 *
 * Así un componente que se use fuera del shell —una tarjeta suelta, algo de
 * Storybook, una prueba— sigue renderizando en vez de reventar. El idioma es
 * presentación: que falte el proveedor no debería tumbar la pantalla.
 */
const Ctx = React.createContext<Contexto>({
  idioma: IDIOMA_POR_DEFECTO,
  t: diccionario(IDIOMA_POR_DEFECTO),
  locale: localeDe(IDIOMA_POR_DEFECTO),
});

export function IdiomaProvider({
  idioma,
  children,
}: {
  idioma: Idioma;
  children: React.ReactNode;
}) {
  const valor = React.useMemo<Contexto>(
    () => ({ idioma, t: diccionario(idioma), locale: localeDe(idioma) }),
    [idioma],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** Los textos del idioma activo: `const t = useT(); t.nav.inventario`. */
export function useT(): Diccionario {
  return React.useContext(Ctx).t;
}

export function useIdioma(): Idioma {
  return React.useContext(Ctx).idioma;
}

export function useLocale(): string {
  return React.useContext(Ctx).locale;
}

/**
 * Formateadores ya atados al idioma activo.
 *
 * Existe para que nadie tenga que acordarse de pasar el locale en cada llamada.
 * Olvidarlo no da error —la función tiene valor por defecto— y el número sale
 * en formato colombiano dentro de una pantalla en inglés, que es justo el fallo
 * que no se nota mirando.
 */
export function useFormatos() {
  const locale = useLocale();
  return React.useMemo(
    () => ({
      numero: (v: number, decimales = 0) => formatNumber(v, decimales, locale),
      cop: (v: number) => formatCOP(v, locale),
      kg: (v: number) => formatKg(v, locale),
      fecha: (v: string | Date | null | undefined) => formatDate(v, locale),
    }),
    [locale],
  );
}
