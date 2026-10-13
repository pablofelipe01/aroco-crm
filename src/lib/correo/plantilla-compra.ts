/**
 * Correo de «compra por aprobar».
 *
 * Función pura —sin base ni red— para probar el texto sin mandar nada. El
 * envío vive en `compras-aprobacion.ts`.
 */
import { botonCorreo, escapar, marcoCorreo, primerNombre, tarjetaTarea } from "./html";

export interface CotizacionCorreo {
  proveedor: string;
  monto: number;
  moneda: string;
  incluyeIva: boolean;
  tiempoEntrega: string | null;
}

export interface SolicitudCorreo {
  consecutivo: string;
  titulo: string;
  categoria: string;
  area: string | null;
  justificacion: string | null;
  solicitante: string | null;
  cotizaciones: CotizacionCorreo[];
}

/** «$1.250.000» en pesos (punto de miles, como `pesos()` de 0059); otras monedas con su código. */
export function monto(valor: number, moneda: string): string {
  const cifra = Math.round(valor)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return moneda === "COP" ? `$${cifra}` : `${moneda} ${cifra}`;
}

export function armarCorreoCompra(
  s: SolicitudCorreo,
  aprobador: string,
  baseUrl: string,
): { asunto: string; html: string; texto: string } {
  const asunto = `Por aprobar: ${s.consecutivo} — ${s.titulo}`;
  const quien = s.solicitante ?? "Alguien";
  // El área solo si aporta algo: «Finca · Finca» es ruido (igual que 0059).
  const clase = [s.categoria, s.area && s.area !== s.categoria ? s.area : null]
    .filter(Boolean)
    .join(" · ");
  const n = s.cotizaciones.length;
  // De menor a mayor: lo primero que se mira al aprobar es la más barata.
  const cotizaciones = [...s.cotizaciones].sort((a, b) => a.monto - b.monto);
  const intro = `${quien} pide aprobar una compra (${clase}) con ${
    n === 1 ? "1 cotización" : `${n} cotizaciones`
  }:`;

  const enlace = `${baseUrl.replace(/\/+$/, "")}/compras`;
  const boton = "Revisar y decidir";
  const nota = (c: CotizacionCorreo) =>
    [c.incluyeIva ? "IVA incluido" : "Sin IVA", c.tiempoEntrega ? `entrega ${c.tiempoEntrega}` : null]
      .filter(Boolean)
      .join(" · ");

  const html = marcoCorreo({
    seccion: "Compras",
    cuerpo: `<p style="margin:0 0 6px;font-size:15px">Hola, ${escapar(primerNombre(aprobador))}. ${escapar(intro)}</p>
<p style="margin:0 0 16px;font-size:16px;font-weight:600">${escapar(s.consecutivo)} — ${escapar(s.titulo)}</p>
${s.justificacion ? `<p style="margin:0 0 16px;font-size:13px;color:#57534e">${escapar(s.justificacion.slice(0, 400))}</p>` : ""}
<ul style="margin:0 0 20px;padding:0;list-style:none">
${cotizaciones
  .map((c) =>
    tarjetaTarea({ nombre: `${c.proveedor} · ${monto(c.monto, c.moneda)}`, nota: nota(c) }),
  )
  .join("\n")}
</ul>
${botonCorreo(boton, enlace)}`,
    pie: "Te llega porque apruebas compras en el CRM de AROCO.",
  });

  const texto = [
    `Hola, ${primerNombre(aprobador)}. ${intro}`,
    "",
    `${s.consecutivo} — ${s.titulo}`,
    ...(s.justificacion ? [s.justificacion.slice(0, 400)] : []),
    "",
    ...cotizaciones.map((c) => `- ${c.proveedor}: ${monto(c.monto, c.moneda)} (${nota(c)})`),
    "",
    `${boton}: ${enlace}`,
  ].join("\n");

  return { asunto, html, texto };
}
