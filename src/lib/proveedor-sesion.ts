import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * La ficha del proveedor que está en sesión, o `null` si quien pregunta no es
 * un proveedor.
 *
 * Un proveedor tiene cuenta de Supabase Auth pero NO una fila en `profiles`.
 * Sin esta comprobación, el layout del CRM lo mandaría a `/onboarding` —el
 * camino de alguien del equipo al que le falta completar su perfil— y quedaría
 * atrapado en un formulario que no le corresponde.
 */
export async function proveedorEnSesion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("proveedores_insumos")
    .select(
      "id, codigo, tipo_persona, nombres, apellidos, razon_social, email, estado, motivo_rechazo",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return data ?? null;
}
