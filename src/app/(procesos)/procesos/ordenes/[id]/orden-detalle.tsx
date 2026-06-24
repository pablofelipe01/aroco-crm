"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Send,
  CheckCircle2,
  XCircle,
  Megaphone,
  Sprout,
  FileDown,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { OC_ESTADO_TONE, OC_CASOS, OC_CASO_LABEL, COP } from "@/lib/procesos/oc-opts";
import type { OcCaso } from "@/lib/procesos/oc-opts";
import type { OrdenCompra } from "@/lib/types/database";
import type { ProveedorHabilitado } from "../page";
import { OrdenForm } from "../orden-form";
import { enviarAprobacion, aprobarOrden, rechazarOrden, emitirOrden } from "../actions";

export function OrdenDetalle({
  orden,
  proveedorNombre,
  proveedorId,
  proveedores,
  canWrite,
  canApprove,
}: {
  orden: OrdenCompra;
  proveedorNombre: string;
  proveedorId: string | null;
  proveedores: ProveedorHabilitado[];
  canWrite: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [edit, setEdit] = React.useState(false);
  const [caso, setCaso] = React.useState<OcCaso>(orden.tipo_caso);
  const [rechazo, setRechazo] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo completar", description: res.error });
      return false;
    }
    toast({ tone: "success", title: okMsg });
    router.refresh();
    return true;
  }

  const e = orden.estado;
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("es-CO") : null);
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("es-CO") : "—");

  const datos: [string, string][] = [
    ["Caso", OC_CASO_LABEL[orden.tipo_caso]],
    ["Volumen", orden.volumen_kg != null ? `${orden.volumen_kg.toLocaleString("es-CO")} kg` : "—"],
    ["Precio/kg", orden.precio_kg != null ? COP.format(orden.precio_kg) : "—"],
    ["Valor total", orden.valor_total ? COP.format(orden.valor_total) : "—"],
    ["Fecha de entrega", fmtDate(orden.fecha_entrega)],
    ["Lugar de entrega", orden.lugar_entrega ?? "—"],
  ];

  const hitos: [string, string | null][] = [
    ["Creada", fmt(orden.created_at)],
    ["Aprobada", fmt(orden.aprobada_en)],
    ["Emitida", fmt(orden.emitida_en)],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/procesos/ordenes"
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> Órdenes de compra
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-semibold text-fg">
            {orden.consecutivo ?? "Orden en borrador"}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-fg-muted">
            {proveedorId ? (
              <Link
                href={`/procesos/proveedores/${proveedorId}`}
                className="inline-flex items-center gap-1 hover:text-accent"
              >
                <Sprout className="h-3.5 w-3.5" /> {proveedorNombre}
              </Link>
            ) : (
              proveedorNombre
            )}
            <Badge tone={OC_ESTADO_TONE[e]}>{e}</Badge>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(e === "Aprobada" || e === "Emitida") && (
            <Link href={`/print/orden/${orden.id}`} target="_blank">
              <Button size="sm" variant="secondary">
                <FileDown className="h-4 w-4" /> Generar PDF
              </Button>
            </Link>
          )}
          {canWrite && (e === "Borrador" || e === "En revisión") && (
            <Button size="sm" variant="secondary" onClick={() => setEdit(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalle de la orden</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            {datos.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{k}</dt>
                <dd className="text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          {orden.observaciones && (
            <p className="mt-3 rounded-[var(--radius-md)] bg-bg-subtle/40 p-2.5 text-sm text-fg-muted">
              {orden.observaciones}
            </p>
          )}
        </CardBody>
      </Card>

      {e === "Rechazada" && orden.motivo_rechazo && (
        <div className="rounded-[var(--radius-md)] border border-danger/40 bg-danger/5 p-3 text-sm">
          <b className="text-danger">Rechazada.</b> {orden.motivo_rechazo}
        </div>
      )}

      {/* Acciones según el estado */}
      {canWrite && (e === "Borrador" || e === "En revisión" || e === "Aprobada") && (
        <Card>
          <CardHeader>
            <CardTitle>Acciones</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {e === "Borrador" && (
              <div className="space-y-2">
                <p className="text-sm text-fg-muted">
                  Define el caso y envía a aprobación. ROC/Finca se aprueba automáticamente.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={caso}
                    onChange={(ev) => setCaso(ev.target.value as OcCaso)}
                    className="w-auto"
                  >
                    {OC_CASOS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.etiqueta}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    loading={busy}
                    onClick={() =>
                      run(
                        () => enviarAprobacion(orden.id, caso),
                        caso === "roc" ? "Aprobada automáticamente" : "Enviada a aprobación",
                      )
                    }
                  >
                    <Send className="h-4 w-4" /> Enviar a aprobación
                  </Button>
                </div>
              </div>
            )}

            {e === "En revisión" && (
              <div className="flex flex-wrap gap-2">
                {canApprove ? (
                  <>
                    <Button
                      size="sm"
                      loading={busy}
                      onClick={() => run(() => aprobarOrden(orden.id), "Orden aprobada")}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setMotivo(""); setRechazo(true); }}
                    >
                      <XCircle className="h-4 w-4 text-danger" /> Rechazar
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-fg-subtle">Pendiente de aprobación por Gerencia.</p>
                )}
              </div>
            )}

            {e === "Aprobada" && (
              <div className="space-y-2">
                <p className="text-sm text-fg-muted">
                  Emite la OC en firme al proveedor y alerta al equipo de logística.
                </p>
                <Button
                  size="sm"
                  loading={busy}
                  onClick={() => run(() => emitirOrden(orden.id), "Orden emitida en firme")}
                >
                  <Megaphone className="h-4 w-4" /> Emitir en firme
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Trazabilidad</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="space-y-2">
            {hitos
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <li key={k} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>
                    <b className="text-fg">{k}</b>{" "}
                    <span className="font-mono text-xs text-fg-subtle">{v}</span>
                  </span>
                </li>
              ))}
          </ul>
        </CardBody>
      </Card>

      <OrdenForm
        open={edit}
        onClose={() => setEdit(false)}
        proveedores={proveedores}
        initial={orden}
        onSaved={() => setEdit(false)}
      />

      <Modal
        open={rechazo}
        onClose={() => setRechazo(false)}
        size="md"
        title="Rechazar orden"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRechazo(false)}>Cancelar</Button>
            <Button
              size="sm"
              loading={busy}
              disabled={!motivo.trim()}
              onClick={async () => {
                const ok = await run(() => rechazarOrden(orden.id, motivo), "Orden rechazada");
                if (ok) setRechazo(false);
              }}
            >
              Confirmar rechazo
            </Button>
          </>
        }
      >
        <Field label="Motivo del rechazo">
          <Textarea rows={3} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
