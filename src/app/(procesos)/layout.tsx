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
  if (hasSupabaseEnv()) {
    const session = await getSessionContext();
    if (!session) redirect("/login");
  }
  return <ProcesosShell>{children}</ProcesosShell>;
}
