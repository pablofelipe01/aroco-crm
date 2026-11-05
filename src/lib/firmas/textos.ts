import type { IdiomaFirma } from "./tipos";

/**
 * Textos de lo que ve quien firma: la página pública, los correos y el
 * certificado de evidencias. Van en el idioma del sobre, no en el del CRM: un
 * comprador en Europa recibe todo en inglés aunque quien lo envía use el CRM
 * en español.
 *
 * PENDIENTE DE REVISIÓN DEL ABOGADO: `consentimiento` y `notaLegal`. Cuando
 * cambie el texto, se sube `VERSION_CONSENTIMIENTO`: cada firma guarda la
 * versión que aceptó, así que un cambio no reescribe lo ya firmado.
 */
export const VERSION_CONSENTIMIENTO = "2026-11-05";

const es = {
  marca: "Firma electrónica",
  enlaceInvalido: "Este enlace no es válido",
  enlaceInvalidoNota:
    "Puede que lo hayan reemplazado por uno nuevo. Revisa el correo más reciente de AROCO o escríbenos a info@aroco.co.",
  anulado: "Este documento fue anulado",
  anuladoNota: "AROCO retiró este documento y ya no se puede firmar.",
  vencido: "El plazo para firmar venció",
  vencidoNota: "Escríbenos a info@aroco.co para que te enviemos uno nuevo.",
  yaFirmaste: "Ya firmaste este documento",
  yaFirmasteNota: "Cuando firmen todos, te llega por correo el PDF con el certificado de firma.",
  completo: "Documento firmado por todos",
  completoNota: "Puedes descargar el PDF firmado con su certificado de evidencias.",
  descargarFirmado: "Descargar PDF firmado",
  rechazaste: "Rechazaste este documento",
  rechazasteNota: "AROCO ya fue notificado.",
  saludo: (n: string) => `Hola, ${n}`,
  teEnvia: "AROCO S.A.S te envía este documento para firma electrónica.",
  paso1: "Revisa el documento",
  paso1Nota: "Ábrelo y léelo completo antes de firmar.",
  abrirDocumento: "Abrir documento (PDF)",
  paginas: (n: number) => (n === 1 ? "1 página" : `${n} páginas`),
  documentoAbierto: "Documento abierto",
  paso2: "Confirma tu identidad",
  paso2Nota: (c: string) => `Te enviamos un código de 6 dígitos a ${c}.`,
  enviarCodigo: "Enviarme el código",
  reenviarCodigo: "Enviar otro código",
  codigo: "Código",
  verificar: "Verificar",
  identidadOk: "Identidad confirmada",
  paso3: "Firma",
  nombreCompleto: "Nombre completo",
  documento: "Cédula, NIT o pasaporte",
  dibujaFirma: "Dibuja tu firma",
  borrar: "Borrar",
  usarEscrita: "Prefiero firmar con mi nombre escrito",
  usarDibujada: "Prefiero dibujar mi firma",
  firmaEscritaNota: "Tu firma será tu nombre escrito.",
  consentimiento:
    "Leí el documento completo, estoy de acuerdo con su contenido y acepto firmarlo por medios electrónicos. Entiendo que esta firma tiene la misma validez que mi firma manuscrita (Ley 527 de 1999 y Decreto 2364 de 2012) y autorizo a AROCO S.A.S a conservar los datos de esta firma como evidencia.",
  firmar: "Firmar documento",
  rechazar: "No voy a firmar",
  motivoRechazo: "Cuéntanos por qué (opcional)",
  confirmarRechazo: "Rechazar documento",
  cancelar: "Cancelar",
  primeroAbre: "Primero abre el documento.",
  primeroVerifica: "Primero confirma tu identidad.",
  faltaFirma: "Dibuja tu firma o elige firmar con tu nombre escrito.",
  faltaConsentimiento: "Marca la casilla de aceptación.",
  firmado: "¡Listo! Firmaste el documento",
  pie: "AROCO S.A.S · NIT 830.007.327-6 · info@aroco.co",
  // correo
  asuntoFirma: (t: string) => `Documento para firmar: ${t}`,
  correoCuerpo: (n: string, t: string) =>
    `Hola, ${n}. AROCO S.A.S te envía «${t}» para que lo revises y lo firmes electrónicamente.`,
  correoBoton: "Revisar y firmar",
  correoVence: (f: string) => `El enlace vence el ${f}. Es personal: no lo reenvíes.`,
  asuntoCodigo: "Tu código para firmar con AROCO",
  correoCodigo: (c: string, m: number) =>
    `Tu código es ${c}. Vale ${m} minutos. Si no estás firmando un documento de AROCO, ignora este correo.`,
  asuntoCompleto: (t: string) => `Documento firmado: ${t}`,
  correoCompleto: (t: string) =>
    `Todos firmaron «${t}». Adjuntamos el PDF firmado con su certificado de evidencias. Guárdalo: es tu copia.`,
  correoVerificar: "Para comprobar que una copia no fue alterada:",
};

