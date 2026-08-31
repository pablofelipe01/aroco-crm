import {
  ShoppingCart,
  TrendingUp,
  HelpCircle,
  Store,
  CandlestickChart,
  LayoutDashboard,
  Users,
  Calculator,
  Boxes,
  Truck,
  Percent,
  LineChart,
  ListChecks,
  ClipboardList,
  Settings,
  type LucideIcon,
} from "lucide-react";

// La lista canónica vive en `@/lib/departments` (módulo sin dependencias); se
// reexporta aquí para no romper a quien ya la importaba desde nav.
export { DEPARTMENTS, type Department } from "@/lib/departments";
import type { Department } from "@/lib/departments";
import type { UserRole } from "@/lib/types/database";
import type { Diccionario } from "@/lib/i18n/es";

export interface NavItem {
  href: string;
  /**
   * Nombre en español. Sigue siendo el rótulo real en la vista en español y el
   * respaldo en cualquier sitio que aún no pase por el diccionario.
   */
  label: string;
  /**
   * Clave de `diccionario.nav`. Al estar tipada contra el diccionario, agregar
   * un módulo al menú sin traducirlo no compila — que es la única forma de que
   * no se cuele una pestaña en español dentro de la vista en inglés.
   */
  llave: keyof Diccionario["nav"];
  icon: LucideIcon;
  /** Departments allowed to see this module. `admin` (Dirección) sees all. */
  departments: Department[] | "all";
  /**
   * Permiso por persona que GANA sobre el rol. Un módulo con permiso no se le
   * muestra a un SuperAdmin por serlo: hay información —posiciones de broker,
   * márgenes, P&L— que no se hereda del cargo, y dar acceso de administrador no
   * puede meter a alguien de rebote ahí.
   */
  permiso?: "ve_mercado";
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    llave: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    departments: "all",
  },
  {
    href: "/comercial",
    llave: "comercial",
    label: "Comercial",
    icon: Users,
    departments: ["Dirección", "Comercial", "Administrativo"],
  },
  {
    href: "/cotizaciones",
    llave: "cotizaciones",
    label: "Cotizaciones",
    icon: Calculator,
    departments: ["Dirección", "Comercial", "Financiero"],
  },
  {
    href: "/inventario",
    llave: "inventario",
    label: "Inventario",
    icon: Boxes,
    departments: ["Dirección", "Bodega Central", "Administrativo", "Operaciones"],
  },
  // "Inventario calidad" (/inventario-calidad) se retiró del menú el 2026-07-29.
  // Era la segunda pestaña de la misma hoja y quedó duplicando a Inventario, que
  // desde 0041 ya trae clasificación, cadmio y valor de compra por lote. Peor:
  // mostraba 12.198 kg en bodega contra los 2.500 kg reales, porque la hoja no
  // descargó la fila DELEITE (9.698 kg ya despachados a Casa Luker el 21-jul).
  // Lo único exclusivo que aportaba era la ubicación (licor / por llegar /
  // Tolimax): 60,8 kg en dos filas.
  // La ruta, la tabla y el sync diario siguen vivos — para reponerlo basta con
  // devolver esta entrada al menú.
  {
    href: "/proveedores",
    llave: "proveedoresInsumos",
    label: "Proveedores Insumos",
    icon: Store,
    departments: ["Dirección", "Financiero", "Administrativo"],
  },
  {
    href: "/compras",
    llave: "compras",
    label: "Compras",
    icon: ShoppingCart,
    // Cualquiera puede pedir insumos; aprobar es otra cosa y lo decide
    // `profiles.aprueba_compras`, no el área.
    departments: "all",
  },
  {
    href: "/despachos",
    llave: "despachos",
    label: "Despachos",
    icon: Truck,
    departments: ["Dirección", "Bodega Central", "Comercial", "Operaciones"],
  },
  {
    href: "/mercado",
    llave: "mercado",
    label: "Mercado",
    icon: CandlestickChart,
    departments: "all",
    permiso: "ve_mercado",
  },
  {
    href: "/preguntas",
    llave: "preguntas",
    label: "Preguntas",
    icon: HelpCircle,
    departments: "all",
  },
  {
    href: "/ventas",
    llave: "ventas",
    label: "Ventas",
    icon: TrendingUp,
    departments: ["Dirección", "Comercial", "Financiero"],
  },
  {
    href: "/comisiones",
    llave: "comisiones",
    label: "Comisiones",
    icon: Percent,
    departments: ["Dirección", "Financiero", "Comercial"],
  },
  {
    href: "/precios",
    llave: "precios",
    label: "Precios",
    icon: LineChart,
    departments: ["Dirección", "Financiero", "Comercial"],
  },
  {
    href: "/tareas",
    llave: "tareas",
    label: "Tareas",
    icon: ListChecks,
    departments: "all",
  },
  {
    href: "/actas",
    llave: "actas",
    label: "Actas",
    icon: ClipboardList,
    departments: "all",
  },
  {
    href: "/equipo",
    llave: "equipo",
    label: "Equipo",
    icon: Settings,
    departments: ["Dirección"],
  },
];

/** Filter modules a department can access. */
/**
 * Los módulos que le tocan a una persona.
 *
 * El rol manda sobre el área: un SuperAdmin ve todo, sin importar dónde esté
 * en el organigrama. Antes esto filtraba solo por área, y como casi todos los
 * módulos listan «Dirección», el efecto era que los admin de Dirección veían
 * todo y los de otras áreas no — Nicolás es SuperAdmin y Comercial, y le
 * faltaban pestañas que sí tenía permiso de abrir. El menú decía una cosa y la
 * base otra.
 */
export type Permisos = { ve_mercado?: boolean | null };

export function navForUser(
  department: Department | null,
  role?: UserRole | null,
  permisos?: Permisos | null,
): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    // El permiso se evalúa ANTES del rol: si no lo tiene, no lo ve, aunque sea
    // SuperAdmin. Al revés —comprobar el rol primero— haría que `admin` viera
    // todo y el permiso no serviría para nada.
    if (item.permiso) return Boolean(permisos?.[item.permiso]);
    if (role === "admin") return true;
    return (
      item.departments === "all" ||
      (department !== null && item.departments.includes(department))
    );
  });
}
