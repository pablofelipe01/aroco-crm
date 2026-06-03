"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { LogIn, Info } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/env";
import { fadeUp } from "@/lib/motion";

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const configured = hasSupabaseEnv();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(
          error.message === "Invalid login credentials"
            ? "Correo o contraseña incorrectos."
            : error.message,
        );
        return;
      }
      const redirectTo = params.get("redirectedFrom") ?? "/dashboard";
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("No se pudo conectar. Verifica la configuración.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <Card className="shadow-[var(--shadow-soft-lg)]">
        <CardBody className="space-y-5">
          <div>
            <h1 className="text-lg font-semibold text-fg">Iniciar sesión</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Ingresa con tu cuenta de AROCO.
            </p>
          </div>

          {!configured && (
            <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-dashed border-border-strong bg-warn-soft/40 px-3 py-2.5 text-xs text-warn">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Supabase aún no está configurado. Agrega las claves a{" "}
                <code className="font-mono">.env.local</code> para habilitar el
                acceso.
              </span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Correo electrónico">
              <Input
                type="email"
                autoComplete="email"
                placeholder="nombre@aroco.co"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Contraseña">
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>

            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              loading={loading}
              disabled={!configured}
            >
              <LogIn className="h-4 w-4" />
              Entrar
            </Button>
          </form>

          <p className="text-center text-xs text-fg-subtle">
            El acceso es por invitación del administrador.
          </p>
        </CardBody>
      </Card>
    </motion.div>
  );
}
