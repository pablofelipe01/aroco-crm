"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Upload, Plus, Trash2, AlertTriangle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatCOP, formatDate, formatNumber } from "@/lib/utils";
import {
  DOCUMENTO_PROVEEDOR_TIPOS, nombreProveedor, totalCuenta, vigencia,
  type CuentaCobroEstado, type ProveedorEstado,
} from "@/lib/schemas/proveedor";
import type {
  ProveedorInsumo, ProveedorInsumoDocumento, CuentaCobro, CuentaCobroItem,
} from "@/lib/types/database";
import { subirDocumento, borrarDocumento, urlDocumento, crearCuentaCobro } from "./actions";

type CuentaConItems = CuentaCobro & { cuenta_cobro_items: CuentaCobroItem[] };

const TONO_ESTADO: Record<ProveedorEstado, BadgeTone> = {
  Pendiente: "warn",
  Activo: "success",
  Rechazado: "danger",
  Inactivo: "neutral",
};

const TONO_CUENTA: Record<CuentaCobroEstado, BadgeTone> = {
  Radicada: "info",
  Aprobada: "success",
  Rechazada: "danger",
  Pagada: "accent",
};

export function PanelProveedor({
  ficha,
  documentos,
  cuentas,
  solicitudes,
}: {
  ficha: ProveedorInsumo;
  documentos: ProveedorInsumoDocumento[];
  cuentas: CuentaConItems[];
  solicitudes: { id: string; consecutivo: string; titulo: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [docOpen, setDocOpen] = React.useState(false);
  const [cuentaOpen, setCuentaOpen] = React.useState(false);
  const [filas, setFilas] = React.useState(1);
  const [ocupado, setOcupado] = React.useState(false);

  const activo = ficha.estado === "Activo";
  const porVencer = documentos.filter((d) => {
    const v = vigencia(d.vence_el);
    return v === "por-vencer" || v === "vencido";
  });

  async function abrir(path: string) {
    const url = await urlDocumento(path);
    if (url) window.open(url, "_blank");
    else toast({ tone: "error", title: "No se pudo abrir el documento." });
  }

  async function enviar(
    e: React.FormEvent<HTMLFormElement>,
    accion: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    exito: string,
    cerrar: () => void,
  ) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setOcupado(true);
    const res = await accion(fd);
    setOcupado(false);
    if (!res.ok) {
      toast({ tone: "error", title: res.error ?? "No se pudo guardar." });
      return;
    }
    toast({ tone: "success", title: exito });
    cerrar();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">{nombreProveedor(ficha)}</h1>
          <p className="mt-0.5 font-mono text-xs text-fg-subtle">
            {ficha.codigo} · {ficha.tipo_documento} {ficha.numero_documento}
          </p>
        </div>
        <Badge tone={TONO_ESTADO[ficha.estado]} dot>
          {ficha.estado}
        </Badge>
      </div>

      {/* El estado del registro es lo primero que quiere saber quien entra. */}
      {ficha.estado === "Pendiente" && (
        <div className="rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft p-4">
          <p className="text-sm font-medium text-warn">Tu registro está en revisión</p>
          <p className="mt-1 text-sm text-fg-muted">
            {ficha.motivo_rechazo ??
              "AROCO va a verificar tus datos y documentos. Mientras tanto puedes subirlos aquí; podrás radicar cuentas de cobro cuando quede aprobado."}
          </p>
        </div>
      )}
      {ficha.estado === "Rechazado" && (
        <div className="rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft p-4">
          <p className="text-sm font-medium text-danger">Tu registro fue rechazado</p>
          <p className="mt-1 text-sm text-fg-muted">
            {ficha.motivo_rechazo ?? "Escríbenos a info@aroco.co para saber qué falta."}
          </p>
        </div>
      )}

      {porVencer.length > 0 && (
        <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <div>
            <p className="text-sm font-medium text-warn">
              {porVencer.length === 1 ? "Un documento" : `${porVencer.length} documentos`} por
              vencer o vencidos
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {porVencer.map((d) => d.tipo).join(", ")}. Súbelos actualizados para que no se
              detenga un pago.
            </p>
          </div>
        </div>
      )}

      {/* ── Documentos ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Mis documentos</CardTitle>
            <Button size="sm" variant="secondary" onClick={() => setDocOpen(true)}>
              <Upload className="h-4 w-4" />
              Subir
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {documentos.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="Todavía no has subido documentos"
              description="RUT, documento de identidad, certificado bancario y cámara de comercio."
            />
          ) : (
            <ul className="space-y-2">
              {documentos.map((d) => {
                const v = vigencia(d.vence_el);
                return (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => abrir(d.archivo_path)}
                        className="text-sm text-accent hover:underline"
                      >
                        {d.tipo}
                      </button>
                      <p className="truncate text-xs text-fg-subtle">{d.archivo_nombre}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {d.vence_el && (
                        <Badge
                          tone={v === "vencido" ? "danger" : v === "por-vencer" ? "warn" : "neutral"}
                        >
                          {v === "vencido" ? "Vencido" : "Vence"} {formatDate(d.vence_el)}
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await borrarDocumento(d.id);
                          if (r.ok) router.refresh();
                          else toast({ tone: "error", title: r.error ?? "No se pudo borrar." });
                        }}
                        className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                        aria-label="Borrar documento"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ── Cuentas de cobro ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Mis cuentas de cobro</CardTitle>
            <Button
              size="sm"
              onClick={() => setCuentaOpen(true)}
              disabled={!activo}
              title={activo ? undefined : "Disponible cuando tu registro esté verificado"}
            >
              <Plus className="h-4 w-4" />
              Nueva
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {cuentas.length === 0 ? (
            <EmptyState
              title={activo ? "Todavía no has radicado ninguna" : "Aún no puedes radicar"}
              description={
                activo
                  ? "Cuando prestes un servicio o entregues un pedido, radica aquí tu cuenta de cobro."
                  : "Cuando AROCO verifique tu registro vas a poder radicar cuentas de cobro."
              }
            />
          ) : (
            <ul className="space-y-3">
              {cuentas.map((c) => (
                <li key={c.id} className="rounded-[var(--radius-md)] border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">
                        <span className="font-mono text-xs text-fg-subtle">{c.consecutivo}</span>{" "}
                        {c.concepto ?? "Sin concepto"}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-subtle">{formatDate(c.fecha)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono tnum text-sm font-semibold text-fg">
                        {formatCOP(totalCuenta(c.cuenta_cobro_items ?? []))}
                      </span>
                      <Badge tone={TONO_CUENTA[c.estado]}>{c.estado}</Badge>
                    </div>
                  </div>
                  {(c.cuenta_cobro_items ?? []).length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-fg-muted">
                      {c.cuenta_cobro_items.map((i) => (
                        <li key={i.id} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {formatNumber(Number(i.cantidad))} × {i.descripcion}
                          </span>
                          <span className="shrink-0 font-mono tnum">
                            {formatCOP(Number(i.cantidad) * Number(i.valor_unitario))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.estado === "Rechazada" && c.motivo_rechazo && (
                    <p className="mt-2 text-xs text-danger">{c.motivo_rechazo}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ── Subir documento ────────────────────────────────────────────── */}
      <Modal
        open={docOpen}
        onClose={() => setDocOpen(false)}
        title="Subir un documento"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDocOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-doc" size="sm" loading={ocupado}>
              Subir
            </Button>
          </>
        }
      >
        <form
          id="form-doc"
          onSubmit={(e) => enviar(e, subirDocumento, "Documento subido", () => setDocOpen(false))}
          className="space-y-4"
        >
          <Field label="Tipo de documento *">
            <Select name="tipo" defaultValue="RUT">
              {DOCUMENTO_PROVEEDOR_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Archivo *" hint="PDF o imagen, máximo 10 MB.">
            <Input type="file" name="archivo" accept=".pdf,image/*" required />
          </Field>
          <Field
            label="Vence el"
            hint="Si el documento tiene vigencia, ponla: te avisamos un mes antes."
          >
            <Input type="date" name="vence_el" />
          </Field>
        </form>
      </Modal>

      {/* ── Nueva cuenta de cobro ──────────────────────────────────────── */}
      <Modal
        open={cuentaOpen}
        onClose={() => setCuentaOpen(false)}
        size="lg"
        title="Nueva cuenta de cobro"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCuentaOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-cuenta" size="sm" loading={ocupado}>
              Radicar
            </Button>
          </>
        }
      >
        <form
          id="form-cuenta"
          onSubmit={(e) => {
            const fd = new FormData(e.currentTarget);
            fd.set("items_count", String(filas));
            const copia = e.currentTarget;
            e.preventDefault();
            setOcupado(true);
            crearCuentaCobro(fd).then((res) => {
              setOcupado(false);
              if (!res.ok) {
                toast({ tone: "error", title: res.error ?? "No se pudo radicar." });
                return;
              }
              toast({ tone: "success", title: "Cuenta de cobro radicada" });
              setCuentaOpen(false);
              setFilas(1);
              copia.reset();
              router.refresh();
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Fecha *">
              <Input
                type="date"
                name="fecha"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </Field>
            <Field label="Solicitud de compra" hint="Solo si esta cuenta corresponde a una.">
              <Select name="solicitud_id" defaultValue="">
                <option value="">— Sin solicitud —</option>
                {solicitudes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.consecutivo} · {s.titulo}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Concepto" className="sm:col-span-2">
              <Textarea name="concepto" rows={2} placeholder="Por qué se cobra." />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                Ítems
              </h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => setFilas((n) => n + 1)}>
                <Plus className="h-3.5 w-3.5" />
                Añadir ítem
              </Button>
            </div>
            <div className="space-y-3">
              {Array.from({ length: filas }, (_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 gap-3 rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3 sm:grid-cols-4"
                >
                  <Field label="Descripción" className="sm:col-span-2">
                    <Input name={`item_${i}_descripcion`} />
                  </Field>
                  <Field label="Cantidad">
                    <Input
                      name={`item_${i}_cantidad`}
                      type="number"
                      step="any"
                      defaultValue={1}
                      className="font-mono tnum"
                    />
                  </Field>
                  <Field label="Valor unitario">
                    <Input name={`item_${i}_valor`} inputMode="decimal" className="font-mono tnum" />
                  </Field>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
