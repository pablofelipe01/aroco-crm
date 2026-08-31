"use client";

import * as React from "react";
import Link from "next/link";
import { Copy, Check, ExternalLink, ArrowLeft } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Lo que ve alguien del equipo que entra a `/portal`.
 *
 * El portal es para proveedores externos, así que un miembro del CRM no tiene
 * ficha y no puede pasar de aquí. En vez de rebotarlo a un login inútil, se le
 * dice qué es esto y se le da el enlace que hay que enviarle a los proveedores
 * — que es lo que realmente venía buscando.
 */
export function VistaEquipo({ nombre }: { nombre: string }) {
  const [copiado, setCopiado] = React.useState(false);
  const [enlace, setEnlace] = React.useState("");

  React.useEffect(() => {
    // Leer el origen exige el navegador, así que solo se puede después de
    // montar. No es un setState en cascada: corre una vez y no depende de nada.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window solo existe tras montar
    setEnlace(`${window.location.origin}/portal/registro`);
  }, []);

  async function copiar() {
    await navigator.clipboard.writeText(enlace);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-semibold text-fg">Portal de proveedores</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {nombre}, este sitio es para los proveedores de insumos, no para el equipo.
        Aquí ellos se registran, suben sus documentos y radican cuentas de cobro.
        Como tu cuenta es del CRM, no tienes una ficha de proveedor y no puedes
        entrar a un panel propio.
      </p>

      <Card className="mt-6">
        <CardBody>
          <p className="text-sm font-medium text-fg">Enlace para enviarle a un proveedor</p>
          <p className="mt-1 text-xs text-fg-subtle">
            Con este enlace se registra solo. Después aparece en Proveedores Insumos
            para que alguien lo verifique.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[var(--radius-md)] border border-border bg-bg-subtle px-3 py-2 font-mono text-xs text-fg-muted">
              {enlace || "…"}
            </code>
            <Button size="sm" variant="secondary" onClick={copiar} disabled={!enlace}>
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardBody className="space-y-3">
          <p className="text-sm font-medium text-fg">Cómo funciona</p>
          <ol className="space-y-2 text-sm text-fg-muted">
            <li>
              <span className="text-fg">1.</span> El proveedor se registra con ese enlace y
              elige su contraseña.
            </li>
            <li>
              <span className="text-fg">2.</span> Sube su RUT, cédula o NIT, certificado
              bancario y cámara de comercio, con las fechas de vencimiento.
            </li>
            <li>
              <span className="text-fg">3.</span> Le llega un aviso a quien verifica, que
              revisa los documentos y lo activa.
            </li>
            <li>
              <span className="text-fg">4.</span> Ya activo, puede radicar cuentas de cobro
              —sueltas o contra una solicitud de compra aprobada— y verlas hasta que se
              paguen.
            </li>
          </ol>
        </CardBody>
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/proveedores">
          <Button variant="secondary">
            <ArrowLeft className="h-4 w-4" />
            Ir a Proveedores Insumos
          </Button>
        </Link>
        <a href="/portal/registro" target="_blank" rel="noopener noreferrer">
          <Button variant="ghost">
            Ver el formulario de registro
            <ExternalLink className="h-4 w-4" />
          </Button>
        </a>
      </div>
    </div>
  );
}
