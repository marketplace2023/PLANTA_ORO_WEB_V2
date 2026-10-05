import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Summary } from '@/features/budget/use-budget'
import type { EcosystemDashboard } from '@/features/dashboard/use-dashboard'
import type { InventoryDashboard } from '@/features/inventory/use-inventory'
import type { MaintenanceDashboard } from '@/features/maintenance/use-maintenance'
import type { PlantSummary } from '@/features/plant/plant-context'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { DashboardsPage } from './dashboards-page'
import { PlantDashboardPage } from './plant-dashboard-page'
import { PlantRoute } from './plant-route'

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  user: null as null | { isGlobalAdmin: boolean },
  plants: [] as unknown[],
  access: [] as unknown[],
  /** El contexto global (sin planta elegida) es currentPlant = null. */
  current: { name: 'REVEMIN II', slug: 'revemin-ii' } as null | { name: string; slug: string },
}))
vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ permissions: state.permissions, currentPlant: state.current, availablePlants: state.plants, isLoadingPlants: false }),
}))
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ status: 'authenticated', user: state.user, access: state.access }) }))

const P = '/plants/revemin-ii'
const plantDetail = (permissions: string[]) => ({
  id: 'p1',
  code: 'REV-II',
  name: 'REVEMIN II',
  slug: 'revemin-ii',
  description: null,
  countryCode: 'PE',
  timezone: 'America/Lima',
  status: 'ACTIVE',
  visibility: 'PUBLIC',
  logoUrl: null,
  heroImageUrl: null,
  settings: null,
  access: { roles: permissions.length ? ['PLANT_ADMIN'] : [], permissions },
})
const maintenance = (over: Partial<MaintenanceDashboard> = {}) =>
  ({ open: 7, backlog: 2, inProgress: 3, overdue: 0, completedLast30Days: 5, byStatus: {}, openByType: {}, mttrHours: null, preventiveCompliancePct: null, partsCostLast30Days: 0, currency: 'USD', mtbfHours: null, overdueWorkOrders: [], ...over }) as MaintenanceDashboard
const inventory = (over: Partial<InventoryDashboard> = {}) =>
  ({ currency: 'USD', itemCount: 9, stockValue: 12345.5, lowStockCount: 0, criticalLowCount: 0, movementsLast30Days: 0, receiptsLast30Days: 0, issuesLast30Days: 0, assetsInStock: 0, assetsInRepair: 0, reservations: null, lowStock: [], recentMovements: [], ...over }) as InventoryDashboard
const budget = (over: Partial<Summary> = {}): Summary => ({ baseCurrency: 'USD', budgetsByStatus: {}, budgetCount: 1, approvedDirect: 100, approvedTotal: 140000, executedDirect: 0, executedTotal: 0, progressPct: 34.07, priceDriftDirect: 0, apuCount: 3, resourceCount: 10, ...over })
const process = (attention = 0) => ({ body: { stages: [], connections: [], totals: { assets: 15, attention } } })

function setupPlant(permissions: string[], routes: Record<string, { status?: number; body?: unknown }> = {}) {
  state.permissions = permissions
  return mockApi({
    [`GET ${P}`]: { body: plantDetail(permissions) },
    [`GET ${P}/stages`]: { body: [] },
    [`GET ${P}/networks`]: { body: [] },
    [`GET ${P}/process`]: process(),
    ...routes,
  })
}
const renderPlant = () =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="dashboard" element={<PlantDashboardPage />} />
      </Route>
    </Routes>,
    { route: `${P}/dashboard` },
  )

beforeEach(() => {
  state.permissions = []
  state.user = null
  state.plants = []
  state.access = []
  state.current = { name: 'REVEMIN II', slug: 'revemin-ii' }
})
afterEach(() => vi.unstubAllGlobals())

