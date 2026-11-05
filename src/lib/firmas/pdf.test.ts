import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  fechaColombia,
  inspeccionarPdf,
  PdfNoValido,
  seguroWinAnsi,
  sellarPdf,
  sha256Hex,
  type EntradaSellado,
} from "./pdf";
import { enmascararCorreo, resumirAgente, turnoActual } from "./tipos";

// PNG de 1×1 transparente.
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

async function pdfDe(paginas: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < paginas; i++) d.addPage([595, 842]).drawText(`Cláusula ${i + 1}`, { x: 50, y: 700, font: f });
  return d.save();
}

function entrada(original: Uint8Array, eventos = 12): EntradaSellado {
  const t = "2026-11-05T19:03:22.000Z";
  return {
    original,
    idioma: "es",
    sobre: {
      codigo: "FIR-0007",
      titulo: "Contrato de suministro — Asociación Ñame & Cacao",
      tipo: "suministro",
      originalNombre: "contrato.pdf",
      originalSha256: sha256Hex(original),
      paginas: 3,
      creadoPor: "Nicolás Pérez",
      enviadoEn: t,
      completadoEn: t,
    },
    firmantes: [
      {
        nombre: "José Núñez",
        nombreFirmado: "José Núñez 🌱",
        documentoFirmado: "CC 1.234.567",
        email: "jose@finca.co",
        rol: "Proveedor",
        verificadoEn: t,
        verificadoCanal: "email",
        firmadoEn: t,
        ip: "190.0.0.1",
        userAgent: "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
        firma: { modo: "dibujada", png: PNG },
      },
      {
        nombre: "Álvaro Acosta",
        nombreFirmado: "Álvaro Acosta Espinosa",
        documentoFirmado: null,
        email: "alvaro@aroco.co",
        rol: null,
        verificadoEn: t,
        verificadoCanal: "email",
        firmadoEn: t,
        ip: null,
        userAgent: null,
        firma: { modo: "escrita" },
      },
    ],
    eventos: Array.from({ length: eventos }, (_, i) => ({
      ocurridoEn: t,
      tipo: i % 2 ? "codigo_verificado" : "evento_desconocido",
      firmante: i % 3 ? "José Núñez" : null,
      ip: "190.0.0.1",
    })),
    hashCadena: "f".repeat(64),
    urlVerificar: "firma.aroco.co/verificar",
  };
}

test("sha256Hex da la huella conocida", () => {
  assert.equal(
    sha256Hex(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("inspeccionarPdf cuenta páginas y rechaza lo que no es PDF", async () => {
  assert.deepEqual(await inspeccionarPdf(await pdfDe(3)), { paginas: 3 });
  await assert.rejects(inspeccionarPdf(new TextEncoder().encode("hola")), PdfNoValido);
  await assert.rejects(inspeccionarPdf(new TextEncoder().encode("%PDF-basura")), PdfNoValido);
});

test("sellarPdf conserva el original y agrega el certificado", async () => {
  const original = await pdfDe(3);
  const firmado = await sellarPdf(entrada(original));
  const doc = await PDFDocument.load(firmado);
  assert.ok(doc.getPageCount() >= 4, "original + al menos una página de certificado");
  assert.equal(doc.getPage(0).getWidth(), 595, "las páginas del original no cambian de tamaño");
  assert.equal(doc.getPage(3).getWidth(), 612);
  assert.match(doc.getTitle() ?? "", /FIR-0007/);
});

test("un registro largo pasa a otra página del certificado", async () => {
  const original = await pdfDe(1);
  const corto = await PDFDocument.load(await sellarPdf(entrada(original, 3)));
  const largo = await PDFDocument.load(await sellarPdf(entrada(original, 150)));
  assert.ok(largo.getPageCount() > corto.getPageCount());
});

test("seguroWinAnsi deja tildes y cambia lo que la fuente no tiene", () => {
  assert.equal(seguroWinAnsi("Ñandú — “ok”"), "Ñandú — “ok”");
  assert.equal(seguroWinAnsi("José 🌱"), "José ?");
  assert.equal(seguroWinAnsi("1 2−3"), "1 2-3");
});

test("fechaColombia resta cinco horas", () => {
  assert.equal(fechaColombia("2026-11-05T03:04:05Z"), "2026-11-04 22:04:05");
});

test("turnoActual respeta el orden", () => {
  const fs = [
    { orden: 1, estado: "firmado" },
    { orden: 2, estado: "notificado" },
    { orden: 2, estado: "pendiente" },
    { orden: 3, estado: "pendiente" },
  ];
  assert.equal(turnoActual(fs, true).length, 2);
  assert.ok(turnoActual(fs, true).every((f) => f.orden === 2));
  assert.equal(turnoActual(fs, false).length, 3);
  assert.equal(turnoActual([{ orden: 1, estado: "firmado" }], true).length, 0);
});

test("enmascararCorreo y resumirAgente", () => {
  assert.equal(enmascararCorreo("ana@aroco.co"), "an***@aroco.co");
  assert.equal(enmascararCorreo("jose.perez@x.com"), "jo********@x.com");
  assert.equal(
    resumirAgente("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17.0 Mobile Safari/604.1"),
    "Safari · iOS",
  );
});
