"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Pencil, Trash2, Eye, EyeOff, Tags } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { CATALOGO_TIPOS } from "@/lib/procesos/catalogos";
import type { Catalogo } from "@/lib/types/database";
import {
  crearItemCatalogo,
  actualizarItemCatalogo,
  eliminarItemCatalogo,
} from "./actions";

export function CatalogosClient({ items }: { items: Catalogo[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [edit, setEdit] = React.useState<Catalogo | null>(null);
  const [editValor, setEditValor] = React.useState("");
  const [editDesc, setEditDesc] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [nuevo, setNuevo] = React.useState<Record<string, string>>({});

  function porTipo(tipo: string) {
    return items.filter((i) => i.tipo === tipo);
  }

  async function agregar(tipo: string) {
    const valor = (nuevo[tipo] ?? "").trim();
    if (!valor) return;
    setBusyId(`new-${tipo}`);
    const res = await crearItemCatalogo(tipo, valor);
    setBusyId(null);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo agregar", description: res.error });
      return;
    }
    setNuevo((n) => ({ ...n, [tipo]: "" }));
    router.refresh();
  }

  async function toggle(it: Catalogo) {
    setBusyId(it.id);
    const res = await actualizarItemCatalogo(it.id, { activo: !it.activo });
    setBusyId(null);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo actualizar", description: res.error });
      return;
    }
    router.refresh();
  }

  async function borrar(it: Catalogo) {
    if (!confirm(`¿Eliminar "${it.valor}" del catálogo? Esta acción no se puede deshacer.`)) return;
    setBusyId(it.id);
    const res = await eliminarItemCatalogo(it.id);
    setBusyId(null);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo eliminar", description: res.error });
      return;
    }
    router.refresh();
  }

  function abrirEdicion(it: Catalogo) {
    setEdit(it);
    setEditValor(it.valor);
    setEditDesc(it.descripcion ?? "");
  }

  async function guardarEdicion() {
    if (!edit) return;
    setSaving(true);
    const res = await actualizarItemCatalogo(edit.id, { valor: editValor, descripcion: editDesc });
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    setEdit(null);
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
        title="Catálogos"
        description="Valores que alimentan los formularios de proveedores. Solo administradores."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {CATALOGO_TIPOS.map((cat) => {
          const lista = porTipo(cat.tipo);
          return (
            <Card key={cat.tipo}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tags className="h-4 w-4 text-accent" /> {cat.label}
                </CardTitle>
                <span className="text-xs text-fg-subtle">{lista.length}</span>
              </CardHeader>
              <CardBody className="space-y-3">
                {lista.length === 0 ? (
                  <p className="text-sm text-fg-subtle">Sin valores todavía.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {lista.map((it) => (
                      <li key={it.id} className="flex items-center gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          <p className={"text-sm " + (it.activo ? "text-fg" : "text-fg-subtle line-through")}>
                            {it.valor}
                          </p>
                          {it.descripcion && (
                            <p className="text-xs text-fg-subtle">{it.descripcion}</p>
                          )}
                        </div>
                        {!it.activo && <Badge tone="neutral">Inactivo</Badge>}
                        <button
                          type="button"
                          title={it.activo ? "Desactivar" : "Activar"}
                          onClick={() => toggle(it)}
                          disabled={busyId === it.id}
                          className="rounded-[var(--radius-sm)] p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg disabled:opacity-50"
                        >
                          {it.activo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => abrirEdicion(it)}
                          className="rounded-[var(--radius-sm)] p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => borrar(it)}
                          disabled={busyId === it.id}
                          className="rounded-[var(--radius-sm)] p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void agregar(cat.tipo);
                  }}
                  className="flex items-center gap-2 pt-1"
                >
                  <Input
                    value={nuevo[cat.tipo] ?? ""}
                    onChange={(e) => setNuevo((n) => ({ ...n, [cat.tipo]: e.target.value }))}
                    placeholder={`Nueva ${cat.singular.toLowerCase()}…`}
                  />
                  <Button type="submit" size="sm" loading={busyId === `new-${cat.tipo}`}>
                    <Plus className="h-4 w-4" /> Agregar
                  </Button>
                </form>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Modal
        open={edit !== null}
        onClose={() => setEdit(null)}
        size="md"
        title="Editar valor"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button size="sm" onClick={guardarEdicion} loading={saving} disabled={!editValor.trim()}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Valor">
            <Input value={editValor} onChange={(e) => setEditValor(e.target.value)} />
          </Field>
          <Field label="Descripción (opcional)">
            <Textarea rows={2} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
