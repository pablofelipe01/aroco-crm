import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { CatalogosClient } from "./catalogos-client";
import type { Catalogo } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function CatalogosPage() {
  const session = await getSessionContext();
  if (session?.profile?.role !== "admin") redirect("/procesos/proveedores");

  const supabase = await createClient();
  const { data } = await supabase
    .from("catalogos")
    .select("*")
    .order("tipo", { ascending: true })
    .order("orden", { ascending: true });

  return <CatalogosClient items={(data ?? []) as Catalogo[]} />;
}
