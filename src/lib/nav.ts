import {
  LayoutDashboard,
  Users,
  Calculator,
  Boxes,
  Layers,
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

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Departments allowed to see this module. `admin` (Dirección) sees all. */
  departments: Department[] | "all";
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    departments: "all",
  },
  {
    href: "/comercial",
    label: "Comercial",
    icon: Users,
    departments: ["Dirección", "Comercial", "Administrativo"],
  },
  {
    href: "/cotizaciones",
    label: "Cotizaciones",
    icon: Calculator,
    departments: ["Dirección", "Comercial", "Financiero"],
  },
  {
    href: "/inventario",
    label: "Inventario",
    icon: Boxes,
    departments: ["Dirección", "Bodega Central", "Administrativo", "Operaciones"],
  },
  {
    href: "/inventario-calidad",
    label: "Inventario calidad",
    icon: Layers,
    departments: ["Dirección", "Bodega Central", "Administrativo", "Operaciones"],
  },
  {
    href: "/despachos",
    label: "Despachos",
    icon: Truck,
    departments: ["Dirección", "Bodega Central", "Comercial", "Operaciones"],
  },
  {
    href: "/comisiones",
    label: "Comisiones",
    icon: Percent,
    departments: ["Dirección", "Financiero", "Comercial"],
  },
  {
    href: "/precios",
    label: "Precios",
    icon: LineChart,
    departments: ["Dirección", "Financiero", "Comercial"],
  },
  {
    href: "/tareas",
    label: "Tareas",
    icon: ListChecks,
    departments: "all",
  },
  {
    href: "/actas",
    label: "Actas",
    icon: ClipboardList,
    departments: "all",
  },
  {
    href: "/equipo",
    label: "Equipo",
    icon: Settings,
    departments: ["Dirección"],
  },
];

/** Filter modules a department can access. */
export function navForDepartment(department: Department | null): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      item.departments === "all" ||
      (department && item.departments.includes(department)),
  );
}
