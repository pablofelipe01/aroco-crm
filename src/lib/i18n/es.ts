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

  dashboard: {
    saludo: "Hola",
    equipo: "equipo",
    descripcion: "Resumen general de la operación comercial de AROCO.",
    enVivo: "En vivo",
    leadsPipeline: "Leads en pipeline",
    activos: "activos",
    disponibleBodega: "Disponible en bodega",
    lotes: "lotes",
    despachosRegistrados: "Despachos registrados",
    kgDespachados: "Kg despachados",
    referencias: "Referencias de mercado",
    trmOficial: "TRM oficial",
    spot: "USD/COP spot",
    cacaoIce: "Cacao ICE",
    cacaoNacional: "Cacao nacional (COP/kg)",
    sinPrecios: "Sin precios cargados.",
    fuentes: "TRM: Banco de la República · Spot y Cacao ICE: Yahoo Finance.",
    proximasTareas: "Próximas tareas",
    proximas: "Próximas",
    departamento: "Departamento",
    sinTareas: "No hay tareas pendientes. 🎉",
    verTareas: "Ver todas las tareas →",
    embudo: "Embudo del pipeline",
    leads: "leads",
    valorPonderado: "Valor ponderado del pipeline",
    dePotencial: "potencial",
    sinLeads: "Sin leads aún",
    inventarioProcedencia: "Inventario por procedencia",
    sinInventario: "Sin inventario",
    tendencia: "Tendencia · nacional vs internacional",
    companias: "compañías",
    sinHistorico: "Sin histórico de precios",
  },

  ventas: {
    titulo: "Ventas",
    descripcion: "Volumen y facturación contra la meta anual",
    errorCarga: "No se pudieron cargar las ventas",
    tablaVacia: "La tabla de ventas está vacía",
    tablaVaciaDetalle:
      "Todavía no ha corrido el sync con la hoja de ventas. Hasta entonces esta página no tiene de dónde sacar cifras.",
    vendidoAnio: "Vendido en el año",
    deLaMeta: "de la meta",
    facturado: "Facturado",
    promedio: "promedio",
    sinValores: "Sin valores cargados",
    faltaMeta: "Falta para la meta",
    meta: "Meta",
    proyeccionCierre: "Proyección de cierre",
    alRitmoDe: "Al ritmo de los últimos",
    meses: "meses",
    avance: "Avance",
    alcanzaMeta: "La proyección alcanza la meta",
    quedaCorta: "La proyección queda corta",
    proyRitmoAnual: "Proyección por ritmo del año",
    proyRitmoAnualNota:
      "Lo vendido dividido por los días transcurridos. Castiga si el año arrancó flojo.",
    proyMesesRecientes: "Proyección por meses recientes",
    proyMesesRecientesNota1: "Promedio de los últimos",
    proyMesesRecientesNota2: "meses con ventas, proyectado a fin de año.",
    porMesTitulo: "Vendido por mes y acumulado",
    sinVentasEn: "Sin ventas en",
    porCliente: "Por cliente",
    sinVentas: "Sin ventas",
    nacionalVsExport: "Nacional vs exportación",
    sinMercado: "Sin datos de mercado",
    bonifPrefijo: "De lo facturado,",
    bonifSufijo: "son bonificación por calidad del grano —",
    bonifDelTotal: "del total.",
    sinValorUno: "envío del año suma",
    sinValorVarios: "envíos del año suman",
    sinValorNota:
      "y todavía no tienen valor cargado en la hoja. Cuentan en los kilos pero no en lo facturado, y el precio promedio se calcula solo sobre los kilos que sí tienen precio.",
    millones: "M",
    milesDeMillones: "MM",
  },

  mesesCortos: {
    ene: "Ene", feb: "Feb", mar: "Mar", abr: "Abr", may: "May", jun: "Jun",
    jul: "Jul", ago: "Ago", sep: "Sep", oct: "Oct", nov: "Nov", dic: "Dic",
  },

  grafico: {
    mes: "Mes",
    acumulado: "Acumulado",
    meta: "Meta",
  },

  mercados: {
    Nacional: "Nacional",
    Internacional: "Internacional",
  },

  tiposLead: {
    Comprador: "Comprador",
    "Proveedor potencial": "Proveedor potencial",
    "Comprador/Broker": "Comprador/Broker",
  },

  tiposActividad: {
    Nota: "Nota",
    Llamada: "Llamada",
    Correo: "Correo",
    WhatsApp: "WhatsApp",
    "Reunión": "Reunión",
    "Cambio de estado": "Cambio de estado",
  },

  comercial: {
    titulo: "Comercial",
    leadsPipeline: "leads en el pipeline",
    filtrados: "filtrados",
    nuevoLead: "Nuevo lead",
    buscarPlaceholder: "Buscar empresa, contacto…",
    estado: "Estado",
    mercado: "Mercado",
    responsable: "Responsable",
    kanban: "Kanban",
    lista: "Lista",
    noSePudoMover: "No se pudo mover el lead",

    pipelineProbabilidad: "Pipeline por probabilidad",
    valorEsperado: "Valor esperado:",
    etapa: "Etapa",
    prob: "Prob.",
    leads: "Leads",
    toneladas: "Toneladas",
    valor: "Valor",
    ponderado: "Ponderado",

    empresa: "Empresa",
    contacto: "Contacto",
    pais: "País",
    proximaAccion: "Próxima acción",
    sinLeads: "Sin leads",
    sinCoincidencias: "No hay leads que coincidan con los filtros.",
    probabilidadCierre: "Probabilidad de cierre",

    correo: "Correo",
    telefono: "Teléfono",
    ubicacion: "Ubicación",
    tipo: "Tipo",
    interes: "Interés",
    volumen: "Volumen",
    valorTotal: "Valor total",
    fechaProximaAccion: "Fecha próxima acción",
    noSeGuardo: "No se pudo guardar",
    noSeElimino: "No se pudo eliminar",
    leadEliminado: "Lead eliminado",
    leadActualizado: "Lead actualizado",
    leadCreado: "Lead creado",
    editarLead: "Editar lead",
    guardarCambios: "Guardar cambios",
    crearLead: "Crear lead",
    nombreEmpresa: "Nombre de la empresa",
    nombrePersona: "Nombre de la persona",
    correoInvalido: "Correo inválido.",
    telefonoCorto: "El teléfono es muy corto.",
    sinAsignar: "Sin asignar",
    ciudadRegion: "Ciudad / Región",
    volumenDescriptivo: "Volumen (descriptivo)",
    ejemploVolumen: "p. ej. 25 MT/mes",
    toneladasTm: "Toneladas (TM)",
    ejemplo25: "p. ej. 25",
    valorTotalCop: "Valor total (COP)",
    ejemploValor: "p. ej. 120000000",
    bitacora: "Bitácora",
    sinActividad: "Sin actividad registrada.",
    registrarActividad: "Registrar actividad",
    quePaso: "¿Qué pasó? (llamada, correo, acuerdo…)",
    agregar: "Agregar",
    calcularAuto: "Indica toneladas y mercado para calcularlo automáticamente, o escríbelo a mano.",
    interesProducto: "Interés en producto",
    notas: "Notas",
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

  /**
   * Etiquetas de los estados que en la base están en español.
   *
   * Las claves son el valor exacto que guarda Postgres —«Cotización», con
   * tilde— porque eso es lo que llega del servidor y lo que hay que poder
   * indexar. Traducir el valor en la base no era opción: rompería los enums,
   * las políticas RLS y todo lo ya guardado.
   */
  etapas: {
    Nuevo: "Nuevo",
    "Cotización": "Cotización",
    "Negociación": "Negociación",
    Enviado: "Enviado",
    "En espera": "En espera",
    Cerrado: "Cerrado",
    Descartado: "Descartado",
  },

  tareaEstados: {
    pending: "Pendiente",
    progress: "En progreso",
    done: "Completado",
    blocked: "Bloqueado",
  },

  cotizacionEstados: {
    borrador: "Borrador",
    enviada: "Enviada",
    aceptada: "Aceptada",
    rechazada: "Rechazada",
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
    tm: "TM",
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
