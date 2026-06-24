"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, CheckCircle2, XCircle, RotateCcw, Ban, History } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ESTADO_TONE } from "@/lib/procesos/proveedor-opts";
import type { Proveedor, ProveedorEstadoLog } from "@/lib/types/database";
import { cambiarEstadoProveedor } from "../actions";

const FLUJO = ["En estudio", "Habilitado"] as const;

type Accion = {
  estado: "En estudio" | "Habilitado" | "Deshabilitado" | "Rechazado";
  label: string;
  icon: React.ElementType;
  tone?: "danger";
  motivoReq?: boolean;
};

function accionesPara(estado: string): Accion[] {
  switch (estado) {
    case "En estudio":
      return [
        { estado: "Habilitado", label: "Aprobar y habilitar", icon: CheckCircle2 },
        { estado: "Rechazado", label: "Rechazar", icon: XCircle, tone: "danger", motivoReq: true },
      ];
    case "Habilitado":
      return [{ estado: "Deshabilitado", label: "Deshabilitar", icon: Ban, tone: "danger", motivoReq: true }];
    case "Rechazado":
    case "Deshabilitado":
      return [{ estado: "En estudio", label: "Volver a estudio", icon: RotateCcw }];
    default:
      return [];
  }
}

export function AprobacionCard({
  proveedor,
  estadoLog,
  canApprove,
}: {
  proveedor: Proveedor;
  estadoLog: ProveedorEstadoLog[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [accion, setAccion] = React.useState<Accion | null>(null);
  const [motivo, setMotivo] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function ejecutar(a: Accion, m: string) {
    setSaving(true);
    const res = await cambiarEstadoProveedor(proveedor.id, a.estado, m || undefined);
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo cambiar el estado", description: res.error });
      return;
    }
    toast({ tone: "success", title: `Proveedor: ${a.estado}` });
    setAccion(null);
    setMotivo("");
    router.refresh();
  }

  function onClick(a: Accion) {
    if (a.motivoReq) {
      setMotivo("");
      setAccion(a);
    } else {
      void ejecutar(a, "");
    }
  }

  const acciones = accionesPara(proveedor.estado);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent" /> Aprobación (Fase 1)
        </CardTitle>
        <Badge tone={ESTADO_TONE[proveedor.estado] ?? "neutral"}>{proveedor.estado}</Badge>
      </CardHeader>
      <CardBody className="space-y-4">
        {/* Stepper del flujo */}
        <div className="flex items-center gap-2">
          {FLUJO.map((e, i) => {
            const done = proveedor.estado === "Habilitado" || (e === "En estudio" && proveedor.estado !== "Rechazado");
            const actual = proveedor.estado === e;
            return (
              <React.Fragment key={e}>
                {i > 0 && <div className="h-px flex-1 bg-border" />}
                <span
                  className={
                    "rounded-full px-3 py-1 text-xs font-medium " +
                    (proveedor.estado === "Habilitado" && e === "Habilitado"
                      ? "bg-success text-white"
                      : actual
                        ? "bg-accent text-accent-fg"
                        : done
                          ? "bg-success/20 text-success"
                          : "bg-bg-subtle text-fg-subtle")
                  }
                >
                  {e}
                </span>
              </React.Fragment>
            );
          })}
          {(proveedor.estado === "Rechazado" || proveedor.estado === "Deshabilitado") && (
            <Badge tone="danger" className="ml-1">{proveedor.estado}</Badge>
          )}
        </div>

        {canApprove ? (
          acciones.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {acciones.map((a) => (
                <Button
                  key={a.estado}
                  size="sm"
                  variant={a.tone === "danger" ? "ghost" : "secondary"}
                  onClick={() => onClick(a)}
                >
                  <a.icon className={"h-4 w-4 " + (a.tone === "danger" ? "text-danger" : "")} />
                  {a.label}
                </Button>
              ))}
            </div>
          )
        ) : (
          <p className="text-xs text-fg-subtle">
            Solo Gerencia Administrativa puede aprobar, rechazar o habilitar.
          </p>
        )}

        {proveedor.comentarios_estado && (
          <p className="rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-2.5 text-xs text-fg-muted">
            <b>Último comentario:</b> {proveedor.comentarios_estado}
          </p>
        )}

        {/* Trazabilidad */}
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            <History className="h-3.5 w-3.5" /> Trazabilidad del estado
          </h3>
          {estadoLog.length === 0 ? (
            <p className="text-sm text-fg-subtle">Sin cambios de estado registrados.</p>
          ) : (
            <ul className="space-y-2">
              {estadoLog.map((l) => (
                <li key={l.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0">
                    <p className="text-fg">
                      {l.estado_anterior ? `${l.estado_anterior} → ` : ""}
                      <b>{l.estado_nuevo}</b>
                      {l.motivo ? ` · ${l.motivo}` : ""}
                    </p>
                    <p className="font-mono text-[11px] text-fg-subtle">
                      {l.usuario_nombre ?? "—"} · {new Date(l.created_at).toLocaleString("es-CO")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>

      <Modal
        open={accion !== null}
        onClose={() => setAccion(null)}
        size="md"
        title={accion?.label ?? ""}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setAccion(null)}>Cancelar</Button>
            <Button
              size="sm"
              onClick={() => accion && ejecutar(accion, motivo)}
              loading={saving}
              disabled={accion?.motivoReq && !motivo.trim()}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <Field label="Motivo">
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Indica el motivo / causales…" />
        </Field>
      </Modal>
    </Card>
  );
}
