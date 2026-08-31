"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Store, Clock, CheckCircle2, Receipt, AlertTriangle, FileText, Check, X, Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { staggerContainer } from "@/lib/motion";
import { formatCOP, formatDate, formatNumber } from "@/lib/utils";
import {
  nombreProveedor, totalCuenta, vigencia,
  type ProveedorEstado, type CuentaCobroEstado,
} from "@/lib/schemas/proveedor";
import type { ProveedorConTodo, CuentaConTodo } from "./page";
import { decidirProveedor, decidirCuenta, marcarPagada, urlDocumento } from "./actions";

const TONO: Record<ProveedorEstado, BadgeTone> = {
  Pendiente: "warn", Activo: "success", Rechazado: "danger", Inactivo: "neutral",
};
const TONO_CUENTA: Record<CuentaCobroEstado, BadgeTone> = {
  Radicada: "info", Aprobada: "success", Rechazada: "danger", Pagada: "accent",
};

type Pregunta = {
  titulo: string;
  etiqueta: string;
  obligatorio: boolean;
  accion: (texto: string) => Promise<{ ok: boolean; error?: string }>;
};

export function ProveedoresClient({
  proveedores,
  cuentas,
  puedeVerificar,
  error,
}: {
  proveedores: ProveedorConTodo[];
  cuentas: CuentaConTodo[];
  puedeVerificar: boolean;
  error?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pestana, setPestana] = React.useState<"proveedores" | "cuentas">("proveedores");
  const [pregunta, setPregunta] = React.useState<Pregunta | null>(null);
  const [texto, setTexto] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);

  const pendientes = proveedores.filter((p) => p.estado === "Pendiente").length;
  const activos = proveedores.filter((p) => p.estado === "Activo").length;
  const radicadas = cuentas.filter((c) => c.estado === "Radicada");
  const porPagar = cuentas.filter((c) => c.estado === "Aprobada");

  async function correr(fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (!r.ok) return toast({ tone: "error", title: r.error ?? "No se pudo." });
    toast({ tone: "success", title: exito });
    router.refresh();
  }

  async function abrirDoc(path: string) {
    const url = await urlDocumento(path);
    if (url) window.open(url, "_blank");
    else toast({ tone: "error", title: "No se pudo abrir el documento." });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proveedores Insumos"
        description="Oficina, finca, cultivo, bodega y demás · sus documentos y cuentas de cobro"
      />

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {!puedeVerificar && (
        <div className="rounded-[var(--radius-md)] border border-info/40 bg-info-soft p-4">
          <p className="text-sm text-info">
            Puedes consultar, pero activar proveedores y decidir sobre cuentas de cobro
            lo hace quien tiene ese permiso.
          </p>
        </div>
      )}

      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Por verificar" value={pendientes} icon={Clock} />
        <StatCard label="Activos" value={activos} icon={CheckCircle2} />
        <StatCard label="Cuentas por revisar" value={radicadas.length} icon={Receipt} />
        <StatCard
          label="Aprobadas sin pagar"
          value={Math.round(porPagar.reduce((a, c) => a + totalCuenta(c.cuenta_cobro_items ?? []), 0) / 1_000_000)}
          prefix="$ "
          suffix=" M"
          icon={Wallet}
          hint={`${porPagar.length} cuentas`}
        />
      </motion.div>

      <div className="flex gap-2">
        {(["proveedores", "cuentas"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPestana(p)}
            className={
              "rounded-[var(--radius-md)] border px-3 py-1.5 text-sm transition-colors " +
              (pestana === p
                ? "border-accent bg-accent-soft text-accent-soft-fg"
                : "border-border text-fg-muted hover:bg-bg-muted")
            }
          >
            {p === "proveedores" ? "Proveedores" : "Cuentas de cobro"}{" "}
            <span className="font-mono tnum text-xs">
              ({p === "proveedores" ? proveedores.length : cuentas.length})
            </span>
          </button>
        ))}
      </div>

      {pestana === "proveedores" ? (
        proveedores.length === 0 ? (
          <EmptyState
            icon={<Store className="h-6 w-6" />}
            title="Todavía no hay proveedores registrados"
            description="Cuando alguien se registre en el portal aparecerá aquí para verificarlo."
          />
        ) : (
          <ul className="space-y-3">
            {proveedores.map((p) => {
              const docs = p.proveedor_insumo_documentos ?? [];
              const vencidos = docs.filter((d) => vigencia(d.vence_el) !== "vigente" && d.vence_el);
              return (
                <li key={p.id}>
                  <Card>
                    <CardBody className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-medium text-fg">{nombreProveedor(p)}</p>
                          <p className="mt-0.5 font-mono text-xs text-fg-subtle">
                            {p.codigo} · {p.tipo_documento} {p.numero_documento} · {p.email}
                          </p>
                        </div>
                        <Badge tone={TONO[p.estado]} dot>{p.estado}</Badge>
                      </div>

                      {p.descripcion && <p className="text-sm text-fg-muted">{p.descripcion}</p>}
                      {p.categorias?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {p.categorias.map((c) => (
                            <Badge key={c} tone="neutral">{c}</Badge>
                          ))}
                        </div>
                      )}

                      {/* Los datos bancarios son lo que hay que verificar contra
                          el certificado antes de activar. */}
                      {p.numero_cuenta && (
                        <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius-md)] border border-border p-3 text-sm sm:grid-cols-4">
                          <Dato k="Banco" v={p.banco ?? "—"} />
                          <Dato k="Tipo" v={p.tipo_cuenta ?? "—"} />
                          <Dato k="Cuenta" v={p.numero_cuenta} mono />
                          <Dato k="Titular" v={p.titular_cuenta ?? "—"} />
                        </dl>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {docs.length === 0 ? (
                          <span className="text-xs text-fg-subtle">Sin documentos subidos</span>
                        ) : (
                          docs.map((d) => {
                            const v = vigencia(d.vence_el);
                            return (
                              <button
                                key={d.id}
                                type="button"
                                onClick={() => abrirDoc(d.archivo_path)}
                                className={
                                  "inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-2 py-1 text-xs transition-colors hover:bg-bg-subtle " +
                                  (v === "vencido"
                                    ? "border-danger/40 text-danger"
                                    : v === "por-vencer"
                                      ? "border-warn/40 text-warn"
                                      : "border-border text-fg-muted")
                                }
                              >
                                <FileText className="h-3 w-3" />
                                {d.tipo}
                                {d.vence_el && ` · ${formatDate(d.vence_el)}`}
                              </button>
                            );
                          })
                        )}
                      </div>

                      {vencidos.length > 0 && (
                        <p className="text-xs text-warn">
                          {vencidos.length} documento{vencidos.length === 1 ? "" : "s"} vencido o por
                          vencer.
                        </p>
                      )}

                      {p.motivo_rechazo && (
                        <p className="text-xs text-fg-muted">
                          <span className="text-fg-subtle">Nota: </span>
                          {p.motivo_rechazo}
                        </p>
                      )}

                      {puedeVerificar && (
                        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                          {p.estado !== "Activo" && (
                            <Button
                              size="sm"
                              loading={ocupado}
                              onClick={() =>
                                correr(() => decidirProveedor(p.id, "Activo"), "Proveedor activado")
                              }
                            >
                              <Check className="h-3.5 w-3.5" />
                              Activar
                            </Button>
                          )}
                          {p.estado !== "Rechazado" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setPregunta({
                                  titulo: `Rechazar a ${nombreProveedor(p)}`,
                                  etiqueta: "¿Por qué se rechaza? El proveedor lo va a ver.",
                                  obligatorio: true,
                                  accion: (t) => decidirProveedor(p.id, "Rechazado", t),
                                })
                              }
                            >
                              <X className="h-3.5 w-3.5" />
                              Rechazar
                            </Button>
                          )}
                          {p.estado === "Activo" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setPregunta({
                                  titulo: `Suspender a ${nombreProveedor(p)}`,
                                  etiqueta: "Motivo (opcional)",
                                  obligatorio: false,
                                  accion: (t) => decidirProveedor(p.id, "Inactivo", t),
                                })
                              }
                            >
                              Suspender
                            </Button>
                          )}
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
        )
      ) : cuentas.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="Todavía no hay cuentas de cobro"
          description="Cuando un proveedor activo radique una, aparecerá aquí."
        />
      ) : (
        <ul className="space-y-3">
          {cuentas.map((c) => {
            const prov = c.proveedores_insumos;
            const total = totalCuenta(c.cuenta_cobro_items ?? []);
            return (
              <li key={c.id}>
                <Card>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-medium text-fg">
                          <span className="font-mono text-xs text-fg-subtle">{c.consecutivo}</span>{" "}
                          {c.concepto ?? "Sin concepto"}
                        </p>
                        <p className="mt-0.5 text-xs text-fg-subtle">
                          {prov ? nombreProveedor(prov) : "—"} · {formatDate(c.fecha)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono tnum text-base font-semibold text-fg">
                          {formatCOP(total)}
                        </span>
                        <Badge tone={TONO_CUENTA[c.estado]}>{c.estado}</Badge>
                      </div>
                    </div>

                    <ul className="space-y-0.5 text-sm text-fg-muted">
                      {(c.cuenta_cobro_items ?? []).map((i) => (
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

                    {/* A dónde se paga, junto a la cuenta: tener que abrir otra
                        pantalla para consultarlo invita a pagar de memoria. */}
                    {prov?.numero_cuenta && (
                      <p className="rounded-[var(--radius-md)] border border-border p-2 font-mono tnum text-xs text-fg-muted">
                        {prov.banco} · {prov.tipo_cuenta} · {prov.numero_cuenta}
                        {prov.titular_cuenta ? ` · ${prov.titular_cuenta}` : ""}
                      </p>
                    )}

                    {c.motivo_rechazo && <p className="text-xs text-danger">{c.motivo_rechazo}</p>}
                    {c.pagada_en && (
                      <p className="text-xs text-fg-subtle">
                        Pagada el {formatDate(c.pagada_en)}
                        {c.pago_referencia ? ` · ${c.pago_referencia}` : ""}
                      </p>
                    )}

                    {puedeVerificar && c.estado !== "Pagada" && (
                      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                        {c.estado === "Radicada" && (
                          <>
                            <Button
                              size="sm"
                              loading={ocupado}
                              onClick={() => correr(() => decidirCuenta(c.id, "Aprobada"), "Cuenta aprobada")}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setPregunta({
                                  titulo: `Rechazar ${c.consecutivo}`,
                                  etiqueta: "¿Por qué se rechaza? El proveedor lo va a ver.",
                                  obligatorio: true,
                                  accion: (t) => decidirCuenta(c.id, "Rechazada", t),
                                })
                              }
                            >
                              <X className="h-3.5 w-3.5" />
                              Rechazar
                            </Button>
                          </>
                        )}
                        {c.estado === "Aprobada" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setPregunta({
                                titulo: `Marcar ${c.consecutivo} como pagada`,
                                etiqueta: "Referencia del pago (opcional)",
                                obligatorio: false,
                                accion: (t) => marcarPagada(c.id, t),
                              })
                            }
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            Marcar pagada
                          </Button>
                        )}
                      </div>
                    )}
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={pregunta !== null}
        onClose={() => {
          setPregunta(null);
          setTexto("");
        }}
        title={pregunta?.titulo}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => { setPregunta(null); setTexto(""); }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              loading={ocupado}
              onClick={async () => {
                if (!pregunta) return;
                if (pregunta.obligatorio && !texto.trim()) {
                  toast({ tone: "error", title: "Escribe el motivo." });
                  return;
                }
                await correr(() => pregunta.accion(texto), "Listo");
                setPregunta(null);
                setTexto("");
              }}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <Field label={pregunta?.etiqueta ?? ""}>
          <Textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

function Dato({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{k}</dt>
      <dd className={"mt-0.5 text-fg " + (mono ? "font-mono tnum text-xs" : "")}>{v}</dd>
    </div>
  );
}
