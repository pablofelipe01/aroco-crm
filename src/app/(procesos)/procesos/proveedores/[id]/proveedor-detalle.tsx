"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ESTADO_TONE } from "@/lib/procesos/proveedor-opts";
import type { Contrato, Departamento, Proveedor, ProveedorDocumento } from "@/lib/types/database";
import { ProveedorForm } from "../proveedor-form";
import { Documentos } from "./documentos";
import { ContratoCard } from "./contrato";

const SECCIONES: { titulo: string; campos: [keyof Proveedor, string][] }[] = [
  {
    titulo: "Identificación",
    campos: [
      ["codigo", "Código productor"],
      ["tipo_proveedor", "Tipo de proveedor"],
      ["tipo_documento", "Tipo de documento"],
      ["numero_documento", "Número de documento"],
    ],
  },
  {
    titulo: "Ubicación",
    campos: [
      ["departamento", "Departamento"],
      ["municipio", "Municipio"],
      ["direccion", "Dirección"],
      ["coordenadas", "Coordenadas"],
    ],
  },
  {
    titulo: "Asociación / Programa",
    campos: [
      ["pertenece_asociacion", "Pertenece a asociación"],
      ["asociacion", "Asociación / Vereda / Cooperativa"],
      ["nit_asociacion", "NIT asociación"],
      ["pertenece_programa", "Pertenece a programa"],
      ["programa", "Programa"],
    ],
  },
  {
    titulo: "Contacto",
    campos: [
      ["contacto", "Contacto"],
      ["celular", "Celular"],
      ["whatsapp", "WhatsApp"],
      ["email", "Email"],
    ],
  },
  {
    titulo: "Producción y calidad",
    campos: [
      ["variedad_cacao", "Variedad"],
      ["tipo_secado", "Tipo de secado"],
      ["cap_baba_mensual", "Cap. baba mensual"],
      ["cap_baba_anual", "Cap. baba anual"],
      ["cap_seco_mensual", "Cap. seco mensual"],
      ["cap_seco_anual", "Cap. seco anual"],
      ["humedad", "Humedad %"],
      ["num_productores_compra", "# productores"],
      ["libre_deforestacion", "Libre de deforestación"],
      ["libre_trabajo_infantil", "Libre de trabajo infantil"],
    ],
  },
  {
    titulo: "Datos bancarios",
    campos: [
      ["banco", "Banco"],
      ["tipo_cuenta", "Tipo de cuenta"],
      ["numero_cuenta", "# de cuenta"],
      ["cedula_titular", "Cédula titular"],
      ["nombre_titular", "Nombre titular"],
      ["regimen_tributario", "Régimen tributario"],
    ],
  },
  {
    titulo: "Referencias y aceptaciones",
    campos: [
      ["referencia_comercial_1", "Referencia comercial 1"],
      ["referencia_comercial_2", "Referencia comercial 2"],
      ["acepta_compromisos_eticos", "Acepta compromisos éticos"],
      ["acepta_politica_datos", "Acepta política de datos"],
    ],
  },
];

export function ProveedorDetalle({
  proveedor,
  departamentos,
  municipios,
  documentos,
  contrato,
  canWrite,
}: {
  proveedor: Proveedor;
  departamentos: Departamento[];
  municipios: { departamento: string; nombre: string }[];
  documentos: ProveedorDocumento[];
  contrato: Contrato | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [edit, setEdit] = React.useState(false);

  const val = (k: keyof Proveedor) => {
    const v = proveedor[k];
    if (v == null || v === "") return null;
    return String(v);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/procesos/proveedores" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Proveedores
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fg">{proveedor.nombre}</h1>
          <p className="mt-1 flex items-center gap-2 text-xs text-fg-subtle">
            <Badge tone={ESTADO_TONE[proveedor.estado] ?? "neutral"}>{proveedor.estado}</Badge>
            {proveedor.codigo && <span className="font-mono">{proveedor.codigo}</span>}
          </p>
        </div>
        {canWrite && (
          <Button size="sm" variant="secondary" onClick={() => setEdit(true)}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
        )}
      </div>

      {(proveedor.certificaciones.length > 0 || proveedor.sellos.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {proveedor.certificaciones.map((c) => (
            <Badge key={c} tone="accent">{c}</Badge>
          ))}
          {proveedor.sellos.map((s) => (
            <Badge key={s} tone="info">{s}</Badge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {SECCIONES.map((sec) => {
          const filas = sec.campos.filter(([k]) => val(k) != null);
          if (filas.length === 0) return null;
          return (
            <Card key={sec.titulo}>
              <CardHeader>
                <CardTitle>{sec.titulo}</CardTitle>
              </CardHeader>
              <CardBody>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  {filas.map(([k, label]) => (
                    <div key={k}>
                      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</dt>
                      <dd className="text-fg">{val(k)}</dd>
                    </div>
                  ))}
                </dl>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <ContratoCard proveedorId={proveedor.id} contrato={contrato} canWrite={canWrite} />

      <Documentos proveedorId={proveedor.id} documentos={documentos} canWrite={canWrite} />

      <ProveedorForm
        open={edit}
        onClose={() => setEdit(false)}
        departamentos={departamentos}
        municipios={municipios}
        initial={proveedor}
        onSaved={() => {
          setEdit(false);
          router.refresh();
        }}
      />
    </div>
  );
}