describe('Dashboard de planta: resumen operacional y alertas', () => {
  it('administrador de planta: KPIs de cada módulo y alertas ordenadas por gravedad con enlaces filtrados', async () => {
    const m = setupPlant(['plant.read', 'maintenance.read', 'inventory.read', 'procurement.read', 'budget.read'], {
      [`GET ${P}/process`]: process(2),
      [`GET ${P}/maintenance/dashboard`]: { body: maintenance({ overdue: 2 }) },
      [`GET ${P}/inventory/dashboard`]: { body: inventory({ lowStockCount: 3, criticalLowCount: 1 }) },
      [`GET ${P}/procurement/summary`]: { body: { byStatus: {}, pendingApproval: 4, openRfqs: 1, awaitingReceipt: 0 } },
      [`GET ${P}/budgets/summary`]: { body: budget({ priceDriftDirect: 749.7 }) },
    })
    renderPlant()
    const overview = await screen.findByRole('heading', { name: 'Resumen operacional' })
    expect(overview).toBeInTheDocument()
    expect(await screen.findByText('USD 12,345.50')).toBeInTheDocument() // valor del inventario
    expect(screen.getByText('USD 140,000.00')).toBeInTheDocument() // presupuesto aprobado
    expect(screen.getByText('Avance 34.07 %')).toBeInTheDocument()
    expect(screen.getByText('2 vencidas · 2 en backlog')).toBeInTheDocument()
    expect(screen.getByText('2 requieren atención')).toBeInTheDocument()
    expect(screen.getByText('Requiere registro de fallas y paros: aún no disponible')).toBeInTheDocument() // Disponibilidad honesta

    const alerts = within(screen.getByRole('heading', { name: 'Alertas' }).parentElement as HTMLElement)
    const items = alerts.getAllByRole('link')
    expect(items.map((a) => a.textContent)).toEqual([
      expect.stringContaining('Crítica2 órdenes de trabajo vencidas'),
      expect.stringContaining('Crítica1 repuesto crítico bajo el mínimo'),
      expect.stringContaining('Atención2 ítems bajo el mínimo'),
      expect.stringContaining('Atención2 activos requieren atención'),
      expect.stringContaining('AtenciónLos precios vigentes superan en USD 749.70'),
      expect.stringContaining('Informativa4 requisiciones por aprobar'),
    ])
    expect(items[0]).toHaveAttribute('href', `${P}/maintenance?tab=orders&overdue=1`)
    expect(items[1]).toHaveAttribute('href', `${P}/inventory?tab=stock&low=1&critical=1`)
    expect(items[5]).toHaveAttribute('href', `${P}/maintenance?tab=requisitions&status=SUBMITTED`)
    expect(m.calls.some((c) => c.path === `${P}/procurement/summary`)).toBe(true)
  })

  it('todo en orden: "Sin alertas activas"', async () => {
    setupPlant(['maintenance.read'], { [`GET ${P}/maintenance/dashboard`]: { body: maintenance() } })
    renderPlant()
    expect(await screen.findByText('Sin alertas activas.')).toBeInTheDocument()
  })

  it('solo se piden los módulos que el usuario puede ver (jefe de mantenimiento: sin inventario, compras ni presupuestos)', async () => {
    const m = setupPlant(['maintenance.read'], { [`GET ${P}/maintenance/dashboard`]: { body: maintenance({ overdue: 1 }) } })
    renderPlant()
    await screen.findByText('1 orden de trabajo vencida', { exact: false })
    expect(screen.queryByText('Valor del inventario')).not.toBeInTheDocument()
    expect(screen.queryByText('Presupuesto aprobado')).not.toBeInTheDocument()
    expect(screen.queryByText('Requisiciones por aprobar')).not.toBeInTheDocument()
    for (const path of ['inventory/dashboard', 'procurement/summary', 'budgets/summary']) {
      expect(m.calls.some((c) => c.path === `${P}/${path}`)).toBe(false)
    }
  })

  it('visitante sin permisos y sin datos visibles: no hay resumen ni alertas', async () => {
    setupPlant([], { [`GET ${P}/process`]: { body: { stages: [], connections: [], totals: null } } })
    renderPlant()
    await screen.findByText(/solo lectura/)
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Resumen operacional' })).not.toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Alertas' })).not.toBeInTheDocument()
  })

  it('un módulo caído no tumba el tablero: avisa, permite reintentar y conserva lo demás', async () => {
    setupPlant(['maintenance.read', 'inventory.read'], {
      [`GET ${P}/maintenance/dashboard`]: { body: maintenance({ overdue: 1 }) },
      [`GET ${P}/inventory/dashboard`]: { status: 500, body: { message: 'boom' } },
    })
    const spy = vi.mocked(fetch)
    renderPlant()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar un indicador')
    expect(screen.getByText('1 orden de trabajo vencida', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('Valor del inventario')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    const inventoryCalls = spy.mock.calls.filter(([url]) => String(url).endsWith('/inventory/dashboard')).length
    expect(inventoryCalls).toBeGreaterThanOrEqual(2)
  })

  it('los KPI llevan al módulo correspondiente', async () => {
    setupPlant(['maintenance.read', 'budget.read'], {
      [`GET ${P}/maintenance/dashboard`]: { body: maintenance() },
      [`GET ${P}/budgets/summary`]: { body: budget({ progressPct: null }) },
    })
    renderPlant()
    expect((await screen.findByText('Órdenes de trabajo abiertas')).closest('a')).toHaveAttribute('href', `${P}/maintenance`)
    expect(screen.getByText('Presupuesto aprobado').closest('a')).toHaveAttribute('href', `${P}/budgets`)
    expect(screen.getByText('Aún no hay presupuestos aprobados')).toBeInTheDocument()
  })
})

