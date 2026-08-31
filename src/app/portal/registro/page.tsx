"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { BANCOS, DEPARTAMENTOS, TIPOS_CUENTA } from "@/lib/colombia";
import { COMPRA_CATEGORIAS } from "@/lib/schemas/compra";
import { PERSONA_TIPOS, DOCUMENTO_TIPOS } from "@/lib/schemas/proveedor";
import { registrarProveedor } from "../actions";

export default function RegistroProveedor() {
  const router = useRouter();
  const [tipoPersona, setTipoPersona] = React.useState<string>("Jurídica");
  const [error, setError] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [listo, setListo] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    if (password !== String(fd.get("password2") ?? "")) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }
    setError(null);
    setEnviando(true);

    const res = await registrarProveedor(fd);
    if (!res.ok) {
      setError(res.error ?? "No se pudo completar el registro.");
      setEnviando(false);
      return;
    }
    // El registro pudo salir bien y un archivo no. Decirlo evita que alguien
    // crea que ya subió el RUT cuando no quedó.
    if (res.error) setAviso(res.error);

    // Se entra de una vez: pedirle que vuelva a escribir lo que acaba de
    // elegir, después de llenar un formulario largo, es fricción sin motivo.
    const supabase = createClient();
    await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password,
    });
    setListo(true);
    setEnviando(false);
    router.refresh();
  }

  if (listo) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-success" />
        <h1 className="text-2xl font-semibold text-fg">Registro enviado</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Ya tienes cuenta. AROCO va a revisar tus datos y tus documentos; los que
          falten los puedes subir desde tu panel. Cuando quede verificado podrás
          radicar cuentas de cobro.
        </p>
        {aviso && (
          <p className="mt-3 rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft p-3 text-sm text-warn">
            {aviso}
          </p>
        )}
        <Button className="mt-6" onClick={() => router.push("/portal")}>
          Ir a mi panel
        </Button>
      </div>
    );
  }

  const esNatural = tipoPersona === "Natural";

  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="text-2xl font-semibold text-fg">Registro de proveedor</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Para proveedores de insumos y servicios: oficina, finca, cultivo, bodega,
        transporte y demás. Puedes adjuntar el RUT y el certificado bancario aquí
        mismo.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        <Card>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <h2 className="text-sm font-medium text-fg sm:col-span-2">Quién eres</h2>

            <Field label="Tipo de persona *">
              <Select
                name="tipo_persona"
                value={tipoPersona}
                onChange={(e) => setTipoPersona(e.target.value)}
              >
                {PERSONA_TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo de documento *">
              <Select name="tipo_documento" defaultValue={esNatural ? "CC" : "NIT"} key={tipoPersona}>
                {DOCUMENTO_TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Número de documento *" className="sm:col-span-2">
              <Input name="numero_documento" required placeholder="900123456" />
            </Field>

            {esNatural ? (
              <>
                <Field label="Nombres *">
                  <Input name="nombres" required />
                </Field>
                <Field label="Apellidos *">
                  <Input name="apellidos" required />
                </Field>
              </>
            ) : (
              <Field label="Razón social *" className="sm:col-span-2">
                <Input name="razon_social" required />
              </Field>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <h2 className="text-sm font-medium text-fg sm:col-span-2">Cómo contactarte</h2>
            <Field label="Correo *" hint="Con este correo vas a entrar al portal.">
              <Input name="email" type="email" required autoComplete="email" />
            </Field>
            <Field label="Teléfono *">
              <Input name="telefono" required />
            </Field>
            <Field label="Dirección" className="sm:col-span-2">
              <Input name="direccion" />
            </Field>
            <Field label="Departamento">
              <Select name="departamento" defaultValue="">
                <option value="">— Sin especificar —</option>
                {DEPARTAMENTOS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Municipio">
              <Input name="municipio" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-sm font-medium text-fg">Qué provees</h2>
            <fieldset>
              <legend className="mb-2 text-[11px] uppercase tracking-wide text-fg-subtle">
                Categorías
              </legend>
              <div className="flex flex-wrap gap-3">
                {COMPRA_CATEGORIAS.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm text-fg-muted">
                    <input
                      type="checkbox"
                      name="categorias"
                      value={c}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Descripción *" hint="En una o dos frases, qué vendes o qué servicio prestas.">
              <Textarea name="descripcion" rows={3} required />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <h2 className="text-sm font-medium text-fg sm:col-span-2">A dónde te pagamos</h2>
            <p className="text-xs text-fg-subtle sm:col-span-2">
              Puedes dejarlo para después. Si más adelante cambias la cuenta, el
              registro vuelve a verificación: es la forma de evitar que un pago
              termine en otra parte.
            </p>
            <Field label="Banco">
              <Select name="banco" defaultValue="">
                <option value="">— Sin especificar —</option>
                {BANCOS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo de cuenta">
              <Select name="tipo_cuenta" defaultValue="">
                <option value="">— Sin especificar —</option>
                {TIPOS_CUENTA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Número de cuenta">
              <Input name="numero_cuenta" className="font-mono tnum" />
            </Field>
            <Field label="Titular de la cuenta">
              <Input name="titular_cuenta" />
            </Field>
            <Field label="Documento del titular" className="sm:col-span-2">
              <Input name="documento_titular" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <h2 className="text-sm font-medium text-fg sm:col-span-2">Tus documentos</h2>
            <p className="text-xs text-fg-subtle sm:col-span-2">
              Súbelos ahora si los tienes a mano — es lo que hace falta para
              verificarte. Si no, puedes hacerlo después desde tu panel, junto con
              el resto (cédula o NIT, cámara de comercio).
            </p>

            <Field label="RUT" hint="PDF o imagen, máximo 10 MB.">
              <Input type="file" name="rut" accept=".pdf,image/*" />
            </Field>
            <Field label="Vence el" hint="Si no tiene vigencia, déjalo vacío.">
              <Input type="date" name="rut_vence" />
            </Field>

            <Field label="Certificado bancario" hint="El de la cuenta a la que te pagamos.">
              <Input type="file" name="certificado_bancario" accept=".pdf,image/*" />
            </Field>
            <Field label="Vence el">
              <Input type="date" name="certificado_bancario_vence" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <h2 className="text-sm font-medium text-fg sm:col-span-2">Tu contraseña</h2>
            <Field label="Contraseña *" hint="Mínimo 8 caracteres.">
              <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label="Repite la contraseña *">
              <Input name="password2" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
          </CardBody>
        </Card>

        {error && (
          <div
            role="alert"
            className="rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft p-3"
          >
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <Link href="/portal/login" className="text-sm text-fg-muted hover:text-fg">
            Ya tengo cuenta
          </Link>
          <Button type="submit" loading={enviando}>
            Registrarme
          </Button>
        </div>
      </form>
    </div>
  );
}
