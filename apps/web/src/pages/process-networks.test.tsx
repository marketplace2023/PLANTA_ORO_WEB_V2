import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NetworkDashboard, NetworkSummary, ProcessOverview, ProcessStage } from '@/features/process/use-process'
import { plantDetail } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { NetworkDashboardPage } from './network-dashboard-page'
import { NetworksPage } from './networks-page'
import { PlantRoute } from './plant-route'
import { ProcessesPage } from './processes-page'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('@/features/plant/plant-context', () => ({ usePlant: () => ({ permissions: state.permissions, currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const stage = (over: Partial<ProcessStage> = {}): ProcessStage => ({
  id: 's6',
  code: 'D06',
  name: 'Molienda Primaria',
  stageGroup: 'MOLIENDA',
  colorToken: 'blue',
  sequence: 6,
  isPublic: true,
  assetCount: 3,
  statusCounts: { OPERATIVE: 2, REPAIR: 1 },
  criticalAssets: 1,
  attentionAssets: 1,
  openWorkOrders: 2,
  ...over,
})
const overview = (over: Partial<ProcessOverview> = {}): ProcessOverview => ({
  stages: [
    stage(),
    stage({ id: 's7', code: 'D07', name: 'Molienda Secundaria', sequence: 7, assetCount: 1, statusCounts: { OPERATIVE: 1 }, attentionAssets: 0, criticalAssets: 0, openWorkOrders: 0 }),
    stage({ id: 's11', code: 'D11', name: 'Lixiviación', stageGroup: 'LIXIVIACION', colorToken: 'green', sequence: 11, assetCount: 0, statusCounts: {}, attentionAssets: 0, criticalAssets: 0, openWorkOrders: 0 }),
  ],
  connections: [
    { id: 'c1', sourceStageId: 's6', targetStageId: 's7', flowType: 'MATERIAL', isReturnFlow: false },
    { id: 'c2', sourceStageId: 's7', targetStageId: 's6', flowType: 'MATERIAL', isReturnFlow: true },
    { id: 'c3', sourceStageId: 's7', targetStageId: 's11', flowType: 'SOLUTION', isReturnFlow: false },
  ],
  totals: { assets: 4, attention: 1 },
  ...over,
})
const net = (over: Partial<NetworkSummary> = {}): NetworkSummary => ({
  id: 'n1',
  code: 'FUR-IOT',
  name: 'IoT / Instrumentación',
  description: 'Sensores y señales',
  icon: 'cpu',
  colorToken: 'network-iot',
  isPublic: true,
  assetCount: 3,
  statusCounts: { OPERATIVE: 1, CRITICAL: 1, REPAIR: 1 },
  attentionAssets: 2,
  ...over,
})
const dash = (over: Partial<NetworkDashboard> = {}): NetworkDashboard => ({
  network: { id: 'n1', code: 'FUR-IOT', name: 'IoT / Instrumentación', description: 'Sensores y señales', icon: 'cpu', colorToken: 'network-iot', isPublic: true },
  assets: {
    total: 3,
    byStatus: { OPERATIVE: 1, CRITICAL: 1, REPAIR: 1 },
    byCriticality: { CRITICAL: 1, HIGH: 1, MEDIUM: 1 },
    byStage: [{ code: 'D06', name: 'Molienda Primaria', count: 2 }, { code: null, name: null, count: 1 }],
    attention: [{ id: 'a7', tag: 'A-7A', name: 'Zaranda', status: 'CRITICAL', criticality: 'HIGH' }],
  },
  workOrders: { open: 2, overdue: 1 },
  ...over,
})

type Reply = { status?: number; body?: unknown }
function setup(routes: Record<string, Reply> = {}) {
  return mockApi({ 'GET /plants/revemin-ii': { body: plantDetail() }, ...routes })
}
const calls = (m: ReturnType<typeof setup>, path: string, method = 'GET') => m.calls.filter((c) => c.method === method && c.path === path)
const body = (m: ReturnType<typeof setup>, method: string, path: string) => JSON.parse(calls(m, path, method).at(-1)!.init.body as string)

const renderAt = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="processes" element={<ProcessesPage />} />
        <Route path="networks" element={<NetworksPage />} />
        <Route path="networks/:code" element={<NetworkDashboardPage />} />
      </Route>
    </Routes>,
    { route },
  )

beforeEach(() => {
  state.permissions = []
})
afterEach(() => vi.unstubAllGlobals())

describe('Procesos', () => {
  const P = '/plants/revemin-ii/processes'

  // La vista de Procesos es el geoportal con solo la red de Procesos disponible.
  const PROC_NETWORKS = [
    { id: 'n0', code: 'FUR-PROC', name: 'Procesos', colorToken: 'network-proc', isEnabled: true, isPublic: true },
    { id: 'n1', code: 'FUR-IOT', name: 'IoT / Instrumentación', colorToken: 'network-iot', isEnabled: true, isPublic: true },
    { id: 'n2', code: 'FUR-PTE', name: 'Potencia Eléctrica', colorToken: 'network-pte', isEnabled: true, isPublic: false },
  ]
  const GEO_STAGES = [
    { id: 's6', code: 'D06', name: 'Molienda Primaria', displayName: 'Molienda Primaria', stageGroup: 'MOLIENDA', colorToken: 'blue', sequence: 6, isEnabled: true, isPublic: true, mapPosition: null },
    { id: 's7', code: 'D07', name: 'Molienda Secundaria', displayName: 'Molienda Secundaria', stageGroup: 'MOLIENDA', colorToken: 'blue', sequence: 7, isEnabled: true, isPublic: true, mapPosition: null },
  ]
  const PROC_SUMMARY = { total: 4, byStatus: { OPERATIVE: 2, REPAIR: 1, CRITICAL: 1 }, byCriticality: { CRITICAL: 1 }, byStage: { D06: 3, D07: 1 }, byNetwork: { 'FUR-PROC': 4 } }
  const geoRoutes = (extra: Record<string, Reply> = {}): Record<string, Reply> => ({
    'GET /plants/revemin-ii/process': { body: overview() },
    'GET /plants/revemin-ii/stages': { body: GEO_STAGES },
    'GET /plants/revemin-ii/networks': { body: PROC_NETWORKS },
    'GET /plants/revemin-ii/assets/summary': { body: PROC_SUMMARY },
    'GET /plants/revemin-ii/assets': { body: { items: [], total: 0, page: 1, pageSize: 100 } },
    ...extra,
  })

  it('se ve como el geoportal de activos: etapas, mapa, etapa destacada y redes, con indicadores de la red de procesos', async () => {
    const m = setup(geoRoutes())
    renderAt(P)

    expect(await screen.findByRole('heading', { name: 'Procesos', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Listado de etapas del proceso')).toBeInTheDocument()
    expect(screen.getByText('Etapa destacada')).toBeInTheDocument()
    const kpi = (t: string) => screen.getByText(t).closest('li') as HTMLElement
    expect(await screen.findByText('Activos en proceso')).toBeInTheDocument()
    expect(kpi('Etapas habilitadas')).toHaveTextContent('2')
    await waitFor(() => expect(kpi('Activos en proceso')).toHaveTextContent('4'))
    expect(kpi('Requieren atención')).toHaveTextContent('2') // reparación + crítico
    expect(kpi('Redes disponibles de 3')).toHaveTextContent('1')
    // Los conteos salen del resumen de la red de procesos, no de toda la planta.
    expect(calls(m, '/plants/revemin-ii/assets/summary')[0].query.get('network')).toBe('FUR-PROC')
    // Y el listado de activos de la etapa también se limita a esa red.
    await waitFor(() => expect(calls(m, '/plants/revemin-ii/assets').length).toBeGreaterThan(0))
    expect(calls(m, '/plants/revemin-ii/assets').at(-1)!.query.get('network')).toBe('FUR-PROC')
  })

  it('solo la red de Procesos está disponible: las demás aparecen bloqueadas y no se pueden elegir', async () => {
    setup(geoRoutes())
    renderAt(P)

    const networks = await screen.findByRole('list', { name: 'Redes' })
    const proc = within(networks).getByRole('button', { name: /FUR-PROC/ })
    expect(proc).toBeEnabled()
    expect(within(proc).getByText('Activa')).toBeInTheDocument()
    for (const name of [/FUR-IOT .*bloqueada/, /FUR-PTE .*bloqueada/]) {
      expect(within(networks).getByRole('button', { name })).toBeDisabled()
    }
    // Pulsar la red activa no la quita.
    await userEvent.click(proc)
    expect(within(networks).getByRole('button', { name: /FUR-PROC/ })).toBeEnabled()
    expect(within(networks).getByText('Activa')).toBeInTheDocument()
  })

  it('la etapa elegida muestra de dónde recibe y a dónde envía (flujo del proceso)', async () => {
    setup(geoRoutes())
    renderAt(`${P}?stage=D07`)

    expect(await screen.findByText('Flujo del proceso · Etapa 07')).toBeInTheDocument()
    const panel = screen.getByText('Flujo del proceso · Etapa 07').closest('section') as HTMLElement
    const recibe = within(panel).getByText('Recibe de').closest('div') as HTMLElement
    expect(within(recibe).getByText('Molienda Primaria')).toBeInTheDocument()
    const envia = within(panel).getByText('Envía a').closest('div') as HTMLElement
    expect(within(envia).getByText('Molienda Primaria')).toBeInTheDocument() // retorno
    expect(within(envia).getByText('retorno')).toBeInTheDocument()
  })

  it('error del servidor: ofrece reintentar', async () => {
    setup(geoRoutes({ 'GET /plants/revemin-ii/assets': { status: 500, body: { message: 'x' } } }))
    renderAt(P)
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeInTheDocument()
  })

  it('editar conexiones solo con plant.configure', async () => {
    setup(geoRoutes())
    const { unmount } = renderAt(P)
    await screen.findByText('Activos en proceso')
    expect(screen.queryByRole('button', { name: /Editar conexiones/ })).not.toBeInTheDocument()
    unmount()
    state.permissions = ['plant.configure']
    setup(geoRoutes())
    renderAt(P)
    expect(await screen.findByRole('button', { name: /Editar conexiones/ })).toBeInTheDocument()
  })

  it('conexiones: agrega validando origen/destino, muestra el rechazo por ciclo y quita una', async () => {
    state.permissions = ['plant.configure']
    const m = setup({
      'GET /plants/revemin-ii/process': { body: overview() },
      'POST /plants/revemin-ii/process/connections': { status: 400, body: { message: 'Datos inválidos', errors: [{ path: 'isReturnFlow', message: 'La conexión cerraría un ciclo en el flujo principal; márcala como flujo de retorno' }] } },
      'DELETE /plants/revemin-ii/process/connections/c1': { status: 204 },
    })
    renderAt(P)
    await userEvent.click(await screen.findByRole('button', { name: /Editar conexiones/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Conexiones actuales (3)')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar conexión' }))
    expect(await within(dialog).findByText('Elige la etapa de origen y la de destino')).toBeInTheDocument()
    expect(calls(m, '/plants/revemin-ii/process/connections', 'POST')).toHaveLength(0)

    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Origen' }))
    await userEvent.click(await screen.findByRole('option', { name: 'D11 · Lixiviación' }))
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Destino' }))
    await userEvent.click(await screen.findByRole('option', { name: 'D06 · Molienda Primaria' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar conexión' }))
    await waitFor(() => expect(body(m, 'POST', '/plants/revemin-ii/process/connections')).toEqual({ sourceStageId: 's11', targetStageId: 's6', flowType: 'MATERIAL', isReturnFlow: false }))
    expect(await within(dialog).findByText(/cerraría un ciclo/)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: /Quitar conexión D06 · Molienda Primaria a D07/ }))
    await waitFor(() => expect(calls(m, '/plants/revemin-ii/process/connections/c1', 'DELETE')).toHaveLength(1))
  })
})

describe('Redes Transversales', () => {
  const N = '/plants/revemin-ii/networks'

  it('solo las redes que devuelve la API (habilitadas), con conteos, atención y enlace al dashboard', async () => {
    setup({ 'GET /plants/revemin-ii/network-overview': { body: [net(), net({ id: 'n2', code: 'FUR-PTE', name: 'Potencia Eléctrica', assetCount: 0, statusCounts: {}, attentionAssets: 0 })] } })
    renderAt(N)
    const card = (await screen.findByRole('link', { name: 'IoT / Instrumentación' })).closest('[data-slot="card"]') as HTMLElement
    expect(card.querySelector('a')).toHaveAttribute('href', '/plants/revemin-ii/networks/FUR-IOT')
    expect(within(card).getByText('3 activos')).toBeInTheDocument()
    expect(within(card).getByText('2 requieren atención')).toBeInTheDocument()
    expect(within(card).getByText('1 Operativo · 1 Crítico · 1 En reparación')).toBeInTheDocument()
    const empty = screen.getByRole('link', { name: 'Potencia Eléctrica' }).closest('[data-slot="card"]') as HTMLElement
    expect(within(empty).getByText('Sin activos')).toBeInTheDocument()
  })

  it('visitante: activos no publicados; sin redes: estado vacío; error con reintentar', async () => {
    setup({ 'GET /plants/revemin-ii/network-overview': { body: [net({ assetCount: null, statusCounts: null, attentionAssets: null })] } })
    const { unmount } = renderAt(N)
    expect(await screen.findAllByText('Activos no publicados')).toHaveLength(2)
    unmount()
    setup({ 'GET /plants/revemin-ii/network-overview': { body: [] } })
    const second = renderAt(N)
    expect(await screen.findByText('No hay redes habilitadas')).toBeInTheDocument()
    second.unmount()
    setup({ 'GET /plants/revemin-ii/network-overview': { status: 500, body: { message: 'x' } } })
    renderAt(N)
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeInTheDocument()
  })

  it('dashboard: KPIs, desgloses por estado/criticidad/etapa y activos que requieren atención', async () => {
    setup({ 'GET /plants/revemin-ii/network-overview/FUR-IOT': { body: dash() } })
    renderAt(`${N}/FUR-IOT`)
    const kpi = (t: string) => screen.getByText(t, { selector: 'p' }).closest('[data-slot="card"]') as HTMLElement
    expect(await screen.findByRole('heading', { name: 'IoT / Instrumentación', level: 1 })).toBeInTheDocument()
    expect(kpi('Activos de la red')).toHaveTextContent('3')
    expect(kpi('Requieren atención')).toHaveTextContent('1')
    expect(kpi('OT abiertas')).toHaveTextContent('2')
    expect(kpi('OT vencidas')).toHaveTextContent('1')
    const stages = screen.getByRole('heading', { name: 'Por etapa' }).closest('[data-slot="card"]') as HTMLElement
    expect(within(stages).getByText('D06 · Molienda Primaria')).toBeInTheDocument()
    expect(within(stages).getByText('Sin etapa')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /A-7A/ })
    expect(link).toHaveAttribute('href', '/plants/revemin-ii/assets/a7')
    expect(within(link).getByText('Crítico')).toBeInTheDocument()
  })

  it('sin mantenimiento no hay tarjetas de OT; sin activos publicados lo explica', async () => {
    setup({ 'GET /plants/revemin-ii/network-overview/FUR-IOT': { body: dash({ workOrders: null }) } })
    const { unmount } = renderAt(`${N}/FUR-IOT`)
    await screen.findByText('Activos de la red')
    expect(screen.queryByText('OT abiertas')).not.toBeInTheDocument()
    unmount()
    setup({ 'GET /plants/revemin-ii/network-overview/FUR-IOT': { body: dash({ assets: null, workOrders: undefined }) } })
    renderAt(`${N}/FUR-IOT`)
    expect(await screen.findByText('Activos no publicados')).toBeInTheDocument()
  })

  it('una red no habilitada o no visible (404) lo dice y vuelve a la lista', async () => {
    setup({ 'GET /plants/revemin-ii/network-overview/FUR-MNT': { status: 404, body: { message: 'x' } } })
    renderAt(`${N}/FUR-MNT`)
    expect(await screen.findByText('Red no disponible')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver todas las redes' })).toHaveAttribute('href', '/plants/revemin-ii/networks')
  })
})
