"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type ResultadoHuella =
  | { encontrado: false }
  | {
      encontrado: true;
      cual: "firmado" | "original";
      codigo: string;
      titulo: string;
      estado: string;
      completadoEn: string | null;
      firmantes: { nombre: string; firmadoEn: string | null }[];
    };

/**
 * ¿Esta huella es la de un documento de AROCO? Solo se recibe el hash: el PDF
 * nunca sale del navegador de quien verifica. Responder con el título y los
 * firmantes no revela nada a quien ya tiene el documento en la mano, y adivinar
 * un SHA-256 no es posible.
 */
export async function consultarHuella(sha256: string): Promise<ResultadoHuella> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return { encontrado: false };
  const admin = createAdminClient();
  const { data: sobre } = await admin
    .from("firmas_sobres")
    .select("id, codigo, titulo, estado, completado_en, firmado_sha256, original_sha256")
    .or(`firmado_sha256.eq.${sha256},original_sha256.eq.${sha256}`)
    .neq("estado", "borrador")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sobre) return { encontrado: false };
  const { data: firmantes } = await admin
    .from("firmas_firmantes")
    .select("nombre, nombre_firmado, firmado_en")
    .eq("sobre_id", sobre.id)
    .order("orden");
  return {
    encontrado: true,
    cual: sobre.firmado_sha256 === sha256 ? "firmado" : "original",
    codigo: sobre.codigo,
    titulo: sobre.titulo,
    estado: sobre.estado,
    completadoEn: sobre.completado_en,
    firmantes: (firmantes ?? []).map((f) => ({ nombre: f.nombre_firmado ?? f.nombre, firmadoEn: f.firmado_en })),
  };
}
