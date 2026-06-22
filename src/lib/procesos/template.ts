/**
 * Plantilla del proceso "Flujo de Selección, Vinculación, Compra, Recepción y
 * Pago a Proveedores de Cacao" (5 fases). Es la FUENTE DE VERDAD de la
 * estructura; cada caso clona la parte que le corresponde según su tipo.
 *
 * Arquitectura preparada para multi-proceso: agrega nuevas plantillas con su
 * propia `key` y `aplica` sin tocar el resto del módulo.
 */
import type { ProcesoPlantilla } from "./types";

export const PROCESO_CACAO: ProcesoPlantilla = {
  key: "cacao",
  nombre: "Proveedores de Cacao",
  aplica: {
    proveedor: [1, 5],
    orden_compra: [2, 3, 4],
  },
  fases: [
    // ── FASE 1 — Gestión de Proveedores (tipo proveedor) ───────────────────
    {
      numero: 1,
      nombre: "Gestión de Proveedores de Cacao",
      pasos: [
        { numero: "1", titulo: "Elaboración de Estrategia, Plan de Compras y Presupuesto", rol: "Gerente Comercial, Asesor Comercial y Gerencia Administrativa" },
        { numero: "2", titulo: "Identificación, Búsqueda, Selección y Notificación a Productores", rol: "Asesor Comercial" },
        { numero: "3", titulo: 'Revisión Documental y Creación en Estado "En Estudio"', rol: "Asesor Comercial" },
        { numero: "4", titulo: "Verificación de Expediente, Validación Legal-Financiera y Generación de Contrato Predefinido", rol: "Gerente Administrativo" },
        { numero: "5", titulo: "Revisión, Aprobación de Contrato en la App y Envío al Productor", rol: "Gerente Comercial y Asesor Comercial" },
        { numero: "6A", titulo: "Registro de Novedades en la Aplicación y Emisión de Nueva Versión Contractual", rol: "Gerente Administrativo y Asesor Comercial", esRama: true },
        { numero: "6B", titulo: "Recepción de Contrato Firmado, Carga en la Aplicación y Envío a Gerencia", rol: "Asesor Comercial", esRama: true },
        { numero: "7", titulo: "Firma Digital del Contrato, Carga de Documento Final y Activación del Proveedor", rol: "Gerente General" },
      ],
      decisiones: [
        {
          clave: "f1_ajustes",
          pregunta: "¿El proveedor seleccionado solicita ajustes o revisiones al contrato?",
          rol: "Asesor Comercial y Proveedor",
          opciones: [
            { id: "si", etiqueta: "Sí, solicita ajustes", activaPasos: ["6A"] },
            { id: "no", etiqueta: "No, lo acepta", activaPasos: ["6B"] },
          ],
        },
      ],
    },
    // ── FASE 2 — Gestión de Compra (tipo orden_compra) ─────────────────────
    {
      numero: 2,
      nombre: "Gestión de Compra de Cacao",
      pasos: [
        { numero: "1", titulo: "Análisis de Presupuesto Mensual de Compras y Definición de Topes Máximos", rol: "Gerente Comercial y Gerente Administrativo" },
        { numero: "2", titulo: 'Validación de Volúmenes, Precios, Fechas y Creación de OC Interna en Estado "Borrador"', rol: "Asesor o Director Comercial" },
        { numero: "3A", titulo: "Aprobación Automática en el Aplicativo sin necesidad de firmas manuales", rol: "Sistema AROCO", esAutomatico: true, esRama: true },
        { numero: "3B", titulo: "Revisión y Aprobación de la OC Directamente en el Aplicativo", rol: "Gerente Comercial y Gerente Administrativo", esRama: true },
        { numero: "3C", titulo: "Revisión Conjunta de Razones, Ajuste de Parámetros de la OC y Reenvío", rol: "Asesor Comercial y Gerencias", esRama: true },
        { numero: "4", titulo: 'Cambio de la Orden a Estado "Aprobada" y Asignación Automática de Consecutivo', rol: "Sistema AROCO", esAutomatico: true },
        { numero: "5", titulo: "Emisión de OC en Firme al Proveedor y Envío de Alerta de Logística a todo el Equipo", rol: "Asesor o Director Comercial" },
      ],
      decisiones: [
        {
          clave: "f2_tipo_oc",
          pregunta: "¿Qué tipo de Orden de Compra es según el Proveedor seleccionado?",
          rol: "Sistema / Automatización",
          opciones: [
            { id: "roc", etiqueta: "Caso 1 — Programa ROC o Finca", activaPasos: ["3A"] },
            { id: "otros_sin", etiqueta: "Caso 2 — Otros Proveedores SIN novedades", activaPasos: ["3B"] },
            { id: "otros_con", etiqueta: "Caso 3 — Otros Proveedores CON novedades", activaPasos: ["3C"] },
          ],
        },
      ],
    },
    // ── FASE 3 — Recepción en Bodega (tipo orden_compra) ───────────────────
    {
      numero: 3,
      nombre: "Recepción de Órdenes de Compra en Bodega",
      pasos: [
        { numero: "1", titulo: "Alistamiento de Bodega e Identificación del Tipo de Envío (Cauca, Finca u Otros)", rol: "Gerente de Operaciones y Jefe de Bodega" },
        { numero: "2", titulo: "Recepción Física de la Carga en Bodega y Registro Fotográfico Obligatorio de Bultos y Camión", rol: "Jefe de Bodega" },
        { numero: "3", titulo: "Pesaje Físico de las Entregas y Confrontación de Peso Real Recibido vs Peso Solicitado", rol: "Jefe de Bodega" },
        { numero: "4", titulo: "Evaluación de Calidad Física: Humedad, Fermentación, Impurezas y Análisis Sensorial", rol: "Jefe de Bodega" },
        { numero: "5", titulo: "Cierre de Reporte de Calidad en la App con Carga de Fotos del Corte y Remisiones de Entrada", rol: "Jefe de Bodega" },
      ],
      decisiones: [],
    },
    // ── FASE 4 — Procesos de Pago Diferenciados (tipo orden_compra) ────────
    {
      numero: 4,
      nombre: "Procesos de Pago Diferenciados",
      pasos: [
        // Rama A — Programa ROC (dispersión masiva)
        { numero: "1A", titulo: "Descarga de Listado de Productores Anexo a la OC y Ajuste a Formato Bancario", rol: "Coordinadora de Compras", esRama: true },
        { numero: "2A", titulo: "Envío de Archivo Masivo de Dispersión Listo para Revisión Técnica", rol: "Coordinadora de Compras", esRama: true },
        { numero: "3A", titulo: "Validación del Archivo de Pago Masivo y Alerta de Autorización", rol: "Gerente Administrativo", esRama: true },
        { numero: "4A", titulo: "Ejecución y Dispersión del Pago en el Banco dentro de las 24 horas siguientes", rol: "Gerente General", esRama: true },
        { numero: "5A", titulo: "Descarga de Soportes, Archivo en Drive y Notificación de Pagos o Novedades al ROC", rol: "Coordinadora de Compras y Asesor", esRama: true },
        // Rama B — Pago General
        { numero: "1B", titulo: "Confrontación del Reporte de Calidad vs Sanciones, Bonificaciones Contractuales y Saldos", rol: "Coordinadora de Compras", esRama: true },
        { numero: "2B", titulo: 'Generación de Reporte Financiero en Estado "Liquidado - Por Revisión"', rol: "Coordinadora de Compras", esRama: true },
        { numero: "3B", titulo: "Ajuste de Parámetros de Liquidación y Recálculo de Valores Financieros en la App", rol: "Coordinadora de Compras", esRama: true },
        { numero: "4B", titulo: 'Cambio de la Orden a Estado "Liquidado - Aprobado" (inmodificable) y Envío para Facturar', rol: "Asesor Comercial", esRama: true },
        { numero: "5B", titulo: "Recepción de Factura Electrónica en el Correo Institucional y Programación de Fechas", rol: "Coordinadora de Compras", esRama: true },
        { numero: "6B", titulo: "Carga de la Obligación Financiera en la Plataforma Bancaria Corporativa al Vencimiento", rol: "Coordinadora de Compras", esRama: true },
        { numero: "7B", titulo: "Validación Técnica y Verificación de Soportes del Pago Cargado en el Banco", rol: "Gerente Administrativo", esRama: true },
        { numero: "8B", titulo: "Autorización de Transferencia y Dispersión de Fondos Final en la Plataforma del Banco", rol: "Gerente General", esRama: true },
        { numero: "9B", titulo: "Descarga de Soportes Bancarios, Alerta al Equipo y Carga de Archivos en Google Drive", rol: "Coordinadora de Compras", esRama: true },
      ],
      decisiones: [
        {
          clave: "f4_origen",
          pregunta: "¿De qué procedencia u origen es la Orden de Compra cerrada en bodega?",
          rol: "Coordinadora de Compras",
          opciones: [
            { id: "roc", etiqueta: "Caso 1 — Programa ROC (pago masivo / dispersión)", activaPasos: ["1A", "2A", "3A", "4A", "5A"] },
            { id: "general", etiqueta: "Caso 2 — Pago General (NO Programa ROC)", activaPasos: ["1B", "2B", "5B", "6B", "7B", "8B", "9B"] },
          ],
        },
        {
          clave: "f4_liquidacion",
          pregunta: "¿El Reporte de Liquidación de la OC es aprobado? (solo Pago General)",
          rol: "Gerente Comercial, Gerente Administrativo y Asesor",
          opciones: [
            { id: "no", etiqueta: "No → ajustar y recalcular (vuelve a preguntar)", activaPasos: ["3B"] },
            { id: "si", etiqueta: "Sí → liquidado aprobado", activaPasos: ["4B"] },
          ],
        },
      ],
    },
    // ── FASE 5 — Mejora Continua (recurrente, tipo proveedor) ──────────────
    {
      numero: 5,
      nombre: "Mejora Continua",
      recurrente: true,
      pasos: [
        { numero: "1", titulo: "Seguimiento Bimensual de Proveedores y Metas de Tiempo o Calidad", rol: "Gerencias y Dirección Comercial" },
      ],
      decisiones: [],
    },
  ],
};

