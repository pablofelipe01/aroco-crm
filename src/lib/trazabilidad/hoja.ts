/**
 * Lectura de la hoja de ruta: quién entregó cada kilo y desde qué vereda.
 *
 * Es la pieza que faltaba para trazar el cacao hacia atrás. El inventario sabe
 * que un lote se llama «CISCA ruta #3 (Guachene - villa rica )» y cuántos kilos
 * tiene; esta hoja sabe que esos kilos los entregaron 91 productores de 19
 * veredas, con nombre, cédula y lo que se le pagó a cada uno.
 *
 * LO QUE NO SE TRAE. La hoja incluye banco, número de cuenta, tipo de cuenta y
 * la cédula del titular. Nada de eso entra: para trazar un grano hasta su
 * finca no hace falta saber a qué cuenta se le pagó, y copiar datos bancarios
 * a una segunda base multiplica dónde puede filtrarse algo que no aporta al
 * problema. Tampoco entran teléfono ni correo del productor — si hay que
 * llamar a alguien, la hoja sigue ahí.
 *
 * Sí entran los precios. «Se le pagó a esta persona tanto por kilo, más
 * bonificación por calidad» es parte de lo que una trazabilidad tiene que
 * poder demostrar, no un dato administrativo suelto.
 *
 * Las columnas se leen por ENCABEZADO y no por posición, como en las demás
 * hojas: con el inventario esa lección salió cara tres veces.
 */

export class ColumnaFaltante extends Error {}

