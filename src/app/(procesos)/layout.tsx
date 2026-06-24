import { redirect } from "next/navigation";
import { ProcesosShell } from "@/components/procesos/procesos-shell";
import { getSessionContext } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";

/** Layout autenticado de la vertiente de Procesos. */
export default async function ProcesosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let isAdmin = false;
  if (hasSupabaseEnv()) {
    const session = await getSessionContext();
    if (!session) redirect("/login");
    isAdmin = session.profile?.role === "admin";
  }
  return <ProcesosShell isAdmin={isAdmin}>{children}</ProcesosShell>;
}
