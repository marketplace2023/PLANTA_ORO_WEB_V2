import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkOrderCost } from '@/features/maintenance/use-maintenance'
import { asset, page, plantDetail } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { ASSIGNEES, dashboard, plan, wo, woDetail } from '@/test/maintenance-fixtures'
import { renderWithProviders } from '@/test/render'
import { MaintenancePage } from './maintenance-page'
import { PlantRoute } from './plant-route'

const state = vi.hoisted(() => ({ permissions: [] as string[], userId: 'u-me' as string | undefined }))
vi.mock('@/features/plant/plant-context', () => ({ usePlant: () => ({ permissions: state.permissions, currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }) }))
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: state.userId ? { id: state.userId } : null }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const M = '/plants/revemin-ii/maintenance'
const B = '/plants/revemin-ii/budgets'
type Reply = { status?: number; body?: unknown }

const LABOR_COST: WorkOrderCost = { id: 'c1', kind: 'LABOR', description: 'Mecánico', resource: { id: 'r1', code: 'LAB-MEC', unit: 'HH' }, quantity: 6, unitCost: 4.5, lineCost: 27, createdAt: '2026-10-02T15:00:00.000Z', createdBy: 'Tomás Técnico' }
const SERVICE_COST: WorkOrderCost = { id: 'c2', kind: 'SERVICE', description: 'Alineación láser', resource: null, quantity: 1, unitCost: 350, lineCost: 350, createdAt: '2026-10-02T16:00:00.000Z', createdBy: null }
const running = (over: object = {}) => woDetail({ status: 'IN_PROGRESS', assignedTo: { id: 'u-tech', name: 'Tomás Técnico' }, nextStatuses: ['ON_HOLD', 'COMPLETED'], ...over })

function setup(order: object, routes: Record<string, Reply> = {}) {
  return mockApi({
    'GET /plants/revemin-ii': { body: plantDetail() },
    [`GET ${M}/dashboard`]: { body: dashboard() },
    [`GET ${M}/work-orders`]: { body: page([wo()]) },
    [`GET ${M}/work-orders/w1`]: { body: order },
    [`GET ${M}/assignees`]: { body: ASSIGNEES },
    [`GET ${M}/plans`]: { body: page([plan()]) },
    'GET /plants/revemin-ii/assets': { body: page([asset()]) },
    ...routes,
  })
}
type Mock = ReturnType<typeof setup>
const calls = (m: Mock, path: string, method = 'GET') => m.calls.filter((c) => c.method === method && c.path === path)
const body = (m: Mock, method: string, path: string) => JSON.parse(calls(m, path, method).at(-1)!.init.body as string)

const renderOrder = () =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="maintenance" element={<MaintenancePage />} />
      </Route>
    </Routes>,
    { route: `${M}?tab=orders&wo=w1` },
  )
const openSheet = async () => {
  renderOrder()
  const sheet = await screen.findByRole('dialog')
  await within(sheet).findByRole('heading', { name: 'Mano de obra, equipos y servicios' })
  return sheet
}

const READ = ['maintenance.read']
const LEAD = ['maintenance.read', 'maintenance.create', 'maintenance.update', 'maintenance.close']

