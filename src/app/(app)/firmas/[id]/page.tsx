import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DetalleSobre } from "./detalle-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sobre de firma" };

export default async function SobrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();

  const [{ data: sobre }, { data: firmantes }, { data: eventos }, { data: integra }] = await Promise.all([
    supabase
      .from("firmas_sobres")
      .select("*, creador:profiles!firmas_sobres_created_by_fkey(full_name)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("firmas_firmantes").select("*").eq("sobre_id", id).order("orden").order("created_at"),
    supabase.from("firmas_eventos").select("*").eq("sobre_id", id).order("id", { ascending: false }),
    supabase.rpc("firmas_cadena_integra", { p_sobre: id }),
  ]);
  if (!sobre) notFound();

  return (
    <DetalleSobre
      sobre={{
        id: sobre.id,
        codigo: sobre.codigo,
        titulo: sobre.titulo,
        tipo: sobre.tipo,
        idioma: sobre.idioma,
        mensaje: sobre.mensaje,
        estado: sobre.estado,
        enOrden: sobre.en_orden,
        originalNombre: sobre.original_nombre,
        originalSha256: sobre.original_sha256,
        paginas: sobre.original_paginas,
        firmadoSha256: sobre.firmado_sha256,
        creadoEn: sobre.created_at,
        enviadoEn: sobre.enviado_en,
        completadoEn: sobre.completado_en,
        venceEn: sobre.vence_en,
        motivoAnulacion: sobre.motivo_anulacion,
        creador: (sobre.creador as { full_name: string } | null)?.full_name ?? "—",
      }}
      firmantes={(firmantes ?? []).map((f) => ({
        id: f.id,
        orden: f.orden,
        nombre: f.nombre,
        email: f.email,
        rol: f.rol,
        estado: f.estado,
        notificadoEn: f.notificado_en,
        verificadoEn: f.verificado_en,
        firmadoEn: f.firmado_en,
        nombreFirmado: f.nombre_firmado,
        documentoFirmado: f.documento_firmado,
        firmadoIp: f.firmado_ip,
        rechazadoEn: f.rechazado_en,
        motivoRechazo: f.motivo_rechazo,
      }))}
      eventos={(eventos ?? []).map((e) => ({
        id: e.id,
        tipo: e.tipo,
        firmanteId: e.firmante_id,
        ocurridoEn: e.ocurrido_en,
        ip: e.ip,
        detalle: e.detalle,
        hash: e.hash,
      }))}
      cadenaIntegra={integra === true}
    />
  );
}