const eco = (over: Partial<EcosystemDashboard> = {}): EcosystemDashboard => ({
  generatedAt: '2026-10-04T12:00:00Z',
  plants: { total: 3, byStatus: { ACTIVE: 3 }, byVisibility: { PUBLIC: 1, AUTHENTICATED: 1, PRIVATE: 1 } },
  users: { total: 9, byStatus: { ACTIVE: 9 }, globalAdmins: 1, activeLast30Days: 6 },
  access: { roles: 14, permissions: 31, assignments: 6 },
  catalog: { families: 8, types: 20, manufacturers: 12, models: 20 },
  masters: { stages: 20, networks: 10 },
  organizations: { providers: { total: 3, pending: 0 }, contractors: { total: 2, pending: 0 } },
  courses: { published: 4 },
  audit: { last24Hours: 12, last7Days: 80, recent: [{ id: 'e1', occurredAt: '2026-10-04T11:00:00Z', module: 'budget', entityType: 'budget', action: 'approved', actor: 'Gabriel Gerente' }] },
  health: { database: 'up', latencyMs: 4 },
  integrations: null,
  ...over,
})

describe('Dashboards (contexto ecosistema)', () => {
  beforeEach(() => {
    state.current = null
  })
  const renderPage = () => renderWithProviders(<DashboardsPage />, { route: '/dashboards' })

  it('administrador del ecosistema: indicadores globales, auditoría reciente e integraciones "no disponible"', async () => {
    state.user = { isGlobalAdmin: true }
    mockApi({ 'GET /admin/dashboard': { body: eco() } })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Dashboard del ecosistema' })).toBeInTheDocument()
    await screen.findByText('Usuarios', { selector: 'p' }) // espera a que carguen los datos
    const kpi = (t: string) => screen.getByText(t, { selector: 'p' }).closest('[data-slot="card"]') as HTMLElement
    expect(within(kpi('Usuarios')).getByText('9')).toBeInTheDocument()
    expect(within(kpi('Usuarios')).getByText(/6 con sesión en 30 días/)).toBeInTheDocument()
    expect(within(kpi('Plantas')).getByText('3 activas — 1 pública · 1 solo con sesión · 1 privada')).toBeInTheDocument()
    expect(within(kpi('Integraciones')).getByText('—')).toBeInTheDocument()
    expect(within(kpi('Salud del sistema')).getByText('Operativo')).toBeInTheDocument()
    expect(screen.getByText('Sin alertas activas.')).toBeInTheDocument()
    const row = screen.getByText('Gabriel Gerente').closest('tr') as HTMLElement
    expect(within(row).getByText('approved')).toBeInTheDocument()
  })

  it('organizaciones pendientes y base de datos caída generan alertas', async () => {
    state.user = { isGlobalAdmin: true }
    mockApi({
      'GET /admin/dashboard': {
        body: eco({ health: { database: 'down', latencyMs: 0 }, organizations: { providers: { total: 3, pending: 2 }, contractors: { total: 2, pending: 1 } } }),
      },
    })
    renderPage()
    expect(await screen.findByText('La base de datos no responde', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /2 proveedores pendientes de aprobación/ })).toHaveAttribute('href', '/providers')
    expect(screen.getByRole('link', { name: /1 contratista pendiente de aprobación/ })).toHaveAttribute('href', '/professionals')
    expect(within(screen.getByText('Salud del sistema', { selector: 'p' }).closest('[data-slot="card"]') as HTMLElement).getByText('Base de datos caída')).toBeInTheDocument()
  })

  it('sin actividad reciente: estado vacío', async () => {
    state.user = { isGlobalAdmin: true }
    mockApi({ 'GET /admin/dashboard': { body: eco({ audit: { last24Hours: 0, last7Days: 0, recent: [] } }) } })
    renderPage()
    expect(await screen.findByText('No hay actividad registrada en los últimos 7 días.')).toBeInTheDocument()
  })

  it('error del servidor: estado de error con reintento', async () => {
    state.user = { isGlobalAdmin: true }
    mockApi({ 'GET /admin/dashboard': { status: 500, body: { message: 'x' } } })
    renderPage()
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeInTheDocument()
  })

  it('cualquier otra persona ve "Mi panel" (solo lectura) y NUNCA pide el dashboard global', async () => {
    state.user = { isGlobalAdmin: false }
    const plant: PlantSummary = { id: 'p1', code: 'REV-II', name: 'REVEMIN II', slug: 'revemin-ii', description: null, countryCode: 'PE', timezone: 'America/Lima', status: 'ACTIVE', visibility: 'PUBLIC', logoUrl: null, heroImageUrl: null }
    state.plants = [plant, { ...plant, id: 'p2', name: 'Planta Norte', slug: 'planta-norte', code: 'NOR-01' }]
    state.access = [{ plantId: 'p1', slug: 'revemin-ii', name: 'REVEMIN II', roles: ['MAINTENANCE_LEAD'], permissions: ['maintenance.read'] }]
    const m = mockApi({})
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Mi panel' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /REVEMIN II/ })).toHaveAttribute('href', '/plants/revemin-ii/dashboard')
    expect(screen.getByText('Jefe de mantenimiento')).toBeInTheDocument()
    expect(screen.getByText('solo lectura')).toBeInTheDocument() // en Planta Norte no tiene rol
    expect(screen.getByRole('link', { name: 'Marketplace' })).toHaveAttribute('href', '/marketplace')
    expect(m.calls).toHaveLength(0)
  })
})
