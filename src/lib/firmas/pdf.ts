import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import { NOMBRE_TIPO, resumirAgente, type IdiomaFirma, type TipoSobre } from "./tipos";

/**
 * El PDF de la firma: inspeccionar el original y sellar el firmado.
 *
 * El firmado es el original intacto, página por página, con un pie que lo
 * identifica, más un certificado de evidencias al final: quién firmó, cómo se
 * verificó, desde dónde y cuándo, y la huella del original. Puro y sin red,
 * para poder probarlo con un PDF de verdad.
 *
 * Cuando AROCO tenga el certificado de firma digital (ONAC), el PDF que sale de
 * aquí es el que se firma con PAdES y estampa de tiempo: eso va encima, no
 * cambia lo que este módulo produce.
 */

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export class PdfNoValido extends Error {}

/** Páginas del PDF, o `PdfNoValido` con un motivo que se le puede mostrar a la persona. */
export async function inspeccionarPdf(bytes: Uint8Array): Promise<{ paginas: number }> {
  if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new PdfNoValido("El archivo no es un PDF.");
  }
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/encrypt/i.test(msg)) {
      throw new PdfNoValido(
        "El PDF tiene contraseña o restricciones. Guárdalo de nuevo sin protección y vuelve a subirlo.",
      );
    }
    throw new PdfNoValido("No se pudo leer el PDF. Puede estar dañado.");
  }
  const paginas = doc.getPageCount();
  if (!paginas) throw new PdfNoValido("El PDF no tiene páginas.");
  return { paginas };
}

export interface FirmanteSellado {
  nombre: string;
  nombreFirmado: string;
  documentoFirmado: string | null;
  email: string;
  rol: string | null;
  verificadoEn: string;
  verificadoCanal: string;
  firmadoEn: string;
  ip: string | null;
  userAgent: string | null;
  firma: { modo: "dibujada"; png: Uint8Array } | { modo: "escrita" };
}

export interface EventoSellado {
  ocurridoEn: string;
  tipo: string;
  firmante: string | null;
  ip: string | null;
}

export interface EntradaSellado {
  original: Uint8Array;
  idioma: IdiomaFirma;
  sobre: {
    codigo: string;
    titulo: string;
    tipo: TipoSobre;
    originalNombre: string;
    originalSha256: string;
    paginas: number;
    creadoPor: string;
    enviadoEn: string;
    completadoEn: string;
  };
  firmantes: FirmanteSellado[];
  eventos: EventoSellado[];
  hashCadena: string;
  urlVerificar: string;
}

