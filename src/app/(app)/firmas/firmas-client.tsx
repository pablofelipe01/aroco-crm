"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, FileSignature, Loader2, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  NOMBRE_ESTADO_SOBRE,
  NOMBRE_TIPO,
  TIPOS_SOBRE,
  type EstadoSobre,
  type TipoSobre,
} from "@/lib/firmas/tipos";
import { crearSobre } from "./actions";
import { EnlacesModal, type EnlaceFirma } from "./enlaces";

export type FilaSobre = {
  id: string;
  codigo: string;
  titulo: string;
  tipo: string;
  estado: string;
  creadoEn: string;
  completadoEn: string | null;
  venceEn: string | null;
  creador: string;
  firmantes: { nombre: string; estado: string }[];
};

export const TONO_ESTADO: Record<string, BadgeTone> = {
  borrador: "neutral",
  enviado: "info",
  completado: "success",
  anulado: "danger",
};

const FILTROS: { clave: "todos" | EstadoSobre; label: string }[] = [
  { clave: "todos", label: "Todos" },
  { clave: "enviado", label: "En firma" },
  { clave: "completado", label: "Firmados" },
  { clave: "borrador", label: "Borradores" },
  { clave: "anulado", label: "Anulados" },
];

const fecha = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" }).format(new Date(iso))
    : "—";

