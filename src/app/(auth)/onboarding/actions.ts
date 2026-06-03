"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEPARTMENTS, type Department } from "@/lib/nav";

export type OnboardingState = { error?: string };

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const department = String(formData.get("department") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  if (!fullName) return { error: "El nombre es obligatorio." };
  if (!DEPARTMENTS.includes(department as Department)) {
    return { error: "Selecciona un departamento válido." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== passwordConfirm) {
    return { error: "Las contraseñas no coinciden." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Set the user's password (invited users arrive without one).
  const { error: pwErr } = await supabase.auth.updateUser({ password });
  if (pwErr) return { error: pwErr.message };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      department: department as Department,
      onboarded: true,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  redirect("/dashboard");
}
