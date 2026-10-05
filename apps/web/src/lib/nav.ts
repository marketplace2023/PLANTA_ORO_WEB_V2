import {
  BookOpen,
  Briefcase,
  Building2,
  Cog,
  FileText,
  Globe,
  LayoutDashboard,
  Network,
  Package,
  Store,
  Warehouse,
  Wrench,
  Calculator,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  label: string
  icon: LucideIcon
  /** `global`: ruta fija. `plant`: depende de la planta seleccionada (/plants/:slug/<segment>). */
  scope: 'global' | 'plant'
  path: string
  /** Solo `plant`: destino cuando no hay planta elegida (en vez de pedir elegir una). */
  globalPath?: string
}

// Nombres fijos: no renombrar por pantalla (docs/design.md §56).
export const NAV_ITEMS: NavItem[] = [
  { label: 'Todo el ecosistema', icon: Globe, scope: 'global', path: '/' },
  { label: 'Catálogo', icon: BookOpen, scope: 'global', path: '/catalog' },
  { label: 'Activos Físicos', icon: Package, scope: 'plant', path: 'assets' },
  { label: 'Procesos', icon: Cog, scope: 'plant', path: 'processes' },
  { label: 'Marketplace', icon: Store, scope: 'global', path: '/marketplace' },
  { label: 'Proveedores', icon: Building2, scope: 'global', path: '/providers' },
  { label: 'Servicios Profesionales', icon: Briefcase, scope: 'global', path: '/professionals' },
  { label: 'Cursos (LMS)', icon: BookOpen, scope: 'global', path: '/courses' },
  { label: 'Redes Transversales', icon: Network, scope: 'plant', path: 'networks' },
  { label: 'Mantenimiento', icon: Wrench, scope: 'plant', path: 'maintenance' },
  { label: 'WMS / Inventario', icon: Warehouse, scope: 'plant', path: 'inventory' },
  { label: 'Presupuestos (LULO)', icon: Calculator, scope: 'plant', path: 'budgets' },
  { label: 'Documentos', icon: FileText, scope: 'plant', path: 'documents' },
  { label: 'Dashboards', icon: LayoutDashboard, scope: 'plant', path: 'dashboard', globalPath: '/dashboards' },
]

/** Secciones de planta válidas como destino tras elegir planta (`/plants?next=<sección>`): nunca se navega a un valor arbitrario de la URL. */
export function plantSection(value: string | null | undefined): NavItem | undefined {
  return NAV_ITEMS.find((i) => i.scope === 'plant' && i.path === value)
}

