"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { proveedorEnSesion } from "@/lib/proveedor-sesion";
import {
  proveedorSchema,
  registroSchema,
  cuentaCobroSchema,
  documentoSchema,
} from "@/lib/schemas/proveedor";
import type { Database } from "@/lib/types/database";

export type Resultado = { ok: boolean; error?: string; id?: string };

type Categoria = Database["public"]["Enums"]["compra_categoria"];
type TipoDoc = Database["public"]["Enums"]["documento_proveedor_tipo"];

function legible(mensaje: string): string {
  if (/duplicate key|already exists|unique/i.test(mensaje)) {
    return "Ya hay un proveedor registrado con ese documento o ese correo.";
  }
  if (/verifica proveedores|42501/i.test(mensaje)) {
    return "Esa acción la hace AROCO, no el proveedor.";
  }
  if (/row-level|policy|permission/i.test(mensaje)) {
    return "No tienes permiso para esta acción.";
  }
  return mensaje;
}

/** Lee los campos del formulario de registro/perfil. */
function leerFicha(fd: FormData) {
  return {
    tipo_persona: fd.get("tipo_persona"),
    tipo_documento: fd.get("tipo_documento"),
    numero_documento: fd.get("numero_documento"),
    nombres: fd.get("nombres") ?? "",
    apellidos: fd.get("apellidos") ?? "",
    razon_social: fd.get("razon_social") ?? "",
    email: fd.get("email"),
    telefono: fd.get("telefono"),
    direccion: fd.get("direccion") ?? "",
    departamento: (fd.get("departamento") || null) as string | null,
    municipio: fd.get("municipio") ?? "",
    categorias: fd.getAll("categorias").map(String),
    descripcion: fd.get("descripcion"),
    banco: (fd.get("banco") || null) as string | null,
    tipo_cuenta: (fd.get("tipo_cuenta") || null) as string | null,
    numero_cuenta: fd.get("numero_cuenta") ?? "",
    titular_cuenta: fd.get("titular_cuenta") ?? "",
    documento_titular: fd.get("documento_titular") ?? "",
  };
}

/**
 * Alta de un proveedor: cuenta de acceso + ficha.
 *
 * El orden importa. Primero se comprueba que el documento y el correo estén
 * libres, para dar un mensaje entendible en vez de un error de llave duplicada.
 * Después se crea la cuenta y luego la ficha; si la ficha falla, la cuenta se
 * borra — si no, quedaría una cuenta huérfana con ese correo y la persona no
 * podría volver a intentarlo.
 *
 * La cuenta se marca `es_proveedor` para que el trigger de `auth.users` NO le
 * cree perfil del CRM. Sin esa marca, un proveedor entraría al CRM como
 * miembro activo.
 */
