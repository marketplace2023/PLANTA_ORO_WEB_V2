import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderRfq, RequisitionDetail, RequisitionItem, Rfq } from '@/features/procurement/use-procurement'
import { ProviderRfqsPanel } from '@/components/organizations/provider-rfqs-panel'
import { asset, page, plantDetail } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { dashboard, LOCATIONS } from '@/test/inventory-fixtures'
import { dashboard as maintDashboard } from '@/test/maintenance-fixtures'
import { renderWithProviders } from '@/test/render'
import { MaintenancePage } from './maintenance-page'
import { PlantRoute } from './plant-route'

const state = vi.hoisted(() => ({ permissions: [] as string[], user: { id: 'u-me', isGlobalAdmin: false } as { id: string; isGlobalAdmin: boolean } | null }))
vi.mock('@/features/plant/plant-context', () => ({ usePlant: () => ({ permissions: state.permissions, currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }) }))
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: state.user, status: 'authenticated' }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const Q = '/plants/revemin-ii/procurement'
type Reply = { status?: number; body?: unknown }

const rq = (over: Partial<RequisitionItem> = {}): RequisitionItem => ({
  id: 'r1',
  code: 'RQ-2026-00001',
  status: 'DRAFT',
  priority: 'HIGH',
  neededBy: '2026-10-30',
  justification: 'Reposición de sellos',
  decisionNote: null,
  approvedAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  requestedBy: { id: 'u-me', name: 'Marta Mantenimiento' },
  asset: { id: 'a1', tag: 'BP-501', name: 'Bomba de pulpa' },
  workOrder: null,
  stage: null,
  estimatedTotal: 1280,
  lineCount: 1,
  ...over,
})
const detail = (over: Partial<RequisitionDetail> = {}): RequisitionDetail => ({
  ...rq(),
  lines: [{ id: 'ln1', item: { id: 'i1', sku: 'SELLO-1' }, description: 'Sello mecánico 60 mm', quantity: 2, uom: 'UND', estimatedPrice: 640, lineTotal: 1280, receivedQuantity: 0 }],
  history: [{ id: 'h1', fromStatus: null, toStatus: 'DRAFT', note: 'Requisición creada', changedAt: '2026-10-01T10:00:00.000Z', changedBy: 'Marta Mantenimiento' }],
  rfq: null,
  ...over,
})
const rfq = (over: Partial<Rfq> = {}): Rfq => ({
  id: 'f1',
  code: 'RFQ-2026-00001',
  status: 'OPEN',
  deadlineAt: '2026-10-20T15:00:00.000Z',
  expired: false,
  invited: [{ id: 'p1', name: 'Repuestos Andinos', verified: true }],
  quotes: [{ id: 'qt1', providerId: 'p1', providerName: 'Repuestos Andinos', currency: 'USD', totalAmount: 1190.5, deliveryDays: 8, conditions: 'Pago a 30 días', status: 'SUBMITTED', updatedAt: '2026-10-02T10:00:00.000Z' }],
  ...over,
})

function setup(routes: Record<string, Reply> = {}) {
  return mockApi({
    'GET /plants/revemin-ii': { body: plantDetail() },
    [`GET ${Q}/summary`]: { body: { byStatus: {}, pendingApproval: 2, openRfqs: 1, awaitingReceipt: 3 } },
    [`GET ${Q}/requisitions`]: { body: page([rq(), rq({ id: 'r2', code: 'RQ-2026-00002', status: 'SUBMITTED', justification: 'Correas', priority: 'LOW', requestedBy: { id: 'u-other', name: 'Otro' } })]) },
    [`GET ${Q}/requisitions/r1`]: { body: detail() },
    'GET /plants/revemin-ii/maintenance/dashboard': { body: maintDashboard() },
    'GET /plants/revemin-ii/inventory/locations': { body: LOCATIONS },
    'GET /plants/revemin-ii/inventory/items': { body: page([]) },
    'GET /plants/revemin-ii/assets': { body: page([asset()]) },
    ...routes,
  })
}
type Mock = ReturnType<typeof setup>
const calls = (m: Mock, path: string, method = 'GET') => m.calls.filter((c) => c.method === method && c.path === path)
const body = (m: Mock, method: string, path: string) => JSON.parse(calls(m, path, method).at(-1)!.init.body as string)

