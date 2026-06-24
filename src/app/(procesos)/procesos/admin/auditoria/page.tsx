import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { AuditoriaClient } from "./auditoria-client";
import type { AuditLog } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  const session = await getSessionContext();
  if (session?.profile?.role !== "admin") redirect("/procesos/proveedores");

  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  return <AuditoriaClient entradas={(data ?? []) as AuditLog[]} />;
}