export function FirmasClient({
  filas,
  error,
  puedeCrear,
  userId,
}: {
  filas: FilaSobre[];
  error: string | null;
  puedeCrear: boolean;
  userId: string;
}) {
  const [filtro, setFiltro] = React.useState<(typeof FILTROS)[number]["clave"]>("todos");
  const [q, setQ] = React.useState("");
  const [creando, setCreando] = React.useState(false);

  const visibles = filas.filter(
    (f) =>
      (filtro === "todos" || f.estado === filtro) &&
      (!q ||
        `${f.codigo} ${f.titulo} ${f.firmantes.map((x) => x.nombre).join(" ")}`
          .toLowerCase()
          .includes(q.toLowerCase())),
  );
  const cuenta = (e: string) => filas.filter((f) => f.estado === e).length;

  return (
    <div>
      <PageHeader
        title="Firmas"
        description="Contratos enviados a firma electrónica, con su certificado de evidencias (Ley 527 de 1999)."
        actions={
          puedeCrear && (
            <Button onClick={() => setCreando(true)}>
              <Plus className="h-4 w-4" />
              Nuevo sobre
            </Button>
          )
        }
      />

      {error ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-danger-soft px-4 py-3 text-sm text-danger">
          No se pudieron cargar los sobres: {error}
        </p>
      ) : filas.length === 0 ? (
        <EmptyState
          icon={<FileSignature className="h-6 w-6" />}
          title="Aún no hay sobres"
          description={
            puedeCrear
              ? "Sube un PDF, agrega quién firma y envíalo. Cada persona recibe un enlace por correo."
              : "Aquí verás los contratos que envíes a firma. Tu área no crea sobres; pídeselo a Comercial, Administrativo o Financiero."
          }
          action={
            puedeCrear && (
              <Button onClick={() => setCreando(true)}>
                <Plus className="h-4 w-4" />
                Nuevo sobre
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtrar por estado">
              {FILTROS.map((f) => (
                <button
                  key={f.clave}
                  role="tab"
                  aria-selected={filtro === f.clave}
                  onClick={() => setFiltro(f.clave)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    filtro === f.clave ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
                  )}
                >
                  {f.label}
                  {f.clave !== "todos" && <span className="ml-1 font-mono tnum opacity-70">{cuenta(f.clave)}</span>}
                </button>
              ))}
            </div>
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar código, título o firmante"
                aria-label="Buscar sobres"
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>

          {visibles.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-fg-subtle">Nada con ese filtro.</p>
          ) : (
            <ul className="divide-y divide-border">
              {visibles.map((s) => {
                const firmados = s.firmantes.filter((f) => f.estado === "firmado").length;
                return (
                  <li key={s.id}>
                    <Link
                      href={`/firmas/${s.id}`}
                      className="flex flex-col gap-2 px-5 py-3.5 transition-colors hover:bg-bg-subtle sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-fg-subtle tnum">{s.codigo}</span>
                          <Badge tone={TONO_ESTADO[s.estado] ?? "neutral"}>
                            {NOMBRE_ESTADO_SOBRE[s.estado as EstadoSobre] ?? s.estado}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-sm font-medium text-fg">{s.titulo}</p>
                        <p className="truncate text-xs text-fg-muted">
                          {NOMBRE_TIPO[s.tipo as TipoSobre]?.es ?? s.tipo} · {s.firmantes.map((f) => f.nombre).join(", ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4 text-xs text-fg-muted sm:flex-col sm:items-end sm:gap-0.5">
                        <span className="font-mono tnum">
                          {firmados}/{s.firmantes.length} firmas
                        </span>
                        <span>
                          {s.estado === "completado" ? `Firmado ${fecha(s.completadoEn)}` : `Creado ${fecha(s.creadoEn)}`} · {s.creador}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {creando && <NuevoSobre userId={userId} onClose={() => setCreando(false)} />}
    </div>
  );
}

type FirmanteForm = { nombre: string; email: string; documento: string; rol: string };
const firmanteVacio = (): FirmanteForm => ({ nombre: "", email: "", documento: "", rol: "" });

function NuevoSobre({ userId, onClose }: { userId: string; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [titulo, setTitulo] = React.useState("");
  const [tipo, setTipo] = React.useState<TipoSobre>("compraventa_nacional");
  const [idioma, setIdioma] = React.useState<"es" | "en">("es");
  const [mensaje, setMensaje] = React.useState("");
  const [enOrden, setEnOrden] = React.useState(true);
  const [firmantes, setFirmantes] = React.useState<FirmanteForm[]>([firmanteVacio()]);
  const [ocupado, setOcupado] = React.useState<null | "borrador" | "enviar">(null);
  const [error, setError] = React.useState<string | null>(null);
  const [enlaces, setEnlaces] = React.useState<{ id: string; lista: EnlaceFirma[] } | null>(null);

  const cambiar = (i: number, k: keyof FirmanteForm, v: string) =>
    setFirmantes((fs) => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const mover = (i: number, d: -1 | 1) =>
    setFirmantes((fs) => {
      const n = [...fs];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  async function guardar(enviar: boolean) {
    setError(null);
    if (!archivo) return setError("Sube el PDF del contrato.");
    if (archivo.size > 15 * 1024 * 1024) return setError("El PDF pasa de 15 MB.");
    setOcupado(enviar ? "enviar" : "borrador");
    try {
      // El PDF va directo del navegador a Storage: por una acción del servidor
      // no cabe (tope de 1 MB) y así no pasa dos veces por la red.
      const path = `originales/${userId}/${crypto.randomUUID()}.pdf`;
      const { error: eUp } = await createClient()
        .storage.from("firmas")
        .upload(path, archivo, { contentType: "application/pdf", upsert: false });
      if (eUp) return setError(`No se pudo subir el PDF: ${eUp.message}`);

      const r = await crearSobre({
        path,
        nombreArchivo: archivo.name,
        titulo,
        tipo,
        idioma,
        mensaje,
        enOrden,
        firmantes,
        enviar,
      });
      if (!r.ok) return setError(r.error);
      toast({ tone: "success", title: enviar ? "Sobre enviado a firma" : "Borrador guardado" });
      if (r.enlaces.length) setEnlaces({ id: r.id, lista: r.enlaces });
      else {
        onClose();
        router.push(`/firmas/${r.id}`);
      }
    } finally {
      setOcupado(null);
    }
  }

  if (enlaces) {
    return (
      <EnlacesModal
        enlaces={enlaces.lista}
        onClose={() => {
          onClose();
          router.push(`/firmas/${enlaces.id}`);
        }}
      />
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Nuevo sobre de firma"
      description="El PDF queda congelado al enviarlo: lo que firman es exactamente lo que subes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={!!ocupado}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={() => guardar(false)} disabled={!!ocupado}>
            {ocupado === "borrador" && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar borrador
          </Button>
          <Button onClick={() => guardar(true)} disabled={!!ocupado}>
            {ocupado === "enviar" && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar a firma
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-dashed px-4 py-4 transition-colors",
            archivo ? "border-accent bg-accent-soft/40" : "border-border-strong hover:bg-bg-subtle",
          )}
        >
          <Upload className="h-5 w-5 shrink-0 text-fg-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-fg">{archivo ? archivo.name : "Elegir PDF del contrato"}</span>
            <span className="block text-xs text-fg-subtle">
              {archivo ? `${(archivo.size / 1024 / 1024).toFixed(1)} MB` : "Hasta 15 MB, sin contraseña"}
            </span>
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setArchivo(f);
              if (f && !titulo) setTitulo(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "));
            }}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Campo label="Título">
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Contrato de suministro — Asociación…" />
          </Campo>
          <Campo label="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoSobre)}>
              {TIPOS_SOBRE.map((t) => (
                <option key={t} value={t}>
                  {NOMBRE_TIPO[t].es}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Idioma para quien firma">
            <Select value={idioma} onChange={(e) => setIdioma(e.target.value as "es" | "en")}>
              <option value="es">Español</option>
              <option value="en">Inglés</option>
            </Select>
          </Campo>
        </div>

        <Campo label="Mensaje en el correo (opcional)">
          <Textarea rows={2} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
        </Campo>

        <fieldset className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="text-xs font-medium text-fg-muted">Firmantes</legend>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={enOrden}
                onChange={(e) => setEnOrden(e.target.checked)}
              />
              Firman en orden (el siguiente recibe el enlace cuando firma el anterior)
            </label>
          </div>
          {firmantes.map((f, i) => (
            <div key={i} className="flex gap-2 rounded-[var(--radius-md)] border border-border p-3">
              <span className="mt-2 w-5 shrink-0 font-mono text-xs text-fg-subtle tnum">{enOrden ? i + 1 : "·"}</span>
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <Input aria-label={`Nombre del firmante ${i + 1}`} placeholder="Nombre completo" value={f.nombre} onChange={(e) => cambiar(i, "nombre", e.target.value)} />
                <Input aria-label={`Correo del firmante ${i + 1}`} placeholder="Correo" type="email" value={f.email} onChange={(e) => cambiar(i, "email", e.target.value)} />
                <Input aria-label={`Documento del firmante ${i + 1}`} placeholder="Cédula / NIT / pasaporte (opcional)" value={f.documento} onChange={(e) => cambiar(i, "documento", e.target.value)} />
                <Input aria-label={`Rol del firmante ${i + 1}`} placeholder="Rol: Comprador, Representante legal AROCO…" value={f.rol} onChange={(e) => cambiar(i, "rol", e.target.value)} />
              </div>
              <div className="flex shrink-0 flex-col gap-0.5">
                {enOrden && i > 0 && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Subir" onClick={() => mover(i, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                )}
                {enOrden && i < firmantes.length - 1 && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Bajar" onClick={() => mover(i, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                )}
                {firmantes.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={`Quitar firmante ${i + 1}`}
                    onClick={() => setFirmantes((fs) => fs.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {firmantes.length < 10 && (
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setFirmantes((fs) => [...fs, firmanteVacio()])}>
              <Plus className="h-3.5 w-3.5" />
              Agregar firmante
            </Button>
          )}
          <p className="text-xs text-fg-subtle">
            Si AROCO también firma, agrega al representante legal como un firmante más (normalmente el último).
          </p>
        </fieldset>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger">
            <X className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
      {label}
      {children}
    </label>
  );
}
