"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Trash2, Download, Loader2 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { ProveedorDocumento } from "@/lib/types/database";
import { subirDocumento, eliminarDocumento, urlDocumento } from "../actions";

const CATEGORIAS: { key: string; titulo: string; hint: string }[] = [
  { key: "legales", titulo: "Documentos legales", hint: "RUT, cédula, cámara de comercio, cuenta bancaria, formulario de vinculación…" },
  { key: "tecnicos", titulo: "Documentos técnicos", hint: "Certificaciones, sellos y soportes técnicos." },
  { key: "contrato", titulo: "Contrato firmado", hint: "Contrato firmado por ambas partes." },
];

function tamano(bytes: number | null): string {
  if (!bytes) return "";
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export function Documentos({
  proveedorId,
  documentos,
  canWrite,
}: {
  proveedorId: string;
  documentos: ProveedorDocumento[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [subiendo, setSubiendo] = React.useState<string | null>(null);

  async function onPick(categoria: string, file: File | undefined) {
    if (!file) return;
    setSubiendo(categoria);
    const fd = new FormData();
    fd.set("proveedorId", proveedorId);
    fd.set("categoria", categoria);
    fd.set("file", file);
    const res = await subirDocumento(fd);
    setSubiendo(null);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo subir", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Documento cargado" });
    router.refresh();
  }

  async function onDownload(doc: ProveedorDocumento) {
    const url = await urlDocumento(doc.file_path);
    if (url) window.open(url, "_blank");
    else toast({ tone: "error", title: "No se pudo abrir el archivo" });
  }

  async function onDelete(doc: ProveedorDocumento) {
    if (!confirm(`¿Eliminar "${doc.nombre}"?`)) return;
    const res = await eliminarDocumento(doc.id);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo eliminar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Documento eliminado" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos soporte</CardTitle>
        <span className="text-xs text-fg-subtle">PDF o imagen · máx 5 MB · 10 por categoría</span>
      </CardHeader>
      <CardBody className="space-y-5">
        {CATEGORIAS.map((cat) => {
          const docs = documentos.filter((d) => d.categoria === cat.key);
          return (
            <div key={cat.key}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-fg">{cat.titulo}</p>
                  <p className="text-xs text-fg-subtle">{cat.hint}</p>
                </div>
                {canWrite && (
                  <label className="shrink-0">
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg"
                      className="hidden"
                      disabled={subiendo === cat.key}
                      onChange={(e) => onPick(cat.key, e.target.files?.[0])}
                    />
                    <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:border-accent/50 hover:text-fg">
                      {subiendo === cat.key ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Subir
                    </span>
                  </label>
                )}
              </div>

              {docs.length === 0 ? (
                <p className="rounded-[var(--radius-md)] border border-dashed border-border px-3 py-2 text-xs text-fg-subtle">
                  Sin documentos.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {docs.map((d) => (
                    <li
                      key={d.id}
                      className="group flex items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-fg-subtle" />
                      <button
                        onClick={() => onDownload(d)}
                        className="min-w-0 flex-1 truncate text-left text-sm text-fg hover:text-accent hover:underline"
                      >
                        {d.nombre}
                      </button>
                      <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{tamano(d.size_bytes)}</span>
                      <button
                        onClick={() => onDownload(d)}
                        className="rounded p-1 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                        aria-label="Descargar"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {canWrite && (
                        <button
                          onClick={() => onDelete(d)}
                          className="rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
