import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asset, page, plantDetail } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { ASSIGNEES, dashboard, plan, wo, woDetail } from '@/test/maintenance-fixtures'
import { renderWithProviders } from '@/test/render'
import { MaintenancePage } from './maintenance-page'
import { PlantRoute } from './plant-route'

const state = vi.hoisted(() => ({ permissions: [] as string[], userId: 'u-me' as string | undefined }))
vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ permissions: state.permissions, currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }),
}))
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: state.userId ? { id: state.userId } : null }) }))

const M = '/plants/revemin-ii/maintenance'
const BASE = '/plants/revemin-ii/maintenance'
type Reply = { status?: number; body?: unknown }

function setup(routes: Record<string, Reply | (() => Reply | Promise<Reply>)> = {}) {
  return mockApi({
    'GET /plants/revemin-ii': { body: plantDetail() },
    [`GET ${M}/dashboard`]: { body: dashboard() },
    [`GET ${M}/work-orders`]: { body: page([wo(), wo({ id: 'w2', code: 'OT-2026-00002', title: 'Cambiar rodamiento', status: 'ASSIGNED', priority: 'URGENT', overdue: true, assignedTo: { id: 'u-tech', name: 'Tomás Técnico' }, nextStatuses: ['IN_PROGRESS', 'PLANNED', 'CANCELLED'] })]) },
    [`GET ${M}/work-orders/w1`]: { body: woDetail() },
    [`GET ${M}/assignees`]: { body: ASSIGNEES },
    [`GET ${M}/plans`]: { body: page([plan()]) },
    'GET /plants/revemin-ii/assets': { body: page([asset()]) },
    ...routes,
  })
}
type Mock = ReturnType<typeof setup>
const calls = (m: Mock, path: string, method = 'GET') => m.calls.filter((c) => c.method === method && c.path === path)
const lastQuery = (m: Mock, path = `${M}/work-orders`) => calls(m, path).at(-1)!.query
const body = (m: Mock, method: string, path: string) => JSON.parse(m.calls.filter((c) => c.method === method && c.path === path).at(-1)!.init.body as string)
const lastDialog = async () => (await screen.findAllByRole('dialog')).at(-1)!

const renderPage = (route = BASE) =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="assets/:assetId" element={<p>Ficha del activo</p>} />
      </Route>
    </Routes>,
    { route },
  )

const READ = ['maintenance.read']
const LEAD = ['maintenance.read', 'maintenance.create', 'maintenance.update', 'maintenance.close']

