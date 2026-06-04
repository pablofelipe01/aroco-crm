import {
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

/** AROCO departments (matches the Postgres `department` enum). */
export const DEPARTMENTS = [
  "Dirección",
  "Comercial",
  "Financiero",
  "Administrativo",
  "Bodega Central",
  "Finca",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

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
    departments: ["Dirección", "Bodega Central", "Administrativo"],
  },
  {
    href: "/despachos",
    label: "Despachos",
    icon: Truck,
    departments: ["Dirección", "Bodega Central", "Comercial"],
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
