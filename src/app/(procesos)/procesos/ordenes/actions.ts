"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { logAudit } from "@/lib/procesos/audit";
import {
  notificarUsuarios,
  notificarDepartamentos,
  notificarTodoElEquipo,
} from "@/lib/procesos/notificaciones";
import type { OcCaso } from "@/lib/procesos/oc-opts";
import type { TablesInsert, TablesUpdate } from "@/lib/types/database";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

/** ¿Puede aprobar/rechazar/emitir OC? (Gerencia Comercial o Administrativa) */
export async function puedeAprobarOC(): Promise<boolean> {
  const session = await getSessionContext();
  const dep = session?.profile?.department;
  return session?.profile?.role === "admin" || dep === "Comercial" || dep === "Administrativo";
}

type OrdenInput = {
  proveedor_id?: string;
  volumen_kg?: number | null;
  precio_kg?: number | null;
  fecha_entrega?: string | null;
  lugar_entrega?: string | null;
  observaciones?: string | null;
  tipo_caso?: OcCaso;
};

function num(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function crearOrden(input: OrdenInput): Promise<ActionResult> {
  const session = await requireSession();
  if (!input.proveedor_id) return { ok: false, error: "Selecciona el proveedor." };

  const supabase = await createClient();
  const { data: prov } = await supabase
    .from("proveedores")
    .select("estado, nombre")
    .eq("id", input.proveedor_id)
    .maybeSingle();
  if (!prov) return { ok: false, error: "Proveedor no encontrado." };
  if (prov.estado !== "Habilitado")
    return { ok: false, error: "Solo se pueden crear órdenes a proveedores habilitados." };

  const row: TablesInsert<"ordenes_compra"> = {
    proveedor_id: input.proveedor_id,
    tipo_caso: input.tipo_caso ?? "otros_sin",
    volumen_kg: num(input.volumen_kg),
    precio_kg: num(input.precio_kg),
    fecha_entrega: input.fecha_entrega || null,
    lugar_entrega: input.lugar_entrega?.trim() || null,
    observaciones: input.observaciones?.trim() || null,
    created_by: session.userId,
  };

  const { data, error } = await supabase.from("ordenes_compra").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await logAudit("orden", data.id, "crear", `Creó una OC (borrador) para ${prov.nombre}`);
  revalidatePath("/procesos/ordenes");
  return { ok: true, id: data.id };
}

export async function actualizarOrden(id: string, input: OrdenInput): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { data: oc } = await supabase
    .from("ordenes_compra")
    .select("estado")
    .eq("id", id)
    .maybeSingle();
  if (!oc) return { ok: false, error: "Orden no encontrada." };
  if (oc.estado !== "Borrador" && oc.estado !== "En revisión")
    return { ok: false, error: "Solo se editan órdenes en borrador o en revisión." };

  const row: TablesUpdate<"ordenes_compra"> = {
    volumen_kg: num(input.volumen_kg),
    precio_kg: num(input.precio_kg),
    fecha_entrega: input.fecha_entrega || null,
    lugar_entrega: input.lugar_entrega?.trim() || null,
    observaciones: input.observaciones?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (input.tipo_caso) row.tipo_caso = input.tipo_caso;

  const { error } = await supabase.from("ordenes_compra").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit("orden", id, "actualizar", "Actualizó la orden de compra");
  revalidatePath(`/procesos/ordenes/${id}`);
  revalidatePath("/procesos/ordenes");
  return { ok: true, id };
}

/** Genera el siguiente consecutivo del año: OC-2026-0001. */
async function siguienteConsecutivo(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefijo = `OC-${year}-`;
  const { count } = await supabase
    .from("ordenes_compra")
    .select("id", { count: "exact", head: true })
    .like("consecutivo", `${prefijo}%`);
  return `${prefijo}${String((count ?? 0) + 1).padStart(4, "0")}`;
}

/** Envía la OC a aprobación. ROC/Finca se aprueba sola; el resto pasa a revisión. */
export async function enviarAprobacion(id: string, tipoCaso: OcCaso): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: oc } = await supabase
    .from("ordenes_compra")
    .select("estado, proveedor_id, proveedores(nombre)")
    .eq("id", id)
    .maybeSingle();
  if (!oc) return { ok: false, error: "Orden no encontrada." };
  if (oc.estado !== "Borrador" && oc.estado !== "En revisión")
    return { ok: false, error: "La orden ya fue procesada." };

  const nombre =
    (oc.proveedores as unknown as { nombre?: string } | null)?.nombre ?? "el proveedor";

  // Caso ROC/Finca → aprobación automática del Sistema AROCO.
  if (tipoCaso === "roc") {
    const consecutivo = await siguienteConsecutivo(supabase);
    const { error } = await supabase
      .from("ordenes_compra")
      .update({
        tipo_caso: tipoCaso,
        estado: "Aprobada",
        consecutivo,
        aprobada_en: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    await logAudit("orden", id, "aprobar", `Aprobación automática (ROC/Finca) · ${consecutivo}`);
    await notificarDepartamentos(
      ["Comercial", "Administrativo"],
      {
        tipo: "oc_aprobada",
        titulo: `OC aprobada automáticamente: ${consecutivo}`,
        cuerpo: `Programa ROC/Finca — ${nombre}.`,
        enlace: `/procesos/ordenes/${id}`,
        entidad: "orden",
        entidadId: id,
      },
      session.userId,
    );
    revalidatePath(`/procesos/ordenes/${id}`);
    revalidatePath("/procesos/ordenes");
    return { ok: true, id };
  }

  // Otros casos → revisión de Gerencia.
  const { error } = await supabase
    .from("ordenes_compra")
    .update({ tipo_caso: tipoCaso, estado: "En revisión", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit("orden", id, "enviar_revision", "Envió la OC a revisión de Gerencia");
  await notificarDepartamentos(
    ["Comercial", "Administrativo"],
    {
      tipo: "oc_revision",
      titulo: `OC pendiente de aprobación`,
      cuerpo: `${nombre} — requiere revisión de Gerencia.`,
      enlace: `/procesos/ordenes/${id}`,
      entidad: "orden",
      entidadId: id,
    },
    session.userId,
  );
  revalidatePath(`/procesos/ordenes/${id}`);
  revalidatePath("/procesos/ordenes");
  return { ok: true, id };
}

export async function aprobarOrden(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!(await puedeAprobarOC()))
    return { ok: false, error: "Solo Gerencia puede aprobar órdenes." };
  const supabase = await createClient();
  const { data: oc } = await supabase
    .from("ordenes_compra")
    .select("estado, consecutivo, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!oc) return { ok: false, error: "Orden no encontrada." };
  if (oc.estado !== "En revisión" && oc.estado !== "Borrador")
    return { ok: false, error: "La orden no está pendiente de aprobación." };

  const consecutivo = oc.consecutivo ?? (await siguienteConsecutivo(supabase));
  const { error } = await supabase
    .from("ordenes_compra")
    .update({
      estado: "Aprobada",
      consecutivo,
      aprobada_por: session.userId,
      aprobada_en: new Date().toISOString(),
      motivo_rechazo: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit("orden", id, "aprobar", `Aprobó la OC · ${consecutivo}`);
  if (oc.created_by && oc.created_by !== session.userId)
    await notificarUsuarios([oc.created_by], {
      tipo: "oc_aprobada",
      titulo: `OC aprobada: ${consecutivo}`,
      enlace: `/procesos/ordenes/${id}`,
      entidad: "orden",
      entidadId: id,
    });
  revalidatePath(`/procesos/ordenes/${id}`);
  revalidatePath("/procesos/ordenes");
  return { ok: true, id };
}

export async function rechazarOrden(id: string, motivo: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!(await puedeAprobarOC()))
    return { ok: false, error: "Solo Gerencia puede rechazar órdenes." };
  if (!motivo.trim()) return { ok: false, error: "Indica el motivo del rechazo." };
  const supabase = await createClient();
  const { data: oc } = await supabase
    .from("ordenes_compra")
    .select("estado, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!oc) return { ok: false, error: "Orden no encontrada." };
  if (oc.estado !== "En revisión" && oc.estado !== "Borrador")
    return { ok: false, error: "La orden no está pendiente de aprobación." };

  const { error } = await supabase
    .from("ordenes_compra")
    .update({ estado: "Rechazada", motivo_rechazo: motivo.trim(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit("orden", id, "rechazar", "Rechazó la OC", { motivo: motivo.trim() });
  if (oc.created_by && oc.created_by !== session.userId)
    await notificarUsuarios([oc.created_by], {
      tipo: "oc_rechazada",
      titulo: "OC rechazada",
      cuerpo: `Motivo: ${motivo.trim()}`,
      enlace: `/procesos/ordenes/${id}`,
      entidad: "orden",
      entidadId: id,
    });
  revalidatePath(`/procesos/ordenes/${id}`);
  revalidatePath("/procesos/ordenes");
  return { ok: true, id };
}

/** Emite la OC en firme al proveedor y dispara la alerta de logística al equipo. */
export async function emitirOrden(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!(await puedeAprobarOC()))
    return { ok: false, error: "Solo Gerencia puede emitir órdenes." };
  const supabase = await createClient();
  const { data: oc } = await supabase
    .from("ordenes_compra")
    .select("estado, consecutivo, proveedores(nombre)")
    .eq("id", id)
    .maybeSingle();
  if (!oc) return { ok: false, error: "Orden no encontrada." };
  if (oc.estado !== "Aprobada") return { ok: false, error: "Solo se emiten órdenes aprobadas." };

  const { error } = await supabase
    .from("ordenes_compra")
    .update({ estado: "Emitida", emitida_en: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const nombre = (oc.proveedores as unknown as { nombre?: string } | null)?.nombre ?? "el proveedor";
  await logAudit("orden", id, "emitir", `Emitió en firme la OC ${oc.consecutivo ?? ""}`.trim());
  await notificarTodoElEquipo(
    {
      tipo: "oc_emitida",
      titulo: `Alerta de logística — OC ${oc.consecutivo ?? ""} emitida`.trim(),
      cuerpo: `Compra en firme a ${nombre}. Preparar recepción en bodega.`,
      enlace: `/procesos/ordenes/${id}`,
      entidad: "orden",
      entidadId: id,
    },
    session.userId,
  );
  revalidatePath(`/procesos/ordenes/${id}`);
  revalidatePath("/procesos/ordenes");
  return { ok: true, id };
}

// ── Comerciales participantes (alimentan comisiones desde la OC) ─────────────

const OC_ROLES = ["Compra+Venta", "Solo Venta", "Solo Compra"] as const;
type OcRol = (typeof OC_ROLES)[number];

/** Registra un comercial participante en la OC con su rol (compra / venta). */
export async function agregarComercialOC(
  ordenId: string,
  comercialId: string,
  rol: string,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!comercialId) return { ok: false, error: "Selecciona el comercial." };
  if (!OC_ROLES.includes(rol as OcRol)) return { ok: false, error: "Rol inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("oc_comerciales").insert({
    orden_id: ordenId,
    comercial_id: comercialId,
    rol: rol as OcRol,
    created_by: session.userId,
  });
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "Ese comercial ya está registrado en la orden." };
    return { ok: false, error: error.message };
  }
  await logAudit("orden", ordenId, "comercial_agregar", `Registró un comercial participante (${rol})`);
  revalidatePath(`/procesos/ordenes/${ordenId}`);
  return { ok: true };
}

/** Quita un comercial participante de la OC. */
export async function quitarComercialOC(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("oc_comerciales")
    .select("orden_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("oc_comerciales").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (row?.orden_id) {
    await logAudit("orden", row.orden_id, "comercial_quitar", "Quitó un comercial participante");
    revalidatePath(`/procesos/ordenes/${row.orden_id}`);
  }
  return { ok: true };
}
