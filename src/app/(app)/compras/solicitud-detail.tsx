"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Paperclip,
  Trash2,
  Send,
  Wallet,
  PackageCheck,
  Plus,
} from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatCOP, formatDate, formatNumber } from "@/lib/utils";
import { MONEDAS } from "@/lib/schemas/compra";
import type { SolicitudConCotizaciones } from "./page";
import {
  subirCotizacion,
  borrarCotizacion,
  urlCotizacion,
  enviarAAprobacion,
  aprobarSolicitud,
  rechazarSolicitud,
  registrarPago,
  registrarEntrega,
} from "./actions";

export const ESTADO_TONE: Record<string, BadgeTone> = {
  Borrador: "neutral",
  Pendiente: "warn",
  Aprobada: "success",
  Rechazada: "danger",
};

/** El monto en su moneda: mezclar COP y USD sin marcarlo induce a error. */
export function formatMonto(monto: number, moneda: string): string {
  return moneda === "USD"
    ? `US$ ${formatNumber(monto, 2)}`
    : formatCOP(monto);
}

export function SolicitudDetail({
  solicitud,
  open,
  onClose,
  puedeAprobar,
  userId,
}: {
  solicitud: SolicitudConCotizaciones | null;
  open: boolean;
  onClose: () => void;
  puedeAprobar: boolean;
  userId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [nuevaOpen, setNuevaOpen] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");
  const [pagoMedio, setPagoMedio] = React.useState("");
  const [pagoRef, setPagoRef] = React.useState("");
  const [entregaNotas, setEntregaNotas] = React.useState("");

  if (!solicitud) return null;

  const s = solicitud;
  const cotizaciones = s.compra_cotizaciones;
  const esAutor = s.created_by === userId;
  const editable = s.estado === "Borrador" && (esAutor || puedeAprobar);
  const elegida = cotizaciones.find((c) => c.id === s.cotizacion_elegida_id) ?? null;

  async function correr(fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo", description: res.error });
      return false;
    }
    toast({ tone: "success", title: exito });
    router.refresh();
    return true;
  }

  async function abrirArchivo(path: string) {
    const url = await urlCotizacion(path);
    if (url) window.open(url, "_blank");
    else toast({ tone: "error", title: "No se pudo abrir el archivo" });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono text-sm text-fg-subtle">{s.consecutivo}</span>
          {s.titulo}
        </span>
      }
      subtitle={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={ESTADO_TONE[s.estado]} dot>
            {s.estado}
          </Badge>
          <Badge tone="neutral">{s.categoria}</Badge>
          {s.area && <Badge tone="neutral">{s.area}</Badge>}
          {s.autor && <span className="text-xs text-fg-muted">Pidió {s.autor}</span>}
        </div>
      }
      footer={
        editable && (
          <Button
            size="sm"
            loading={busy}
            onClick={() =>
              correr(() => enviarAAprobacion(s.id), "Enviada a aprobación")
            }
          >
            <Send className="h-4 w-4" />
            Enviar a aprobación
          </Button>
        )
      }
    >
      <div className="space-y-6">
        {(s.descripcion || s.justificacion) && (
          <dl className="space-y-3 text-sm">
            {s.descripcion && (
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">
                  Qué se necesita
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-fg">{s.descripcion}</dd>
              </div>
            )}
            {s.justificacion && (
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">
                  Por qué
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-fg">{s.justificacion}</dd>
              </div>
            )}
          </dl>
        )}

        {s.estado === "Rechazada" && s.motivo_rechazo && (
          <div className="rounded-[var(--radius-md)] border border-danger/30 bg-danger-soft/40 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-danger">
              Rechazada{s.decidio ? ` por ${s.decidio}` : ""}
            </p>
            <p className="mt-1 text-sm text-fg">{s.motivo_rechazo}</p>
          </div>
        )}

        {/* ── Cotizaciones ─────────────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              Cotizaciones ({cotizaciones.length})
            </h3>
            {editable && (
              <Button variant="ghost" size="sm" onClick={() => setNuevaOpen((v) => !v)}>
                <Plus className="h-3.5 w-3.5" />
                Añadir
              </Button>
            )}
          </div>

          {cotizaciones.length === 0 ? (
            <p className="text-sm text-fg-subtle">
              Aún no hay cotizaciones. Sube al menos una para poder pedir aprobación.
            </p>
          ) : (
            <ul className="space-y-2">
              {cotizaciones.map((c, i) => {
                const esElegida = c.id === s.cotizacion_elegida_id;
                return (
                  <li
                    key={c.id}
                    className={
                      "rounded-[var(--radius-md)] border p-3 " +
                      (esElegida
                        ? "border-success bg-success-soft/30"
                        : "border-border bg-surface")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium text-fg">
                          {c.proveedor}
                          {/* La lista viene ordenada por monto: la primera es
                              la más barata, y conviene que salte a la vista. */}
                          {i === 0 && cotizaciones.length > 1 && !esElegida && (
                            <Badge tone="info">más económica</Badge>
                          )}
                          {esElegida && <Badge tone="success">elegida</Badge>}
                        </p>
                        {c.descripcion && (
                          <p className="mt-0.5 text-xs text-fg-subtle">{c.descripcion}</p>
                        )}
                        <p className="mt-1 text-xs text-fg-muted">
                          {c.incluye_iva ? "IVA incluido" : "sin IVA"}
                          {c.tiempo_entrega ? ` · entrega ${c.tiempo_entrega}` : ""}
                          {c.valida_hasta ? ` · vence ${formatDate(c.valida_hasta)}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 font-mono text-sm font-semibold tnum text-fg">
                        {formatMonto(Number(c.monto), c.moneda)}
                      </p>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {c.archivo_path && (
                        <button
                          type="button"
                          onClick={() => abrirArchivo(c.archivo_path!)}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-accent hover:bg-bg-subtle"
                        >
                          <Paperclip className="h-3 w-3" />
                          {c.archivo_nombre ?? "archivo"}
                        </button>
                      )}
                      {puedeAprobar && s.estado === "Pendiente" && (
                        <Button
                          size="sm"
                          loading={busy}
                          onClick={() =>
                            correr(
                              () => aprobarSolicitud(s.id, c.id),
                              `Aprobada con ${c.proveedor}`,
                            )
                          }
                        >
                          <Check className="h-3.5 w-3.5" />
                          Elegir y aprobar
                        </Button>
                      )}
                      {editable && (
                        <button
                          type="button"
                          onClick={() =>
                            correr(() => borrarCotizacion(c.id), "Cotización eliminada")
                          }
                          className="ml-auto rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                          aria-label="Eliminar cotización"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {nuevaOpen && editable && (
            <NuevaCotizacion
              solicitudId={s.id}
              onDone={() => {
                setNuevaOpen(false);
                router.refresh();
              }}
            />
          )}
        </div>

        {/* ── Rechazo ──────────────────────────────────────────────────── */}
        {puedeAprobar && s.estado === "Pendiente" && (
          <div className="rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3">
            <Field label="Rechazar la solicitud" hint="Di qué habría que corregir.">
              <Textarea
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo del rechazo"
              />
            </Field>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              loading={busy}
              disabled={!motivo.trim()}
              onClick={() =>
                correr(() => rechazarSolicitud(s.id, motivo), "Solicitud rechazada")
              }
            >
              <X className="h-3.5 w-3.5" />
              Rechazar
            </Button>
          </div>
        )}

        {/* ── Pago y entrega ───────────────────────────────────────────── */}
        {s.estado === "Aprobada" && (
          <div className="space-y-3">
            {elegida && (
              <p className="text-sm text-fg-muted">
                Aprobada{s.decidio ? ` por ${s.decidio}` : ""}
                {s.aprobada_en ? ` el ${formatDate(s.aprobada_en)}` : ""} con{" "}
                <span className="font-medium text-fg">{elegida.proveedor}</span> por{" "}
                <span className="font-mono tnum">
                  {formatMonto(Number(elegida.monto), elegida.moneda)}
                </span>
                .
              </p>
            )}

            <div className="rounded-[var(--radius-md)] border border-border p-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
                <Wallet className="h-3.5 w-3.5" />
                Pago
              </h4>
              {s.pagada_en ? (
                <p className="text-sm text-fg">
                  Pagada el {formatDate(s.pagada_en)}
                  {s.pago_medio ? ` · ${s.pago_medio}` : ""}
                  {s.pago_referencia ? ` · ref. ${s.pago_referencia}` : ""}
                </p>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Medio" className="w-40">
                    <Input
                      value={pagoMedio}
                      onChange={(e) => setPagoMedio(e.target.value)}
                      placeholder="Transferencia"
                    />
                  </Field>
                  <Field label="Referencia" className="w-44">
                    <Input
                      value={pagoRef}
                      onChange={(e) => setPagoRef(e.target.value)}
                      placeholder="N.º de comprobante"
                    />
                  </Field>
                  <Button
                    size="sm"
                    loading={busy}
                    onClick={() =>
                      correr(
                        () => registrarPago(s.id, pagoMedio, pagoRef),
                        "Pago registrado",
                      )
                    }
                  >
                    Registrar pago
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-[var(--radius-md)] border border-border p-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
                <PackageCheck className="h-3.5 w-3.5" />
                Entrega
              </h4>
              {s.recibida_en ? (
                <p className="text-sm text-fg">
                  Recibida el {formatDate(s.recibida_en)}
                  {s.entrega_notas ? ` · ${s.entrega_notas}` : ""}
                </p>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Notas" className="flex-1">
                    <Input
                      value={entregaNotas}
                      onChange={(e) => setEntregaNotas(e.target.value)}
                      placeholder="Estado de lo recibido"
                    />
                  </Field>
                  <Button
                    size="sm"
                    loading={busy}
                    onClick={() =>
                      correr(
                        () => registrarEntrega(s.id, entregaNotas),
                        "Entrega registrada",
                      )
                    }
                  >
                    Marcar recibida
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/** Alta de una cotización, con su archivo. */
function NuevaCotizacion({
  solicitudId,
  onDone,
}: {
  solicitudId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("solicitud_id", solicitudId);
    setBusy(true);
    const res = await subirCotizacion(fd);
    setBusy(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Cotización añadida" });
    onDone();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 grid grid-cols-1 gap-3 rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3 sm:grid-cols-2"
    >
      <Field label="Proveedor *" className="sm:col-span-2">
        <Input name="proveedor" required placeholder="Nombre del proveedor" />
      </Field>
      <Field label="Monto *">
        <Input name="monto" required inputMode="decimal" placeholder="1.250.000" className="font-mono tnum" />
      </Field>
      <Field label="Moneda">
        <Select name="moneda" defaultValue="COP">
          {MONEDAS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tiempo de entrega">
        <Input name="tiempo_entrega" placeholder="8 días hábiles" />
      </Field>
      <Field label="Válida hasta">
        <Input type="date" name="valida_hasta" />
      </Field>
      <Field label="Qué incluye" className="sm:col-span-2">
        <Input name="descripcion" placeholder="Detalle de lo cotizado" />
      </Field>
      <Field label="Archivo (PDF o foto)" className="sm:col-span-2">
        <Input type="file" name="archivo" accept=".pdf,image/*" />
      </Field>
      <label className="flex items-center gap-2 text-sm text-fg-muted sm:col-span-2">
        <input type="checkbox" name="incluye_iva" defaultChecked className="h-4 w-4 accent-[var(--accent)]" />
        El monto incluye IVA
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" loading={busy}>
          Guardar cotización
        </Button>
      </div>
    </form>
  );
}