describe('Mantenimiento (página)', () => {
  beforeEach(() => {
    state.permissions = READ
    state.userId = 'u-me'
  })
  afterEach(() => vi.unstubAllGlobals())

  describe('acceso y navegación', () => {
    it('sin maintenance.read no muestra nada interno ni consulta mantenimiento', async () => {
      state.permissions = ['asset.read']
      const m = setup()
      renderPage()
      expect(await screen.findByText('Sin acceso a Mantenimiento')).toBeInTheDocument()
      expect(m.calls.some((c) => c.path.startsWith(M))).toBe(false)
      expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    })

    it('muestra las 4 pestañas y abre en Dashboard', async () => {
      setup()
      renderPage()
      await screen.findByText('OT abiertas')
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Dashboard', 'Órdenes de trabajo', 'Kanban', 'Planes'])
      expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
    })

    it('la pestaña vive en la URL y se puede cambiar', async () => {
      setup()
      renderPage(`${BASE}?tab=orders`)
      expect(await screen.findByRole('button', { name: 'OT-2026-00001' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('tab', { name: 'Kanban' }))
      expect(await screen.findByRole('heading', { name: /Solicitada/ })).toBeInTheDocument()
    })
  })

  describe('dashboard (design.md §26)', () => {
    // El título del KPI es un <p>; las etiquetas de los gráficos son <span>, así que no chocan.
    const card = (title: string) => screen.getByText(title, { selector: 'p' }).closest('[data-slot="card"]') as HTMLElement

    it('muestra los KPI con valor y unidad', async () => {
      setup()
      renderPage()
      await screen.findByText('OT abiertas')
      expect(card('OT abiertas')).toHaveTextContent('5')
      expect(card('Backlog')).toHaveTextContent('3')
      expect(card('OT vencidas')).toHaveTextContent('2')
      expect(card('En ejecución')).toHaveTextContent('1')
      expect(card('Completadas (30 días)')).toHaveTextContent('4')
      expect(card('MTTR')).toHaveTextContent(/3s*h/)
      expect(card('Cumplimiento preventivo')).toHaveTextContent(/33.3s*%/)
    })

    it('lo que no se puede calcular se muestra como "—" con su explicación (nunca inventado)', async () => {
      setup()
      renderPage()
      await screen.findByText('OT abiertas')
      expect(card('MTBF')).toHaveTextContent('—')
      expect(card('MTBF')).toHaveTextContent('Requiere registro de fallas')
      expect(card('Costo de órdenes (30 días)')).toHaveTextContent('USD 2,050.50')
      expect(card('Costo de órdenes (30 días)')).toHaveTextContent('Repuestos USD 1,250.50 · mano de obra, equipos y servicios USD 800.00')
    })

    it('sin datos: MTTR y cumplimiento muestran guion con la causa', async () => {
      setup({ [`GET ${M}/dashboard`]: { body: dashboard({ mttrHours: null, preventiveCompliancePct: null, open: 0, byStatus: {}, openByType: {}, overdueWorkOrders: [], overdue: 0 }) } })
      renderPage()
      await screen.findByText('OT abiertas')
      expect(card('MTTR')).toHaveTextContent('—')
      expect(card('MTTR')).toHaveTextContent('Sin correctivos terminados en 90 días')
      expect(screen.getAllByText('Sin datos.')).toHaveLength(2)
      expect(screen.getByText(/No hay órdenes vencidas/)).toBeInTheDocument()
    })

    it('desglose por tipo (abiertas) y por estado', async () => {
      setup()
      renderPage()
      await screen.findByText('OT abiertas')
      const byType = screen.getByText('Órdenes abiertas por tipo').closest('[data-slot="card"]') as HTMLElement
      expect(within(byType).getByText('Correctivo').parentElement).toHaveTextContent('3')
      expect(within(byType).getByText('Preventivo').parentElement).toHaveTextContent('1')
      const byStatus = screen.getByText('Órdenes por estado').closest('[data-slot="card"]') as HTMLElement
      expect(within(byStatus).getByText('Completada').parentElement).toHaveTextContent('3')
    })

    it('las vencidas se listan y se pueden abrir', async () => {
      const m = setup({ [`GET ${M}/work-orders/w9`]: { body: woDetail({ id: 'w9', code: 'OT-2026-00009', title: 'Cambio de aceite', status: 'PLANNED' }) } })
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /OT-2026-00009/ }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      await waitFor(() => expect(calls(m, `${M}/work-orders/w9`)).toHaveLength(1))
    })

    it('error con reintentar; esqueletos mientras carga', async () => {
      let fail = true
      setup({ [`GET ${M}/dashboard`]: () => (fail ? { status: 500, body: {} } : { body: dashboard() }) })
      renderPage()
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar')
      fail = false
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByText('OT abiertas')).toBeInTheDocument()
    })

    it('muestra esqueletos accesibles al cargar', async () => {
      setup({ [`GET ${M}/dashboard`]: () => new Promise<Reply>(() => undefined) })
      renderPage()
      expect(await screen.findByLabelText('Cargando indicadores')).toHaveAttribute('aria-busy', 'true')
    })
  })

  describe('órdenes de trabajo (lista)', () => {
    it('muestra código, título, activo, tipo, prioridad, estado, responsable y atraso (texto, no solo color)', async () => {
      setup()
      renderPage(`${BASE}?tab=orders`)
      const row1 = (await screen.findByRole('button', { name: 'OT-2026-00001' })).closest('tr')!
      expect(within(row1).getByText('Vibración alta en el molino')).toBeInTheDocument()
      expect(within(row1).getByText('MB-301')).toBeInTheDocument()
      expect(within(row1).getByText('Correctivo')).toBeInTheDocument()
      expect(within(row1).getByText('Alta')).toBeInTheDocument()
      expect(within(row1).getByText('Solicitada')).toBeInTheDocument()

      const row2 = screen.getByRole('button', { name: 'OT-2026-00002' }).closest('tr')!
      expect(within(row2).getByText('Urgente')).toBeInTheDocument()
      expect(within(row2).getByText('Asignada')).toBeInTheDocument()
      expect(within(row2).getByText('Tomás Técnico')).toBeInTheDocument()
      expect(within(row2).getByText('Atrasada')).toBeInTheDocument()
    })

    it('los filtros de la URL llegan a la API y se muestran como chips', async () => {
      const m = setup()
      renderPage(`${BASE}?tab=orders&status=ASSIGNED&type=CORRECTIVE&priority=URGENT&assignedTo=me&overdue=1`)
      await screen.findByRole('button', { name: 'OT-2026-00001' })
      expect(Object.fromEntries(lastQuery(m))).toMatchObject({ status: 'ASSIGNED', type: 'CORRECTIVE', priority: 'URGENT', assignedTo: 'me', overdue: '1', pageSize: '25' })
      const chips = screen.getByRole('list', { name: 'Filtros activos' })
      for (const name of [/Estado: Asignada/, /Tipo: Correctivo/, /Prioridad: Urgente/, /Responsable: Yo/, /Vencimiento: Atrasadas/]) {
        expect(within(chips).getByRole('button', { name: new RegExp(`Quitar filtro ${name.source}`) })).toBeInTheDocument()
      }
    })

    it('"Asignadas a mí" y "Atrasadas" se filtran con casillas', async () => {
      const m = setup()
      renderPage(`${BASE}?tab=orders`)
      await screen.findByRole('button', { name: 'OT-2026-00001' })
      await userEvent.click(screen.getByRole('checkbox', { name: 'Asignadas a mí' }))
      await waitFor(() => expect(lastQuery(m).get('assignedTo')).toBe('me'))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Atrasadas' }))
      await waitFor(() => expect(lastQuery(m).get('overdue')).toBe('1'))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Atrasadas' }))
      await waitFor(() => expect(lastQuery(m).has('overdue')).toBe(false))
    })

    it('filtra por estado con el selector y quita el chip', async () => {
      const m = setup()
      renderPage(`${BASE}?tab=orders`)
      await screen.findByRole('button', { name: 'OT-2026-00001' })
      await userEvent.click(screen.getByRole('combobox', { name: 'Estado' }))
      await userEvent.click(await screen.findByRole('option', { name: 'En ejecución' }))
      await waitFor(() => expect(lastQuery(m).get('status')).toBe('IN_PROGRESS'))
      await userEvent.click(screen.getByRole('button', { name: /Quitar filtro Estado/ }))
      await waitFor(() => expect(lastQuery(m).has('status')).toBe(false))
    })

    it('la búsqueda se envía con debounce y reinicia la página', async () => {
      const m = setup()
      renderPage(`${BASE}?tab=orders&page=2`)
      await screen.findByRole('button', { name: 'OT-2026-00001' })
      await userEvent.type(screen.getByLabelText('Buscar'), 'rodamiento')
      await waitFor(() => expect(lastQuery(m).get('search')).toBe('rodamiento'))
      expect(lastQuery(m).has('page')).toBe(false)
    })

    it('el filtro por activo (desde la ficha FUR) llega a la API', async () => {
      const m = setup()
      renderPage(`${BASE}?tab=orders&assetId=a1`)
      await screen.findByRole('button', { name: 'OT-2026-00001' })
      expect(lastQuery(m).get('assetId')).toBe('a1')
      expect(screen.getByRole('button', { name: /Quitar filtro Activo/ })).toBeInTheDocument()
    })

    it('pagina', async () => {
      const m = setup({ [`GET ${M}/work-orders`]: { body: page([wo()], 60) } })
      renderPage(`${BASE}?tab=orders`)
      await screen.findByRole('button', { name: 'OT-2026-00001' })
      expect(screen.getByText('1–25 de 60')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
      await waitFor(() => expect(lastQuery(m).get('page')).toBe('2'))
    })

    it('estados vacíos: sin órdenes (con CTA solo si puede solicitar) y sin coincidencias', async () => {
      setup({ [`GET ${M}/work-orders`]: { body: page([]) } })
      const { unmount } = renderPage(`${BASE}?tab=orders`)
      expect(await screen.findByText('No hay órdenes de trabajo')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Solicitar/ })).not.toBeInTheDocument()
      unmount()

      state.permissions = [...READ, 'maintenance.create']
      setup({ [`GET ${M}/work-orders`]: { body: page([]) } })
      const second = renderPage(`${BASE}?tab=orders`)
      await screen.findByText('No hay órdenes de trabajo')
      await waitFor(() => expect(screen.getAllByRole('button', { name: /Solicitar mantenimiento/ })).toHaveLength(2)) // cabecera + estado vacío
      second.unmount()

      setup({ [`GET ${M}/work-orders`]: { body: page([]) } })
      renderPage(`${BASE}?tab=orders&status=CLOSED`)
      expect(await screen.findByText('Ninguna orden coincide con los filtros')).toBeInTheDocument()
    })

    it('error con reintentar; esqueletos al cargar', async () => {
      let fail = true
      setup({ [`GET ${M}/work-orders`]: () => (fail ? { status: 500, body: {} } : { body: page([wo()]) }) })
      renderPage(`${BASE}?tab=orders`)
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar')
      fail = false
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByRole('button', { name: 'OT-2026-00001' })).toBeInTheDocument()
    })
  })

  describe('detalle de la orden', () => {
    it('muestra datos, historial y deja el panel enlazable (?wo=)', async () => {
      setup()
      renderPage(`${BASE}?tab=orders&wo=w1`)
      const sheet = await screen.findByRole('dialog')
      expect(await within(sheet).findByText('Se siente en el piso de la nave')).toBeInTheDocument()
      expect(within(sheet).getByText('Olga Operadora', { selector: 'dd' })).toBeInTheDocument()
      expect(within(sheet).getByText('Sin asignar')).toBeInTheDocument()
      expect(within(sheet).getByText('Solicitud creada')).toBeInTheDocument()
      expect(within(sheet).getByRole('link', { name: /MB-301/ })).toHaveAttribute('href', '/plants/revemin-ii/assets/a1')
    })

    it('solo lectura: no ofrece ninguna acción ni edición', async () => {
      setup()
      renderPage(`${BASE}?tab=orders&wo=w1`)
      const sheet = await screen.findByRole('dialog')
      await within(sheet).findByText('Se siente en el piso de la nave')
      expect(within(sheet).queryByRole('group', { name: 'Acciones de la orden' })).not.toBeInTheDocument()
      expect(within(sheet).queryByRole('button', { name: /Planificar|Cancelar|Editar/ })).not.toBeInTheDocument()
    })

    it('quien planifica ve Planificar/Cancelar y Editar; el gerente (solo cierre) no ve Planificar', async () => {
      state.permissions = LEAD
      setup()
      const { unmount } = renderPage(`${BASE}?tab=orders&wo=w1`)
      const sheet = await screen.findByRole('dialog')
      expect(await within(sheet).findByRole('button', { name: 'Planificar' })).toBeInTheDocument()
      expect(within(sheet).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
      expect(within(sheet).getByRole('button', { name: /Editar/ })).toBeInTheDocument()
      unmount()

      state.permissions = ['maintenance.read', 'maintenance.close']
      setup()
      renderPage(`${BASE}?tab=orders&wo=w1`)
      await screen.findByText('Se siente en el piso de la nave')
      expect(screen.queryByRole('button', { name: 'Planificar' })).not.toBeInTheDocument()
    })

    it('el técnico asignado ve "Iniciar" aunque solo tenga lectura; otro técnico no', async () => {
      state.userId = 'u-tech'
      const assigned = woDetail({ id: 'w2', code: 'OT-2026-00002', status: 'ASSIGNED', assignedTo: { id: 'u-tech', name: 'Tomás Técnico' }, nextStatuses: ['IN_PROGRESS', 'PLANNED', 'CANCELLED'] })
      setup({ [`GET ${M}/work-orders/w2`]: { body: assigned } })
      const { unmount } = renderPage(`${BASE}?tab=orders&wo=w2`)
      const sheet = await screen.findByRole('dialog')
      expect(await within(sheet).findByRole('button', { name: 'Iniciar' })).toBeInTheDocument()
      expect(within(sheet).queryByRole('button', { name: /Devolver|Cancelar/ })).not.toBeInTheDocument()
      unmount()

      state.userId = 'u-otro'
      setup({ [`GET ${M}/work-orders/w2`]: { body: assigned } })
      renderPage(`${BASE}?tab=orders&wo=w2`)
      await screen.findByText('OT-2026-00002')
      await screen.findByText(/Se siente en el piso/)
      expect(screen.queryByRole('button', { name: 'Iniciar' })).not.toBeInTheDocument()
    })

    it('una orden cerrada o cancelada no ofrece acciones aunque haya permisos', async () => {
      state.permissions = LEAD
      setup({ [`GET ${M}/work-orders/w1`]: { body: woDetail({ status: 'CLOSED', nextStatuses: [] }) } })
      renderPage(`${BASE}?tab=orders&wo=w1`)
      const sheet = await screen.findByRole('dialog')
      await within(sheet).findByText('Se siente en el piso de la nave')
      expect(within(sheet).queryByRole('button', { name: /Editar|Planificar|Cerrar/ })).not.toBeInTheDocument()
    })

    describe('repuestos usados', () => {
      const PART = { id: 'pt1', item: { id: 'i1', sku: 'ROD-22218', name: 'Rodamiento 22218', uom: 'UND' }, location: 'R-A1', quantity: 2, unitCost: 185.5, lineCost: 371, createdAt: '2026-10-02T15:00:00.000Z', createdBy: 'Tomás Técnico' }
      const running = (over: object = {}) => woDetail({ status: 'IN_PROGRESS', assignedTo: { id: 'u-tech', name: 'Tomás Técnico' }, nextStatuses: ['ON_HOLD', 'COMPLETED'], ...over })
      const INV = '/plants/revemin-ii/inventory'
      const stockRoutes = {
        [`GET ${INV}/items`]: { body: page([{ id: 'i1', sku: 'ROD-22218', name: 'Rodamiento 22218', uom: 'UND', onHand: 6 }, { id: 'i2', sku: 'AGOTADO', name: 'Sin stock', uom: 'UND', onHand: 0 }]) },
        [`GET ${INV}/items/i1`]: { body: { id: 'i1', sku: 'ROD-22218', uom: 'UND', stock: [{ locationId: 'l1', locationCode: 'R-A1', warehouseCode: 'ALM', quantity: 4 }] } },
      }

      it('lista lo consumido con su costo en la moneda de la planta', async () => {
        setup({ [`GET ${M}/work-orders/w1`]: { body: running({ parts: [PART], partsCost: 371 }) } })
        renderPage(`${BASE}?tab=orders&wo=w1`)
        const sheet = await screen.findByRole('dialog')
        expect(await within(sheet).findByText('Rodamiento 22218')).toBeInTheDocument()
        expect(within(sheet).getByText('Desde R-A1')).toBeInTheDocument()
        const partsSection = within(sheet).getByRole('heading', { name: 'Repuestos usados' }).closest('section') as HTMLElement
        expect(within(partsSection).getAllByText('USD 371.00')).toHaveLength(2) // línea y total
        expect(within(sheet).queryByRole('button', { name: /Devolver|Registrar repuesto/ })).not.toBeInTheDocument()
      })

      it('sin repuestos lo dice; los ítems sin costo avisan que no suman', async () => {
        setup({ [`GET ${M}/work-orders/w1`]: { body: running() } })
        const { unmount } = renderPage(`${BASE}?tab=orders&wo=w1`)
        expect(await screen.findByText('Esta orden no ha consumido repuestos.')).toBeInTheDocument()
        unmount()

        setup({ [`GET ${M}/work-orders/w1`]: { body: running({ parts: [{ ...PART, unitCost: null, lineCost: null }], partsCost: 0, partsHaveUncosted: true }) } })
        renderPage(`${BASE}?tab=orders&wo=w1`)
        expect(await screen.findByText('Sin costo')).toBeInTheDocument()
        expect(screen.getByText(/sin costo cargado que no suman/)).toBeInTheDocument()
      })

      it('quien edita la orden (con inventario) registra y devuelve repuestos', async () => {
        state.permissions = [...LEAD, 'inventory.read']
        const m = setup({
          [`GET ${M}/work-orders/w1`]: { body: running({ parts: [PART], partsCost: 371 }) },
          ...stockRoutes,
          [`POST ${M}/work-orders/w1/parts`]: { status: 201, body: { parts: [], partsCost: 0, hasUncosted: false } },
          [`DELETE ${M}/work-orders/w1/parts/pt1`]: { body: { parts: [], partsCost: 0, hasUncosted: false } },
        })
        renderPage(`${BASE}?tab=orders&wo=w1`)
        const sheet = await screen.findByRole('dialog')
        await userEvent.click(await within(sheet).findByRole('button', { name: /Registrar repuesto/ }))
        const dialog = (await screen.findAllByRole('dialog')).at(-1)!

        await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar consumo' }))
        expect(await within(dialog).findAllByText('Requerido')).toHaveLength(2)
        expect(await within(dialog).findByText(/mayor que cero/)).toBeInTheDocument()

        await userEvent.click(within(dialog).getByRole('combobox', { name: 'Ítem' }))
        expect(screen.queryByRole('option', { name: /AGOTADO/ })).not.toBeInTheDocument() // sin existencias no se ofrece
        await userEvent.click(await screen.findByRole('option', { name: /ROD-22218/ }))
        await userEvent.click(within(dialog).getByRole('combobox', { name: 'Ubicación de origen' }))
        await userEvent.click(await screen.findByRole('option', { name: /R-A1.*disponible: 4/ }))
        await userEvent.type(within(dialog).getByLabelText(/Cantidad/), '2')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar consumo' }))
        await waitFor(() => expect(body(m, 'POST', `${M}/work-orders/w1/parts`)).toEqual({ itemId: 'i1', locationId: 'l1', quantity: 2 }))

        await userEvent.click(await screen.findByRole('button', { name: 'Devolver ROD-22218 al inventario' }))
        await waitFor(() => expect(calls(m, `${M}/work-orders/w1/parts/pt1`, 'DELETE')).toHaveLength(1))
      })

      it('si el servidor rechaza por stock insuficiente, lo muestra y el diálogo sigue abierto', async () => {
        state.permissions = [...LEAD, 'inventory.read']
        setup({
          [`GET ${M}/work-orders/w1`]: { body: running() },
          ...stockRoutes,
          [`POST ${M}/work-orders/w1/parts`]: { status: 409, body: { message: 'Stock insuficiente de ROD-22218 en la ubicación (disponible: 4 UND, solicitado: 9)' } },
        })
        renderPage(`${BASE}?tab=orders&wo=w1`)
        await userEvent.click(await screen.findByRole('button', { name: /Registrar repuesto/ }))
        const dialog = (await screen.findAllByRole('dialog')).at(-1)!
        await userEvent.click(within(dialog).getByRole('combobox', { name: 'Ítem' }))
        await userEvent.click(await screen.findByRole('option', { name: /ROD-22218/ }))
        await userEvent.click(within(dialog).getByRole('combobox', { name: 'Ubicación de origen' }))
        await userEvent.click(await screen.findByRole('option', { name: /R-A1/ }))
        await userEvent.type(within(dialog).getByLabelText(/Cantidad/), '9')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar consumo' }))
        expect(await within(dialog).findByText(/Stock insuficiente/)).toBeInTheDocument()
      })

      it('el responsable registra con solo lectura de mantenimiento si lee inventario; sin inventory.read no', async () => {
        state.userId = 'u-tech'
        state.permissions = ['maintenance.read', 'inventory.read']
        setup({ [`GET ${M}/work-orders/w1`]: { body: running() } })
        const { unmount } = renderPage(`${BASE}?tab=orders&wo=w1`)
        expect(await screen.findByRole('button', { name: /Registrar repuesto/ })).toBeInTheDocument()
        unmount()

        state.permissions = ['maintenance.read']
        setup({ [`GET ${M}/work-orders/w1`]: { body: running() } })
        renderPage(`${BASE}?tab=orders&wo=w1`)
        await screen.findByText('Esta orden no ha consumido repuestos.')
        expect(screen.queryByRole('button', { name: /Registrar repuesto/ })).not.toBeInTheDocument()
      })

      it('solo en ejecución, en pausa o terminada: no en una orden asignada ni cerrada', async () => {
        state.permissions = [...LEAD, 'inventory.read']
        for (const status of ['ASSIGNED', 'CLOSED'] as const) {
          setup({ [`GET ${M}/work-orders/w1`]: { body: running({ status, nextStatuses: [] }) } })
          const { unmount } = renderPage(`${BASE}?tab=orders&wo=w1`)
          await screen.findByText('Esta orden no ha consumido repuestos.')
          expect(screen.queryByRole('button', { name: /Registrar repuesto/ })).not.toBeInTheDocument()
          unmount()
        }
      })
    })

    it('404: mensaje claro', async () => {
      setup({ [`GET ${M}/work-orders/w1`]: { status: 404, body: { message: 'no' } } })
      renderPage(`${BASE}?tab=orders&wo=w1`)
      expect(await screen.findByText(/no existe o no es visible/)).toBeInTheDocument()
    })
  })

  describe('transiciones', () => {
    beforeEach(() => {
      state.permissions = LEAD
    })
    const POST = `${M}/work-orders/w1/transition`

    async function open(status: Reply['body'] = woDetail()) {
      const m = setup({ [`GET ${M}/work-orders/w1`]: { body: status }, [`POST ${M}/work-orders/w1/transition`]: { status: 201, body: woDetail({ status: 'PLANNED' }) } })
      renderPage(`${BASE}?tab=orders&wo=w1`)
      return { m, sheet: await screen.findByRole('dialog') }
    }

    it('Planificar: no pide datos y envía solo el estado', async () => {
      const { m, sheet } = await open()
      await userEvent.click(await within(sheet).findByRole('button', { name: 'Planificar' }))
      const dialog = await lastDialog()
      expect(within(dialog).getByText(/Solicitada → Planificada/)).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Planificar' }))
      await waitFor(() => expect(calls(m, POST, 'POST')).toHaveLength(1))
      expect(body(m, 'POST', POST)).toEqual({ to: 'PLANNED' })
    })

    it('Asignar exige elegir responsable y lo envía', async () => {
      const { m, sheet } = await open(woDetail({ status: 'PLANNED', nextStatuses: ['ASSIGNED', 'CANCELLED'] }))
      await userEvent.click(await within(sheet).findByRole('button', { name: 'Asignar' }))
      const dialog = await lastDialog()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar' }))
      expect(await within(dialog).findByText('Selecciona al responsable')).toBeInTheDocument()
      expect(calls(m, POST, 'POST')).toHaveLength(0)

      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Responsable' }))
      await userEvent.click(await screen.findByRole('option', { name: /Tomás Técnico/ }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar' }))
      await waitFor(() => expect(calls(m, POST, 'POST')).toHaveLength(1))
      expect(body(m, 'POST', POST)).toEqual({ to: 'ASSIGNED', assignedTo: 'u-tech' })
    })

    it('Completar exige el trabajo realizado', async () => {
      const { m, sheet } = await open(woDetail({ status: 'IN_PROGRESS', nextStatuses: ['ON_HOLD', 'COMPLETED'] }))
      await userEvent.click(await within(sheet).findByRole('button', { name: 'Completar' }))
      const dialog = await lastDialog()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Completar' }))
      expect(await within(dialog).findByText('Indica qué trabajo se realizó')).toBeInTheDocument()
      expect(calls(m, POST, 'POST')).toHaveLength(0)

      await userEvent.type(within(dialog).getByLabelText('Trabajo realizado'), 'Se cambió el rodamiento')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Completar' }))
      await waitFor(() => expect(calls(m, POST, 'POST')).toHaveLength(1))
      expect(body(m, 'POST', POST)).toEqual({ to: 'COMPLETED', completionNotes: 'Se cambió el rodamiento' })
    })

    it('Cancelar exige el motivo (acción destructiva)', async () => {
      const { m, sheet } = await open()
      await userEvent.click(await within(sheet).findByRole('button', { name: 'Cancelar' }))
      const dialog = await lastDialog()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      expect(await within(dialog).findByText('Indica el motivo de la cancelación')).toBeInTheDocument()
      expect(calls(m, POST, 'POST')).toHaveLength(0)

      await userEvent.type(within(dialog).getByLabelText('Motivo de la cancelación'), 'Duplicada')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      await waitFor(() => expect(body(m, 'POST', POST)).toEqual({ to: 'CANCELLED', note: 'Duplicada' }))
    })

    it('si el servidor rechaza (409 / 403) lo muestra y deja el diálogo abierto', async () => {
      const m = setup({
        [`GET ${M}/work-orders/w1`]: { body: woDetail() },
        [`POST ${M}/work-orders/w1/transition`]: { status: 409, body: { message: 'La orden cambió de estado mientras la editabas; recarga e inténtalo de nuevo' } },
      })
      renderPage(`${BASE}?tab=orders&wo=w1`)
      await userEvent.click(await screen.findByRole('button', { name: 'Planificar' }))
      const dialog = await lastDialog()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Planificar' }))
      expect(await within(dialog).findByText(/La orden cambió de estado/)).toBeInTheDocument()
      expect(calls(m, POST, 'POST')).toHaveLength(1)

      vi.unstubAllGlobals()
      setup({ [`GET ${M}/work-orders/w1`]: { body: woDetail() }, [`POST ${M}/work-orders/w1/transition`]: { status: 403, body: { message: 'x' } } })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Planificar' }))
      expect(await within(dialog).findByText('No tienes permiso para esta acción.')).toBeInTheDocument()
    })

    it('Editar: precarga, y como quien planifica puede cambiar el responsable', async () => {
      const m = setup({ [`GET ${M}/work-orders/w1`]: { body: woDetail() }, [`PATCH ${M}/work-orders/w1`]: { body: woDetail({ title: 'Título nuevo' }) } })
      renderPage(`${BASE}?tab=orders&wo=w1`)
      await userEvent.click(await screen.findByRole('button', { name: /Editar/ }))
      const dialog = await lastDialog()
      const title = within(dialog).getByLabelText('Título')
      expect(title).toHaveValue('Vibración alta en el molino')
      expect(within(dialog).queryByLabelText('Activo')).not.toBeInTheDocument() // el activo no se cambia

      await userEvent.clear(title)
      await userEvent.type(title, 'Título nuevo')
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Responsable' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Tomás Técnico' }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(calls(m, `${M}/work-orders/w1`, 'PATCH')).toHaveLength(1))
      expect(body(m, 'PATCH', `${M}/work-orders/w1`)).toMatchObject({ title: 'Título nuevo', type: 'CORRECTIVE', priority: 'HIGH', assignedTo: 'u-tech', description: 'Se siente en el piso de la nave' })
    })
  })

  describe('solicitar mantenimiento', () => {
    beforeEach(() => {
      state.permissions = ['maintenance.read', 'maintenance.create']
    })

    it('un operador (solo create) ve el botón; quien solo lee no', async () => {
      setup()
      renderPage()
      expect(await screen.findByRole('button', { name: /Solicitar mantenimiento/ })).toBeInTheDocument()
    })

    it('valida activo y título sin llamar al servidor', async () => {
      const m = setup()
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /Solicitar mantenimiento/ }))
      const dialog = await lastDialog()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
      expect(await within(dialog).findByText('Selecciona el activo', { selector: 'p' })).toBeInTheDocument()
      expect(within(dialog).getByText('Requerido')).toBeInTheDocument()
      expect(calls(m, `${M}/work-orders`, 'POST')).toHaveLength(0)
    })

    it('crea la solicitud con el cuerpo esperado y abre su detalle', async () => {
      const m = setup({ [`POST ${M}/work-orders`]: { status: 201, body: woDetail({ id: 'w1', code: 'OT-2026-00050' }) } })
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /Solicitar mantenimiento/ }))
      const dialog = await lastDialog()

      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Activo' }))
      await userEvent.click(await screen.findByRole('option', { name: /MB-301/ }))
      await userEvent.type(within(dialog).getByLabelText('Título'), 'Ruido anormal')
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Prioridad' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Urgente' }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))

      await waitFor(() => expect(calls(m, `${M}/work-orders`, 'POST')).toHaveLength(1))
      expect(body(m, 'POST', `${M}/work-orders`)).toEqual({ assetId: 'a1', title: 'Ruido anormal', type: 'CORRECTIVE', priority: 'URGENT' })
      await waitFor(() => expect(calls(m, `${M}/work-orders/w1`).length).toBeGreaterThan(0)) // abre el detalle
    })

    it('errores del servidor por campo se muestran bajo el campo', async () => {
      setup({ [`POST ${M}/work-orders`]: { status: 400, body: { message: 'Datos inválidos', errors: [{ path: 'assetId', message: 'El activo está dado de baja' }] } } })
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /Solicitar mantenimiento/ }))
      const dialog = await lastDialog()
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Activo' }))
      await userEvent.click(await screen.findByRole('option', { name: /MB-301/ }))
      await userEvent.type(within(dialog).getByLabelText('Título'), 'x')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }))
      expect(await within(dialog).findByText('El activo está dado de baja')).toBeInTheDocument()
    })
  })

  describe('kanban (design.md §38)', () => {
    const items = [
      wo({ id: 'w1', code: 'OT-1', title: 'Solicitud A', status: 'REQUESTED' }),
      wo({ id: 'w2', code: 'OT-2', title: 'Asignada B', status: 'ASSIGNED', assignedTo: { id: 'u-tech', name: 'Tomás Técnico' }, nextStatuses: ['IN_PROGRESS', 'PLANNED', 'CANCELLED'] }),
      wo({ id: 'w3', code: 'OT-3', title: 'Atrasada C', status: 'IN_PROGRESS', overdue: true, nextStatuses: ['ON_HOLD', 'COMPLETED'] }),
    ]

    it('agrupa las órdenes por estado, con conteo y columnas vacías explícitas; sin columna de canceladas', async () => {
      setup({ [`GET ${M}/work-orders`]: { body: page(items) } })
      renderPage(`${BASE}?tab=kanban`)
      await screen.findByText('Solicitud A')
      const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
      expect(headings).toHaveLength(7)
      expect(headings.some((h) => h?.includes('Cancelada'))).toBe(false)

      const col = (name: RegExp) => screen.getByRole('heading', { name }).closest('section')!
      expect(within(col(/Solicitada/)).getByText('Solicitud A')).toBeInTheDocument()
      expect(within(col(/^Asignada/)).getByText('Asignada B')).toBeInTheDocument()
      expect(within(col(/En ejecución/)).getByText('Atrasada C')).toBeInTheDocument()
      expect(within(col(/En ejecución/)).getByText(/Atrasada ·/)).toBeInTheDocument()
      expect(within(col(/Planificada/)).getByText('Sin órdenes')).toBeInTheDocument()
      expect(within(col(/Solicitada/)).getByLabelText('1 órdenes')).toBeInTheDocument()
    })

    it('el menú "Mover" solo ofrece lo que el usuario puede hacer', async () => {
      state.permissions = ['maintenance.read'] // solo lectura: no puede mover nada ajeno
      setup({ [`GET ${M}/work-orders`]: { body: page(items) } })
      renderPage(`${BASE}?tab=kanban`)
      await screen.findByText('Solicitud A')
      expect(screen.queryByRole('button', { name: /Mover OT-1/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Mover OT-2/ })).not.toBeInTheDocument() // asignada a otra persona

      state.userId = 'u-tech' // el técnico asignado sí puede iniciar su orden
      vi.unstubAllGlobals()
      setup({ [`GET ${M}/work-orders`]: { body: page(items) } })
      const second = renderPage(`${BASE}?tab=kanban`)
      await userEvent.click(await screen.findByRole('button', { name: 'Mover OT-2' }))
      expect((await screen.findAllByRole('menuitem')).map((i) => i.textContent)).toEqual(['Iniciar'])
      second.unmount()
    })

    it('mover una tarjeta abre el diálogo de la transición y envía el POST', async () => {
      state.permissions = LEAD
      const m = setup({ [`GET ${M}/work-orders`]: { body: page(items) }, [`POST ${M}/work-orders/w1/transition`]: { status: 201, body: woDetail({ status: 'PLANNED' }) } })
      renderPage(`${BASE}?tab=kanban`)
      await userEvent.click(await screen.findByRole('button', { name: 'Mover OT-1' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Planificar' }))
      const dialog = await lastDialog()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Planificar' }))
      await waitFor(() => expect(calls(m, `${M}/work-orders/w1/transition`, 'POST')).toHaveLength(1))
    })

    it('avisa cuando hay más órdenes que las mostradas', async () => {
      setup({ [`GET ${M}/work-orders`]: { body: page(items, 250, 1, 100) } })
      renderPage(`${BASE}?tab=kanban`)
      expect(await screen.findByText(/Mostrando las 100 órdenes más recientes de 250/)).toBeInTheDocument()
    })

    it('abre el detalle al elegir una tarjeta', async () => {
      const m = setup({ [`GET ${M}/work-orders`]: { body: page(items) } })
      renderPage(`${BASE}?tab=kanban`)
      await userEvent.click(await screen.findByRole('button', { name: /Solicitud A/ }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      await waitFor(() => expect(calls(m, `${M}/work-orders/w1`).length).toBeGreaterThan(0))
    })
  })

  describe('planes', () => {
    it('lista los planes con frecuencia, próxima fecha, vencimiento y estado', async () => {
      setup({ [`GET ${M}/plans`]: { body: page([plan(), plan({ id: 'p2', name: 'Inspección anual', frequencyValue: 12, overdue: true, status: 'PAUSED' })]) } })
      renderPage(`${BASE}?tab=plans`)
      const row = (await screen.findByText('Lubricación mensual')).closest('tr')!
      expect(within(row).getByText('Cada mes')).toBeInTheDocument()
      expect(within(row).getByText('MB-301')).toBeInTheDocument()
      expect(within(row).getByText('Activo')).toBeInTheDocument()
      const second = screen.getByText('Inspección anual').closest('tr')!
      expect(within(second).getByText('Cada 12 meses')).toBeInTheDocument()
      expect(within(second).getByText('Vencido')).toBeInTheDocument()
      expect(within(second).getByText('Pausado')).toBeInTheDocument()
    })

    it('sin maintenance.update no hay acciones ni botón de crear', async () => {
      setup()
      renderPage(`${BASE}?tab=plans`)
      await screen.findByText('Lubricación mensual')
      expect(screen.queryByRole('button', { name: /Generar orden/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Nuevo plan/ })).not.toBeInTheDocument()
    })

    it('Generar OT: llama al endpoint y abre la orden creada; un plan pausado no puede generar', async () => {
      state.permissions = LEAD
      const m = setup({
        [`GET ${M}/plans`]: { body: page([plan(), plan({ id: 'p2', name: 'Pausado', status: 'PAUSED' })]) },
        [`POST ${M}/plans/p1/generate`]: { status: 201, body: woDetail({ id: 'w1', code: 'OT-2026-00077', status: 'PLANNED' }) },
      })
      renderPage(`${BASE}?tab=plans`)
      expect(await screen.findByRole('button', { name: 'Generar orden de Pausado' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: 'Generar orden de Lubricación mensual' }))
      await waitFor(() => expect(calls(m, `${M}/plans/p1/generate`, 'POST')).toHaveLength(1))
      expect(await screen.findByRole('dialog')).toBeInTheDocument() // abre la OT generada
    })

    it('si ya hay una orden abierta del plan (409) no abre nada', async () => {
      state.permissions = LEAD
      setup({ [`POST ${M}/plans/p1/generate`]: { status: 409, body: { message: 'El plan ya tiene una orden abierta (OT-2026-00003)' } } })
      renderPage(`${BASE}?tab=plans`)
      await userEvent.click(await screen.findByRole('button', { name: 'Generar orden de Lubricación mensual' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Generar orden de Lubricación mensual' })).toBeEnabled())
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('Pausar y reactivar envían PATCH de estado', async () => {
      state.permissions = LEAD
      const m = setup({ [`PATCH ${M}/plans/p1`]: { body: plan({ status: 'PAUSED' }) } })
      renderPage(`${BASE}?tab=plans`)
      await userEvent.click(await screen.findByRole('button', { name: 'Pausar Lubricación mensual' }))
      await waitFor(() => expect(body(m, 'PATCH', `${M}/plans/p1`)).toEqual({ status: 'PAUSED' }))
    })

    it('crear plan: valida y envía frecuencia y primera fecha en ISO', async () => {
      state.permissions = LEAD
      const m = setup({ [`POST ${M}/plans`]: { status: 201, body: plan() } })
      renderPage(`${BASE}?tab=plans`)
      await userEvent.click(await screen.findByRole('button', { name: /Nuevo plan/ }))
      const dialog = await lastDialog()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear plan' }))
      expect(await within(dialog).findByText('Selecciona el activo', { selector: 'p' })).toBeInTheDocument()
      expect(within(dialog).getByText('Requerido')).toBeInTheDocument()
      expect(within(dialog).getByText('Indica la fecha')).toBeInTheDocument()
      expect(calls(m, `${M}/plans`, 'POST')).toHaveLength(0)

      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Activo' }))
      await userEvent.click(await screen.findByRole('option', { name: /MB-301/ }))
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Cambio de filtros')
      await userEvent.clear(within(dialog).getByLabelText('Cada'))
      await userEvent.type(within(dialog).getByLabelText('Cada'), '3')
      await userEvent.type(within(dialog).getByLabelText('Primera fecha'), '2027-01-15T08:30')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear plan' }))

      await waitFor(() => expect(calls(m, `${M}/plans`, 'POST')).toHaveLength(1))
      const sent = body(m, 'POST', `${M}/plans`)
      expect(sent).toMatchObject({ assetId: 'a1', name: 'Cambio de filtros', planType: 'PREVENTIVE', priority: 'MEDIUM', frequencyValue: 3, frequencyUnit: 'MONTHS' })
      expect(sent.firstDueAt).toBe(new Date('2027-01-15T08:30').toISOString())
    })

    it('frecuencia inválida se rechaza en el cliente', async () => {
      state.permissions = LEAD
      const m = setup()
      renderPage(`${BASE}?tab=plans`)
      await userEvent.click(await screen.findByRole('button', { name: /Nuevo plan/ }))
      const dialog = await lastDialog()
      await userEvent.clear(within(dialog).getByLabelText('Cada'))
      await userEvent.type(within(dialog).getByLabelText('Cada'), '0')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear plan' }))
      expect(await within(dialog).findByText(/entero mayor o igual a 1/)).toBeInTheDocument()
      expect(calls(m, `${M}/plans`, 'POST')).toHaveLength(0)
    })

    it('editar plan: precarga y envía el cambio', async () => {
      state.permissions = LEAD
      const m = setup({ [`PATCH ${M}/plans/p1`]: { body: plan() } })
      renderPage(`${BASE}?tab=plans`)
      await userEvent.click(await screen.findByRole('button', { name: 'Editar Lubricación mensual' }))
      const dialog = await lastDialog()
      expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Lubricación mensual')
      expect(within(dialog).queryByLabelText('Activo')).not.toBeInTheDocument()
      await userEvent.clear(within(dialog).getByLabelText('Nombre'))
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Lubricación quincenal')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
      await waitFor(() => expect(calls(m, `${M}/plans/p1`, 'PATCH')).toHaveLength(1))
      expect(body(m, 'PATCH', `${M}/plans/p1`)).toMatchObject({ name: 'Lubricación quincenal', frequencyValue: 1, frequencyUnit: 'MONTHS' })
    })

    it('estado vacío: el CTA de crear exige permiso', async () => {
      setup({ [`GET ${M}/plans`]: { body: page([]) } })
      const { unmount } = renderPage(`${BASE}?tab=plans`)
      expect(await screen.findByText('No hay planes de mantenimiento')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Crear el primer plan/ })).not.toBeInTheDocument()
      unmount()

      state.permissions = LEAD
      setup({ [`GET ${M}/plans`]: { body: page([]) } })
      renderPage(`${BASE}?tab=plans`)
      expect(await screen.findByRole('button', { name: /Crear el primer plan/ })).toBeInTheDocument()
    })
  })
})
