import { createAdminClient } from "@/lib/supabase/admin";
import { accesoPorToken, contextoPeticion, descargar, registrarEvento } from "@/lib/firmas/servidor";

export const dynamic = "force-dynamic";

/** La copia firmada, para cada firmante, con su mismo enlace. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const acceso = await accesoPorToken(admin, token);
  if (acceso.estado !== "completo" || !acceso.sobre.firmado_path) {
    return new Response("No disponible", { status: 404 });
  }
  const { sobre, firmante } = acceso;
  const pdf = await descargar(admin, sobre.firmado_path!);
  await registrarEvento(admin, {
    sobreId: sobre.id,
    firmanteId: firmante.id,
    tipo: "copia_descargada",
    ctx: await contextoPeticion(),
  });
  const nombre = encodeURIComponent(`${sobre.codigo} - ${sobre.titulo}.pdf`);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${nombre}`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