const renderPage = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="maintenance" element={<MaintenancePage />} />
      </Route>
    </Routes>,
    { route },
  )
const R = '/plants/revemin-ii/maintenance?tab=requisitions'
const lastDialog = async () => (await screen.findAllByRole('dialog')).at(-1)!

const REQUESTER = ['procurement.read', 'procurement.create']
const BUYER = ['procurement.read', 'procurement.create', 'procurement.approve']

beforeEach(() => {
  state.permissions = ['procurement.read']
  state.user = { id: 'u-me', isGlobalAdmin: false }
})
afterEach(() => vi.unstubAllGlobals())

describe('Requisiciones (pestaña de Mantenimiento)', () => {
  it('sin maintenance.read ni procurement.read no muestra nada ni consulta compras', async () => {
    state.permissions = []
    const m = setup()
    renderPage(R)
    expect(await screen.findByText('Sin acceso a Mantenimiento')).toBeInTheDocument()
    expect(m.calls.some((c) => c.path.startsWith(Q))).toBe(false)
  })

  it('solo procurement.read: una sola pestaña (Requisiciones) y no consulta mantenimiento', async () => {
    const m = setup()
    renderPage('/plants/revemin-ii/maintenance')
    expect(await screen.findByText('RQ-2026-00001')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Requisiciones'])
    expect(m.calls.some((c) => c.path.includes('/maintenance/'))).toBe(false)
  })

  it('con ambos permisos aparecen las 5 pestañas', async () => {
    state.permissions = ['maintenance.read', 'procurement.read']
    setup()
    renderPage('/plants/revemin-ii/maintenance')
    await screen.findByText('OT abiertas')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Dashboard', 'Órdenes de trabajo', 'Kanban', 'Planes', 'Requisiciones'])
  })

  it('lista con resumen, estado (texto), prioridad y total estimado', async () => {
    setup()
    renderPage(R)
    const row = (await screen.findByText('Reposición de sellos')).closest('tr')!
    expect(within(row).getByText('Borrador')).toBeInTheDocument()
    expect(within(row).getByText('USD 1,280.00')).toBeInTheDocument()
    expect(within(row).getByText(/Marta Mantenimiento · 1 línea/)).toBeInTheDocument()
    const card = (t: string) => screen.getByText(t, { selector: 'p' }).closest('[data-slot="card"]') as HTMLElement
    expect(card('Por aprobar')).toHaveTextContent('2')
    expect(card('Pendientes de recepción')).toHaveTextContent('3')
  })

  it('los filtros llegan a la API y se muestran como chips', async () => {
    const m = setup()
    renderPage(`${R}&status=SUBMITTED&priority=LOW&mine=1`)
    await screen.findByText('Reposición de sellos')
    const q = calls(m, `${Q}/requisitions`).at(-1)!.query
    expect([q.get('status'), q.get('priority'), q.get('mine')]).toEqual(['SUBMITTED', 'LOW', '1'])
    expect(screen.getByRole('button', { name: 'Quitar filtro Estado: Por aprobar' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Buscar'), 'sello')
    await waitFor(() => expect(calls(m, `${Q}/requisitions`).at(-1)!.query.get('search')).toBe('sello'))
  })

  it('sin permiso de crear no hay botones de alta; con permiso sí', async () => {
    setup()
    const { unmount } = renderPage(R)
    await screen.findByText('Reposición de sellos')
    expect(screen.queryByRole('button', { name: /Nueva requisición/ })).not.toBeInTheDocument()
    unmount()
    state.permissions = REQUESTER
    setup()
    renderPage(R)
    expect(await screen.findByRole('button', { name: /Nueva requisición/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Desde stock bajo mínimo/ })).toBeInTheDocument()
  })

  it('vacío con CTA solo para quien puede crear; error con reintentar', async () => {
    state.permissions = REQUESTER
    setup({ [`GET ${Q}/requisitions`]: { body: page([]) } })
    const { unmount } = renderPage(R)
    expect(await screen.findByText('No hay requisiciones')).toBeInTheDocument()
    unmount()
    setup({ [`GET ${Q}/requisitions`]: { status: 500, body: { message: 'x' } } })
    renderPage(R)
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeInTheDocument()
  })
})

describe('Crear requisición', () => {
  beforeEach(() => {
    state.permissions = REQUESTER
  })

  it('valida justificación y líneas sin llamar al servidor', async () => {
    const m = setup()
    renderPage(R)
    await userEvent.click(await screen.findByRole('button', { name: /Nueva requisición/ }))
    const dialog = await lastDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear requisición' }))
    expect(await within(dialog).findByText('Explica para qué se necesita')).toBeInTheDocument()
    expect(within(dialog).getByText('Mayor que cero')).toBeInTheDocument()
    expect(calls(m, `${Q}/requisitions`, 'POST')).toHaveLength(0)
  })

  it('envía justificación, prioridad, líneas con precio y abre el detalle', async () => {
    const m = setup({ [`POST ${Q}/requisitions`]: { status: 201, body: detail({ id: 'r1' }) } })
    renderPage(R)
    await userEvent.click(await screen.findByRole('button', { name: /Nueva requisición/ }))
    const dialog = await lastDialog()
    await userEvent.type(within(dialog).getByLabelText('Justificación'), 'Cambio programado')
    const line = within(dialog).getByRole('group', { name: 'Línea 1' })
    await userEvent.type(within(line).getByLabelText('Descripción'), 'Rodamiento 6310')
    await userEvent.type(within(line).getByLabelText('Cantidad'), '4')
    await userEvent.type(within(line).getByLabelText('Precio estimado'), '42.9')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar línea' }))
    expect(within(dialog).getByRole('group', { name: 'Línea 2' })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quitar línea 2' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear requisición' }))
    await waitFor(() => expect(body(m, 'POST', `${Q}/requisitions`)).toEqual({ justification: 'Cambio programado', priority: 'MEDIUM', lines: [{ description: 'Rodamiento 6310', quantity: 4, uom: 'UND', estimatedPrice: 42.9 }] }))
    expect(await screen.findByRole('dialog', { name: /RQ-2026-00001/ })).toBeInTheDocument() // panel de detalle
  })

  it('errores del servidor por línea aparecen bajo el campo', async () => {
    setup({ [`POST ${Q}/requisitions`]: { status: 400, body: { message: 'Datos inválidos', errors: [{ path: 'lines.0.itemId', message: 'El ítem está inactivo' }] } } })
    renderPage(R)
    await userEvent.click(await screen.findByRole('button', { name: /Nueva requisición/ }))
    const dialog = await lastDialog()
    await userEvent.type(within(dialog).getByLabelText('Justificación'), 'Motivo válido')
    const line = within(dialog).getByRole('group', { name: 'Línea 1' })
    await userEvent.type(within(line).getByLabelText('Descripción'), 'X')
    await userEvent.type(within(line).getByLabelText('Cantidad'), '1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear requisición' }))
    expect(await within(dialog).findByText('El ítem está inactivo')).toBeInTheDocument()
  })

  it('"Desde stock bajo mínimo" arma las líneas con las sugerencias', async () => {
    const m = setup({ [`GET ${Q}/suggestions`]: { body: [{ itemId: 'i3', sku: 'SELLO-MEC-60', description: 'Sello mecánico 60 mm', uom: 'UND', onHand: 1, suggestedQuantity: 7 }] }, [`POST ${Q}/requisitions`]: { status: 201, body: detail() } })
    state.permissions = [...REQUESTER, 'inventory.read']
    setup({
      [`GET ${Q}/suggestions`]: { body: [{ itemId: 'i3', sku: 'SELLO-MEC-60', description: 'Sello mecánico 60 mm', uom: 'UND', onHand: 1, suggestedQuantity: 7 }] },
      'GET /plants/revemin-ii/inventory/items': { body: page([{ id: 'i3', sku: 'SELLO-MEC-60', name: 'Sello mecánico 60 mm', uom: 'UND', onHand: 1 }]) },
    })
    void m
    renderPage(R)
    await userEvent.click(await screen.findByRole('button', { name: /Desde stock bajo mínimo/ }))
    const dialog = await lastDialog()
    expect(within(dialog).getByLabelText('Justificación')).toHaveValue('Reposición de ítems bajo mínimo')
    expect(within(dialog).getByLabelText('Descripción')).toHaveValue('Sello mecánico 60 mm')
    expect(within(dialog).getByLabelText('Cantidad')).toHaveValue(7)
  })

  it('el enlace ?suggest=1 (desde Inventario) abre la requisición con los ítems bajo mínimo; vacío, avisa', async () => {
    state.permissions = REQUESTER
    setup({ [`GET ${Q}/suggestions`]: { body: [{ itemId: 'i3', sku: 'S', description: 'Sello mecánico 60 mm', uom: 'UND', onHand: 1, suggestedQuantity: 7 }] } })
    const { unmount } = renderPage(`${R}&suggest=1`)
    const dialog = await lastDialog()
    expect(within(dialog).getByLabelText('Descripción')).toHaveValue('Sello mecánico 60 mm')
    unmount()

    setup({ [`GET ${Q}/suggestions`]: { body: [] } })
    renderPage(`${R}&suggest=1`)
    expect(await screen.findByText(/nada que reponer/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el enlace "Solicitar compra" de una orden abre el formulario con su activo y su orden', async () => {
    state.permissions = REQUESTER
    const m = setup({ [`POST ${Q}/requisitions`]: { status: 201, body: detail() } })
    renderPage(`${R}&new=1&forAsset=a1&forWo=w9`)
    const dialog = await lastDialog()
    await userEvent.type(within(dialog).getByLabelText('Justificación'), 'Falta repuesto de la OT')
    const line = within(dialog).getByRole('group', { name: 'Línea 1' })
    await userEvent.type(within(line).getByLabelText('Descripción'), 'Sello')
    await userEvent.type(within(line).getByLabelText('Cantidad'), '1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear requisición' }))
    await waitFor(() => expect(body(m, 'POST', `${Q}/requisitions`)).toMatchObject({ assetId: 'a1', workOrderId: 'w9' }))
  })

  it('si no hay ítems bajo mínimo avisa y no abre el formulario', async () => {
    setup({ [`GET ${Q}/suggestions`]: { body: [] } })
    renderPage(R)
    await userEvent.click(await screen.findByRole('button', { name: /Desde stock bajo mínimo/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('Detalle: acciones según estado, permisos y autoría', () => {
  const open = (r: RequisitionDetail, perms: string[]) => {
    state.permissions = perms
    const m = setup({ [`GET ${Q}/requisitions/r1`]: { body: r } })
    renderPage(`${R}&rq=r1`)
    return m
  }
  const actions = async () => within(await screen.findByRole('group', { name: 'Acciones de la requisición' }))

  it('borrador propio: Enviar, Editar y Cancelar; sin permiso de crear no hay acciones', async () => {
    open(detail(), REQUESTER)
    const a = await actions()
    expect(a.getByRole('button', { name: /Enviar a aprobación/ })).toBeInTheDocument()
    expect(a.getByRole('button', { name: /Editar/ })).toBeInTheDocument()
    expect(a.getByRole('button', { name: /Cancelar requisición/ })).toBeInTheDocument()
  })

  it('borrador ajeno sin aprobar: solo lectura', async () => {
    open(detail({ requestedBy: { id: 'u-other', name: 'Otro' } }), REQUESTER)
    await screen.findByText('Sello mecánico 60 mm')
    expect(screen.queryByRole('group', { name: 'Acciones de la requisición' })).not.toBeInTheDocument()
  })

  it('enviar a aprobación llama a la acción', async () => {
    const m = open(detail(), REQUESTER)
    m.calls.length = 0
    await userEvent.click(await screen.findByRole('button', { name: /Enviar a aprobación/ }))
    await waitFor(() => expect(calls(m, `${Q}/requisitions/r1/submit`, 'POST')).toHaveLength(1))
  })

  it('por aprobar: quien aprueba ve Aprobar/Rechazar; el solicitante no, salvo administrador', async () => {
    const submitted = detail({ status: 'SUBMITTED', requestedBy: { id: 'u-other', name: 'Otro' } })
    const m = open(submitted, BUYER)
    await userEvent.click(await screen.findByRole('button', { name: /Aprobar/ }))
    await waitFor(() => expect(calls(m, `${Q}/requisitions/r1/approve`, 'POST')).toHaveLength(1))
  })

  it('no ofrece aprobar la propia requisición (el servidor también lo impide)', async () => {
    open(detail({ status: 'SUBMITTED' }), BUYER)
    await screen.findByText('Sello mecánico 60 mm')
    expect(screen.queryByRole('button', { name: /^Aprobar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rechazar/ })).not.toBeInTheDocument()
  })

  it('el administrador del ecosistema sí puede aprobar la propia', async () => {
    state.user = { id: 'u-me', isGlobalAdmin: true }
    open(detail({ status: 'SUBMITTED' }), BUYER)
    expect(await screen.findByRole('button', { name: /Aprobar/ })).toBeInTheDocument()
  })

  it('rechazar exige el motivo y lo envía', async () => {
    const m = open(detail({ status: 'SUBMITTED', requestedBy: { id: 'u-other', name: 'Otro' } }), BUYER)
    await userEvent.click(await screen.findByRole('button', { name: /Rechazar/ }))
    const dialog = await lastDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rechazar' }))
    expect(await within(dialog).findByText('Requerido')).toBeInTheDocument()
    expect(calls(m, `${Q}/requisitions/r1/reject`, 'POST')).toHaveLength(0)
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Sin presupuesto')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rechazar' }))
    await waitFor(() => expect(body(m, 'POST', `${Q}/requisitions/r1/reject`)).toEqual({ note: 'Sin presupuesto' }))
  })

  it('una requisición rechazada muestra el motivo y no ofrece acciones', async () => {
    open(detail({ status: 'REJECTED', decisionNote: 'Sin presupuesto' }), BUYER)
    expect(await screen.findByText(/Motivo del rechazo:/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Acciones de la requisición' })).not.toBeInTheDocument()
  })

  it('aprobada: Solicitar cotización valida proveedores y plazo, y envía la fecha en ISO', async () => {
    const m = open(detail({ status: 'APPROVED' }), REQUESTER)
    m.calls.length = 0
    setup()
    state.permissions = REQUESTER
    const m2 = mockApi({
      'GET /plants/revemin-ii': { body: plantDetail() },
      [`GET ${Q}/summary`]: { body: { byStatus: {}, pendingApproval: 0, openRfqs: 0, awaitingReceipt: 0 } },
      [`GET ${Q}/requisitions`]: { body: page([]) },
      [`GET ${Q}/requisitions/r1`]: { body: detail({ status: 'APPROVED' }) },
      'GET /providers': { body: page([{ id: 'p1', organizationName: 'Repuestos Andinos', verified: true, rating: 4.5 }, { id: 'p2', organizationName: 'Otra Industrial', verified: false, rating: null }]) },
      [`POST ${Q}/requisitions/r1/rfq`]: { status: 201, body: detail({ status: 'RFQ', rfq: rfq() }) },
    })
    await userEvent.click(await screen.findByRole('button', { name: /Solicitar cotización/ }))
    const dialog = await lastDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    expect(await within(dialog).findByText('Invita al menos a un proveedor')).toBeInTheDocument()
    expect(calls(m2, `${Q}/requisitions/r1/rfq`, 'POST')).toHaveLength(0)
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Repuestos Andinos/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
    await waitFor(() => {
      const b = body(m2, 'POST', `${Q}/requisitions/r1/rfq`)
      expect(b.providerIds).toEqual(['p1'])
      expect(new Date(b.deadlineAt).toISOString()).toBe(b.deadlineAt)
    })
  })

  it('en cotización: lista cotizaciones y adjudica solo quien aprueba', async () => {
    const r = detail({ status: 'RFQ', rfq: rfq() })
    const m = open(r, BUYER)
    expect(await screen.findByText('Repuestos Andinos', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('USD 1,190.50')).toBeInTheDocument()
    expect(screen.getByText(/Entrega en 8 días · Pago a 30 días/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Adjudicar a Repuestos Andinos' }))
    await waitFor(() => expect(body(m, 'POST', `${Q}/requisitions/r1/award`)).toEqual({ quoteId: 'qt1' }))
  })

  it('quien solo crea no adjudica; el plazo vencido se indica con texto', async () => {
    open(detail({ status: 'RFQ', rfq: rfq({ expired: true }) }), REQUESTER)
    expect(await screen.findByText(/plazo vencido/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Adjudicar/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancelar solicitud de cotización/ })).toBeInTheDocument()
  })

  it('pedida: recepción solo con inventory.move', async () => {
    const ordered = detail({ status: 'ORDERED', rfq: rfq({ status: 'AWARDED' }) })
    const { unmount } = renderOnly(ordered, BUYER)
    await screen.findByText('Sello mecánico 60 mm')
    expect(screen.queryByRole('button', { name: /Registrar recepción/ })).not.toBeInTheDocument()
    unmount()
    renderOnly(ordered, [...BUYER, 'inventory.move'])
    expect(await screen.findByRole('button', { name: /Registrar recepción/ })).toBeInTheDocument()
  })

  function renderOnly(r: RequisitionDetail, perms: string[]) {
    state.permissions = perms
    setup({ [`GET ${Q}/requisitions/r1`]: { body: r } })
    return renderPage(`${R}&rq=r1`)
  }

  it('recepción: exige cantidad, límite y ubicación; envía lo recibido', async () => {
    state.permissions = ['procurement.read', 'inventory.move']
    const m = setup({ [`GET ${Q}/requisitions/r1`]: { body: detail({ status: 'ORDERED', rfq: rfq({ status: 'AWARDED' }) }) }, [`POST ${Q}/requisitions/r1/receive`]: { status: 201, body: detail({ status: 'ORDERED' }) } })
    renderPage(`${R}&rq=r1`)
    await userEvent.click(await screen.findByRole('button', { name: /Registrar recepción/ }))
    const dialog = await lastDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar recepción' }))
    expect(await within(dialog).findByText('Indica la cantidad recibida de al menos una línea')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByLabelText('Cantidad recibida'), '5')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar recepción' }))
    expect(await within(dialog).findByText('Máximo 2 UND')).toBeInTheDocument()

    await userEvent.clear(within(dialog).getByLabelText('Cantidad recibida'))
    await userEvent.type(within(dialog).getByLabelText('Cantidad recibida'), '2')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar recepción' }))
    expect(await within(dialog).findByText('Elige la ubicación de ingreso')).toBeInTheDocument()
    expect(calls(m, `${Q}/requisitions/r1/receive`, 'POST')).toHaveLength(0)

    await userEvent.click(within(dialog).getByRole('combobox', { name: /Ubicación de Sello mecánico/ }))
    expect(screen.queryByRole('option', { name: /E-01/ })).not.toBeInTheDocument() // inactiva
    await userEvent.click(await screen.findByRole('option', { name: /R-A1/ }))
    await userEvent.type(within(dialog).getByLabelText('Costo unitario'), '650')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar recepción' }))
    await waitFor(() => expect(body(m, 'POST', `${Q}/requisitions/r1/receive`)).toEqual({ lines: [{ lineId: 'ln1', quantity: 2, locationId: 'l1', unitCost: 650 }] }))
  })

  it('404 y el historial legible', async () => {
    state.permissions = REQUESTER
    setup({ [`GET ${Q}/requisitions/r1`]: { status: 404, body: { message: 'x' } } })
    const { unmount } = renderPage(`${R}&rq=r1`)
    expect(await screen.findByText(/no existe o no es visible/)).toBeInTheDocument()
    unmount()
    setup({ [`GET ${Q}/requisitions/r1`]: { body: detail({ status: 'SUBMITTED', history: [{ id: 'h2', fromStatus: 'DRAFT', toStatus: 'SUBMITTED', note: null, changedAt: '2026-10-02T10:00:00.000Z', changedBy: 'Marta' }] }) } })
    renderPage(`${R}&rq=r1`)
    expect(await screen.findByText(/Borrador →/)).toBeInTheDocument()
  })
})

describe('Desde otras pantallas', () => {
  it('Inventario enlaza la reposición solo a quien puede crear requisiciones', async () => {
    const { InventoryPage } = await import('./inventory-page')
    state.permissions = ['inventory.read']
    mockApi({ 'GET /plants/revemin-ii': { body: plantDetail() }, 'GET /plants/revemin-ii/inventory/dashboard': { body: dashboard() } })
    const { unmount } = renderWithProviders(
      <Routes>
        <Route path="/plants/:plantSlug" element={<PlantRoute />}>
          <Route path="inventory" element={<InventoryPage />} />
        </Route>
      </Routes>,
      { route: '/plants/revemin-ii/inventory' },
    )
    await screen.findByText('Ítems bajo mínimo')
    expect(screen.queryByRole('link', { name: /Crear requisición de reposición/ })).not.toBeInTheDocument()
    unmount()

    state.permissions = ['inventory.read', 'procurement.create']
    mockApi({ 'GET /plants/revemin-ii': { body: plantDetail() }, 'GET /plants/revemin-ii/inventory/dashboard': { body: dashboard() } })
    renderWithProviders(
      <Routes>
        <Route path="/plants/:plantSlug" element={<PlantRoute />}>
          <Route path="inventory" element={<InventoryPage />} />
        </Route>
      </Routes>,
      { route: '/plants/revemin-ii/inventory' },
    )
    expect(await screen.findByRole('link', { name: /Crear requisición de reposición/ })).toHaveAttribute('href', '/plants/revemin-ii/maintenance?tab=requisitions&suggest=1')
  })
})

describe('Panel de cotizaciones del proveedor', () => {
  const PR: ProviderRfq = {
    id: 'f1',
    code: 'RFQ-2026-00001',
    status: 'OPEN',
    deadlineAt: '2026-10-20T15:00:00.000Z',
    acceptsQuotes: true,
    priority: 'HIGH',
    neededBy: '2026-11-01',
    plant: { name: 'REVEMIN II', countryCode: 'PE' },
    lines: [{ id: 'l1', description: 'Sello mecánico 60 mm', quantity: 2, uom: 'UND' }],
    myQuote: null,
  }
  const mount = (rfqs: ProviderRfq[], extra: Record<string, Reply> = {}) => {
    const m = mockApi({ 'GET /providers/p1/rfqs': { body: rfqs }, ...extra })
    renderWithProviders(<ProviderRfqsPanel providerId="p1" />)
    return m
  }

  it('muestra solo lo necesario para cotizar', async () => {
    mount([PR])
    expect(await screen.findByText('RFQ-2026-00001')).toBeInTheDocument()
    expect(screen.getByText(/REVEMIN II · prioridad alta/)).toBeInTheDocument()
    expect(screen.getByText(/Sello mecánico 60 mm — 2 UND/)).toBeInTheDocument()
  })

  it('valida y envía la cotización con monto, días y condiciones', async () => {
    const m = mount([PR], { 'POST /providers/p1/rfqs/f1/quote': { status: 201, body: { ...PR, myQuote: { id: 'q', currency: 'USD', totalAmount: 250, deliveryDays: 10, conditions: null, status: 'SUBMITTED' } } } })
    const form = await screen.findByRole('form', { name: 'Cotizar RFQ-2026-00001' })
    await userEvent.click(within(form).getByRole('button', { name: 'Enviar cotización' }))
    expect(await within(form).findByText('Indica un monto mayor que cero')).toBeInTheDocument()
    expect(within(form).getByText('Días enteros (0 o más)')).toBeInTheDocument()
    expect(calls(m, '/providers/p1/rfqs/f1/quote', 'POST')).toHaveLength(0)
    await userEvent.type(within(form).getByLabelText('Monto total'), '250')
    await userEvent.type(within(form).getByLabelText('Días de entrega'), '10')
    await userEvent.type(within(form).getByLabelText('Condiciones'), 'Pago a 30 días')
    await userEvent.click(within(form).getByRole('button', { name: 'Enviar cotización' }))
    await waitFor(() => expect(body(m, 'POST', '/providers/p1/rfqs/f1/quote')).toEqual({ currency: 'USD', totalAmount: 250, deliveryDays: 10, conditions: 'Pago a 30 días' }))
  })

  it('con cotización vigente permite actualizar y retirar; el servidor puede rechazar (plazo vencido)', async () => {
    const mine = { ...PR, myQuote: { id: 'q', currency: 'PEN', totalAmount: 900, deliveryDays: 5, conditions: null, status: 'SUBMITTED' as const } }
    const m = mount([mine], { 'DELETE /providers/p1/rfqs/f1/quote': { body: { ...PR } }, 'POST /providers/p1/rfqs/f1/quote': { status: 409, body: { message: 'Venció el plazo para cotizar' } } })
    const form = await screen.findByRole('form', { name: 'Cotizar RFQ-2026-00001' })
    expect(within(form).getByLabelText('Monto total')).toHaveValue(900)
    await userEvent.click(within(form).getByRole('button', { name: 'Actualizar cotización' }))
    expect(await within(form).findByText('Venció el plazo para cotizar')).toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: 'Retirar cotización' }))
    await waitFor(() => expect(calls(m, '/providers/p1/rfqs/f1/quote', 'DELETE')).toHaveLength(1))
  })

  it('RFQ cerrada o vencida: sin formulario, y se informa el resultado', async () => {
    mount([
      { ...PR, id: 'f2', code: 'RFQ-2026-00002', status: 'AWARDED', acceptsQuotes: false, myQuote: { id: 'q', currency: 'USD', totalAmount: 1190.5, deliveryDays: 8, conditions: null, status: 'AWARDED' } },
      { ...PR, id: 'f3', code: 'RFQ-2026-00003', acceptsQuotes: false },
    ])
    expect(await screen.findByText('Mi cotización: Adjudicada')).toBeInTheDocument()
    expect(screen.getByText('USD 1,190.50')).toBeInTheDocument()
    expect(screen.getByText(/plazo vencido/)).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('sin solicitudes: estado vacío', async () => {
    mount([])
    expect(await screen.findByText('Aún no recibes solicitudes')).toBeInTheDocument()
  })
})
