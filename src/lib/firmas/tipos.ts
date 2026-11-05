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
