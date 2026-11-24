import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CatalogoCampo } from "@/lib/finca/captura-equipos";
import { CampoClient } from "./campo-client";

export const dynamic = "force-dynamic";

/**
 * Captura de labores desde el celular. El catálogo viaja DENTRO del HTML: el
 * service worker guarda esta página y, sin señal, la sirve con el catálogo de
 * la última vez que se abrió con internet.
 */
export default async function CampoPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login?redirectedFrom=/campo");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finca_catalogo_captura");

  if (error || !data) {
    const sinPermiso = error?.code === "42501";
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-fg-subtle" aria-hidden />
        <h1 className="text-lg font-semibold text-fg">
          {sinPermiso ? "Sin acceso al registro de labores" : "No se pudo cargar la lista"}
        </h1>
        <p className="text-sm text-fg-muted">
          {sinPermiso
            ? "El registro de labores es para el área Finca y Dirección. Si trabaja en la finca, pida que le asignen el área."
            : "Intente de nuevo en un momento."}
        </p>
        <Link href="/elegir" className="text-sm text-accent underline">
          Volver al inicio
        </Link>
      </main>
    );
  }

  return (
    <CampoClient
      catalogo={data as unknown as CatalogoCampo}
      usuario={session.userId}
      nombre={session.profile?.full_name ?? session.email}
    />
  );
}
