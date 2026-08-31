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
  Pencil,
} from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatCOP, formatDate, formatNumber } from "@/lib/utils";
import { MONEDAS, COMPRA_CATEGORIAS } from "@/lib/schemas/compra";
import { nombreProveedor } from "@/lib/schemas/proveedor";
import { DEPARTMENTS } from "@/lib/departments";
import type { SolicitudConCotizaciones } from "./page";
import {
  editarSolicitud,
  editarCotizacion,
  subirCotizacion,
  borrarCotizacion,
  urlCotizacion,
  enviarAAprobacion,
  aprobarSolicitud,
  rechazarSolicitud,
  registrarPago,
  registrarEntrega,
} from "./actions";

/** Proveedor registrado y verificado, para elegirlo en vez de escribirlo. */
export type ProveedorOpcion = {
  id: string;
  tipo_persona: string;
  nombres: string | null;
  apellidos: string | null;
  razon_social: string | null;
  numero_documento: string;
};

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
  proveedores,
}: {
  solicitud: SolicitudConCotizaciones | null;
  open: boolean;
  onClose: () => void;
  puedeAprobar: boolean;
  userId: string;
  proveedores: ProveedorOpcion[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [nuevaOpen, setNuevaOpen] = React.useState(false);
  const [editandoCot, setEditandoCot] = React.useState<string | null>(null);
  const [editandoSol, setEditandoSol] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");
  const [pagoMedio, setPagoMedio] = React.useState("");
  const [pagoRef, setPagoRef] = React.useState("");
  const [entregaNotas, setEntregaNotas] = React.useState("");

  if (!solicitud) return null;

  const s = solicitud;
  const cotizaciones = s.compra_cotizaciones;
  const esAutor = s.created_by === userId;
  const esBorrador = s.estado === "Borrador";
  // Se puede corregir mientras no esté decidida. Antes solo en Borrador, y eso
  // dejaba encerrado a quien detectaba un error después de pedir aprobación:
  // la única salida era que se la rechazaran. Una vez aprobada o rechazada sí
  // se congela, porque el registro debe seguir diciendo qué se decidió.
  const editable = !["Aprobada", "Rechazada"].includes(s.estado) && (esAutor || puedeAprobar);
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
        esBorrador && (esAutor || puedeAprobar) && (
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
        {editable && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setEditandoSol((v) => !v)}>
              <Pencil className="h-3.5 w-3.5" />
              {editandoSol ? "Cancelar" : "Editar solicitud"}
            </Button>
          </div>
        )}

        {editandoSol && editable && (
          <FormSolicitud
            solicitud={s}
            onDone={() => {
              setEditandoSol(false);
              router.refresh();
            }}
          />
        )}

        {!editandoSol && (s.descripcion || s.justificacion) && (
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
                          {/* Distinguir una cotización de proveedor verificado
                              de una de alguien ocasional es lo que permite
                              pagar sin ir a buscar datos por fuera del CRM. */}
                          {c.proveedor_id && <Badge tone="info">registrado</Badge>}
                          {/* Si alguien corrigió el monto después de que el
                              aprobador lo leyó, tiene que verse. */}
                          {c.updated_at && c.updated_at !== c.created_at && (
                            <span className="text-[11px] text-fg-subtle">
                              editada {formatDate(c.updated_at)}
                            </span>
                          )}
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
                            setEditandoCot((v) => (v === c.id ? null : c.id))
                          }
                          className="rounded p-1 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                          aria-label="Editar cotización"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
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

                    {editandoCot === c.id && editable && (
                      <FormCotizacion
                        cotizacion={c}
                        proveedores={proveedores}
                        onDone={() => {
                          setEditandoCot(null);
                          router.refresh();
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {nuevaOpen && editable && (
            <FormCotizacion
              solicitudId={s.id}
              proveedores={proveedores}
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

/**
 * Alta y corrección de una cotización. Es el mismo formulario en los dos casos
 * a propósito: si fueran dos, un campo añadido en uno se olvida en el otro y
 * la cotización editada deja de poder decir lo que la nueva sí dice.
 */
function FormCotizacion({
  solicitudId,
  cotizacion,
  proveedores,
  onDone,
}: {
  solicitudId?: string;
  cotizacion?: SolicitudConCotizaciones["compra_cotizaciones"][number];
  proveedores: ProveedorOpcion[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const editando = !!cotizacion;
  // Si se elige un proveedor registrado, el nombre y el NIT se llenan solos.
  // Escribirlos a mano al lado de una ficha verificada es cómo aparecen dos
  // «Alkosto» que después no se pueden cruzar.
  const [elegido, setElegido] = React.useState<string>(cotizacion?.proveedor_id ?? "");
  const ficha = proveedores.find((p) => p.id === elegido);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    let res;
    if (cotizacion) {
      fd.set("id", cotizacion.id);
      res = await editarCotizacion(fd);
    } else {
      fd.set("solicitud_id", solicitudId!);
      res = await subirCotizacion(fd);
    }
    setBusy(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: editando ? "Cotización actualizada" : "Cotización añadida" });
    onDone();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 grid grid-cols-1 gap-3 rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3 sm:grid-cols-2"
    >
      {proveedores.length > 0 && (
        <Field
          label="Proveedor registrado"
          className="sm:col-span-2"
          hint="Si está en el portal, elígelo: trae su NIT y su cuenta bancaria verificados."
        >
          <Select
            name="proveedor_id"
            value={elegido}
            onChange={(e) => setElegido(e.target.value)}
          >
            <option value="">— Proveedor ocasional (escribir a mano) —</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {nombreProveedor(p)} · {p.numero_documento}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Proveedor *" className="sm:col-span-2">
        <Input
          name="proveedor"
          required
          // `key` fuerza el remontaje para que el valor por defecto se
          // actualice al cambiar de ficha; sin él React conserva lo tecleado.
          key={elegido}
          defaultValue={ficha ? nombreProveedor(ficha) : (cotizacion?.proveedor ?? "")}
          readOnly={!!ficha}
          placeholder="Nombre del proveedor"
        />
      </Field>
      {ficha && (
        <input type="hidden" name="nit" value={ficha.numero_documento} />
      )}
      <Field label="Monto *">
        <Input
          name="monto"
          required
          inputMode="decimal"
          defaultValue={cotizacion ? String(cotizacion.monto) : ""}
          placeholder="1.250.000"
          className="font-mono tnum"
        />
      </Field>
      <Field label="Moneda">
        <Select name="moneda" defaultValue={cotizacion?.moneda ?? "COP"}>
          {MONEDAS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tiempo de entrega">
        <Input
          name="tiempo_entrega"
          defaultValue={cotizacion?.tiempo_entrega ?? ""}
          placeholder="8 días hábiles"
        />
      </Field>
      <Field label="Válida hasta">
        <Input type="date" name="valida_hasta" defaultValue={cotizacion?.valida_hasta ?? ""} />
      </Field>
      <Field label="Qué incluye" className="sm:col-span-2">
        <Input
          name="descripcion"
          defaultValue={cotizacion?.descripcion ?? ""}
          placeholder="Detalle de lo cotizado"
        />
      </Field>
      <Field
        label={
          cotizacion?.archivo_path
            ? "Reemplazar archivo (PDF o foto)"
            : "Archivo (PDF o foto)"
        }
        className="sm:col-span-2"
      >
        <Input type="file" name="archivo" accept=".pdf,image/*" />
      </Field>
      {/* Al editar, no elegir archivo deja el que ya estaba: subir uno nuevo no
          puede ser el único modo de quitar el viejo. */}
      {cotizacion?.archivo_path && (
        <label className="flex items-center gap-2 text-sm text-fg-muted sm:col-span-2">
          <input type="checkbox" name="quitar_archivo" className="h-4 w-4 accent-[var(--accent)]" />
          Quitar el archivo actual ({cotizacion.archivo_nombre ?? "archivo"})
        </label>
      )}
      <label className="flex items-center gap-2 text-sm text-fg-muted sm:col-span-2">
        <input
          type="checkbox"
          name="incluye_iva"
          defaultChecked={cotizacion ? cotizacion.incluye_iva : true}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        El monto incluye IVA
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" loading={busy}>
          {editando ? "Guardar cambios" : "Guardar cotización"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Corrección de los datos de la solicitud. */
function FormSolicitud({
  solicitud,
  onDone,
}: {
  solicitud: SolicitudConCotizaciones;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const res = await editarSolicitud(solicitud.id, {
      titulo: fd.get("titulo"),
      descripcion: fd.get("descripcion") ?? "",
      categoria: fd.get("categoria"),
      area: fd.get("area") ?? "",
      justificacion: fd.get("justificacion") ?? "",
    });
    setBusy(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Solicitud actualizada" });
    onDone();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-3 rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3 sm:grid-cols-2"
    >
      <Field label="Qué se necesita *" className="sm:col-span-2">
        <Input name="titulo" required defaultValue={solicitud.titulo} />
      </Field>
      <Field label="Categoría">
        <Select name="categoria" defaultValue={solicitud.categoria}>
          {COMPRA_CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Área">
        <Select name="area" defaultValue={solicitud.area ?? ""}>
          <option value="">— Sin área —</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Detalle" className="sm:col-span-2">
        <Textarea name="descripcion" rows={3} defaultValue={solicitud.descripcion ?? ""} />
      </Field>
      <Field label="Por qué" className="sm:col-span-2">
        <Textarea name="justificacion" rows={2} defaultValue={solicitud.justificacion ?? ""} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" loading={busy}>
          Guardar cambios
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
