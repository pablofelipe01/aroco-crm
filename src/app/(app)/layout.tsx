import { redirect } from "next/navigation";
import { AppShell, type ShellUser } from "@/components/layout/app-shell";
import { getSessionContext, isOnboarded } from "@/lib/auth";
import { proveedorEnSesion } from "@/lib/proveedor-sesion";
import { hasSupabaseEnv } from "@/lib/env";

/**
 * Authenticated app layout. Loads the profile server-side and enforces the
 * session. Before Supabase keys are configured it falls back to a placeholder
 * admin so the UI remains explorable during early development.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasSupabaseEnv()) {
    const placeholder: ShellUser = {
      name: "Álvaro Acosta (demo)",
      department: "Dirección",
      role: "admin",
    };
    return <AppShell user={placeholder}>{children}</AppShell>;
  }

  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (!isOnboarded(session.profile)) {
    // Un proveedor no tiene perfil a propósito, así que caería aquí. Va a su
    // portal, no al onboarding del equipo.
    if (await proveedorEnSesion()) redirect("/portal");
    redirect("/onboarding");
  }

  const profile = session.profile!;
  const user: ShellUser = {
    name: profile.full_name,
    department: profile.department,
    role: profile.role,
    permisos: { ve_mercado: profile.ve_mercado },
  };

  return <AppShell user={user}>{children}</AppShell>;
}
