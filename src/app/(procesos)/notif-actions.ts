"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function marcarNotificacionLeida(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notificaciones").update({ leida: true }).eq("id", id);
  revalidatePath("/procesos", "layout");
}

export async function marcarTodasLeidas(): Promise<void> {
  const supabase = await createClient();
  // RLS limita el update a las notificaciones del propio usuario.
  await supabase.from("notificaciones").update({ leida: true }).eq("leida", false);
  revalidatePath("/procesos", "layout");
}