export const PROCESOS: Record<string, ProcesoPlantilla> = {
  cacao: PROCESO_CACAO,
};

// ── Mapeo rol-del-flujo → persona por defecto (editable en la UI) ───────────

interface DefaultRol {
  nombre: string; // nombre EXACTO en team_members
  porConfirmar?: boolean;
}

/**
 * Resuelve la persona por defecto para el rol (string compuesto) de un paso.
 * Escanea por palabras clave en orden de prioridad. `null` = sin persona
 * (paso automático / Sistema AROCO). `porConfirmar` lo marca la UI en ámbar.
 */
export function defaultRolPersona(rol: string): DefaultRol | null {
  const r = rol.toLowerCase();
  if (r.includes("sistema")) return null; // automático
  if (r.includes("gerente general")) return { nombre: "Álvaro Acosta" };
  if (r.includes("operaciones")) return { nombre: "Ángela María Acosta" };
  if (r.includes("bodega")) return { nombre: "Fernando Mejía Paz" };
  if (r.includes("coordinadora")) return { nombre: "Milena Soto", porConfirmar: true };
  if (r.includes("administrativ") || r.includes("gerencia administrativa"))
    return { nombre: "Luis Ernesto Barrios", porConfirmar: true };
  if (r.includes("calidad") || r.includes("sensorial"))
    return { nombre: "John Saenz", porConfirmar: true };
  if (r.includes("gerente comercial"))
    return { nombre: "John Muñoz", porConfirmar: true };
  if (r.includes("comercial") || r.includes("asesor") || r.includes("director"))
    return { nombre: "John Muñoz" };
  return null;
}
