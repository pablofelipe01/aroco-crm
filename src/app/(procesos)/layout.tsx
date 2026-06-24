import { redirect } from "next/navigation";
import { ProcesosShell } from "@/components/procesos/procesos-shell";
import { NotifBell } from "@/components/procesos/notif-bell";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import type { Notificacion } from "@/lib/types/database";

/** Layout autenticado de la vertiente de Procesos. */
export default async function ProcesosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let isAdmin = false;
  let items: Notificacion[] = [];
  let unread = 0;

  if (hasSupabaseEnv()) {
    const session = await getSessionContext();
    if (!session) redirect("/login");
    isAdmin = session.profile?.role === "admin";

    const supabase = await createClient();
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("notificaciones")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("notificaciones")
        .select("id", { count: "exact", head: true })
        .eq("leida", false),
    ]);
    items = (data ?? []) as Notificacion[];
    unread = count ?? 0;
  }

  return (
    <ProcesosShell isAdmin={isAdmin} bell={<NotifBell items={items} unread={unread} />}>
      {children}
    </ProcesosShell>
  );
}
