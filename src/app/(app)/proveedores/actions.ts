"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { PROVEEDOR_ESTADOS, CUENTA_COBRO_ESTADOS } from "@/lib/schemas/proveedor";
import type { Database } from "@/lib/types/database";

export type Resultado = { ok: boolean; error?: string };

type EstadoProv = Database["public"]["Enums"]["proveedor_insumo_estado"];
type EstadoCuenta = Database["public"]["Enums"]["cuenta_cobro_estado"];

async function quienVerifica() {
  const session = await getSessionContext();
  if (!session?.profile?.verifica_proveedores) return null;
  return session;
}

function legible(mensaje: string): string {
  if (/verifica proveedores|42501/i.test(mensaje)) {
    return "Solo quien verifica proveedores puede hacer esto.";
  }
  if (/row-level|policy|permission/i.test(mensaje)) return "No tienes permiso.";
  return mensaje;
}

/**
 * Activa, rechaza o suspende un proveedor.
 *
 * Rechazar exige motivo: quien queda fuera tiene que poder saber qué corregir,
 * y el motivo se le muestra en su panel. Un rechazo mudo obliga a llamar a
 * preguntar.
 */
export async function decidirProveedor(
  id: string,
  estado: string,
  motivo?: string,
): Promise<Resultado> {
  const session = await quienVerifica();
  if (!session) return { ok: false, error: "No tienes permiso para verificar proveedores." };
  if (!PROVEEDOR_ESTADOS.includes(estado as never)) {
    return { ok: false, error: "Estado inválido." };
  }
  if (estado === "Rechazado" && !motivo?.trim()) {
    return { ok: false, error: "Escribe por qué se rechaza." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("proveedores_insumos")
    .update({
      estado: estado as EstadoProv,
      motivo_rechazo: motivo?.trim() || null,
      verificado_por: session.userId,
      verificado_en: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/proveedores");
  return { ok: true };
}

/** Aprueba o rechaza una cuenta de cobro. */
export async function decidirCuenta(
  id: string,
  estado: string,
  motivo?: string,
): Promise<Resultado> {
  const session = await quienVerifica();
  if (!session) return { ok: false, error: "No tienes permiso." };
  if (!CUENTA_COBRO_ESTADOS.includes(estado as never)) {
    return { ok: false, error: "Estado inválido." };
  }
  if (estado === "Rechazada" && !motivo?.trim()) {
    return { ok: false, error: "Escribe por qué se rechaza." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cuentas_cobro")
    .update({
      estado: estado as EstadoCuenta,
      motivo_rechazo: motivo?.trim() || null,
      decidida_por: session.userId,
      decidida_en: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/proveedores");
  return { ok: true };
}

/**
 * Marca una cuenta como pagada.
 *
 * Solo se puede pagar lo aprobado: la comprobación va aquí y no solo en los
 * botones, porque la interfaz se puede saltar y pagar sin aprobar es
 * exactamente lo que el flujo existe para evitar.
 */
export async function marcarPagada(id: string, referencia?: string): Promise<Resultado> {
  const session = await quienVerifica();
  if (!session) return { ok: false, error: "No tienes permiso." };

  const supabase = await createClient();
  const { data: cuenta } = await supabase
    .from("cuentas_cobro")
    .select("estado")
    .eq("id", id)
    .maybeSingle();
  if (!cuenta) return { ok: false, error: "No se encontró la cuenta de cobro." };
  if (cuenta.estado !== "Aprobada") {
    return { ok: false, error: "Solo se puede marcar como pagada una cuenta aprobada." };
  }

  const { error } = await supabase
    .from("cuentas_cobro")
    .update({
      estado: "Pagada",
      pagada_en: new Date().toISOString(),
      pago_referencia: referencia?.trim() || null,
      decidida_por: session.userId,
    })
    .eq("id", id);

  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/proveedores");
  return { ok: true };
}

/** Enlace firmado para revisar un documento del proveedor. */
export async function urlDocumento(path: string): Promise<string | null> {
  const session = await getSessionContext();
  if (!session) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("proveedores-insumos")
    .createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}
