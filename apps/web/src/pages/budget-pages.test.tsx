import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Analysis, ApuDetail, BudgetDetail, BudgetItem, BudgetSummary, Deviations, Summary, ValuationDetail, ValuationList } from '@/features/budget/use-budget'
import { plantDetail } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { ApuEditorPage } from './apu-editor-page'
import { BudgetEditorPage } from './budget-editor-page'
import { BudgetsPage } from './budgets-page'
import { PlantRoute } from './plant-route'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('@/features/plant/plant-context', () => ({ usePlant: () => ({ permissions: state.permissions, currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const B = '/plants/revemin-ii/budgets'
const READ = ['budget.read']
const EDIT = ['budget.read', 'budget.edit']
const APPROVE = ['budget.read', 'budget.edit', 'budget.approve']

const summary = (over: Partial<Summary> = {}): Summary => ({
  baseCurrency: 'USD',
  budgetsByStatus: { DRAFT: 1, APPROVED: 2 },
  budgetCount: 3,
  approvedDirect: 100000,
  approvedTotal: 140000,
  executedDirect: 25000,
  executedTotal: 35000,
  progressPct: 25,
  priceDriftDirect: 1200.5,
  apuCount: 4,
  resourceCount: 9,
  ...over,
})
const item = (over: Partial<BudgetItem> = {}): BudgetItem => ({
  id: 'i1',
  code: '01.01',
  description: 'Concreto f’c 210',
  unit: 'm3',
  quantity: 10,
  unitPrice: 200,
  amount: 2000,
  missingRates: [],
  apu: { id: 'a1', code: 'APU-001', name: 'Concreto' },
  ...over,
})
const budget = (over: Partial<BudgetDetail> = {}): BudgetDetail => ({
  id: 'b1',
  code: 'PRE-2026-00001',
  name: 'Ampliación de planta',
  status: 'DRAFT',
  project: { id: 'p1', code: 'PRJ-1', name: 'Ampliación' },
  baseCurrency: 'USD',
  rates: { overheadPct: 10, utilityPct: 5, taxPct: 18 },
  approvedAt: null,
  approvedBy: null,
  createdAt: '2026-10-01T10:00:00Z',
  totals: { direct: 2000, overhead: 200, utility: 100, subtotal: 2300, tax: 414, total: 2714, incomplete: false },
  chapters: [
    { id: 'c1', code: '01', name: 'Obras civiles', position: 0, subtotal: 2000, items: [item()] },
    { id: 'c2', code: '02', name: 'Montaje', position: 1, subtotal: 0, items: [] },
  ],
  ...over,
})
const approved = (over: Partial<BudgetDetail> = {}) => budget({ status: 'APPROVED', approvedAt: '2026-10-02T10:00:00Z', approvedBy: 'u2', ...over })
const apu = (over: Partial<ApuDetail> = {}): ApuDetail => ({
  id: 'a1',
  code: 'APU-001',
  name: 'Concreto f’c 210',
  unit: 'm3',
  description: null,
  yieldValue: 8,
  hoursPerDay: 8,
  status: 'ACTIVE',
  baseCurrency: 'USD',
  missingRates: [],
  lines: [
    { id: 'l1', resourceId: 'r1', code: 'MAT-001', name: 'Cemento', type: 'MATERIAL', unit: 'bol', unitPrice: 9.5, currency: 'USD', quantity: 9, wastePct: 5, resourceStatus: 'ACTIVE', subtotal: 89.7750 },
    { id: 'l2', resourceId: 'r2', code: 'MO-001', name: 'Operario', type: 'LABOR', unit: 'h', unitPrice: 4, currency: 'USD', quantity: 2, wastePct: 0, resourceStatus: 'ACTIVE', subtotal: 8 },
  ],
  directCost: 97.775,
  breakdown: { MATERIAL: 89.775, LABOR: 8, EQUIPMENT: 0, TRANSPORT: 0 },
  usedInBudgets: 2,
  ...over,
})
const emptyList = { items: [], total: 0, page: 1, pageSize: 25, baseCurrency: 'USD' }

type Reply = { status?: number; body?: unknown }
function setup(routes: Record<string, Reply | ((req: { path: string; init: RequestInit }) => Reply)> = {}) {
  return mockApi({ 'GET /plants/revemin-ii': { body: plantDetail() }, ...routes })
}
const calls = (m: ReturnType<typeof setup>, path: string, method = 'GET') => m.calls.filter((c) => c.method === method && c.path === path)
const body = (m: ReturnType<typeof setup>, method: string, path: string) => JSON.parse(calls(m, path, method).at(-1)!.init.body as string)

const renderAt = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="budgets/apus/:apuId" element={<ApuEditorPage />} />
        <Route path="budgets/:budgetId" element={<BudgetEditorPage />} />
      </Route>
    </Routes>,
    { route },
  )

beforeEach(() => {
  state.permissions = READ
})
afterEach(() => vi.unstubAllGlobals())

describe('Presupuestos: tablero y permisos', () => {
  it('sin budget.read no muestra datos ni los pide', async () => {
    state.permissions = ['asset.read']
    const m = setup()
    renderAt(B)
    expect(await screen.findByText('Sin acceso a Presupuestos')).toBeInTheDocument()
    expect(m.calls.some((c) => c.path.includes('/budgets'))).toBe(false)
  })

  it('tablero: indicadores con moneda y avance; la desviación positiva se resalta', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/summary': { body: summary() } })
    renderAt(B)
    expect(await screen.findByText('USD 140,000.00')).toBeInTheDocument()
    expect(screen.getByText('25 %')).toBeInTheDocument()
    expect(screen.getByText('1 en borrador · 2 aprobados · 0 cerrados')).toBeInTheDocument()
    expect(screen.getByText('USD 1,200.50')).toBeInTheDocument()
  })

  it('tablero sin presupuestos aprobados: avance sin dato', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/summary': { body: summary({ budgetCount: 0, progressPct: null, budgetsByStatus: {} }) } })
    renderAt(B)
    expect(await screen.findByText('Aún no hay presupuestos aprobados')).toBeInTheDocument()
  })

  it('error del servidor → estado de error con reintento', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/summary': { status: 500, body: { message: 'boom' } } })
    renderAt(B)
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeInTheDocument()
  })
})

describe('Presupuestos: lista', () => {
  const list = (items: BudgetSummary[]) => ({ items, total: items.length, page: 1, pageSize: 25, baseCurrency: 'USD' })
  const row = (over: Partial<BudgetSummary> = {}): BudgetSummary => ({ id: 'b1', code: 'PRE-2026-00001', name: 'Ampliación', status: 'DRAFT', project: { id: 'p1', code: 'PRJ-1', name: 'Ampliación' }, itemCount: 3, total: 2714, direct: 2000, incomplete: false, approvedAt: null, createdAt: '2026-10-01T10:00:00Z', ...over })

  it('muestra estado, totales y marca los presupuestos incompletos', async () => {
    setup({
      'GET /plants/revemin-ii/budgets': { body: list([row(), row({ id: 'b2', code: 'PRE-2026-00002', status: 'APPROVED', incomplete: true, approvedAt: '2026-10-02T10:00:00Z' })]) },
      'GET /plants/revemin-ii/budgets/projects': { body: [] },
    })
    renderAt(`${B}?tab=budgets`)
    const link = await screen.findByRole('link', { name: 'PRE-2026-00001' })
    expect(link).toHaveAttribute('href', '/plants/revemin-ii/budgets/b1')
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByText('Aprobado')).toBeInTheDocument()
    expect(screen.getAllByText('USD 2,714.00')).toHaveLength(2)
    expect(screen.getByText(/Incompleto: hay partidas sin precio/)).toBeInTheDocument()
  })

  it('sin budget.edit no hay botones de creación', async () => {
    setup({ 'GET /plants/revemin-ii/budgets': { body: list([]) }, 'GET /plants/revemin-ii/budgets/projects': { body: [] } })
    renderAt(`${B}?tab=budgets`)
    expect(await screen.findByText('Aún no hay presupuestos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nuevo presupuesto/ })).not.toBeInTheDocument()
  })

  it('con budget.edit: sin proyectos no se puede crear presupuesto; crear proyecto envía el código', async () => {
    state.permissions = EDIT
    const m = setup({
      'GET /plants/revemin-ii/budgets': { body: list([]) },
      'GET /plants/revemin-ii/budgets/projects': { body: [] },
      'POST /plants/revemin-ii/budgets/projects': { status: 201, body: { id: 'p9', code: 'PRJ-9', name: 'Nuevo', description: null, status: 'ACTIVE', budgets: 0 } },
    })
    renderAt(`${B}?tab=budgets`)
    expect(await screen.findByRole('button', { name: /Nuevo presupuesto/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /Nuevo proyecto/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Código'), 'PRJ-9')
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Nuevo')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear proyecto' }))
    await waitFor(() => expect(body(m, 'POST', '/plants/revemin-ii/budgets/projects')).toMatchObject({ code: 'PRJ-9', name: 'Nuevo' }))
  })
})

describe('Editor de APU', () => {
  const A = `${B}/apus/a1`

  it('muestra líneas, precios y el pie con costo directo y desglose', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/apus/a1': { body: apu() } })
    renderAt(A)
    expect(await screen.findByRole('heading', { name: /APU-001/ })).toBeInTheDocument()
    expect(screen.getByText('Cemento')).toBeInTheDocument()
    expect(screen.getByText('5 %')).toBeInTheDocument() // desperdicio de material
    const footer = screen.getByLabelText('Totales del APU')
    expect(within(footer).getByText('USD 97.775')).toBeInTheDocument()
    expect(within(footer).getByText('USD 89.775')).toBeInTheDocument() // material
    expect(screen.getByText(/usado en 2 presupuesto/)).toBeInTheDocument()
  })

  it('mano de obra no muestra desperdicio (se calcula por rendimiento)', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/apus/a1': { body: apu() } })
    renderAt(A)
    const row = (await screen.findByText('Operario')).closest('tr') as HTMLElement
    expect(within(row).getByText('—')).toBeInTheDocument()
  })

  it('con tipo de cambio faltante avisa y no inventa un precio', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/apus/a1': { body: apu({ directCost: null, breakdown: null, missingRates: ['PEN'] }) } })
    renderAt(A)
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta el tipo de cambio de PEN')
    const footer = screen.getByLabelText('Totales del APU')
    expect(within(footer).queryByText(/USD/)).not.toBeInTheDocument() // sin precio no hay "USD 0.00"
    expect(within(footer).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('solo lectura: sin botones de edición', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/apus/a1': { body: apu() } })
    renderAt(A)
    await screen.findByText('Cemento')
    expect(screen.queryByRole('button', { name: /Agregar recurso/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Quitar MAT-001/ })).not.toBeInTheDocument()
  })

  it('con budget.edit: quitar una línea llama al servidor', async () => {
    state.permissions = EDIT
    const m = setup({
      'GET /plants/revemin-ii/budgets/apus/a1': { body: apu() },
      'GET /plants/revemin-ii/budgets/resources': { body: emptyList },
      'DELETE /plants/revemin-ii/budgets/apus/a1/lines/l1': { body: apu() },
    })
    renderAt(A)
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar MAT-001' }))
    await waitFor(() => expect(calls(m, '/plants/revemin-ii/budgets/apus/a1/lines/l1', 'DELETE')).toHaveLength(1))
  })

  it('APU inexistente → no encontrado', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/apus/a1': { status: 404, body: { message: 'No existe' } } })
    renderAt(A)
    expect(await screen.findByText('APU no encontrado')).toBeInTheDocument()
  })
})

