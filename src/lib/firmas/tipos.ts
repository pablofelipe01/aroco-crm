/**
 * Catálogos de la firma electrónica, sin dependencias: los usan el CRM, la
 * página pública de firma y el sellado del PDF.
 */

export const TIPOS_SOBRE = [
  "compraventa_internacional",
  "compraventa_nacional",
  "suministro",
  "laboral",
  "otrosi",
  "confidencialidad",
  "representacion",
  "otro",
] as const;
export type TipoSobre = (typeof TIPOS_SOBRE)[number];

export const NOMBRE_TIPO: Record<TipoSobre, { es: string; en: string }> = {
  compraventa_internacional: { es: "Compraventa internacional", en: "International sale" },
  compraventa_nacional: { es: "Compraventa nacional", en: "Domestic sale" },
  suministro: { es: "Acuerdo de suministro", en: "Supply agreement" },
  laboral: { es: "Contrato laboral", en: "Employment contract" },
  otrosi: { es: "Otrosí", en: "Amendment" },
  confidencialidad: { es: "Acuerdo de confidencialidad", en: "Non-disclosure agreement" },
  representacion: { es: "Acuerdo de representación", en: "Representation agreement" },
  otro: { es: "Otro", en: "Other" },
};

export type EstadoSobre = "borrador" | "enviado" | "completado" | "anulado";
export type EstadoFirmante = "pendiente" | "notificado" | "firmado" | "rechazado";
export type IdiomaFirma = "es" | "en";

/** Días que vive un sobre enviado antes de vencer. */
export const DIAS_VIGENCIA = 30;
/** Minutos que vale un código de un solo uso. */
export const MINUTOS_CODIGO = 10;
/** Intentos fallidos antes de que haya que pedir otro código. */
export const INTENTOS_CODIGO = 5;
/** Segundos mínimos entre dos envíos de código. */
export const ESPERA_REENVIO_S = 60;
/** Códigos por hora por firmante. */
export const CODIGOS_POR_HORA = 5;
/** Minutos que vale la verificación de identidad para firmar. */
export const MINUTOS_VERIFICACION = 30;

/**
 * Quiénes firman ya y quiénes después. En orden, solo el grupo con el `orden`
 * más bajo que aún no termina; en paralelo, todos los que no han firmado.
 */
export function turnoActual<T extends { orden: number; estado: EstadoFirmante | string }>(
  firmantes: T[],
  enOrden: boolean,
): T[] {
  const pendientes = firmantes.filter((f) => f.estado === "pendiente" || f.estado === "notificado");
  if (!enOrden) return pendientes;
  if (!pendientes.length) return [];
  const min = Math.min(...pendientes.map((f) => f.orden));
  return pendientes.filter((f) => f.orden === min);
}

