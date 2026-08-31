"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { COOKIE_IDIOMA, normalizarIdioma } from "./index";

/**
 * Cambia el idioma de la persona que está en sesión.
 *
 * Se guarda en dos sitios y no es redundancia:
 *
 *   · En el perfil, porque la preferencia es de la persona y debe seguirla a
 *     cualquier dispositivo donde entre.
 *   · En una cookie, porque las pantallas sin sesión —login, onboarding— no
 *     tienen perfil que consultar, y porque evita ir a la base en cada
 *     renderizado del servidor.
 *
 * Si el perfil no se puede guardar, la cookie igual queda puesta: el cambio se
 * ve de inmediato aunque no sobreviva al siguiente dispositivo. Es mejor que
 * quedarse en el idioma anterior sin explicación.
 */
export async function cambiarIdioma(valor: string): Promise<{ ok: boolean }> {
  const idioma = normalizarIdioma(valor);

  const store = await cookies();
  store.set(COOKIE_IDIOMA, idioma, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const session = await getSessionContext();
  if (session?.profile) {
    const supabase = await createClient();
    await supabase
      .from("profiles")
      .update({ idioma })
      .eq("id", session.profile.id);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
