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

  if (!fullName) return { error: "El nombre es obligatorio." };
  if (!DEPARTMENTS.includes(department as Department)) {
    return { error: "Selecciona un departamento válido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      department: department as Department,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  redirect("/dashboard");
}
