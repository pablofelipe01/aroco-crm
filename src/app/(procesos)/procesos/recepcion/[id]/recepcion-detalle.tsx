"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, PackageCheck, Camera, Upload, Trash2, ExternalLink } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  RECEPCION_ESTADO_TONE,
  TIPOS_ENVIO,
  FOTO_CATEGORIAS,
} from "@/lib/procesos/recepcion-opts";
import type { RecepcionEnvio, FotoCategoria } from "@/lib/procesos/recepcion-opts";
import type { Recepcion, RecepcionFoto } from "@/lib/types/database";
import {
  actualizarRecepcion,
  cerrarRecepcion,
  subirFoto,
  eliminarFoto,
  urlFoto,
} from "../actions";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function RecepcionDetalle({
  recepcion,
  fotos,
  ordenId,
  consecutivo,
  proveedorNombre,
  precioKg,
  canWrite,
}: {
  recepcion: Recepcion;
  fotos: RecepcionFoto[];
  ordenId: string | null;
  consecutivo: string | null;
  proveedorNombre: string;
  precioKg: number | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const r = recepcion;
  const cerrada = r.estado === "Cerrada";
  const editable = canWrite && !cerrada;

  const [tipoEnvio, setTipoEnvio] = React.useState<RecepcionEnvio | "">(r.tipo_envio ?? "");
  const [pesoRec, setPesoRec] = React.useState(r.peso_recibido_kg?.toString() ?? "");
  const [humedad, setHumedad] = React.useState(r.humedad_pct?.toString() ?? "");
  const [ferment, setFerment] = React.useState(r.fermentacion_pct?.toString() ?? "");
  const [impurezas, setImpurezas] = React.useState(r.impurezas_pct?.toString() ?? "");
  const [sensorial, setSensorial] = React.useState(r.analisis_sensorial ?? "");
  const [remisiones, setRemisiones] = React.useState(r.remisiones ?? "");
  const [obs, setObs] = React.useState(r.observaciones ?? "");
  const [saving, setSaving] = React.useState(false);
  const [closing, setClosing] = React.useState(false);

  async function guardar() {
    setSaving(true);
    const res = await actualizarRecepcion(r.id, {
      tipo_envio: tipoEnvio,
      peso_recibido_kg: pesoRec,
      humedad_pct: humedad,
      fermentacion_pct: ferment,
      impurezas_pct: impurezas,
      analisis_sensorial: sensorial,
      remisiones,
      observaciones: obs,
    });
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Guardado" });
    router.refresh();
  }

  async function cerrar() {
    setClosing(true);
    const res = await cerrarRecepcion(r.id);
    setClosing(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se puede cerrar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Reporte cerrado" });
    router.refresh();
  }

  const solicitado = r.peso_solicitado_kg;
  const recibidoNum = Number(pesoRec) || 0;
  const diff = solicitado != null ? recibidoNum - solicitado : null;
  const valorEstimado = precioKg != null ? recibidoNum * precioKg : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/procesos/recepcion"
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> Recepción en bodega
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-fg">
            Recepción · <span className="font-mono">{consecutivo ?? "OC"}</span>
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-fg-muted">
            {proveedorNombre}
            <Badge tone={RECEPCION_ESTADO_TONE[r.estado]}>{r.estado}</Badge>
          </p>
        </div>
        {ordenId && (
          <Link
            href={`/procesos/ordenes/${ordenId}`}
            className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          >
            Ver OC <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* Pesaje */}
      <Card>
        <CardHeader>
          <CardTitle>Pesaje y envío</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Tipo de envío">
              <Select
                value={tipoEnvio}
                onChange={(e) => setTipoEnvio(e.target.value as RecepcionEnvio | "")}
                disabled={!editable}
              >
                <option value="">Selecciona…</option>
                {TIPOS_ENVIO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Peso solicitado (kg)">
              <Input value={solicitado != null ? String(solicitado) : "—"} disabled readOnly />
            </Field>
            <Field label="Peso recibido (kg)">
              <Input
                type="number"
                inputMode="decimal"
                value={pesoRec}
                onChange={(e) => setPesoRec(e.target.value)}
                disabled={!editable}
              />
            </Field>
          </div>
          {diff != null && pesoRec !== "" && (
            <p className="text-sm text-fg-muted">
              Diferencia vs solicitado:{" "}
              <b className={diff < 0 ? "text-danger" : "text-success"}>
                {diff > 0 ? "+" : ""}
                {diff.toLocaleString("es-CO")} kg
              </b>
              {valorEstimado != null && (
                <>
                  {" · "}Valor estimado: <b className="tnum">{COP.format(valorEstimado)}</b>
                </>
              )}
            </p>
          )}
        </CardBody>
      </Card>

      {/* Calidad */}
      <Card>
        <CardHeader>
          <CardTitle>Evaluación de calidad</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Humedad (%)">
              <Input type="number" inputMode="decimal" value={humedad} onChange={(e) => setHumedad(e.target.value)} disabled={!editable} />
            </Field>
            <Field label="Fermentación (%)">
              <Input type="number" inputMode="decimal" value={ferment} onChange={(e) => setFerment(e.target.value)} disabled={!editable} />
            </Field>
            <Field label="Impurezas (%)">
              <Input type="number" inputMode="decimal" value={impurezas} onChange={(e) => setImpurezas(e.target.value)} disabled={!editable} />
            </Field>
          </div>
          <Field label="Análisis sensorial">
            <Textarea rows={2} value={sensorial} onChange={(e) => setSensorial(e.target.value)} disabled={!editable} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Remisiones de entrada">
              <Input value={remisiones} onChange={(e) => setRemisiones(e.target.value)} disabled={!editable} />
            </Field>
            <Field label="Observaciones">
              <Input value={obs} onChange={(e) => setObs(e.target.value)} disabled={!editable} />
            </Field>
          </div>

          {editable && (
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={guardar} loading={saving}>
                <Save className="h-4 w-4" /> Guardar
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Fotos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-accent" /> Registro fotográfico
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {FOTO_CATEGORIAS.map((cat) => (
            <FotoCategoriaRow
              key={cat.id}
              recepcionId={r.id}
              categoria={cat.id}
              label={cat.label}
              fotos={fotos.filter((f) => f.categoria === cat.id)}
              editable={editable}
            />
          ))}
        </CardBody>
      </Card>

      {editable && (
        <div className="flex justify-end">
          <Button onClick={cerrar} loading={closing}>
            <PackageCheck className="h-4 w-4" /> Cerrar reporte de recepción
          </Button>
        </div>
      )}

      {cerrada && r.cerrada_en && (
        <p className="text-center text-xs text-fg-subtle">
          Reporte cerrado el {new Date(r.cerrada_en).toLocaleString("es-CO")}.
        </p>
      )}
    </div>
  );
}

function FotoCategoriaRow({
  recepcionId,
  categoria,
  label,
  fotos,
  editable,
}: {
  recepcionId: string;
  categoria: FotoCategoria;
  label: string;
  fotos: RecepcionFoto[];
  editable: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("recepcionId", recepcionId);
    fd.set("categoria", categoria);
    fd.set("file", file);
    const res = await subirFoto(fd);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo subir", description: res.error });
      return;
    }
    router.refresh();
  }

  async function ver(path: string) {
    const url = await urlFoto(path);
    if (url) window.open(url, "_blank");
  }

  async function borrar(id: string) {
    setBusy(true);
    const res = await eliminarFoto(id);
    setBusy(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo eliminar", description: res.error });
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-fg">
          {label} <span className="text-xs text-fg-subtle">({fotos.length})</span>
        </span>
        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={onFile}
            />
            <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()} loading={busy}>
              <Upload className="h-3.5 w-3.5" /> Subir
            </Button>
          </>
        )}
      </div>
      {fotos.length === 0 ? (
        <p className="text-xs text-fg-subtle">Sin archivos.</p>
      ) : (
        <ul className="space-y-1">
          {fotos.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <button type="button" onClick={() => ver(f.file_path)} className="min-w-0 flex-1 truncate text-left text-fg-muted hover:text-accent">
                {f.nombre}
              </button>
              {editable && (
                <button
                  type="button"
                  onClick={() => borrar(f.id)}
                  className="rounded-[var(--radius-sm)] p-1 text-fg-subtle hover:text-danger"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
