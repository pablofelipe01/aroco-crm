"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth";
import { DEPARTMENTS, type Department } from "@/lib/nav";

export type InviteState = { error?: string; success?: string };

async function requireAdmin() {
  const session = await getSessionContext();
  if (!session || session.profile?.role !== "admin") {
    throw new Error("No autorizado.");
  }
  return session;
}

/**
 * Invite a new user by email (admin only). Sends a Supabase invitation linking
 * to /auth/callback; the invitee sets a password and is then onboarded.
 * Department/role/full_name are passed as metadata so the profile trigger
 * provisions them.
 */
export async function inviteUser(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "No autorizado." };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const department = String(formData.get("department") ?? "").trim();
  const role = String(formData.get("role") ?? "member").trim();

  // Se acepta cualquier correo válido: parte del equipo es externa o usa Gmail
  // (p. ej. operaciones/finca). El dominio ya no se restringe a @aroco.co.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Correo inválido." };
  }
  if (department && !DEPARTMENTS.includes(department as Department)) {
    return { error: "Departamento inválido." };
  }

  // Use the real origin the admin is on (so the invite link points to the
  // deployed app, not a fixed env var). Falls back to NEXT_PUBLIC_SITE_URL.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin =
    (host ? `${proto}://${host}` : "") || process.env.NEXT_PUBLIC_SITE_URL || "";

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName || email,
      department: department || null,
      role: role === "admin" ? "admin" : "member",
    },
    redirectTo: origin ? `${origin}/auth/callback` : undefined,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return {
        error:
          "Ese correo ya tiene una cuenta. Si la persona olvidó su contraseña, puede usar “¿Olvidaste tu contraseña?” en el login.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/equipo");
  return { success: `Invitación enviada a ${email}.` };
}

export type ProfileActionResult = { ok: boolean; error?: string };

/** Toggle a profile's active flag (admin only). Cannot deactivate yourself. */
export async function toggleProfileActive(
  profileId: string,
  active: boolean,
): Promise<ProfileActionResult> {
  const session = await requireAdmin().catch(() => null);
  if (!session) return { ok: false, error: "No autorizado." };
  if (profileId === session.userId)
    return { ok: false, error: "No puedes desactivar tu propia cuenta." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ active })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/equipo");
  return { ok: true };
}

/** Change a profile's role (admin only). Cannot change your own role. */
export async function setProfileRole(
  profileId: string,
  role: "admin" | "member",
): Promise<ProfileActionResult> {
  const session = await requireAdmin().catch(() => null);
  if (!session) return { ok: false, error: "No autorizado." };
  if (profileId === session.userId)
    return { ok: false, error: "No puedes cambiar tu propio rol." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/equipo");
  return { ok: true };
}

/**
 * Lo que un admin puede cambiar de un perfil desde Equipo (2026-11-04: para que
 * Nicolás arme los perfiles sin pasar por Pablo). El rol y el activo van por
 * sus propias acciones, que traen la regla de no tocarse a sí mismo.
 */
export type CambiosPerfil = {
  full_name?: string;
  department?: Department | null;
  aprueba_compras?: boolean;
  ve_mercado?: boolean;
  ve_uso?: boolean;
  ve_comisiones_todas?: boolean;
  verifica_proveedores?: boolean;
};

const PERMISOS = [
  "aprueba_compras",
  "ve_mercado",
  "ve_uso",
  "ve_comisiones_todas",
  "verifica_proveedores",
] as const;

export async function actualizarPerfil(
  profileId: string,
  cambios: CambiosPerfil,
): Promise<ProfileActionResult> {
  const session = await requireAdmin().catch(() => null);
  if (!session) return { ok: false, error: "No autorizado." };

  const limpio: CambiosPerfil = {};
  if (cambios.full_name !== undefined) {
    const nombre = cambios.full_name.trim();
    if (nombre.length < 2) return { ok: false, error: "El nombre es muy corto." };
    limpio.full_name = nombre;
  }
  if (cambios.department !== undefined) {
    if (cambios.department !== null && !DEPARTMENTS.includes(cambios.department)) {
      return { ok: false, error: "Área inválida." };
    }
    limpio.department = cambios.department;
  }
  for (const k of PERMISOS) {
    if (typeof cambios[k] === "boolean") limpio[k] = cambios[k];
  }
  if (Object.keys(limpio).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(limpio).eq("id", profileId);
  if (error) return { ok: false, error: error.message };

  // El catálogo del equipo (avatares de tareas, leads, procesos) lee el área y
  // el nombre de `team_members`, no del perfil. Sin esto, cambiar el área aquí
  // no cambiaría el color en ningún otro lado.
  const espejo: { name?: string; department?: Department | null } = {};
  if (limpio.full_name !== undefined) espejo.name = limpio.full_name;
  if (limpio.department !== undefined) espejo.department = limpio.department;
  if (Object.keys(espejo).length > 0) {
    const { error: eTm } = await supabase
      .from("team_members")
      .update(espejo)
      .eq("profile_id", profileId);
    if (eTm) return { ok: false, error: `Perfil guardado, catálogo no: ${eTm.message}` };
  }

  revalidatePath("/equipo");
  return { ok: true };
}
