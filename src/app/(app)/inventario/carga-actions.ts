"use server";

/**
 * Carga del inventario desde el CRM (fase 2, migración 0113).
 *
 * Mientras `inventario_config.fuente` sea 'hoja', el Excel manda y aquí no se
 * registra nada: llevar el mismo cacao en los dos lados lo contaría doble.
 * Los saldos no se escriben desde aquí: la base los recalcula con cada
 * ingreso, salida o ajuste, y rechaza lo que deje una clase en negativo.
 *
 * Ojo: un archivo "use server" solo puede exportar funciones async (ver
 * memoria aroco-use-server-exports); los esquemas viven en lib/inventory.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import {
  CLASES_CRM,
  NOMBRE_CLASE_CRM,
  ajusteSchema,
  codigoIngreso,
  colIn,
  colSalida,
  ingresoSchema,
  salidaSchema,
  type ClaseCrm,
} from "@/lib/inventory/carga";

export type ResultadoCarga = { ok: boolean; error?: string; id?: string; detalle?: string };

type Cliente = Awaited<ReturnType<typeof createClient>>;

function refrescar() {
  revalidatePath("/inventario");
  revalidatePath("/despachos");
}

async function sesion() {
  const s = await getSessionContext();
  if (!s) throw new Error("Sesión expirada.");
  return s;
}

async function cargaEnCrm(db: Cliente): Promise<string | null> {
  const { data } = await db.from("inventario_config").select("fuente").maybeSingle();
  return data?.fuente === "crm"
    ? null
    : "La carga del inventario todavía viene del Excel. Un administrador debe pasarla al CRM primero.";
}

/** El mensaje de un `raise exception` de la base, sin el ruido de PostgREST. */
function mensaje(e: { message: string; code?: string }): string {
  if (e.code === "42501" || /row-level security/i.test(e.message))
    return "No tienes permiso para esta operación.";
  return e.message;
}

export async function pasarCargaAlCrm(): Promise<ResultadoCarga> {
  const s = await sesion();
  if (s.profile?.role !== "admin")
    return { ok: false, error: "Solo un administrador puede pasar la carga al CRM." };
  const db = await createClient();
  const { data, error } = await db.rpc("inventario_pasar_a_crm");
  if (error) return { ok: false, error: mensaje(error) };
  refrescar();
  revalidatePath("/inventario-calidad");
  const r = (data ?? {}) as { lotes?: number; aperturas?: number };
  return {
    ok: true,
    detalle: r.lotes != null ? `${r.lotes} lotes pasaron al CRM con su saldo de hoy.` : "Ya estaba en el CRM.",
  };
}

function camposIngreso(v: ReturnType<typeof ingresoSchema.parse>) {
  const kilos = Object.fromEntries(
    CLASES_CRM.map((c) => [colIn(c), Math.round((v.kilos[c] ?? 0) * 1000) / 1000]),
  ) as Record<ReturnType<typeof colIn>, number>;
  const mayor = CLASES_CRM.reduce((a, b) => ((v.kilos[b] ?? 0) > (v.kilos[a] ?? 0) ? b : a));
  return {
    entry_date: v.entry_date,
    proveedor_id: v.proveedor_id ?? null,
    proveedor: v.proveedor ?? null,
    departamento: v.departamento ?? null,
    municipio: v.municipio ?? null,
    remision: v.remision ?? null,
    odc: v.odc ?? null,
    recepcion: v.recepcion ?? null,
    responsable: v.responsable ?? null,
    bultos_in: v.bultos_in,
    purchase_price_cop_kg:
      v.purchase_price_cop_kg != null ? v.purchase_price_cop_kg + (v.bonificacion_cop_kg ?? 0) : null,
    bonificacion_cop_kg: v.bonificacion_cop_kg ?? null,
    cadmio: v.cadmio ?? null,
    pct_humedad: v.pct_humedad ?? null,
    pct_fermentacion_total: v.pct_fermentacion_total ?? null,
    notes: v.notes ?? null,
    quality: NOMBRE_CLASE_CRM[mayor],
    ...kilos,
  };
}

