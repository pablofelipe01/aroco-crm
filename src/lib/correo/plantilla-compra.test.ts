import { test } from "node:test";
import assert from "node:assert/strict";
import { armarCorreoCompra, monto, type SolicitudCorreo } from "./plantilla-compra";

const SOLICITUD: SolicitudCorreo = {
  consecutivo: "SC-0042",
  titulo: "Guadañas para la finca",
  categoria: "Finca",
  area: "Finca",
  justificacion: "Las dos que hay se dañaron.",
  solicitante: "Juan Carlos García",
  cotizaciones: [
    { proveedor: "Agro B", monto: 1450000, moneda: "COP", incluyeIva: true, tiempoEntrega: null },
    { proveedor: "Agro A", monto: 1250000, moneda: "COP", incluyeIva: false, tiempoEntrega: "3 días" },
  ],
};

test("pesos con punto de miles; otras monedas con su código", () => {
  assert.equal(monto(1250000, "COP"), "$1.250.000");
  assert.equal(monto(980.4, "USD"), "USD 980");
});

test("asunto igual al aviso de la campana", () => {
  const c = armarCorreoCompra(SOLICITUD, "Luis Ernesto Barrios", "https://aroco-crm.vercel.app/");
  assert.equal(c.asunto, "Por aprobar: SC-0042 — Guadañas para la finca");
});

test("saluda al aprobador, no repite el área y ordena de la más barata a la más cara", () => {
  const c = armarCorreoCompra(SOLICITUD, "Luis Ernesto Barrios", "https://aroco-crm.vercel.app/");
  assert.match(
    c.texto,
    /^Hola, Luis\. Juan Carlos García pide aprobar una compra \(Finca\) con 2 cotizaciones:/,
  );
  assert.ok(c.texto.indexOf("Agro A") < c.texto.indexOf("Agro B"));
  assert.match(c.texto, /- Agro A: \$1\.250\.000 \(Sin IVA · entrega 3 días\)/);
  assert.match(c.texto, /Revisar y decidir: https:\/\/aroco-crm\.vercel\.app\/compras$/);
});

test("el html escapa lo que escribió quien pidió", () => {
  const c = armarCorreoCompra(
    { ...SOLICITUD, titulo: "<b>Urgente</b>", area: "Administrativo" },
    "Álvaro Acosta",
    "https://x",
  );
  assert.ok(!c.html.includes("<b>Urgente</b>"));
  assert.ok(c.html.includes("&lt;b&gt;Urgente&lt;/b&gt;"));
  assert.match(c.texto, /\(Finca · Administrativo\)/);
});
