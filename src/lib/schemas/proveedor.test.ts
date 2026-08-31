import { test } from "node:test";
import assert from "node:assert/strict";
import { proveedorSchema, totalCuenta, vigencia, nombreProveedor } from "./proveedor";

const base = {
  tipo_persona: "Jurídica" as const,
  tipo_documento: "NIT" as const,
  numero_documento: "900.123.456-7",
  razon_social: "Agroinsumos del Llano SAS",
  email: "Ventas@Agroinsumos.CO",
  telefono: "3101234567",
  descripcion: "Fertilizantes y agroinsumos para cultivo",
  categorias: ["Cultivo" as const],
};

test("el NIT se guarda limpio, sin puntos ni guion", () => {
  // «900.123.456-7» y «9001234567» son el mismo proveedor. Sin normalizar,
  // entrarían dos veces y el índice único no los detectaría.
  const r = proveedorSchema.parse(base);
  assert.equal(r.numero_documento, "9001234567");
});

test("el correo se normaliza a minúsculas", () => {
  // Es la llave de acceso: «Ventas@» y «ventas@» tienen que ser uno solo.
  assert.equal(proveedorSchema.parse(base).email, "ventas@agroinsumos.co");
});

test("persona natural exige nombres y apellidos", () => {
  const sinNombre = proveedorSchema.safeParse({
    ...base,
    tipo_persona: "Natural",
    tipo_documento: "CC",
    razon_social: null,
  });
  assert.equal(sinNombre.success, false);

  const conNombre = proveedorSchema.safeParse({
    ...base,
    tipo_persona: "Natural",
    tipo_documento: "CC",
    razon_social: null,
    nombres: "Ana",
    apellidos: "Ramírez",
  });
  assert.equal(conNombre.success, true);
});

test("persona jurídica exige razón social", () => {
  const r = proveedorSchema.safeParse({ ...base, razon_social: "" });
  assert.equal(r.success, false);
});

test("el total suma cantidad por valor unitario", () => {
  assert.equal(
    totalCuenta([
      { cantidad: 2, valor_unitario: 625_000 },
      { cantidad: 1, valor_unitario: 180_000 },
    ]),
    1_430_000,
  );
  assert.equal(totalCuenta([]), 0);
});

test("un documento avisa 30 días antes de vencer, no el mismo día", () => {
  const enDias = (n: number) => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  assert.equal(vigencia(enDias(90)), "vigente");
  assert.equal(vigencia(enDias(10)), "por-vencer", "conseguir un RUT nuevo toma días");
  assert.equal(vigencia(enDias(-1)), "vencido");
  assert.equal(vigencia(null), "sin-fecha");
});

test("el nombre depende del tipo de persona", () => {
  assert.equal(
    nombreProveedor({ tipo_persona: "Jurídica", nombres: null, apellidos: null, razon_social: "Alkosto SA" }),
    "Alkosto SA",
  );
  assert.equal(
    nombreProveedor({ tipo_persona: "Natural", nombres: "Ana", apellidos: "Ramírez", razon_social: null }),
    "Ana Ramírez",
  );
});