export async function crearIngreso(input: unknown): Promise<ResultadoCarga> {
  const p = ingresoSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  const s = await sesion();
  const db = await createClient();
  const bloqueo = await cargaEnCrm(db);
  if (bloqueo) return { ok: false, error: bloqueo };

  const base = codigoIngreso(p.data);
  // El código no es único por sí solo (mismo proveedor, mismo día): si choca
  // con la clave del lote se le agrega un sufijo.
  for (let intento = 1; intento <= 6; intento++) {
    const code = intento === 1 ? base : `${base}-${intento}`;
    const { data, error } = await db
      .from("inventory_lots")
      .insert({
        ...camposIngreso(p.data),
        code,
        codigo_nuevo: code,
        clase: "",
        source: "crm",
        bodega: p.data.bodega,
        bodega_por: s.userId,
        bodega_en: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (!error) {
      refrescar();
      return { ok: true, id: data.id, detalle: code };
    }
    if (error.code !== "23505") return { ok: false, error: mensaje(error) };
  }
  return { ok: false, error: "Ya hay varios ingresos con ese código; agrega la remisión o la recepción." };
}

export async function editarIngreso(id: string, input: unknown): Promise<ResultadoCarga> {
  const p = ingresoSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  const s = await sesion();
  const db = await createClient();
  const bloqueo = await cargaEnCrm(db);
  if (bloqueo) return { ok: false, error: bloqueo };
  const { data: lote } = await db.from("inventory_lots").select("source, bodega").eq("id", id).maybeSingle();
  if (!lote || lote.source !== "crm") return { ok: false, error: "Ese lote no se puede editar aquí." };

  const { data, error } = await db
    .from("inventory_lots")
    .update({
      ...camposIngreso(p.data),
      bodega: p.data.bodega,
      ...(lote.bodega !== p.data.bodega
        ? { bodega_por: s.userId, bodega_en: new Date().toISOString() }
        : {}),
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: mensaje(error) };
  if ((data ?? []).length === 0) return { ok: false, error: "No tienes permiso para editar lotes." };
  refrescar();
  return { ok: true, id };
}

export async function borrarIngreso(id: string): Promise<ResultadoCarga> {
  await sesion();
  const db = await createClient();
  const [{ data: lote }, { count: salidas }, { count: ajustes }] = await Promise.all([
    db.from("inventory_lots").select("source, created_by").eq("id", id).maybeSingle(),
    db.from("dispatches").select("id", { count: "exact", head: true }).eq("lote_origen_id", id),
    db.from("inventario_ajustes").select("id", { count: "exact", head: true }).eq("lot_id", id),
  ]);
  if (!lote || lote.source !== "crm" || !lote.created_by)
    return { ok: false, error: "Solo se pueden borrar ingresos registrados en el CRM." };
  if ((salidas ?? 0) > 0 || (ajustes ?? 0) > 0)
    return { ok: false, error: "El lote ya tiene salidas o ajustes: bórralos primero." };
  const { data, error } = await db.from("inventory_lots").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: mensaje(error) };
  if ((data ?? []).length === 0) return { ok: false, error: "No tienes permiso para borrar lotes." };
  refrescar();
  return { ok: true };
}

export async function registrarSalida(input: unknown): Promise<ResultadoCarga> {
  const p = salidaSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  const s = await sesion();
  const db = await createClient();
  const bloqueo = await cargaEnCrm(db);
  if (bloqueo) return { ok: false, error: bloqueo };

  const ids = [...new Set(p.data.lineas.map((l) => l.lote_id))];
  const { data: lotes, error: e1 } = await db
    .from("inventory_lots")
    .select("id, code, remision, source, purchase_price_cop_kg")
    .in("id", ids);
  if (e1) return { ok: false, error: mensaje(e1) };
  const porId = new Map((lotes ?? []).map((l) => [l.id, l]));
  if (ids.some((i) => porId.get(i)?.source !== "crm"))
    return { ok: false, error: "Uno de los lotes no está en el libro del CRM." };

  const ceros = Object.fromEntries(CLASES_CRM.map((c) => [colSalida(c), 0])) as Record<
    ReturnType<typeof colSalida>,
    number
  >;
  // Una fila por línea, como hace el archivo con cada «SALIDA n». Van en un
  // solo insert: si una línea deja un lote en negativo, no entra ninguna.
  const filas = p.data.lineas.map((l, i) => {
    const lote = porId.get(l.lote_id)!;
    return {
      ...ceros,
      [colSalida(l.clase as ClaseCrm)]: l.kg,
      source: "crm",
      dispatch_date: p.data.dispatch_date,
      destination: p.data.destination,
      remision_salida: p.data.remision_salida ?? null,
      oc: p.data.oc ?? null,
      bultos: i === 0 ? (p.data.bultos ?? null) : null,
      qty_kg: l.kg,
      lote_origen_id: l.lote_id,
      origin: lote.code,
      remision_entrada: lote.remision,
      purchase_price_cop_kg: lote.purchase_price_cop_kg,
      created_by: s.userId,
    };
  });
  const { data, error } = await db.from("dispatches").insert(filas).select("id");
  if (error) return { ok: false, error: mensaje(error) };
  refrescar();
  return { ok: true, detalle: `${data?.length ?? 0} línea(s) registradas.` };
}

export async function registrarAjuste(input: unknown): Promise<ResultadoCarga> {
  const p = ajusteSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos." };
  await sesion();
  const db = await createClient();
  const bloqueo = await cargaEnCrm(db);
  if (bloqueo) return { ok: false, error: bloqueo };
  const { error } = await db.from("inventario_ajustes").insert({
    lot_id: p.data.lot_id,
    fecha: p.data.fecha,
    tipo: p.data.tipo,
    clase_origen: p.data.clase_origen,
    clase_destino: p.data.tipo === "reclasificacion" ? (p.data.clase_destino ?? null) : null,
    kg: p.data.kg,
    nota: p.data.nota || null,
  });
  if (error) return { ok: false, error: mensaje(error) };
  refrescar();
  return { ok: true };
}

export async function borrarAjuste(id: string): Promise<ResultadoCarga> {
  await sesion();
  const db = await createClient();
  const { data, error } = await db
    .from("inventario_ajustes")
    .delete()
    .eq("id", id)
    .neq("tipo", "apertura")
    .select("id");
  if (error) return { ok: false, error: mensaje(error) };
  if ((data ?? []).length === 0)
    return { ok: false, error: "No se pudo borrar (el saldo de apertura no se borra)." };
  refrescar();
  return { ok: true };
}

export async function borrarSalida(id: string): Promise<ResultadoCarga> {
  await sesion();
  const db = await createClient();
  const { data, error } = await db
    .from("dispatches")
    .delete()
    .eq("id", id)
    .eq("source", "crm")
    .select("id");
  if (error) return { ok: false, error: mensaje(error) };
  if ((data ?? []).length === 0)
    return { ok: false, error: "Solo se pueden borrar salidas registradas en el CRM." };
  refrescar();
  return { ok: true };
}