describe('Costos de la orden de trabajo (hoja de la OT)', () => {
  beforeEach(() => {
    state.permissions = READ
    state.userId = 'u-me'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('lista cada costo con su tipo, recurso del libro de precios, cantidad × costo unitario y total de la línea', async () => {
    setup(running({ costs: [LABOR_COST, SERVICE_COST], otherCost: 377, partsCost: 100, totalCost: 477 }))
    const sheet = await openSheet()
    const labor = within(sheet).getByText('Mecánico').closest('tr') as HTMLElement
    expect(within(labor).getByText(/Mano de obra/)).toBeInTheDocument()
    expect(within(labor).getByRole('link', { name: 'LAB-MEC' })).toHaveAttribute('href', `${B}?tab=resources&search=LAB-MEC`)
    expect(within(labor).getByText('6 HH × USD 4.50')).toBeInTheDocument()
    expect(within(labor).getByText('USD 27.00')).toBeInTheDocument()
    const service = within(sheet).getByText('Alineación láser').closest('tr') as HTMLElement
    expect(within(service).getByText('Servicio externo')).toBeInTheDocument()
    expect(within(service).queryByRole('link')).not.toBeInTheDocument() // costo manual: sin recurso
    expect(within(service).getByText('1 × USD 350.00')).toBeInTheDocument()
  })

  it('el resumen separa repuestos, mano de obra/equipos/servicios y el costo total de la orden', async () => {
    setup(running({ costs: [LABOR_COST, SERVICE_COST], otherCost: 377, partsCost: 100, totalCost: 477 }))
    const sheet = await openSheet()
    const section = within(sheet).getByRole('heading', { name: 'Mano de obra, equipos y servicios' }).closest('section') as HTMLElement
    const summary = within(section).getByText('Costo total de la orden').closest('dl') as HTMLElement
    expect(within(summary).getByText('Repuestos').nextSibling).toHaveTextContent('USD 100.00')
    expect(within(summary).getByText('Mano de obra, equipos y servicios').nextSibling).toHaveTextContent('USD 377.00')
    expect(within(summary).getByText('Costo total de la orden').nextSibling).toHaveTextContent('USD 477.00')
  })

  it('sin costos lo dice', async () => {
    setup(running())
    const sheet = await openSheet()
    expect(within(sheet).getByText('Esta orden no tiene costos registrados además de los repuestos.')).toBeInTheDocument()
  })

  describe('quién puede registrar', () => {
    it('solo lectura (ni responsable ni maintenance.update): sin botón de registrar ni de quitar', async () => {
      setup(running({ costs: [LABOR_COST], otherCost: 27, totalCost: 27 }))
      const sheet = await openSheet()
      expect(within(sheet).queryByRole('button', { name: /Registrar costo|Quitar costo/ })).not.toBeInTheDocument()
    })

    it('quien edita la orden y el responsable sí', async () => {
      state.permissions = LEAD
      setup(running())
      const { unmount } = renderOrder()
      expect(await screen.findByRole('button', { name: /Registrar costo/ })).toBeInTheDocument()
      unmount()

      state.permissions = READ
      state.userId = 'u-tech' // responsable de la orden, con solo lectura de mantenimiento
      setup(running())
      renderOrder()
      expect(await screen.findByRole('button', { name: /Registrar costo/ })).toBeInTheDocument()
    })

    it.each(['REQUESTED', 'PLANNED', 'ASSIGNED', 'CLOSED', 'CANCELLED'] as const)('con la orden en estado %s no se registran ni se quitan costos', async (status) => {
      state.permissions = LEAD
      setup(woDetail({ status, nextStatuses: [], costs: [LABOR_COST], otherCost: 27, totalCost: 27 }))
      const sheet = await openSheet()
      expect(within(sheet).queryByRole('button', { name: /Registrar costo|Quitar costo/ })).not.toBeInTheDocument()
    })

    it.each(['IN_PROGRESS', 'ON_HOLD', 'COMPLETED'] as const)('con la orden en estado %s sí', async (status) => {
      state.permissions = LEAD
      setup(woDetail({ status, nextStatuses: [] }))
      const sheet = await openSheet()
      expect(within(sheet).getByRole('button', { name: /Registrar costo/ })).toBeInTheDocument()
    })
  })

  describe('registrar un costo', () => {
    it('costo manual: envía tipo, cantidad, costo unitario y descripción; sin acceso a Presupuestos no hay selector de recurso', async () => {
      state.permissions = LEAD
      const m = setup(running(), { [`POST ${M}/work-orders/w1/costs`]: { status: 201, body: { costs: [SERVICE_COST], otherCost: 350 } } })
      const sheet = await openSheet()
      await userEvent.click(within(sheet).getByRole('button', { name: /Registrar costo/ }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      expect(within(dialog).queryByRole('combobox', { name: 'Recurso del libro de precios' })).not.toBeInTheDocument()

      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Tipo de costo' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Servicio externo' }))
      await userEvent.type(within(dialog).getByLabelText('Descripción'), 'Alineación láser')
      await userEvent.type(within(dialog).getByLabelText(/Cantidad/), '2')
      await userEvent.type(within(dialog).getByLabelText(/Costo unitario/), '150.5')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar costo' }))
      await waitFor(() => expect(body(m, 'POST', `${M}/work-orders/w1/costs`)).toEqual({ kind: 'SERVICE', quantity: 2, unitCost: 150.5, description: 'Alineación láser' }))
    })

    it('valida en el cliente: el tipo y la cantidad son obligatorios y no llama al servidor', async () => {
      state.permissions = LEAD
      const m = setup(running())
      const sheet = await openSheet()
      await userEvent.click(within(sheet).getByRole('button', { name: /Registrar costo/ }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar costo' }))
      expect(await within(dialog).findAllByText('Requerido')).toHaveLength(2)
      expect(calls(m, `${M}/work-orders/w1/costs`, 'POST')).toHaveLength(0)
    })

    it('con acceso a Presupuestos: elige un recurso del libro de precios y NO envía costo unitario', async () => {
      state.permissions = [...LEAD, 'budget.read']
      const resource = (id: string, code: string, name: string, resourceType: string, unitPrice: number, currency: string, unit: string) => ({ id, code, name, resourceType, unitPrice, currency, unit, status: 'ACTIVE' })
      const m = setup(running(), {
        [`GET ${B}/resources`]: {
          body: {
            items: [resource('r1', 'LAB-MEC', 'Mecánico', 'LABOR', 4.5, 'USD', 'HH'), resource('r2', 'EQ-GRUA', 'Grúa 20 t', 'EQUIPMENT', 100, 'PEN', 'HM'), resource('r3', 'MAT-CEM', 'Cemento', 'MATERIAL', 9.5, 'USD', 'BOL')],
            total: 3,
            page: 1,
            pageSize: 100,
            baseCurrency: 'USD',
          },
        },
        [`POST ${M}/work-orders/w1/costs`]: { status: 201, body: { costs: [LABOR_COST], otherCost: 27 } },
      })
      const sheet = await openSheet()
      await userEvent.click(within(sheet).getByRole('button', { name: /Registrar costo/ }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!

      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Tipo de costo' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Mano de obra' }))
      await userEvent.type(within(dialog).getByLabelText(/Costo unitario/), '99') // lo escrito antes de elegir recurso no se envía: manda el libro de precios
      await userEvent.click(await within(dialog).findByRole('combobox', { name: 'Recurso del libro de precios' }))
      expect(screen.queryByRole('option', { name: /MAT-CEM/ })).not.toBeInTheDocument() // los materiales salen del inventario, no de aquí
      expect(screen.getByRole('option', { name: /EQ-GRUA.*PEN 100\.00\/HM/ })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('option', { name: /LAB-MEC.*USD 4\.50\/HH/ }))
      await userEvent.type(within(dialog).getByLabelText(/Cantidad/), '6')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar costo' }))
      await waitFor(() => expect(body(m, 'POST', `${M}/work-orders/w1/costs`)).toEqual({ kind: 'LABOR', quantity: 6, resourceId: 'r1' }))
    })

    it('un 409 del servidor (p. ej. falta el tipo de cambio) se muestra en el diálogo y este sigue abierto', async () => {
      state.permissions = LEAD
      setup(running(), { [`POST ${M}/work-orders/w1/costs`]: { status: 409, body: { message: 'Falta el tipo de cambio de EUR: cárgalo en Presupuestos antes de usar este recurso' } } })
      const sheet = await openSheet()
      await userEvent.click(within(sheet).getByRole('button', { name: /Registrar costo/ }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Tipo de costo' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Otro' }))
      await userEvent.type(within(dialog).getByLabelText('Descripción'), 'Varios')
      await userEvent.type(within(dialog).getByLabelText(/Cantidad/), '1')
      await userEvent.type(within(dialog).getByLabelText(/Costo unitario/), '5')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar costo' }))
      expect(await within(dialog).findByText(/Falta el tipo de cambio de EUR/)).toBeInTheDocument()
      expect(dialog).toBeInTheDocument() // sigue abierto: se puede corregir y reintentar
      expect(within(dialog).getByRole('button', { name: 'Registrar costo' })).toBeEnabled()
    })

    it('un 400 del servidor se muestra bajo el campo correspondiente', async () => {
      state.permissions = LEAD
      setup(running(), { [`POST ${M}/work-orders/w1/costs`]: { status: 400, body: { message: 'Solicitud inválida', errors: [{ path: 'unitCost', message: 'Máximo 4 decimales' }] } } })
      const sheet = await openSheet()
      await userEvent.click(within(sheet).getByRole('button', { name: /Registrar costo/ }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Tipo de costo' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Servicio externo' }))
      await userEvent.type(within(dialog).getByLabelText('Descripción'), 'X')
      await userEvent.type(within(dialog).getByLabelText(/Cantidad/), '1')
      await userEvent.type(within(dialog).getByLabelText(/Costo unitario/), '1.23456')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar costo' }))
      expect(await within(dialog).findByText('Máximo 4 decimales')).toBeInTheDocument()
    })
  })

  it('quitar un costo llama al servidor', async () => {
    state.permissions = LEAD
    const m = setup(running({ costs: [LABOR_COST], otherCost: 27, totalCost: 27 }), { [`DELETE ${M}/work-orders/w1/costs/c1`]: { body: { costs: [], otherCost: 0 } } })
    const sheet = await openSheet()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Quitar costo Mecánico' }))
    await waitFor(() => expect(calls(m, `${M}/work-orders/w1/costs/c1`, 'DELETE')).toHaveLength(1))
  })
})
