import { test } from "node:test";
import assert from "node:assert/strict";
import { fotoMercado } from "./foto";
import type { DatosMercado } from "@/app/(app)/mercado/riesgo-data";

/** La situación real del 2026-09-01: inventario entero descubierto. */
const base: DatosMercado = {
  riesgo: {
    toneladasFisicas: 25.32,
    toneladasCubiertas: 0,
    toneladasDescubiertas: 25.32,
    coberturaPct: 0,
    collar: null,
    contratos: {
      putsLargos: 0,
      callsCortos: 0,
      futurosLargos: 0,
      futurosCortos: 0,
    },
    precioMercadoCopKg: 27104.3,
    costoPromedioCopKg: 13558,
    pnlFisicoCop: 342_800_000,
    faltantes: [],
  },
  escenarios: [
    { variacion: -0.2, precioCopKg: 21683.44, pnlCop: 205_700_000 },
    { variacion: 0, precioCopKg: 27104.3, pnlCop: 342_800_000 },
  ],
  kgFisico: 25_320,
  lotes: [],
  totales: {
    lotes_con_saldo: 14,
    costo_promedio_cop_kg: 13558,
  } as DatosMercado["totales"],
  broker: {
    fecha: "2026-08-28",
    cuenta: "AR-001",
    equity: 250_000,
    margenInicial: null,
    disponible: 180_000,
    variacionMercado: -3200,
    pnlMtd: -5000,
    pnlYtd: -42_000,
    moneda: "USD",
  },
  cadena: {
    vencimientos: [
      {
        id: "b1",
        contract_month: "DEC26",
        date: "2026-08-28",
        underlying: 6401,
      },
    ],
    elegido: "DEC26",
    fecha: "2026-08-28",
    subyacente: 6401,
    // Sin tablero del bróker y sin cálculo: el caso que la prueba de abajo
    // exige que se declare en vez de disimularse.
    fuenteDelta: null,
    filas: [
      {
        strike: 4000,
        call_premium: 2400,
        call_delta: null,
        put_premium: 12,
        put_delta: null,
        propioCall: 0,
        propioPut: 0,
      },
      {
        strike: 6400,
        call_premium: 310,
        call_delta: null,
        put_premium: 298,
        put_delta: null,
        propioCall: 0,
        propioPut: 0,
      },
      {
        strike: 6500,
        call_premium: 265,
        call_delta: null,
        put_premium: 352,
        put_delta: null,
        propioCall: 0,
        propioPut: 2,
      },
    ],
  },
  mercado: {
    fecha: "2026-09-01",
    precioUsdT: 6483,
    contrato: "DEC26",
    fuente: "vivo",
    momento: "2026-09-01T14:32:00Z",
    cierrePrevio: 6390,
  },
  cobertura: null,
  trm: { fecha: "2026-08-30", valor: 4180.25 },
  diferenciales: {
    fecha: "2026-08-25",
    filas: [
      {
        origen: "Colombia",
        grado: null,
        valor: 350,
        unidad: "USD/t",
        fuente: "AROCO",
        metodo: "prima observada",
      },
    ],
  },
  ratios: { fecha: "2026-08-25", filas: [], futuros: [] },
  intel: [],
  error: null,
};

test("la foto lleva las cifras que están en pantalla", () => {
  const f = fotoMercado(base);
  assert.match(f, /En bodega: 25\.32 t en 14 lotes/);
  assert.match(f, /descubierto: 25\.32 t/);
  assert.match(f, /6483\.00 USD\/t/);
  assert.match(f, /TRM 4180\.25 del 2026-08-30/);
});

test("sin delta cargado, dice que la cobertura efectiva no se puede calcular", () => {
  // El riesgo de callarlo es que el modelo presente los contratos nominales
  // como si fueran protección real.
  const f = fotoMercado(base);
  assert.match(f, /NO SE PUEDE CALCULAR, no hay delta/);
});

test("sin margen en el extracto, prohíbe calcular equity − margen", () => {
  const f = fotoMercado(base);
  assert.match(f, /nunca la calcules como equity − margen/);
});

test("un precio que no es en vivo se advierte", () => {
  const f = fotoMercado({
    ...base,
    mercado: {
      ...base.mercado,
      fuente: "guardado",
      momento: null,
      cierrePrevio: null,
    },
  });
  assert.match(f, /El precio NO es en vivo/);
  assert.doesNotMatch(f, /variación del día/);
});

test("los faltantes del cálculo se nombran uno por uno", () => {
  const f = fotoMercado({
    ...base,
    riesgo: { ...base.riesgo, faltantes: ["TRM", "precio del cacao"] },
  });
  assert.match(f, /FALTANTES DEL CÁLCULO: TRM, precio del cacao/);
});

test("la cadena se recorta alrededor del dinero, no por el principio", () => {
  // Con 60 strikes, mandar los primeros 14 daría la cola de la cadena —
  // strikes que nadie usa para cubrir— y dejaría fuera el dinero.
  const filas = Array.from({ length: 60 }, (_, i) => ({
    strike: 3000 + i * 100,
    call_premium: 100,
    call_delta: null,
    put_premium: 100,
    put_delta: null,
    propioCall: 0,
    propioPut: 0,
  }));
  const f = fotoMercado({ ...base, cadena: { ...base.cadena, filas } });
  assert.match(
    f,
    /14 strikes alrededor del dinero, de 60 en la cadena completa/,
  );
  assert.match(f, /^6400 \| /m, "el strike del dinero tiene que estar");
  assert.doesNotMatch(f, /^3000 \| /m, "la cola no");
});

test("la estimación de Colombia se marca como estimación", () => {
  const f = fotoMercado(base);
  assert.match(f, /ESTIMACIÓN de AROCO/);
});