describe('Editor de presupuesto', () => {
  const E = `${B}/b1`
  const get = (b: BudgetDetail) => ({ 'GET /plants/revemin-ii/budgets/b1': { body: b } })

  it('borrador: capítulos, partidas con precio y panel de totales', async () => {
    setup({ ...get(budget()), 'GET /plants/revemin-ii/budgets/apus': { body: emptyList } })
    renderAt(E)
    expect(await screen.findByRole('heading', { name: /PRE-2026-00001/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Obras civiles/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Concreto f’c 210')).toBeInTheDocument()
    const totals = screen.getByLabelText('Totales del presupuesto')
    expect(within(totals).getByText('USD 2,714.00')).toBeInTheDocument()
    expect(within(totals).getByText('(18 %)')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Desviaciones' })).not.toBeInTheDocument()
  })

  it('elegir otro capítulo muestra su estado vacío', async () => {
    setup({ ...get(budget()), 'GET /plants/revemin-ii/budgets/apus': { body: emptyList } })
    renderAt(E)
    await userEvent.click(await screen.findByRole('button', { name: /Montaje/ }))
    expect(await screen.findByText('Este capítulo no tiene partidas')).toBeInTheDocument()
  })

  it('partida sin precio por tipo de cambio faltante y total incompleto: advierte y no deja aprobar', async () => {
    state.permissions = APPROVE
    setup({
      ...get(budget({ totals: { ...budget().totals, incomplete: true }, chapters: [{ id: 'c1', code: '01', name: 'Obras', position: 0, subtotal: 0, items: [item({ unitPrice: null, amount: null, missingRates: ['PEN'] })] }] })),
      'GET /plants/revemin-ii/budgets/apus': { body: emptyList },
    })
    renderAt(E)
    expect(await screen.findByText(/Sin precio \(PEN\)/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('el total está incompleto')
    expect(screen.getByRole('button', { name: /Aprobar/ })).toBeDisabled()
  })

  it('solo lectura: sin acciones de edición ni aprobación', async () => {
    setup({ ...get(budget()), 'GET /plants/revemin-ii/budgets/apus': { body: emptyList } })
    renderAt(E)
    await screen.findByText('Concreto f’c 210')
    for (const name of [/Agregar partida/, /Aprobar/, /Duplicar/, /Tasas/, /Nuevo$/]) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })

  it('editor sin budget.approve no ve Aprobar pero sí Duplicar', async () => {
    state.permissions = EDIT
    setup({ ...get(budget()), 'GET /plants/revemin-ii/budgets/apus': { body: emptyList } })
    renderAt(E)
    expect(await screen.findByRole('button', { name: /Duplicar/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aprobar/ })).not.toBeInTheDocument()
  })

  it('aprobar llama al endpoint de aprobación', async () => {
    state.permissions = APPROVE
    const m = setup({
      ...get(budget()),
      'GET /plants/revemin-ii/budgets/apus': { body: emptyList },
      'POST /plants/revemin-ii/budgets/b1/approve': { body: approved() },
    })
    renderAt(E)
    await userEvent.click(await screen.findByRole('button', { name: /Aprobar/ }))
    await waitFor(() => expect(calls(m, '/plants/revemin-ii/budgets/b1/approve', 'POST')).toHaveLength(1))
  })

  it('editar tasas envía los tres porcentajes', async () => {
    state.permissions = EDIT
    const m = setup({
      ...get(budget()),
      'GET /plants/revemin-ii/budgets/apus': { body: emptyList },
      'PATCH /plants/revemin-ii/budgets/b1': { body: budget() },
    })
    renderAt(E)
    await userEvent.click(await screen.findByRole('button', { name: /Tasas/ }))
    const dialog = await screen.findByRole('dialog')
    const gg = within(dialog).getByLabelText('Gastos generales (%)')
    await userEvent.clear(gg)
    await userEvent.type(gg, '12.5')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(body(m, 'PATCH', '/plants/revemin-ii/budgets/b1')).toEqual({ overheadPct: 12.5, utilityPct: 5, taxPct: 18 }))
  })

  it('aprobado: congelado (sin edición de partidas), con desviaciones y botón cerrar', async () => {
    state.permissions = APPROVE
    setup(get(approved()))
    renderAt(E)
    expect(await screen.findByText(/precios y la estructura están congelados/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agregar partida/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar partida 01.01' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Desviaciones' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cerrar presupuesto/ })).toBeInTheDocument()
  })

  it('presupuesto inexistente → no encontrado', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/b1': { status: 404, body: { message: 'No existe' } } })
    renderAt(E)
    expect(await screen.findByText('Presupuesto no encontrado')).toBeInTheDocument()
  })

  it('agregar partida envía capítulo, APU y cantidad', async () => {
    state.permissions = EDIT
    const m = setup({
      ...get(budget()),
      'GET /plants/revemin-ii/budgets/apus': { body: { ...emptyList, items: [{ id: 'a1', code: 'APU-001', name: 'Concreto', unit: 'm3', status: 'ACTIVE', yieldValue: 8, lineCount: 2, unitPrice: 97.775, missingRates: [] }], total: 1 } },
      'POST /plants/revemin-ii/budgets/b1/items': { status: 201, body: budget() },
    })
    renderAt(E)
    await userEvent.click(await screen.findByRole('button', { name: /Agregar partida/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Código de la partida'), '01.02')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'APU' }))
    await userEvent.click(await screen.findByRole('option', { name: /APU-001/ }))
    await userEvent.type(within(dialog).getByLabelText('Cantidad'), '3.5')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar partida' }))
    await waitFor(() => expect(body(m, 'POST', '/plants/revemin-ii/budgets/b1/items')).toMatchObject({ chapterId: 'c1', apuId: 'a1', code: '01.02', quantity: 3.5 }))
  })

  it('un 409 del servidor se muestra en el diálogo sin cerrarlo', async () => {
    state.permissions = EDIT
    setup({
      ...get(budget()),
      'GET /plants/revemin-ii/budgets/apus': { body: emptyList },
      'POST /plants/revemin-ii/budgets/b1/chapters': { status: 409, body: { message: 'El presupuesto ya no es un borrador' } },
    })
    renderAt(E)
    await userEvent.click(await screen.findByRole('button', { name: /^Nuevo$/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Código'), '03')
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Eléctrico')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear capítulo' }))
    expect(await within(dialog).findByText('El presupuesto ya no es un borrador')).toBeInTheDocument()
  })
})

describe('Escenarios, valorizaciones y desviaciones', () => {
  const E = `${B}/b1`
  const analysis = (): Analysis => ({
    baseCurrency: 'USD',
    base: { direct: 2000, overhead: 200, utility: 100, subtotal: 2300, tax: 414, total: 2714 },
    scenarios: [{ id: 's1', name: 'Materiales +10 %', adjustments: { MATERIAL: 10 }, totals: { direct: 2100, overhead: 210, utility: 105, subtotal: 2415, tax: 434.7, total: 2849.7 }, change: 135.7, changePct: 5 }],
    sensitivity: { base: 2714, rows: [{ type: 'MATERIAL', deltaPct: 10, total: 2849.7, change: 135.7, changePct: 5 }, { type: 'MATERIAL', deltaPct: -10, total: 2578.3, change: -135.7, changePct: -5 }] },
  })

  it('escenarios: compara contra la base y muestra la sensibilidad', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/b1': { body: budget() }, 'GET /plants/revemin-ii/budgets/b1/analysis': { body: analysis() } })
    renderAt(`${E}?tab=scenarios`)
    expect(await screen.findByText('Base (presupuesto)')).toBeInTheDocument()
    const row = screen.getByText('Materiales +10 %', { selector: 'td' }).closest('tr') as HTMLElement
    expect(within(row).getByText('USD 2,849.70')).toBeInTheDocument()
    expect(within(row).getByText(/\+USD 135\.70|\+?135\.70/)).toBeInTheDocument()
    expect(screen.getByText('Sensibilidad (±10 % por tipo de recurso)')).toBeInTheDocument()
    expect(screen.getAllByText('Material')).not.toHaveLength(0)
  })

  it('crear escenario: solo envía los tipos con valor', async () => {
    state.permissions = EDIT
    const m = setup({
      'GET /plants/revemin-ii/budgets/b1': { body: budget() },
      'GET /plants/revemin-ii/budgets/b1/analysis': { body: analysis() },
      'POST /plants/revemin-ii/budgets/b1/scenarios': { status: 201, body: { id: 's2', name: 'x', adjustments: {}, createdAt: '2026-10-02T00:00:00Z' } },
    })
    renderAt(`${E}?tab=scenarios`)
    await userEvent.click(await screen.findByRole('button', { name: /Nuevo escenario/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Mano de obra +8')
    await userEvent.type(within(dialog).getByLabelText('Mano de obra (%)'), '8')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear escenario' }))
    await waitFor(() => expect(body(m, 'POST', '/plants/revemin-ii/budgets/b1/scenarios')).toEqual({ name: 'Mano de obra +8', adjustments: { LABOR: 8 } }))
  })

  it('escenarios sin permiso de edición no muestra crear ni eliminar', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/b1': { body: budget() }, 'GET /plants/revemin-ii/budgets/b1/analysis': { body: analysis() } })
    renderAt(`${E}?tab=scenarios`)
    await screen.findByText('Base (presupuesto)')
    expect(screen.queryByRole('button', { name: /Nuevo escenario/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Eliminar escenario/ })).not.toBeInTheDocument()
  })

  it('análisis con 409 explica por qué no se puede analizar', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/b1': { body: budget() }, 'GET /plants/revemin-ii/budgets/b1/analysis': { status: 409, body: { message: 'Hay partidas sin precio' } } })
    renderAt(`${E}?tab=scenarios`)
    expect(await screen.findByText('No se puede analizar todavía')).toBeInTheDocument()
    expect(screen.getByText('Hay partidas sin precio')).toBeInTheDocument()
  })

  const vlist = (over: Partial<ValuationList> = {}): ValuationList => ({
    budgetStatus: 'APPROVED',
    progressPct: 40,
    executedDirect: 800,
    executedTotal: 1085.6,
    items: [{ id: 'v1', number: 1, periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'DRAFT', approvedAt: null, direct: 800, total: 1085.6, lineCount: 1 }],
    ...over,
  })
  const vdetail = (over: Partial<ValuationDetail> = {}): ValuationDetail => ({
    id: 'v1',
    number: 1,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    status: 'DRAFT',
    note: null,
    approvedAt: null,
    lines: [{ itemId: 'i1', code: '01.01', description: 'Concreto f’c 210', unit: 'm3', contractQuantity: 10, previousQuantity: 2, quantity: 4, cumulativeQuantity: 6, unitPrice: 200, amount: 800 }],
    totals: { direct: 800, overhead: 80, utility: 40, subtotal: 920, tax: 165.6, total: 1085.6 },
    ...over,
  })

  it('valorizaciones de un borrador: pide aprobar primero', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/b1': { body: budget() }, 'GET /plants/revemin-ii/budgets/b1/valuations': { body: vlist({ budgetStatus: 'DRAFT', items: [] }) } })
    renderAt(`${E}?tab=valuations`)
    expect(await screen.findByText('Aprueba el presupuesto para valorizar')).toBeInTheDocument()
  })

  it('valorizaciones: avance, lista y detalle con contratado/anterior/acumulado', async () => {
    setup({
      'GET /plants/revemin-ii/budgets/b1': { body: approved() },
      'GET /plants/revemin-ii/budgets/b1/valuations': { body: vlist() },
      'GET /plants/revemin-ii/budgets/b1/valuations/v1': { body: vdetail() },
    })
    renderAt(`${E}?tab=valuations`)
    expect(await screen.findByRole('progressbar', { name: 'Avance acumulado' })).toHaveAttribute('aria-valuenow', '40')
    expect(screen.getByText('40 %')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver valorización 1' }))
    const dialog = await screen.findByRole('dialog', { name: /Valorización 1/ })
    const row = (await within(dialog).findByText('Concreto f’c 210')).closest('tr') as HTMLElement
    expect(within(row).getByText('10 m3')).toBeInTheDocument()
    expect(within(row).getByText('USD 800.00')).toBeInTheDocument()
    // sin budget.approve no se puede aprobar
    expect(within(dialog).queryByRole('button', { name: /Aprobar valorización/ })).not.toBeInTheDocument()
  })

  it('aprobar una valorización requiere budget.approve y llama al endpoint', async () => {
    state.permissions = APPROVE
    const m = setup({
      'GET /plants/revemin-ii/budgets/b1': { body: approved() },
      'GET /plants/revemin-ii/budgets/b1/valuations': { body: vlist() },
      'GET /plants/revemin-ii/budgets/b1/valuations/v1': { body: vdetail() },
      'POST /plants/revemin-ii/budgets/b1/valuations/v1/approve': { body: vdetail({ status: 'APPROVED' }) },
    })
    renderAt(`${E}?tab=valuations`)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver valorización 1' }))
    await userEvent.click(await screen.findByRole('button', { name: /Aprobar valorización/ }))
    await waitFor(() => expect(calls(m, '/plants/revemin-ii/budgets/b1/valuations/v1/approve', 'POST')).toHaveLength(1))
  })

  it('una valorización aprobada no ofrece editar, eliminar ni aprobar', async () => {
    state.permissions = APPROVE
    setup({
      'GET /plants/revemin-ii/budgets/b1': { body: approved() },
      'GET /plants/revemin-ii/budgets/b1/valuations': { body: vlist({ items: [{ id: 'v1', number: 1, periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'APPROVED', approvedAt: '2026-11-02T00:00:00Z', direct: 800, total: 1085.6, lineCount: 1 }] }) },
      'GET /plants/revemin-ii/budgets/b1/valuations/v1': { body: vdetail({ status: 'APPROVED' }) },
    })
    renderAt(`${E}?tab=valuations`)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver valorización 1' }))
    const dialog = await screen.findByRole('dialog', { name: /Valorización 1/ })
    await within(dialog).findByText('Concreto f’c 210')
    for (const name of [/Aprobar valorización/, /^Editar$/, /^Eliminar$/]) expect(within(dialog).queryByRole('button', { name })).not.toBeInTheDocument()
  })

  it('nueva valorización: envía solo partidas con cantidad y muestra el 409 de tope contratado', async () => {
    state.permissions = EDIT
    const m = setup({
      'GET /plants/revemin-ii/budgets/b1': { body: approved() },
      'GET /plants/revemin-ii/budgets/b1/valuations': { body: vlist({ items: [] }) },
      'POST /plants/revemin-ii/budgets/b1/valuations': { status: 409, body: { message: 'La partida 01.01 supera la cantidad contratada' } },
    })
    renderAt(`${E}?tab=valuations`)
    await userEvent.click(await screen.findByRole('button', { name: /Nueva valorización/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Cantidad ejecutada de 01.01'), '11')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear valorización' }))
    expect(await within(dialog).findByText('La partida 01.01 supera la cantidad contratada')).toBeInTheDocument()
    expect(body(m, 'POST', '/plants/revemin-ii/budgets/b1/valuations').lines).toEqual([{ itemId: 'i1', quantity: 11 }])
  })

  it('nueva valorización sin cantidades no llama al servidor', async () => {
    state.permissions = EDIT
    const m = setup({
      'GET /plants/revemin-ii/budgets/b1': { body: approved() },
      'GET /plants/revemin-ii/budgets/b1/valuations': { body: vlist({ items: [] }) },
    })
    renderAt(`${E}?tab=valuations`)
    await userEvent.click(await screen.findByRole('button', { name: /Nueva valorización/ }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear valorización' }))
    expect(await within(dialog).findByText(/al menos una partida/)).toBeInTheDocument()
    expect(calls(m, '/plants/revemin-ii/budgets/b1/valuations', 'POST')).toHaveLength(0)
  })

  it('desviaciones: impacto con tasas y partidas afectadas', async () => {
    const dev: Deviations = {
      baseCurrency: 'USD',
      impactDirect: 100,
      impactTotal: 135.7,
      itemsAffected: 1,
      items: [{ itemId: 'i1', code: '01.01', description: 'Concreto f’c 210', unit: 'm3', quantity: 10, frozenUnitPrice: 200, currentUnitPrice: 210, diff: 10, diffPct: 5, impact: 100 }],
    }
    setup({ 'GET /plants/revemin-ii/budgets/b1': { body: approved() }, 'GET /plants/revemin-ii/budgets/b1/deviations': { body: dev } })
    renderAt(`${E}?tab=deviations`)
    expect(await screen.findByText('USD 135.70')).toBeInTheDocument()
    const row = screen.getByText('Concreto f’c 210').closest('tr') as HTMLElement
    expect(within(row).getByText('USD 200.00')).toBeInTheDocument()
    expect(within(row).getByText('USD 210.00')).toBeInTheDocument()
    expect(within(row).getByText(/\+USD 10\.00 \(\+5 %\)/)).toBeInTheDocument()
  })

  it('en un borrador la pestaña de desviaciones de la URL se ignora', async () => {
    setup({ 'GET /plants/revemin-ii/budgets/b1': { body: budget() }, 'GET /plants/revemin-ii/budgets/apus': { body: emptyList } })
    renderAt(`${E}?tab=deviations`)
    expect(await screen.findByRole('tab', { name: 'Partidas', selected: true })).toBeInTheDocument()
  })
})