const ETIQUETAS = {
  es: {
    titulo: "Certificado de firma electrónica",
    pie: (c: string, u: string) => `AROCO S.A.S · ${c} · Firmado electrónicamente · Verifica en ${u}`,
    sobre: "Sobre",
    documento: "Documento",
    tipo: "Tipo",
    archivo: "Archivo original",
    paginas: "Páginas",
    huella: "Huella SHA-256 del original",
    enviadoPor: "Enviado por",
    enviado: "Enviado",
    completado: "Completado",
    firmantes: "Firmantes",
    firmo: "Firmó como",
    identificacion: "Identificación",
    correo: "Correo",
    rol: "Rol",
    verificacion: "Verificación de identidad",
    canal: { email: "código de un solo uso enviado al correo", whatsapp: "código de un solo uso por WhatsApp", sms: "código de un solo uso por SMS" } as Record<string, string>,
    firmadoEl: "Firmado",
    ip: "Dirección IP",
    dispositivo: "Dispositivo",
    firma: "Firma",
    firmaEscrita: "(firma con nombre escrito)",
    registro: "Registro de eventos",
    fecha: "Fecha y hora (Colombia, UTC-5)",
    evento: "Evento",
    quien: "Firmante",
    cadena: "Huella final de la cadena de eventos",
    legal:
      "Documento firmado electrónicamente conforme a la Ley 527 de 1999 y el Decreto 2364 de 2012 (compilado en el Decreto 1074 de 2015). Cada firmante se identificó con un código de un solo uso, abrió el documento y aceptó expresamente su contenido. El registro de eventos es de solo agregar y cada línea está encadenada a la anterior. La huella SHA-256 del original permite comprobar que el contenido firmado es el mismo que se envió.",
    comprobar: (u: string) => `Para comprobar que este PDF no fue alterado, súbelo en ${u}`,
    pagina: (a: number, b: number) => `Página ${a} de ${b} del certificado`,
    eventos: {
      creado: "Sobre creado",
      enviado: "Sobre enviado",
      notificado: "Enlace de firma enviado",
      notificacion_fallida: "Falló el envío del enlace",
      enlace_regenerado: "Enlace de firma regenerado",
      enlace_abierto: "Abrió el enlace",
      documento_abierto: "Abrió el documento",
      codigo_enviado: "Código enviado",
      codigo_fallido: "Código incorrecto",
      codigo_no_enviado: "Falló el envío del código",
      cierre_fallido: "Falló el sellado (reintentado)",
      codigo_verificado: "Identidad verificada",
      firmado: "Firmó",
      rechazado: "Rechazó",
      anulado: "Sobre anulado",
      completado: "Firmado por todos",
    } as Record<string, string>,
  },
  en: {
    titulo: "Electronic signature certificate",
    pie: (c: string, u: string) => `AROCO S.A.S · ${c} · Electronically signed · Verify at ${u}`,
    sobre: "Envelope",
    documento: "Document",
    tipo: "Type",
    archivo: "Original file",
    paginas: "Pages",
    huella: "SHA-256 fingerprint of the original",
    enviadoPor: "Sent by",
    enviado: "Sent",
    completado: "Completed",
    firmantes: "Signers",
    firmo: "Signed as",
    identificacion: "ID number",
    correo: "Email",
    rol: "Role",
    verificacion: "Identity verification",
    canal: { email: "one-time code sent by email", whatsapp: "one-time code via WhatsApp", sms: "one-time code via SMS" } as Record<string, string>,
    firmadoEl: "Signed",
    ip: "IP address",
    dispositivo: "Device",
    firma: "Signature",
    firmaEscrita: "(typed-name signature)",
    registro: "Event log",
    fecha: "Date and time (Colombia, UTC-5)",
    evento: "Event",
    quien: "Signer",
    cadena: "Final fingerprint of the event chain",
    legal:
      "Document signed electronically under Colombian Law 527 of 1999 and Decree 2364 of 2012 (compiled in Decree 1074 of 2015). Each signer was identified with a one-time code, opened the document and expressly accepted its content. The event log is append-only and each entry is chained to the previous one. The SHA-256 fingerprint of the original allows checking that the signed content is the same that was sent.",
    comprobar: (u: string) => `To check that this PDF has not been altered, upload it at ${u}`,
    pagina: (a: number, b: number) => `Certificate page ${a} of ${b}`,
    eventos: {
      creado: "Envelope created",
      enviado: "Envelope sent",
      notificado: "Signing link sent",
      notificacion_fallida: "Signing link failed to send",
      enlace_regenerado: "Signing link regenerated",
      enlace_abierto: "Opened the link",
      documento_abierto: "Opened the document",
      codigo_enviado: "Code sent",
      codigo_fallido: "Wrong code",
      codigo_no_enviado: "Code failed to send",
      cierre_fallido: "Sealing failed (retried)",
      codigo_verificado: "Identity verified",
      firmado: "Signed",
      rechazado: "Declined",
      anulado: "Envelope voided",
      completado: "Signed by all parties",
    } as Record<string, string>,
  },
};

/** «2026-11-05 14:03:22». Hora de Colombia, armada a mano para no depender del ICU del servidor. */
export function fechaColombia(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// Las fuentes estándar del PDF solo codifican WinAnsi (Latin-1 + unos
// cuantos). Tildes y eñes sí; lo demás se reemplaza para que un nombre con un
// carácter raro no tumbe el sellado entero.
const EXTRA_WINANSI = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export function seguroWinAnsi(s: string): string {
  return Array.from(s.normalize("NFC"))
    .map((ch) => {
      if (ch === "\n" || ch === "\t") return " ";
      if (/[  -​ ]/.test(ch)) return " ";
      if (ch === "−") return "-";
      const c = ch.codePointAt(0)!;
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA_WINANSI.has(ch)) return ch;
      return "?";
    })
    .join("");
}