export type TextosFirma = typeof es;

const en: TextosFirma = {
  marca: "Electronic signature",
  enlaceInvalido: "This link is not valid",
  enlaceInvalidoNota:
    "It may have been replaced by a new one. Check AROCO's most recent email or write to info@aroco.co.",
  anulado: "This document was voided",
  anuladoNota: "AROCO withdrew this document and it can no longer be signed.",
  vencido: "The signing period has expired",
  vencidoNota: "Write to info@aroco.co and we will send you a new one.",
  yaFirmaste: "You already signed this document",
  yaFirmasteNota: "Once everyone signs, you will receive the signed PDF with its signature certificate.",
  completo: "Signed by all parties",
  completoNota: "You can download the signed PDF with its evidence certificate.",
  descargarFirmado: "Download signed PDF",
  rechazaste: "You declined this document",
  rechazasteNota: "AROCO has been notified.",
  saludo: (n) => `Hello, ${n}`,
  teEnvia: "AROCO S.A.S has sent you this document for electronic signature.",
  paso1: "Review the document",
  paso1Nota: "Open it and read it in full before signing.",
  abrirDocumento: "Open document (PDF)",
  paginas: (n) => (n === 1 ? "1 page" : `${n} pages`),
  documentoAbierto: "Document opened",
  paso2: "Confirm your identity",
  paso2Nota: (c) => `We will send a 6-digit code to ${c}.`,
  enviarCodigo: "Send me the code",
  reenviarCodigo: "Send another code",
  codigo: "Code",
  verificar: "Verify",
  identidadOk: "Identity confirmed",
  paso3: "Sign",
  nombreCompleto: "Full name",
  documento: "ID, tax ID or passport number",
  dibujaFirma: "Draw your signature",
  borrar: "Clear",
  usarEscrita: "I prefer to sign with my typed name",
  usarDibujada: "I prefer to draw my signature",
  firmaEscritaNota: "Your typed name will be your signature.",
  consentimiento:
    "I have read the entire document, I agree with its content and I accept to sign it electronically. I understand this signature has the same validity as my handwritten signature (Colombian Law 527 of 1999 and Decree 2364 of 2012) and I authorize AROCO S.A.S to keep the data of this signature as evidence.",
  firmar: "Sign document",
  rechazar: "I will not sign",
  motivoRechazo: "Tell us why (optional)",
  confirmarRechazo: "Decline document",
  cancelar: "Cancel",
  primeroAbre: "Open the document first.",
  primeroVerifica: "Confirm your identity first.",
  faltaFirma: "Draw your signature or choose to sign with your typed name.",
  faltaConsentimiento: "Tick the acceptance box.",
  firmado: "Done! You signed the document",
  pie: "AROCO S.A.S · Tax ID 830.007.327-6 · info@aroco.co",
  asuntoFirma: (t) => `Document to sign: ${t}`,
  correoCuerpo: (n, t) =>
    `Hello, ${n}. AROCO S.A.S has sent you “${t}” to review and sign electronically.`,
  correoBoton: "Review and sign",
  correoVence: (f) => `The link expires on ${f}. It is personal: do not forward it.`,
  asuntoCodigo: "Your AROCO signing code",
  correoCodigo: (c, m) =>
    `Your code is ${c}. It is valid for ${m} minutes. If you are not signing an AROCO document, ignore this email.`,
  asuntoCompleto: (t) => `Signed document: ${t}`,
  correoCompleto: (t) =>
    `Everyone has signed “${t}”. Attached is the signed PDF with its evidence certificate. Keep it: it is your copy.`,
  correoVerificar: "To check that a copy has not been altered:",
};

export function textosFirma(idioma: IdiomaFirma | string): TextosFirma {
  return idioma === "en" ? en : es;
}
