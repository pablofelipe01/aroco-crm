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

  if (!email.endsWith("@aroco.co")) {
    return { error: "El correo debe pertenecer al dominio @aroco.co." };
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

  if (error) return { error: error.message };

  revalidatePath("/equipo");
  return { success: `Invitación enviada a ${email}.` };
}

/** Toggle a profile's active flag (admin only). */
export async function toggleProfileActive(profileId: string, active: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ active })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/equipo");
}
