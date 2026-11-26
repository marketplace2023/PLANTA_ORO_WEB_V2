import {
  BookOpen,
  Briefcase,
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
  Factory,
  Handshake,
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
  /** Fotografía usada en los accesos visuales; el menú conserva su icono. */
  image?: string
}

// Nombres fijos: no renombrar por pantalla (docs/design.md §56).
export const NAV_ITEMS: NavItem[] = [
  { label: 'Página principal', icon: Globe, scope: 'global', path: '/' },
  { label: 'Catálogo', icon: BookOpen, scope: 'global', path: '/catalog', image: '/categorias/card-catalogo.webp' },
  { label: 'Activos Físicos', icon: Package, scope: 'plant', path: 'assets', image: '/categorias/card-activos-fisicos.webp' },
  { label: 'Procesos', icon: Cog, scope: 'plant', path: 'processes', image: '/categorias/card-procesos.webp' },
  { label: 'Marketplace', icon: Store, scope: 'global', path: '/marketplace', image: '/categorias/card-marketplace.webp' },
  { label: 'Servicios Profesionales', icon: Briefcase, scope: 'global', path: '/professionals', image: '/categorias/card-servicios-profesionales.webp' },
  { label: 'Cursos (LMS)', icon: BookOpen, scope: 'global', path: '/courses', image: '/categorias/card-cursos-lms.webp' },
  { label: 'Redes Transversales', icon: Network, scope: 'plant', path: 'networks' },
  { label: 'Mantenimiento', icon: Wrench, scope: 'plant', path: 'maintenance', image: '/categorias/card-mantenimiento.webp' },
  { label: 'WMS / Inventario', icon: Warehouse, scope: 'plant', path: 'inventory', image: '/categorias/card-wms-inventario.webp' },
  { label: 'Presupuestos (LULO)', icon: Calculator, scope: 'plant', path: 'budgets', globalPath: '/budgets', image: '/categorias/card-presupuestos-lulo.webp' },
  { label: 'Documentos', icon: FileText, scope: 'plant', path: 'documents', image: '/categorias/card-documentos.webp' },
  { label: 'Dashboards', icon: LayoutDashboard, scope: 'plant', path: 'dashboard', globalPath: '/dashboards' },
]

/** Una sola estructura para el menú principal y los accesos visuales. */
export const PORTAL_NAV_GROUPS = [
  { id: 'plant', label: 'Gestión de planta', icon: Factory, paths: ['/catalog', 'assets', 'processes', 'maintenance', 'inventory', 'documents'] },
  { id: 'services', label: 'Servicios', icon: Handshake, paths: ['/marketplace', '/professionals', '/courses', 'budgets'] },
].map(({ paths, ...group }) => ({ ...group, items: paths.map((path) => NAV_ITEMS.find((item) => item.path === path)!) }))

export function navTarget(item: NavItem, plantSlug?: string | null): string {
  if (item.scope === 'global') return item.path
  if (plantSlug) return `/plants/${plantSlug}/${item.path}`
  return item.globalPath ?? `/plants?next=${item.path}`
}

/** Secciones de planta válidas como destino tras elegir planta (`/plants?next=<sección>`): nunca se navega a un valor arbitrario de la URL. */
export function plantSection(value: string | null | undefined): NavItem | undefined {
  return NAV_ITEMS.find((i) => i.scope === 'plant' && i.path === value)
}

