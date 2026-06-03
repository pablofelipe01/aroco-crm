"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { KeyRound } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { fadeUp } from "@/lib/motion";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(
          error.message.toLowerCase().includes("session")
            ? "El enlace expiró o no es válido. Solicita uno nuevo desde “¿Olvidaste tu contraseña?”."
            : error.message,
        );
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo actualizar la contraseña. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <Card className="shadow-[var(--shadow-soft-lg)]">
        <CardBody className="space-y-5">
          <div>
            <h1 className="text-lg font-semibold text-fg">Nueva contraseña</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Define tu nueva contraseña para entrar.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Contraseña" hint="Mínimo 8 caracteres.">
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="Confirmar contraseña">
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>

            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              <KeyRound className="h-4 w-4" />
              Guardar contraseña
            </Button>
          </form>
        </CardBody>
      </Card>
    </motion.div>
  );
}