/** «an***@dominio.com»: quien firma reconoce su correo sin que la página lo exponga entero. */
export function enmascararCorreo(email: string): string {
  const [u, d] = email.split("@");
  if (!u || !d) return email;
  const visible = u.length <= 2 ? u.slice(0, 1) : u.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(3, u.length - visible.length))}@${d}`;
}

/** Resumen legible del navegador para el certificado («Chrome en Android»). */
export function resumirAgente(ua: string | null | undefined): string {
  if (!ua) return "—";
  const so = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "otro sistema";
  const nav = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /CriOS|Chrome\//.test(ua)
          ? "Chrome"
          : /FxiOS|Firefox\//.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : "navegador";
  return `${nav} · ${so}`;
}

/** Nombre de cada evento del registro, para el CRM. */
export const NOMBRE_EVENTO: Record<string, string> = {
  creado: "Sobre creado",
  enviado: "Sobre enviado",
  notificado: "Enlace enviado por correo",
  notificacion_fallida: "Falló el correo con el enlace",
  enlace_regenerado: "Enlace nuevo enviado",
  enlace_abierto: "Abrió el enlace",
  documento_abierto: "Abrió el documento",
  codigo_enviado: "Código enviado",
  codigo_no_enviado: "Falló el envío del código",
  codigo_fallido: "Código incorrecto",
  codigo_verificado: "Identidad verificada",
  firmado: "Firmó",
  rechazado: "Rechazó",
  anulado: "Sobre anulado",
  cierre_fallido: "Falló el sellado del PDF",
  completado: "Firmado por todos · PDF sellado",
  copia_enviada: "Copia firmada enviada",
  copia_fallida: "Falló el envío de la copia",
  copia_descargada: "Descargó la copia firmada",
};

export const NOMBRE_ESTADO_SOBRE: Record<EstadoSobre, string> = {
  borrador: "Borrador",
  enviado: "En firma",
  completado: "Firmado",
  anulado: "Anulado",
};

export const NOMBRE_ESTADO_FIRMANTE: Record<EstadoFirmante, string> = {
  pendiente: "En espera",
  notificado: "Por firmar",
  firmado: "Firmó",
  rechazado: "Rechazó",
};

/** Áreas que crean sobres (Dirección entra por ser admin). Espeja la RLS de 0111. */
export const AREAS_FIRMAS = ["Comercial", "Administrativo", "Financiero"] as const;

// ── Documento de identidad ──────────────────────────────────────────────────
// Nicolás (2026-11-17) pidió elegir el tipo de un menú en vez de escribir
// «cédula / NIT» a mano. Se guarda como un solo texto («C.C. 1.234.567»): así
// el certificado y el registro de eventos no cambian, y `partirDocumento` lo
// vuelve a separar para editarlo.

export const TIPOS_DOCUMENTO = ["CC", "NIT", "CE", "PAS", "PPT", "TAX"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const NOMBRE_DOCUMENTO: Record<TipoDocumento, { es: string; en: string }> = {
  CC: { es: "Cédula de ciudadanía (C.C.)", en: "Colombian ID card (C.C.)" },
  NIT: { es: "NIT", en: "Colombian tax ID (NIT)" },
  CE: { es: "Cédula de extranjería (C.E.)", en: "Colombian foreigner ID (C.E.)" },
  PAS: { es: "Pasaporte", en: "Passport" },
  PPT: { es: "Permiso por Protección Temporal (PPT)", en: "Temporary Protection Permit (PPT)" },
  TAX: { es: "Identificación tributaria extranjera", en: "Foreign tax ID" },
};

/** Lo que va delante del número en el texto guardado. */
const PREFIJO: Record<TipoDocumento, { es: string; en: string }> = {
  CC: { es: "C.C.", en: "C.C." },
  NIT: { es: "NIT", en: "NIT" },
  CE: { es: "C.E.", en: "C.E." },
  PAS: { es: "Pasaporte", en: "Passport" },
  PPT: { es: "PPT", en: "PPT" },
  TAX: { es: "Tax ID", en: "Tax ID" },
};

/** «C.C. 1.234.567». Sin número no hay documento: cadena vacía. */
export function unirDocumento(tipo: TipoDocumento, numero: string, idioma: IdiomaFirma = "es"): string {
  const n = numero.trim().replace(/\s+/g, " ");
  return n ? `${PREFIJO[tipo][idioma]} ${n}` : "";
}

/**
 * El inverso de `unirDocumento`. Un texto viejo, escrito a mano antes del
 * menú, se reconoce si empieza por un prefijo conocido; si no, queda entero
 * como número de una cédula, que es lo más común.
 */
export function partirDocumento(texto: string | null | undefined): { tipo: TipoDocumento; numero: string } {
  const t = (texto ?? "").trim();
  // El orden importa: «cédula de extranjería» antes que «cédula».
  const fin = String.raw`(?=[\s\d:#.-]|$)[\s:#.-]*`;
  const reglas: [TipoDocumento, string][] = [
    ["CE", String.raw`c\.?\s?e\.?|c[eé]dula de extranjer[ií]a`],
    ["CC", String.raw`c\.?\s?c\.?|c[eé]dula(?: de ciudadan[ií]a)?`],
    ["NIT", "nit"],
    ["PAS", "pasaporte|passport"],
    ["PPT", "ppt"],
    ["TAX", String.raw`tax\s?id`],
  ];
  for (const [tipo, re] of reglas) {
    const m = t.match(new RegExp(`^(?:${re})${fin}`, "i"));
    if (m) return { tipo, numero: t.slice(m[0].length).trim() };
  }
  return { tipo: "CC", numero: t };
}

// ── Dónde va la firma en el documento ───────────────────────────────────────
// Nicolás (2026-11-17): la firma quedaba solo en el certificado del final y no
// en la línea de firma. Quien crea el sobre la ubica sobre el PDF. Todo en
// fracciones de la página (0–1, origen arriba a la izquierda, como se ve en
// pantalla), para no depender del tamaño al que se dibujó.

export type PosicionFirma = { pagina: number; x: number; y: number; w: number; h: number };

/** Tamaño por defecto del recuadro: ancho de una línea de firma típica. */
export const RECUADRO_FIRMA = { w: 0.3, h: 0.07 };

export function posicionValida(p: unknown, paginas: number): p is PosicionFirma {
  if (!p || typeof p !== "object") return false;
  const { pagina, x, y, w, h } = p as Record<string, unknown>;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  return (
    Number.isInteger(pagina) &&
    (pagina as number) >= 1 &&
    (pagina as number) <= paginas &&
    [x, y, w, h].every(num) &&
    (w as number) > 0.02 &&
    (h as number) > 0.01 &&
    (x as number) >= 0 &&
    (y as number) >= 0 &&
    (x as number) + (w as number) <= 1.0001 &&
    (y as number) + (h as number) <= 1.0001
  );
}
