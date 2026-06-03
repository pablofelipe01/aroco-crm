import { ShieldAlert, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ModulePlaceholder } from "@/components/module-placeholder";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { initials } from "@/lib/utils";
import { InviteForm } from "./invite-form";

export default async function EquipoPage() {
  if (!hasSupabaseEnv()) {
    return (
      <ModulePlaceholder
        title="Equipo / Ajustes"
        description="Perfiles, departamentos, roles e invitaciones. Solo administradores."
        phase="Fase 1"
        icon={Users}
        features={["Invitaciones", "Perfiles", "Roles", "Catálogo de equipo"]}
      />
    );
  }

  const session = await getSessionContext();
  const isAdmin = session?.profile?.role === "admin";

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Equipo / Ajustes" />
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="Acceso restringido"
          description="Solo los administradores (Dirección) pueden gestionar el equipo."
        />
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: profiles }, { data: team }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("team_members")
      .select("*")
      .order("name", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipo / Ajustes"
        description="Invita usuarios, gestiona perfiles y consulta el catálogo del equipo."
        actions={<Badge tone="accent">Administrador</Badge>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Invitar usuario</CardTitle>
        </CardHeader>
        <CardBody>
          <InviteForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios con acceso ({profiles?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {!profiles?.length ? (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">
              Aún no hay usuarios. Invita al primero arriba.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {profiles.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-mono text-xs font-medium text-accent-fg">
                    {initials(p.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {p.full_name}
                    </p>
                    <p className="truncate text-xs text-fg-muted">{p.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.department && (
                      <Badge tone="neutral">{p.department}</Badge>
                    )}
                    <Badge tone={p.role === "admin" ? "accent" : "neutral"}>
                      {p.role === "admin" ? "Admin" : "Miembro"}
                    </Badge>
                    <Badge tone={p.active ? "success" : "danger"} dot>
                      {p.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo del equipo ({team?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {team?.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 px-3 py-2.5"
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full font-mono text-xs font-medium text-white"
                  style={{ backgroundColor: m.color ?? "var(--accent)" }}
                >
                  {initials(m.name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {m.name}
                  </p>
                  <p className="truncate text-xs text-fg-muted">
                    {m.role_title ?? m.department ?? "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