function partir(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const palabras = seguroWinAnsi(texto).split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) {
      actual = prueba;
      continue;
    }
    if (actual) lineas.push(actual);
    // Una palabra más ancha que la línea (un hash) se corta por caracteres.
    let resto = p;
    while (fuente.widthOfTextAtSize(resto, tam) > ancho) {
      let n = resto.length;
      while (n > 1 && fuente.widthOfTextAtSize(resto.slice(0, n), tam) > ancho) n--;
      lineas.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    actual = resto;
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

const TINTA = rgb(0.11, 0.1, 0.09);
const SUAVE = rgb(0.34, 0.33, 0.31);
const TENUE = rgb(0.47, 0.44, 0.42);
const LINEA = rgb(0.86, 0.84, 0.82);
const CACAO = rgb(0.29, 0.15, 0.07);

const ANCHO = 612;
const ALTO = 792;
const MARGEN = 50;

class Escritor {
  pagina!: PDFPage;
  y = 0;
  paginas: PDFPage[] = [];
  constructor(
    private doc: PDFDocument,
    public normal: PDFFont,
    public negrita: PDFFont,
  ) {
    this.nueva();
  }
  nueva() {
    this.pagina = this.doc.addPage([ANCHO, ALTO]);
    this.paginas.push(this.pagina);
    this.y = ALTO - MARGEN;
  }
  espacio(h: number) {
    if (this.y - h < MARGEN + 20) this.nueva();
  }
  texto(t: string, o: { tam?: number; fuente?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; ancho?: number; interlinea?: number } = {}) {
    const tam = o.tam ?? 9;
    const fuente = o.fuente ?? this.normal;
    const x = o.x ?? MARGEN;
    const ancho = o.ancho ?? ANCHO - MARGEN - x;
    const alto = tam * (o.interlinea ?? 1.35);
    for (const l of partir(t, fuente, tam, ancho)) {
      this.espacio(alto);
      this.pagina.drawText(l, { x, y: this.y - tam, size: tam, font: fuente, color: o.color ?? TINTA });
      this.y -= alto;
    }
  }
  par(etiqueta: string, valor: string, x = MARGEN, anchoEtiqueta = 150) {
    const tam = 9;
    const lineas = partir(valor, this.normal, tam, ANCHO - MARGEN - x - anchoEtiqueta);
    const alto = tam * 1.35;
    this.espacio(alto * lineas.length);
    this.pagina.drawText(seguroWinAnsi(etiqueta), { x, y: this.y - tam, size: tam, font: this.normal, color: TENUE });
    for (const l of lineas) {
      this.pagina.drawText(l, { x: x + anchoEtiqueta, y: this.y - tam, size: tam, font: this.normal, color: TINTA });
      this.y -= alto;
    }
  }
  regla(gap = 8) {
    this.espacio(gap * 2);
    this.y -= gap;
    this.pagina.drawLine({ start: { x: MARGEN, y: this.y }, end: { x: ANCHO - MARGEN, y: this.y }, thickness: 0.5, color: LINEA });
    this.y -= gap;
  }
}

export async function sellarPdf(e: EntradaSellado): Promise<Uint8Array> {
  const L = ETIQUETAS[e.idioma];
  const doc = await PDFDocument.load(e.original, { updateMetadata: false });
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const cursiva = await doc.embedFont(StandardFonts.HelveticaOblique);

  // 1 · Pie en cada página del original. El contenido no se toca: el pie va en
  // el margen inferior, en gris y pequeño.
  const pie = seguroWinAnsi(L.pie(e.sobre.codigo, e.urlVerificar));
  for (const p of doc.getPages()) {
    const caja = p.getCropBox();
    const tam = 6.5;
    const ancho = normal.widthOfTextAtSize(pie, tam);
    p.drawText(pie, {
      x: caja.x + Math.max(8, (caja.width - ancho) / 2),
      y: caja.y + 8,
      size: tam,
      font: normal,
      color: TENUE,
    });
  }

  // 2 · Certificado de evidencias.
  const w = new Escritor(doc, normal, negrita);
  w.texto("AROCO S.A.S", { tam: 8, fuente: negrita, color: CACAO });
  w.texto(L.titulo, { tam: 16, fuente: negrita });
  w.y -= 4;
  w.texto(e.sobre.titulo, { tam: 11, color: SUAVE });
  w.regla();

  w.par(L.sobre, e.sobre.codigo);
  w.par(L.tipo, NOMBRE_TIPO[e.sobre.tipo]?.[e.idioma] ?? e.sobre.tipo);
  w.par(L.archivo, e.sobre.originalNombre);
  w.par(L.paginas, String(e.sobre.paginas));
  w.par(L.huella, e.sobre.originalSha256);
  w.par(L.enviadoPor, e.sobre.creadoPor);
  w.par(L.enviado, fechaColombia(e.sobre.enviadoEn));
  w.par(L.completado, fechaColombia(e.sobre.completadoEn));
  w.regla();

  w.texto(L.firmantes, { tam: 11, fuente: negrita });
  w.y -= 4;
  const imagenes = new Map<number, PDFImage>();
  for (let i = 0; i < e.firmantes.length; i++) {
    const f = e.firmantes[i];
    if (f.firma.modo === "dibujada") imagenes.set(i, await doc.embedPng(f.firma.png));
  }
  e.firmantes.forEach((f, i) => {
    w.espacio(150);
    w.texto(`${i + 1}. ${f.nombreFirmado}`, { tam: 10, fuente: negrita });
    w.y -= 2;
    if (f.documentoFirmado) w.par(L.identificacion, f.documentoFirmado, MARGEN + 12, 138);
    w.par(L.correo, f.email, MARGEN + 12, 138);
    if (f.rol) w.par(L.rol, f.rol, MARGEN + 12, 138);
    w.par(
      L.verificacion,
      `${L.canal[f.verificadoCanal] ?? f.verificadoCanal} · ${fechaColombia(f.verificadoEn)}`,
      MARGEN + 12,
      138,
    );
    w.par(L.firmadoEl, fechaColombia(f.firmadoEn), MARGEN + 12, 138);
    w.par(L.ip, f.ip ?? "—", MARGEN + 12, 138);
    w.par(L.dispositivo, resumirAgente(f.userAgent), MARGEN + 12, 138);

    // La firma, en un recuadro.
    const altoCaja = 56;
    w.espacio(altoCaja + 14);
    w.y -= 4;
    const x = MARGEN + 150;
    const caja = { x, y: w.y - altoCaja, width: 220, height: altoCaja };
    w.pagina.drawText(seguroWinAnsi(L.firma), { x: MARGEN + 12, y: w.y - 9, size: 9, font: normal, color: TENUE });
    w.pagina.drawRectangle({ ...caja, borderColor: LINEA, borderWidth: 0.5 });
    const img = imagenes.get(i);
    if (img) {
      const escala = Math.min((caja.width - 12) / img.width, (caja.height - 10) / img.height);
      const iw = img.width * escala;
      const ih = img.height * escala;
      w.pagina.drawImage(img, { x: caja.x + (caja.width - iw) / 2, y: caja.y + (caja.height - ih) / 2, width: iw, height: ih });
    } else {
      const nombre = seguroWinAnsi(f.nombreFirmado);
      let tam = 18;
      while (tam > 8 && cursiva.widthOfTextAtSize(nombre, tam) > caja.width - 16) tam--;
      w.pagina.drawText(nombre, { x: caja.x + 8, y: caja.y + caja.height / 2 - tam / 3, size: tam, font: cursiva, color: CACAO });
      w.pagina.drawText(seguroWinAnsi(L.firmaEscrita), { x: caja.x + caja.width + 8, y: caja.y + 4, size: 7, font: normal, color: TENUE });
    }
    w.y -= altoCaja + 10;
    w.regla(6);
  });

  // 3 · Registro de eventos.
  w.espacio(60);
  w.texto(L.registro, { tam: 11, fuente: negrita });
  w.y -= 4;
  const cols = [MARGEN, MARGEN + 110, MARGEN + 260, MARGEN + 430];
  const encabezado = () => {
    w.espacio(14);
    [L.fecha, L.evento, L.quien, L.ip].forEach((t, i) =>
      w.pagina.drawText(seguroWinAnsi(i === 0 ? t.split(" (")[0] : t), { x: cols[i], y: w.y - 8, size: 7.5, font: negrita, color: TENUE }),
    );
    w.y -= 13;
  };
  encabezado();
  for (const ev of e.eventos) {
    if (w.y - 12 < MARGEN + 20) {
      w.nueva();
      encabezado();
    }
    const valores = [
      fechaColombia(ev.ocurridoEn),
      L.eventos[ev.tipo] ?? ev.tipo,
      ev.firmante ?? "—",
      ev.ip ?? "—",
    ];
    valores.forEach((t, i) => {
      const max = (cols[i + 1] ?? ANCHO - MARGEN) - cols[i] - 6;
      let s = seguroWinAnsi(t);
      while (s.length > 1 && normal.widthOfTextAtSize(s, 7.5) > max) s = s.slice(0, -2) + "…";
      w.pagina.drawText(s, { x: cols[i], y: w.y - 8, size: 7.5, font: normal, color: TINTA });
    });
    w.y -= 11.5;
  }
  w.texto(L.fecha, { tam: 7, color: TENUE });
  w.regla();
  w.texto(L.cadena, { tam: 9, color: TENUE });
  w.texto(e.hashCadena, { tam: 9 });
  w.y -= 6;
  w.texto(L.legal, { tam: 8, color: SUAVE, interlinea: 1.45 });
  w.y -= 4;
  w.texto(L.comprobar(e.urlVerificar), { tam: 8, fuente: negrita, color: SUAVE });

  // Numeración del certificado.
  w.paginas.forEach((p, i) =>
    p.drawText(seguroWinAnsi(`${e.sobre.codigo} · ${L.pagina(i + 1, w.paginas.length)}`), {
      x: MARGEN,
      y: 24,
      size: 7,
      font: normal,
      color: TENUE,
    }),
  );

  doc.setTitle(`${e.sobre.titulo} (${e.sobre.codigo})`);
  doc.setSubject(L.titulo);
  doc.setKeywords([e.sobre.codigo, e.sobre.originalSha256]);
  doc.setProducer("AROCO · firma electrónica");
  doc.setModificationDate(new Date(e.sobre.completadoEn));
  return doc.save();
}
