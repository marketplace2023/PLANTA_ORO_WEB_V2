import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, plantDetail } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { dashboard, item, itemDetail, LOCATIONS, movement, WAREHOUSES } from '@/test/inventory-fixtures'
import { renderWithProviders } from '@/test/render'
import { InventoryPage } from './inventory-page'
import { PlantRoute } from './plant-route'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ permissions: state.permissions, currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const I = '/plants/revemin-ii/inventory'
type Reply = { status?: number; body?: unknown }

function setup(routes: Record<string, Reply | (() => Reply | Promise<Reply>)> = {}) {
  return mockApi({
    'GET /plants/revemin-ii': { body: plantDetail() },
    [`GET ${I}/dashboard`]: { body: dashboard() },
    [`GET ${I}/items`]: { body: page([item(), item({ id: 'i3', sku: 'SELLO-MEC-60', name: 'Sello mecánico 60 mm', onHand: 1, belowMin: true, minStock: 3, value: 640 })]) },
    [`GET ${I}/items/i1`]: { body: itemDetail() },
    [`GET ${I}/movements`]: { body: page([movement(), movement({ id: 'mv2', type: 'ISSUE', quantity: 2, from: 'R-A1', to: null, referenceType: 'WORK_ORDER', referenceId: 'w9', note: null })]) },
    [`GET ${I}/warehouses`]: { body: WAREHOUSES },
    [`GET ${I}/locations`]: { body: LOCATIONS },
    ...routes,
  })
}
type Mock = ReturnType<typeof setup>
const calls = (m: Mock, path: string, method = 'GET') => m.calls.filter((c) => c.method === method && c.path === path)
const body = (m: Mock, method: string, path: string) => JSON.parse(m.calls.filter((c) => c.method === method && c.path === path).at(-1)!.init.body as string)

const renderPage = (route = I) =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="inventory" element={<InventoryPage />} />
      </Route>
    </Routes>,
    { route },
  )

const READ = ['inventory.read']
const KEEPER = ['inventory.read', 'inventory.create', 'inventory.update', 'inventory.move']

