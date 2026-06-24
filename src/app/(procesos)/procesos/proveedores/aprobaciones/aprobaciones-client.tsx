"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, Inbox, ExternalLink, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cambiarEstadoProveedor } from "../actions";
import type { ProveedorPendiente } from "./page";

function diasDesde(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function AprobacionesClient({ pendientes }: { pendientes: ProveedorPendiente[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [rechazar, setRechazar] = React.useState<ProveedorPendiente | null>(null);
  const [motivo, setMotivo] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function aprobar(p: ProveedorPendiente) {
    setBusyId(p.id);
    const res = await cambiarEstadoProveedor(p.id, "Habilitado");
    setBusyId(null);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo habilitar", description: res.error });
      return;
    }
    toast({ tone: "success", title: `${p.nombre} habilitado` });
    router.refresh();
  }

  async function confirmarRechazo() {
    if (!rechazar) return;
    setBusyId(rechazar.id);
    const res = await cambiarEstadoProveedor(rechazar.id, "Rechazado", motivo);
    setBusyId(null);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo rechazar", description: res.error });
      return;
    }
    toast({ tone: "success", title: `${rechazar.nombre} rechazado` });
    setRechazar(null);
    setMotivo("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Link
        href="/procesos/proveedores"
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> Proveedores
      </Link>

      <PageHeader
        title="Bandeja de aprobaciones"
        description="Proveedores en estudio pendientes de validación por Gerencia Administrativa."
      />

      {pendientes.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title="Todo al día"
          description="No hay proveedores pendientes de aprobación."
        />
      ) : (
        <div className="space-y-3">
          {pendientes.map((p) => {
            const dias = diasDesde(p.created_at);
            const busy = busyId === p.id;
            return (
              <Card key={p.id}>
                <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/procesos/proveedores/${p.id}`}
                        className="inline-flex items-center gap-1 font-medium text-fg hover:text-accent"
                      >
                        {p.nombre}
                        <ExternalLink className="h-3.5 w-3.5 text-fg-subtle" />
                      </Link>
                      <Badge tone="warn">En estudio</Badge>
                      <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
                        <Clock className="h-3 w-3" />
                        {dias === 0 ? "hoy" : `hace ${dias} d`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-fg-subtle">
                      {p.codigo ? `${p.codigo} · ` : ""}
                      {p.numero_documento ?? "sin documento"}
                      {" · "}
                      {[p.municipio, p.departamento].filter(Boolean).join(", ") || "sin ubicación"}
                      {p.asociacion ? ` · ${p.asociacion}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setMotivo(""); setRechazar(p); }}
                      disabled={busy}
                    >
                      <XCircle className="h-4 w-4 text-danger" /> Rechazar
                    </Button>
                    <Button size="sm" onClick={() => aprobar(p)} loading={busy}>
                      <CheckCircle2 className="h-4 w-4" /> Habilitar
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={rechazar !== null}
        onClose={() => setRechazar(null)}
        size="md"
        title={`Rechazar ${rechazar?.nombre ?? ""}`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRechazar(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={confirmarRechazo}
              loading={busyId === rechazar?.id}
              disabled={!motivo.trim()}
            >
              Confirmar rechazo
            </Button>
          </>
        }
      >
        <Field label="Motivo del rechazo">
          <Textarea
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Causales por las que no se habilita el proveedor…"
          />
        </Field>
      </Modal>
    </div>
  );
}
