import type { Diccionario } from "./es";

/**
 * English strings.
 *
 * Typed as `Diccionario`, so a key added to `es.ts` and forgotten here breaks
 * the build instead of leaking Spanish into an English screen.
 *
 * Module names stay close to what the team says out loud: the people using the
 * English view still sit in meetings where someone says «Comercial». Where the
 * plain translation would be unrecognisable across that line, the English keeps
 * the shape of the original ("Minutes" for Actas, not "Meeting records").
 */
export const en: Diccionario = {
  nav: {
    dashboard: "Dashboard",
    comercial: "Sales pipeline",
    cotizaciones: "Quotes",
    inventario: "Inventory",
    proveedoresInsumos: "Supply vendors",
    compras: "Purchasing",
    despachos: "Shipments",
    preguntas: "Open questions",
    mercado: "Market",
    ventas: "Sales",
    comisiones: "Commissions",
    precios: "Prices",
    tareas: "Tasks",
    actas: "Minutes",
    equipo: "Team",
  },

  shell: {
    buscar: "Search…",
    notificaciones: "Notifications",
    marcarLeidas: "Mark as read",
    sinNotificaciones: "Nothing pending.",
    asistente: "Assistant",
    salir: "Sign out",
    idioma: "Language",
    espanol: "Español",
    ingles: "English",
    colapsar: "Collapse menu",
    expandir: "Expand menu",
    abrirMenu: "Open menu",
    administrador: "Administrator",
    miembro: "Member",
  },

  paleta: {
    placeholder: "Search or jump to…",
    titulo: "Command palette",
    irA: "Go to",
    navegacion: "Navigation",
    crear: "Create",
    nuevoLead: "New lead",
    nuevaCotizacion: "New quote",
    nuevaTarea: "New task",
    sinResultados: "No results for",
    resultados: "Results",
  },

  comun: {
    cargando: "Loading…",
    guardar: "Save",
    cancelar: "Cancel",
    cerrar: "Close",
    eliminar: "Delete",
    editar: "Edit",
    crear: "Create",
    buscar: "Search",
    filtrar: "Filter",
    limpiar: "Clear",
    confirmar: "Confirm",
    aprobar: "Approve",
    rechazar: "Reject",
    ver: "View",
    descargar: "Download",
    sinDatos: "No data",
    sinResultados: "No results found",
    error: "Something went wrong",
    reintentar: "Try again",
    de: "of",
    total: "Total",
    fecha: "Date",
    estado: "Status",
    acciones: "Actions",
    opcional: "optional",
    obligatorio: "required",
  },

  estados: {
    pendiente: "Pending",
    aprobada: "Approved",
    rechazada: "Rejected",
    pagada: "Paid",
    activo: "Active",
    inactivo: "Inactive",
    borrador: "Draft",
  },

  unidades: {
    kg: "kg",
    toneladas: "t",
    porKilo: "/kg",
    porTonelada: "/t",
  },
};