describe('WMS / Inventario (página)', () => {
  beforeEach(() => {
    state.permissions = READ
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sin inventory.read no muestra datos ni consulta la API de inventario', async () => {
    state.permissions = []
    const m = setup()
    renderPage()
    expect(await screen.findByText('Sin acceso al inventario')).toBeInTheDocument()
    expect(m.calls.some((c) => c.path.startsWith(I))).toBe(false)
  })

  describe('dashboard', () => {
    it('muestra los indicadores con moneda y deja las reservas como no disponibles', async () => {
      setup()
      renderPage()
      const card = (title: string) => screen.getByText(title).closest('[data-slot="card"]') as HTMLElement
      expect(await screen.findByText('USD 125,430.50')).toBeInTheDocument()
      expect(card('Ítems activos')).toHaveTextContent('9')
      expect(card('Bajo mínimo')).toHaveTextContent('2')
      expect(card('Críticos bajo mínimo')).toHaveTextContent('1')
      expect(card('Movimientos (30 días)')).toHaveTextContent('3 ingresos · 4 salidas')
      expect(card('Activos en reparación')).toHaveTextContent('1')
      expect(card('Reservas')).toHaveTextContent('—')
    })

    it('lista los ítems bajo mínimo y abre su detalle', async () => {
      setup({ [`GET ${I}/items/i3`]: { body: itemDetail({ id: 'i3', sku: 'SELLO-MEC-60', name: 'Sello mecánico 60 mm', stock: [], recentMovements: [] }) } })
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /SELLO-MEC-60/ }))
      expect(await screen.findByText('Sin existencias en ninguna ubicación.')).toBeInTheDocument()
    })
  })

  describe('stock', () => {
    it('lista ítems con alertas y los filtros viven en la URL y en la consulta', async () => {
      const m = setup()
      renderPage(`${I}?tab=stock`)
      const row = (await screen.findByText('Sello mecánico 60 mm')).closest('tr')!
      expect(within(row).getByText('Bajo mínimo')).toBeInTheDocument()
      expect(within(screen.getByText('Rodamiento esférico 22218 E').closest('tr')!).getByText('Crítico')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('checkbox', { name: 'Bajo mínimo' }))
      await waitFor(() => expect(calls(m, `${I}/items`).at(-1)!.query.get('low')).toBe('1'))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Solo críticos' }))
      await waitFor(() => expect(calls(m, `${I}/items`).at(-1)!.query.get('critical')).toBe('1'))
      expect(await screen.findByRole('button', { name: /Limpiar/ })).toBeInTheDocument()
    })

    it('la búsqueda se envía al servidor', async () => {
      const m = setup()
      renderPage(`${I}?tab=stock`)
      await userEvent.type(await screen.findByLabelText('Buscar'), 'sello')
      await waitFor(() => expect(calls(m, `${I}/items`).at(-1)!.query.get('search')).toBe('sello'))
    })

    it('estado vacío con CTA solo para quien puede crear', async () => {
      setup({ [`GET ${I}/items`]: { body: page([]) } })
      renderPage(`${I}?tab=stock`)
      expect(await screen.findByText('No hay ítems en el inventario')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Nuevo ítem/ })).not.toBeInTheDocument()
    })

    it('solo lectura: sin botón de nuevo ítem ni operaciones de stock', async () => {
      setup()
      renderPage(`${I}?tab=stock&item=i1`)
      expect(await screen.findByText('Existencias por ubicación')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Nuevo ítem/ })).not.toBeInTheDocument()
      for (const name of ['Recibir', 'Emitir', 'Transferir', 'Ajustar', 'Editar', 'Desactivar']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    })

    it('detalle: existencias por ubicación, valor y costo promedio', async () => {
      setup()
      renderPage(`${I}?tab=stock&item=i1`)
      const sheet = await screen.findByRole('dialog')
      expect(await within(sheet).findByText('Existencias por ubicación')).toBeInTheDocument()
      expect(within(sheet).getByText('USD 1,113.00')).toBeInTheDocument()
      expect(within(sheet).getByText('USD 185.50')).toBeInTheDocument()
      expect(within(sheet).getAllByText(/R-B1/).length).toBeGreaterThan(0)
    })
  })

  describe('operaciones de stock', () => {
    beforeEach(() => {
      state.permissions = KEEPER
    })

    it('recibir: valida lo obligatorio y envía cantidad numérica con costo', async () => {
      const m = setup({ [`POST ${I}/movements/receipt`]: { status: 201, body: { movementId: 'mv9' } } })
      renderPage(`${I}?tab=stock&item=i1`)
      await userEvent.click(await screen.findByRole('button', { name: 'Recibir' }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar ingreso' }))
      expect(await within(dialog).findAllByText('Requerido')).toHaveLength(2) // ubicación y cantidad
      expect(m.calls.some((c) => c.method === 'POST')).toBe(false)

      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Ubicación de destino' }))
      await userEvent.click(await screen.findByRole('option', { name: /R-A1/ }))
      await userEvent.type(within(dialog).getByLabelText(/Cantidad/), '5')
      await userEvent.type(within(dialog).getByLabelText('Costo unitario'), '190.25')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar ingreso' }))
      await waitFor(() => expect(body(m, 'POST', `${I}/movements/receipt`)).toEqual({ itemId: 'i1', locationId: 'l1', quantity: 5, unitCost: 190.25 }))
    })

    it('emitir: solo ofrece ubicaciones con existencias y muestra el 409 de stock insuficiente', async () => {
      setup({ [`POST ${I}/movements/issue`]: { status: 409, body: { message: 'Stock insuficiente de ROD-22218 en la ubicación (disponible: 4 UND, solicitado: 9)' } } })
      renderPage(`${I}?tab=stock&item=i1`)
      await userEvent.click(await screen.findByRole('button', { name: 'Emitir' }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Ubicación de origen' }))
      expect(await screen.findAllByRole('option')).toHaveLength(2) // las dos ubicaciones con stock
      await userEvent.click(screen.getByRole('option', { name: /R-A1.*disponible: 4/ }))
      await userEvent.type(within(dialog).getByLabelText(/Cantidad/), '9')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar salida' }))
      expect(await within(dialog).findByText(/Stock insuficiente/)).toBeInTheDocument()
      expect(screen.getAllByRole('dialog').length).toBeGreaterThan(0)
    })

    it('transferir: origen con stock y destino activo', async () => {
      const m = setup({ [`POST ${I}/movements/transfer`]: { status: 201, body: { movementId: 'mv9' } } })
      renderPage(`${I}?tab=stock&item=i1`)
      await userEvent.click(await screen.findByRole('button', { name: 'Transferir' }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Origen' }))
      await userEvent.click(await screen.findByRole('option', { name: /R-A1/ }))
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Destino' }))
      const options = await screen.findAllByRole('option')
      expect(options.some((o) => /E-01/.test(o.textContent ?? ''))).toBe(false) // ubicación inactiva
      await userEvent.click(screen.getByRole('option', { name: /R-B1/ }))
      await userEvent.type(within(dialog).getByLabelText(/Cantidad/), '1.5')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Transferir' }))
      await waitFor(() => expect(body(m, 'POST', `${I}/movements/transfer`)).toEqual({ itemId: 'i1', fromLocationId: 'l1', toLocationId: 'l2', quantity: 1.5 }))
    })

    it('ajustar: el motivo es obligatorio', async () => {
      const m = setup({ [`POST ${I}/movements/adjust`]: { status: 201, body: { movementId: 'mv9' } } })
      renderPage(`${I}?tab=stock&item=i1`)
      await userEvent.click(await screen.findByRole('button', { name: 'Ajustar' }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Ubicación' }))
      await userEvent.click(await screen.findByRole('option', { name: /R-A1/ }))
      await userEvent.type(within(dialog).getByLabelText(/Saldo real contado/), '3')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Aplicar ajuste' }))
      expect(await within(dialog).findByText('Requerido')).toBeInTheDocument()
      expect(m.calls.some((c) => c.method === 'POST')).toBe(false)

      await userEvent.type(within(dialog).getByLabelText('Motivo del ajuste'), 'Conteo cíclico')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Aplicar ajuste' }))
      await waitFor(() => expect(body(m, 'POST', `${I}/movements/adjust`)).toEqual({ itemId: 'i1', locationId: 'l1', newQuantity: 3, reason: 'Conteo cíclico' }))
    })

    it('un ítem inactivo solo permite emitir lo que queda', async () => {
      setup({ [`GET ${I}/items/i1`]: { body: itemDetail({ status: 'INACTIVE' }) } })
      renderPage(`${I}?tab=stock&item=i1`)
      expect(await screen.findByRole('button', { name: 'Emitir' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Recibir' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Activar' })).toBeInTheDocument()
    })

    it('crear ítem: SKU y unidad se piden al crear; errores del servidor por campo', async () => {
      const m = setup({ [`POST ${I}/items`]: { status: 409, body: { message: 'Ya existe un ítem con el SKU DUP en esta planta' } } })
      renderPage(`${I}?tab=stock`)
      await userEvent.click(await screen.findByRole('button', { name: /Nuevo ítem/ }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.type(within(dialog).getByLabelText('SKU'), 'DUP')
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Duplicado')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear ítem' }))
      expect(await within(dialog).findByText(/Ya existe un ítem con el SKU DUP/)).toBeInTheDocument()
      expect(body(m, 'POST', `${I}/items`)).toMatchObject({ sku: 'DUP', name: 'Duplicado', uom: 'UND', itemType: 'SPARE', minStock: 0, isCritical: false })
    })

    it('editar: no permite cambiar SKU ni unidad', async () => {
      const m = setup({ [`PATCH ${I}/items/i1`]: { body: itemDetail() } })
      renderPage(`${I}?tab=stock&item=i1`)
      await userEvent.click(await screen.findByRole('button', { name: 'Editar' }))
      const dialog = (await screen.findAllByRole('dialog')).at(-1)!
      expect(within(dialog).queryByLabelText('SKU')).not.toBeInTheDocument()
      expect(within(dialog).queryByLabelText('Unidad de medida')).not.toBeInTheDocument()
      await userEvent.clear(within(dialog).getByLabelText('Stock mínimo'))
      await userEvent.type(within(dialog).getByLabelText('Stock mínimo'), '5')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
      await waitFor(() => expect(body(m, 'PATCH', `${I}/items/i1`)).toMatchObject({ minStock: 5, name: 'Rodamiento esférico 22218 E', isCritical: true }))
      expect(body(m, 'PATCH', `${I}/items/i1`)).not.toHaveProperty('sku')
    })
  })

  describe('movimientos', () => {
    it('lista el libro, enlaza la orden de trabajo y filtra por tipo', async () => {
      const m = setup()
      renderPage(`${I}?tab=movements`)
      expect(await screen.findByText('Saldo inicial')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Orden de trabajo' })).toHaveAttribute('href', '/plants/revemin-ii/maintenance?tab=orders&wo=w9')
      await userEvent.click(screen.getByRole('combobox', { name: 'Tipo' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Salida' }))
      await waitFor(() => expect(calls(m, `${I}/movements`).at(-1)!.query.get('type')).toBe('ISSUE'))
    })
  })

  describe('almacenes y ubicaciones', () => {
    it('lista almacenes y ubicaciones con su estado', async () => {
      setup()
      renderPage(`${I}?tab=warehouses`)
      expect(await screen.findByRole('heading', { name: /Almacén central/ })).toBeInTheDocument()
      expect(within(screen.getByText('Estante 1').closest('tr')!).getByText('Inactiva')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Nuevo almacén/ })).not.toBeInTheDocument()
    })

    it('crear almacén y ubicación (con permisos)', async () => {
      state.permissions = KEEPER
      const m = setup({ [`POST ${I}/warehouses`]: { status: 201, body: {} }, [`POST ${I}/locations`]: { status: 201, body: {} } })
      renderPage(`${I}?tab=warehouses`)
      await userEvent.click(await screen.findByRole('button', { name: /Nuevo almacén/ }))
      let dialog = await screen.findByRole('dialog')
      await userEvent.type(within(dialog).getByLabelText('Código'), 'alm-2')
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Almacén de campo')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear almacén' }))
      await waitFor(() => expect(body(m, 'POST', `${I}/warehouses`)).toEqual({ code: 'alm-2', name: 'Almacén de campo' }))

      await userEvent.click(await screen.findByRole('button', { name: /Nueva ubicación/ }))
      dialog = await screen.findByRole('dialog')
      await userEvent.type(within(dialog).getByLabelText('Código'), 'R-C1')
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Rack C1')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear ubicación' }))
      await waitFor(() => expect(body(m, 'POST', `${I}/locations`)).toEqual({ warehouseId: 'w1', code: 'R-C1', name: 'Rack C1', locationType: 'RACK' }))
    })

    it('desactivar con existencias muestra el motivo del servidor', async () => {
      state.permissions = KEEPER
      setup({ [`PATCH ${I}/locations/l1`]: { status: 409, body: { message: 'No se puede desactivar una ubicación que todavía tiene existencias' } } })
      renderPage(`${I}?tab=warehouses`)
      await userEvent.click(await screen.findByRole('button', { name: 'Desactivar ubicación R-A1' }))
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/todavía tiene existencias/)))
    })
  })
})
