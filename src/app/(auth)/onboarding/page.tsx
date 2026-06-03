import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { getSessionContext, isOnboarded } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  if (!hasSupabaseEnv()) redirect("/dashboard");

  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (isOnboarded(session.profile)) redirect("/dashboard");

  return (
    <Card className="shadow-[var(--shadow-soft-lg)]">
      <CardBody className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-fg">Crea tu cuenta</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Bienvenido a AROCO. Confirma tus datos y define tu contraseña.
          </p>
        </div>
        <OnboardingForm
          initialName={session.profile?.full_name ?? ""}
        />
      </CardBody>
    </Card>
  );
}
