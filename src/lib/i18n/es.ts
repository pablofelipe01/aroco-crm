/**
 * Textos en español — la fuente de verdad.
 *
 * `en.ts` está tipado contra este objeto, así que si alguien agrega una clave
 * aquí y olvida traducirla, la compilación falla. Es a propósito: una
 * traducción que se olvida no se nota hasta que alguien ve media pantalla en
 * otro idioma, y para entonces ya está en producción.
 *
 * Las claves se agrupan por dónde aparecen, no por palabra. Un mismo término
 * puede traducirse distinto según el contexto —«estado» es *status* en una
 * tarea y *state* en un departamento— y compartir clave obliga a elegir mal en
 * uno de los dos sitios.
 */
export const es = {
  nav: {
    dashboard: "Dashboard",
    comercial: "Comercial",
    cotizaciones: "Cotizaciones",
    inventario: "Inventario",
    proveedoresInsumos: "Proveedores Insumos",
    compras: "Compras",
    despachos: "Despachos",
    preguntas: "Preguntas",
    mercado: "Mercado",
    ventas: "Ventas",
    comisiones: "Comisiones",
    precios: "Precios",
    tareas: "Tareas",
    actas: "Actas",
    equipo: "Equipo",
  },

  shell: {
    buscar: "Buscar…",
    notificaciones: "Notificaciones",
    marcarLeidas: "Marcar leídas",
    sinNotificaciones: "Sin notificaciones pendientes.",
    asistente: "Asistente",
    salir: "Cerrar sesión",
    idioma: "Idioma",
    espanol: "Español",
    ingles: "English",
    colapsar: "Colapsar menú",
    expandir: "Expandir menú",
    abrirMenu: "Abrir menú",
    administrador: "Administrador",
    miembro: "Miembro",
  },

  paleta: {
    placeholder: "Buscar o saltar a…",
    titulo: "Paleta de comandos",
    irA: "Ir a",
    navegacion: "Navegación",
    crear: "Crear",
    nuevoLead: "Nuevo lead",
    nuevaCotizacion: "Nueva cotización",
    nuevaTarea: "Nueva tarea",
    sinResultados: "Sin resultados para",
    resultados: "Resultados",
  },

  comun: {
    cargando: "Cargando…",
    guardar: "Guardar",
    cancelar: "Cancelar",
    cerrar: "Cerrar",
    eliminar: "Eliminar",
    editar: "Editar",
    crear: "Crear",
    buscar: "Buscar",
    filtrar: "Filtrar",
    limpiar: "Limpiar",
    confirmar: "Confirmar",
    aprobar: "Aprobar",
    rechazar: "Rechazar",
    ver: "Ver",
    descargar: "Descargar",
    sinDatos: "Sin datos",
    sinResultados: "No se encontraron resultados",
    error: "Algo salió mal",
    reintentar: "Reintentar",
    de: "de",
    total: "Total",
    fecha: "Fecha",
    estado: "Estado",
    acciones: "Acciones",
    opcional: "opcional",
    obligatorio: "obligatorio",
  },

  estados: {
    pendiente: "Pendiente",
    aprobada: "Aprobada",
    rechazada: "Rechazada",
    pagada: "Pagada",
    activo: "Activo",
    inactivo: "Inactivo",
    borrador: "Borrador",
  },

  unidades: {
    kg: "kg",
    toneladas: "t",
    porKilo: "/kg",
    porTonelada: "/t",
  },
} as const;

/**
 * La forma del diccionario: las mismas secciones y las mismas claves, con los
 * valores ensanchados a `string`.
 *
 * El `as const` de arriba fija cada texto como su propio tipo literal —
 * `"Inventario"`, no `string`— y sin ensancharlos `en.ts` no podría escribir
 * «Inventory» en esa clave: TypeScript exigiría la palabra en español. Lo que
 * se quiere heredar es la estructura, no el contenido.
 */
export type Diccionario = {
  [Seccion in keyof typeof es]: {
    [Clave in keyof (typeof es)[Seccion]]: string;
  };
};