export async function registrarProveedor(fd: FormData): Promise<Resultado> {
  const datos = proveedorSchema.safeParse(leerFicha(fd));
  if (!datos.success) {
    return { ok: false, error: datos.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const clave = registroSchema.safeParse({ password: fd.get("password") });
  if (!clave.success) {
    return { ok: false, error: clave.error.issues[0]?.message ?? "Contraseña inválida." };
  }

  const admin = createAdminClient();
  const d = datos.data;

  const { data: existe } = await admin
    .from("proveedores_insumos")
    .select("numero_documento, email")
    .or(`numero_documento.eq.${d.numero_documento},email.eq.${d.email}`)
    .maybeSingle();
  if (existe) {
    return {
      ok: false,
      error:
        existe.numero_documento === d.numero_documento
          ? "Ya hay un proveedor con ese número de documento."
          : "Ya hay un proveedor registrado con ese correo.",
    };
  }

  const { data: cuenta, error: eAuth } = await admin.auth.admin.createUser({
    email: d.email,
    password: clave.data.password,
    email_confirm: true,
    user_metadata: { es_proveedor: "true", full_name: d.razon_social ?? d.nombres },
  });
  if (eAuth || !cuenta?.user) {
    return { ok: false, error: legible(eAuth?.message ?? "No se pudo crear la cuenta.") };
  }

  const { data: ficha, error: eFicha } = await admin
    .from("proveedores_insumos")
    .insert({
      auth_user_id: cuenta.user.id,
      tipo_persona: d.tipo_persona,
      tipo_documento: d.tipo_documento,
      numero_documento: d.numero_documento,
      nombres: d.nombres ?? null,
      apellidos: d.apellidos ?? null,
      razon_social: d.razon_social ?? null,
      email: d.email,
      telefono: d.telefono,
      direccion: d.direccion ?? null,
      departamento: d.departamento ?? null,
      municipio: d.municipio ?? null,
      categorias: (d.categorias ?? []) as Categoria[],
      descripcion: d.descripcion,
      banco: d.banco ?? null,
      tipo_cuenta: d.tipo_cuenta ?? null,
      numero_cuenta: d.numero_cuenta ?? null,
      titular_cuenta: d.titular_cuenta ?? null,
      documento_titular: d.documento_titular ?? null,
    })
    .select("id")
    .single();

  if (eFicha) {
    // Sin esto quedaría una cuenta sin ficha: el correo estaría tomado y la
    // persona no podría volver a registrarse ni entrar a ninguna parte.
    await admin.auth.admin.deleteUser(cuenta.user.id);
    return { ok: false, error: legible(eFicha.message) };
  }

  return { ok: true, id: ficha.id };
}

/** Edita la ficha. Cambiar la cuenta bancaria la devuelve a verificación. */
export async function actualizarPerfil(fd: FormData): Promise<Resultado> {
  const prov = await proveedorEnSesion();
  if (!prov) return { ok: false, error: "Sesión expirada." };

  const datos = proveedorSchema.safeParse(leerFicha(fd));
  if (!datos.success) {
    return { ok: false, error: datos.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const d = datos.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("proveedores_insumos")
    .update({
      tipo_persona: d.tipo_persona,
      tipo_documento: d.tipo_documento,
      numero_documento: d.numero_documento,
      nombres: d.nombres ?? null,
      apellidos: d.apellidos ?? null,
      razon_social: d.razon_social ?? null,
      telefono: d.telefono,
      direccion: d.direccion ?? null,
      departamento: d.departamento ?? null,
      municipio: d.municipio ?? null,
      categorias: (d.categorias ?? []) as Categoria[],
      descripcion: d.descripcion,
      banco: d.banco ?? null,
      tipo_cuenta: d.tipo_cuenta ?? null,
      numero_cuenta: d.numero_cuenta ?? null,
      titular_cuenta: d.titular_cuenta ?? null,
      documento_titular: d.documento_titular ?? null,
      // El correo NO se edita aquí: es la llave de acceso, y cambiarlo sin
      // comprobar el nuevo dejaría a la persona sin poder entrar.
    })
    .eq("id", prov.id);

  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/portal");
  return { ok: true, id: prov.id };
}

/**
 * Sube un documento a la carpeta del proveedor.
 *
 * El archivo va por el cliente del usuario, no por service_role: así la
 * política de Storage comprueba que la carpeta sea la suya. Con service_role
 * se saltaría esa comprobación y bastaría un error de programación para que
 * alguien escribiera en la carpeta de otro.
 */
export async function subirDocumento(fd: FormData): Promise<Resultado> {
  const prov = await proveedorEnSesion();
  if (!prov) return { ok: false, error: "Sesión expirada." };

  const meta = documentoSchema.safeParse({
    tipo: fd.get("tipo"),
    vence_el: fd.get("vence_el") ?? "",
  });
  if (!meta.success) {
    return { ok: false, error: meta.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Elige un archivo." };
  }
  if (archivo.size > 10 * 1024 * 1024) {
    return { ok: false, error: "El archivo pesa más de 10 MB." };
  }
  const permitidos = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
  if (!permitidos.includes(archivo.type)) {
    return { ok: false, error: "Solo se aceptan PDF o imágenes." };
  }

  const supabase = await createClient();
  const limpio = archivo.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const ruta = `${prov.id}/${Date.now()}-${limpio}`;

  const { error: eUp } = await supabase.storage
    .from("proveedores-insumos")
    .upload(ruta, archivo, { contentType: archivo.type });
  if (eUp) return { ok: false, error: `No se pudo subir: ${eUp.message}` };

  const { error } = await supabase.from("proveedor_insumo_documentos").insert({
    proveedor_id: prov.id,
    tipo: meta.data.tipo as TipoDoc,
    archivo_path: ruta,
    archivo_nombre: archivo.name,
    vence_el: meta.data.vence_el ?? null,
  });
  if (error) {
    // El archivo ya está arriba; si la fila falla, se retira para no dejar
    // huérfanos ocupando el bucket.
    await supabase.storage.from("proveedores-insumos").remove([ruta]);
    return { ok: false, error: legible(error.message) };
  }

  revalidatePath("/portal");
  return { ok: true };
}

export async function borrarDocumento(id: string): Promise<Resultado> {
  const prov = await proveedorEnSesion();
  if (!prov) return { ok: false, error: "Sesión expirada." };
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("proveedor_insumo_documentos")
    .select("archivo_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("proveedor_insumo_documentos").delete().eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };
  if (doc?.archivo_path) {
    await supabase.storage.from("proveedores-insumos").remove([doc.archivo_path]);
  }
  revalidatePath("/portal");
  return { ok: true };
}

/** Enlace firmado para abrir un documento. */
export async function urlDocumento(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("proveedores-insumos")
    .createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}

/**
 * Radica una cuenta de cobro con sus ítems.
 *
 * La cabecera y los ítems van en dos pasos porque son dos tablas. Si los ítems
 * fallan, la cabecera se borra: una cuenta de cobro sin ítems no tiene valor y
 * dejarla ahí ocuparía un consecutivo con un documento vacío.
 */
export async function crearCuentaCobro(fd: FormData): Promise<Resultado> {
  const prov = await proveedorEnSesion();
  if (!prov) return { ok: false, error: "Sesión expirada." };
  if (prov.estado !== "Activo") {
    return {
      ok: false,
      error: "Tu registro todavía no está verificado, así que aún no puedes radicar cuentas.",
    };
  }

  const cuantos = Number(fd.get("items_count") ?? 0);
  const items = [];
  for (let i = 0; i < cuantos; i++) {
    const descripcion = String(fd.get(`item_${i}_descripcion`) ?? "").trim();
    const valor = String(fd.get(`item_${i}_valor`) ?? "").trim();
    if (!descripcion && !valor) continue; // fila añadida y no usada
    items.push({
      descripcion,
      cantidad: fd.get(`item_${i}_cantidad`) ?? 1,
      valor_unitario: valor,
    });
  }

  const parsed = cuentaCobroSchema.safeParse({
    fecha: fd.get("fecha"),
    concepto: fd.get("concepto") ?? "",
    solicitud_id: fd.get("solicitud_id") ?? "",
    items,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { data: cuenta, error } = await supabase
    .from("cuentas_cobro")
    .insert({
      proveedor_id: prov.id,
      fecha: parsed.data.fecha,
      concepto: parsed.data.concepto ?? null,
      solicitud_id: parsed.data.solicitud_id ?? null,
    })
    .select("id, consecutivo")
    .single();
  if (error) return { ok: false, error: legible(error.message) };

  const { error: eItems } = await supabase.from("cuenta_cobro_items").insert(
    parsed.data.items.map((it, i) => ({
      cuenta_id: cuenta.id,
      orden: i,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      valor_unitario: it.valor_unitario,
    })),
  );
  if (eItems) {
    await supabase.from("cuentas_cobro").delete().eq("id", cuenta.id);
    return { ok: false, error: legible(eItems.message) };
  }

  revalidatePath("/portal");
  return { ok: true, id: cuenta.id };
}
