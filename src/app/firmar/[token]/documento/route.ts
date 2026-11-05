import { createAdminClient } from "@/lib/supabase/admin";
import { accesoPorToken, contextoPeticion, descargar, huboEvento, registrarEvento } from "@/lib/firmas/servidor";

export const dynamic = "force-dynamic";

/**
 * El original, para leerlo antes de firmar. Pasa por aquí (y no por una URL
 * firmada de Storage) para dejar constancia de que quien firma lo abrió: firmar
 * exige ese evento.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const acceso = await accesoPorToken(admin, token);
  if (acceso.estado === "invalido" || acceso.estado === "anulado") {
    return new Response("No disponible", { status: 404 });
  }
  const { sobre, firmante } = acceso;
  const pdf = await descargar(admin, sobre.original_path);

  // Un visor de PDF pide el archivo varias veces seguidas: un evento cada 5 min basta.
  if (!(await huboEvento(admin, firmante.id, "documento_abierto", 5))) {
    await registrarEvento(admin, {
      sobreId: sobre.id,
      firmanteId: firmante.id,
      tipo: "documento_abierto",
      detalle: { sha256: sobre.original_sha256 },
      ctx: await contextoPeticion(),
    });
  }

  const nombre = encodeURIComponent(sobre.original_nombre);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${nombre}`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