/** minúsculas, sin tildes ni espacios de más, para comparar encabezados. */
function normalizar(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nombre de vereda comparable.
 *
 * La hoja trae 25 escrituras distintas para unas 19 veredas: «BARRAGAN» y
 * «BARRAGÁN», «BOCA DEL PALO» y «BOCAS DEL PALO», «MINGO» y «VEREDA MINGO»,
 * «CAPONERA PUEBLO NUEVO» y «PUEBLO NUEVO CAPONERA». Sin unificarlas, el mapa
 * pintaría el mismo sitio varias veces y repartiría entre ellos los kilos que
 * son de uno solo.
 *
 * Se quitan tildes, el prefijo «vereda» y los plurales de una letra final; se
 * ORDENAN las palabras, y se juntan SIN espacios. Cada paso resuelve un par
 * real de la hoja del 3-sep y ninguno enumera parejas a mano:
 *
 *   tildes         BARRAGAN            = BARRAGÁN
 *   plural         BOCA DEL PALO       = BOCAS DEL PALO
 *   prefijo        MINGO               = VEREDA MINGO
 *   orden          CAPONERA PUEBLO N.  = PUEBLO NUEVO CAPONERA
 *   sin espacios   BARRIO TERRONAL     = BARRIOTERRONAL
 *
 * Juntar sin espacios es lo que salva el último par, donde a alguien se le fue
 * la barra espaciadora. Podría fusionar dos veredas que de verdad se llamen
 * igual salvo por un espacio, pero eso no existe en los datos y el caso
 * contrario —el mismo sitio pintado dos veces en el mapa, con sus kilos
 * repartidos entre los dos— sí está ocurriendo.
 */
export function claveVereda(nombre: string): string {
  const base = normalizar(nombre)
    .replace(/^vereda\s+/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
  if (!base) return "";
  const palabras = base
    .split(/\s+/)
    // Singular aproximado: «bocas» → «boca». Basta para lo que hay y no
    // inventa reglas de español que después haya que desarmar.
    .map((p) => (p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p))
    .sort();
  return palabras.join("");
}

/** «RUTA 3» · «Ruta #3» · «ruta 3 (Guachene)» → 3. */
export function numeroDeRuta(texto: string): number | null {
  const m = /ruta\s*#?\s*(\d+)/i.exec(normalizar(texto));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Números como los escribe la hoja en español: «8.739,5» y «$ 104.868».
 * El punto separa miles y la coma es decimal, al revés de JavaScript.
 */
export function numero(v: string): number {
  const limpio = (v ?? "").replace(/[^\d,.-]/g, "");
  if (!limpio) return 0;
  const n = Number(limpio.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export type EntregaFila = {
  fila: number;
  fecha: string;
  ruta: number;
  loteHoja: string;
  productor: string;
  cedula: string;
  tipoProductor: string;
  veredaCruda: string;
  veredaClave: string;
  calidad: string;
  kgPrimera: number;
  kgSegunda: number;
  precioBase: number;
  bonificacionCalidad: number;
  precioKgPrimera: number;
  totalPrimera: number;
  precioKgSegunda: number;
  totalSegunda: number;
  totalVenta: number;
};

export type HojaRuta = {
  entregas: EntregaFila[];
  /** Filas con datos que se descartaron, y por qué. Se reportan, no se ocultan. */
  descartadas: { fila: number; motivo: string }[];
};

function indice(encabezado: string[], ...nombres: string[]): number {
  const normalizados = encabezado.map(normalizar);
  for (const n of nombres) {
    const i = normalizados.indexOf(normalizar(n));
    if (i >= 0) return i;
  }
  throw new ColumnaFaltante(
    `La hoja de ruta no tiene la columna «${nombres[0]}». Encontradas: ${encabezado
      .filter(Boolean)
      .join(", ")}`,
  );
}

function indiceOpcional(encabezado: string[], ...nombres: string[]): number {
  try {
    return indice(encabezado, ...nombres);
  } catch {
    return -1;
  }
}

export function parseHojaRuta(matriz: string[][]): HojaRuta {
  if (matriz.length < 2) throw new ColumnaFaltante("La hoja de ruta llegó vacía.");

  const enc = matriz[0];
  const C = {
    fecha: indice(enc, "Fecha"),
    lote: indiceOpcional(enc, "Lote"),
    cedula: indice(enc, "Cédula", "Cedula"),
    tipo: indiceOpcional(enc, "Tipo productor"),
    productor: indice(enc, "Productor"),
    ruta: indice(enc, "Ruta"),
    vereda: indice(enc, "Vereda"),
    calidad: indiceOpcional(enc, "Calidad"),
    kgPrimera: indice(enc, "Kg primera"),
    precioBase: indiceOpcional(enc, "Precio base"),
    bonificacion: indiceOpcional(enc, "Bonificación por calidad", "Bonificacion por calidad"),
    precioPrimera: indiceOpcional(enc, "Precio kg primera"),
    totalPrimera: indiceOpcional(enc, "Total primera"),
    kgSegunda: indiceOpcional(enc, "Kg segunda"),
    precioSegunda: indiceOpcional(enc, "Precio kg segunda"),
    totalSegunda: indiceOpcional(enc, "Total segunda"),
    totalVenta: indiceOpcional(enc, "TOTAL VENTA", "Total venta"),
  };

  const celda = (f: string[], i: number) => (i < 0 ? "" : (f[i] ?? "").trim());

  const entregas: EntregaFila[] = [];
  const descartadas: { fila: number; motivo: string }[] = [];

  for (let r = 1; r < matriz.length; r++) {
    const f = matriz[r];
    const numeroFila = r + 1; // 1-indexado y contando el encabezado, como en la hoja
    const fecha = celda(f, C.fecha);
    const productor = celda(f, C.productor);

    if (!fecha && !productor) continue; // fila en blanco del final

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      descartadas.push({ fila: numeroFila, motivo: `fecha ilegible: «${fecha}»` });
      continue;
    }
    if (!productor) {
      descartadas.push({ fila: numeroFila, motivo: "sin productor" });
      continue;
    }

    // Sin ruta la entrega no se puede colgar de ningún lote: es justo el dato
    // que enlaza la hoja con el inventario.
    const ruta = numeroDeRuta(celda(f, C.ruta));
    if (ruta === null) {
      descartadas.push({
        fila: numeroFila,
        motivo: `ruta ilegible: «${celda(f, C.ruta)}»`,
      });
      continue;
    }

    const kgPrimera = numero(celda(f, C.kgPrimera));
    const kgSegunda = numero(celda(f, C.kgSegunda));
    if (kgPrimera <= 0 && kgSegunda <= 0) {
      descartadas.push({ fila: numeroFila, motivo: "sin kilos" });
      continue;
    }

    const veredaCruda = celda(f, C.vereda);
    entregas.push({
      fila: numeroFila,
      fecha,
      ruta,
      loteHoja: celda(f, C.lote),
      productor,
      // La cédula se guarda solo con dígitos: en la hoja aparece con puntos a
      // veces y sin ellos otras, y así el mismo productor no entra dos veces.
      cedula: celda(f, C.cedula).replace(/\D/g, ""),
      tipoProductor: celda(f, C.tipo),
      veredaCruda,
      veredaClave: claveVereda(veredaCruda),
      calidad: celda(f, C.calidad),
      kgPrimera,
      kgSegunda,
      precioBase: numero(celda(f, C.precioBase)),
      bonificacionCalidad: numero(celda(f, C.bonificacion)),
      precioKgPrimera: numero(celda(f, C.precioPrimera)),
      totalPrimera: numero(celda(f, C.totalPrimera)),
      precioKgSegunda: numero(celda(f, C.precioSegunda)),
      totalSegunda: numero(celda(f, C.totalSegunda)),
      totalVenta: numero(celda(f, C.totalVenta)),
    });
  }

  return { entregas, descartadas };
}

export type Acopio = {
  fecha: string;
  ruta: number;
  kgPrimera: number;
  kgSegunda: number;
  kgTotal: number;
  productores: number;
  totalVenta: number;
  veredas: number;
};

/**
 * Agrupa las entregas en ACOPIOS: una fecha y una ruta.
 *
 * Es la unidad que se enlaza con un lote de bodega. La ruta sola no sirve como
 * clave —la misma ruta se recorre cada quincena— y la fecha sola tampoco: el
 * mismo día pueden salir varias rutas.
 */
export function agruparAcopios(entregas: EntregaFila[]): Acopio[] {
  const mapa = new Map<string, Acopio & { cedulas: Set<string>; claves: Set<string> }>();

  for (const e of entregas) {
    const clave = `${e.fecha}|${e.ruta}`;
    const acc =
      mapa.get(clave) ??
      {
        fecha: e.fecha,
        ruta: e.ruta,
        kgPrimera: 0,
        kgSegunda: 0,
        kgTotal: 0,
        productores: 0,
        totalVenta: 0,
        veredas: 0,
        cedulas: new Set<string>(),
        claves: new Set<string>(),
      };
    acc.kgPrimera += e.kgPrimera;
    acc.kgSegunda += e.kgSegunda;
    acc.totalVenta += e.totalVenta;
    // Por cédula y no por nombre: el mismo productor escrito de dos maneras
    // contaría doble, y «cuántos productores hay detrás de este lote» es de
    // las primeras cosas que alguien va a citar.
    if (e.cedula) acc.cedulas.add(e.cedula);
    if (e.veredaClave) acc.claves.add(e.veredaClave);
    mapa.set(clave, acc);
  }

  return [...mapa.values()]
    .map(({ cedulas, claves, ...a }) => ({
      ...a,
      kgPrimera: Math.round(a.kgPrimera * 100) / 100,
      kgSegunda: Math.round(a.kgSegunda * 100) / 100,
      kgTotal: Math.round((a.kgPrimera + a.kgSegunda) * 100) / 100,
      productores: cedulas.size,
      veredas: claves.size,
      totalVenta: Math.round(a.totalVenta),
    }))
    .sort((a, b) => (a.fecha === b.fecha ? a.ruta - b.ruta : b.fecha.localeCompare(a.fecha)));
}
