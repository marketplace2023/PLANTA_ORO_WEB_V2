import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAMILIES, MODELS, page } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { AdminCatalogPage } from './admin-catalog-page'

const state = vi.hoisted(() => ({ admin: true }))
vi.mock('@/features/plant/plant-context', () => ({ usePlant: () => ({ currentPlant: null, permissions: [] }) }))
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'u1', isGlobalAdmin: state.admin } }) }))

type Reply = { status?: number; body?: unknown }
const TYPES = [{ id: 't1', code: 'MOLINO_BOLAS', name: 'Molino de bolas', familyCode: 'MOLINOS', familyName: 'Molinos' }]
const MAKERS = [{ id: 'mf1', name: 'Metso', countryCode: 'FI' }]
const INACTIVE_MODEL = { ...MODELS[1], id: 'm2', status: 'INACTIVE' }

function setup(routes: Record<string, Reply | (() => Reply)> = {}) {
  return mockApi({
    'GET /catalog/families': { body: FAMILIES },
    'GET /catalog/types': { body: TYPES },
    'GET /catalog/manufacturers': { body: MAKERS },
    'GET /catalog/assets': { body: page([MODELS[0], INACTIVE_MODEL], 2, 1, 50) },
    ...routes,
  })
}
type Mock = ReturnType<typeof setup>
const body = (m: Mock, method: string, path: string) => JSON.parse(m.calls.filter((c) => c.method === method && c.path === path).at(-1)!.init.body as string)

describe('Administrar catálogo', () => {
  beforeEach(() => {
    state.admin = true
  })
  afterEach(() => vi.unstubAllGlobals())

  it('solo el administrador del ecosistema: los demás reciben una explicación y ninguna llamada', async () => {
    state.admin = false
    const m = setup()
    renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog' })
    expect(await screen.findByText('Solo para administradores del ecosistema')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(m.calls).toHaveLength(0)
  })

  it('tiene 4 pestañas y abre en Familias', async () => {
    setup()
    renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog' })
    expect(await screen.findByText('Molinos')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Familias', 'Tipos', 'Fabricantes', 'Modelos'])
  })

  describe('familias', () => {
    it('crear: código obligatorio con ayuda, y envía el cuerpo', async () => {
      const m = setup({ 'POST /catalog/families': { status: 201, body: {} } })
      renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog' })
      await userEvent.click(await screen.findByRole('button', { name: /Nueva familia/ }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/No se puede cambiar después/)).toBeInTheDocument()

      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear familia' }))
      expect(await within(dialog).findAllByText('Requerido')).toHaveLength(2) // código y nombre
      expect(m.calls.some((c) => c.method === 'POST')).toBe(false)

      await userEvent.type(within(dialog).getByLabelText('Código'), 'GRUAS')
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Grúas')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear familia' }))
      await waitFor(() => expect(body(m, 'POST', '/catalog/families')).toEqual({ code: 'GRUAS', name: 'Grúas' }))
    })

    it('un código repetido (409) o inválido (400) se muestra y el diálogo sigue abierto', async () => {
      setup({ 'POST /catalog/families': { status: 409, body: { message: 'Ya existe una familia con el código MOLINOS' } } })
      renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog' })
      await userEvent.click(await screen.findByRole('button', { name: /Nueva familia/ }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.type(within(dialog).getByLabelText('Código'), 'MOLINOS')
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Otra')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear familia' }))
      expect(await within(dialog).findByText(/Ya existe una familia con el código MOLINOS/)).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('editar: no pide el código (inmutable) y envía solo nombre e ícono', async () => {
      const m = setup({ 'PATCH /catalog/families/f1': { body: {} } })
      renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog' })
      await userEvent.click(await screen.findByRole('button', { name: 'Editar Molinos' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByLabelText('Código')).not.toBeInTheDocument()
      await userEvent.clear(within(dialog).getByLabelText('Nombre'))
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Molinos y SAG')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
      await waitFor(() => expect(body(m, 'PATCH', '/catalog/families/f1')).toEqual({ name: 'Molinos y SAG', icon: 'cog' }))
    })
  })

  describe('tipos y fabricantes', () => {
    it('crear tipo: elige la familia del catálogo', async () => {
      const m = setup({ 'POST /catalog/types': { status: 201, body: {} } })
      renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog?tab=types' })
      expect(await screen.findByText('Molino de bolas')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /Nuevo tipo/ }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.type(within(dialog).getByLabelText('Código'), 'MOLINO_SAG')
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Molino SAG')
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Familia' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Molinos' }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear tipo' }))
      await waitFor(() => expect(body(m, 'POST', '/catalog/types')).toEqual({ code: 'MOLINO_SAG', name: 'Molino SAG', familyCode: 'MOLINOS' }))
    })

    it('muestra los fabricantes derivados de las fichas sin alta de marcas independientes', async () => {
      setup()
      renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog?tab=manufacturers' })
      expect(await screen.findByText('Metso')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Nuevo fabricante/ })).not.toBeInTheDocument()
      expect(screen.getByText(/Se administran desde cada modelo/)).toBeInTheDocument()
    })

    it('permite reintentar la consulta de referencias si falla', async () => {
      let fail = true
      setup({ 'GET /catalog/manufacturers': () => fail ? { status: 500, body: {} } : { body: [{ id: 'ref1', name: 'WEG' }] } })
      renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog?tab=manufacturers' })
      expect(await screen.findByRole('alert')).toBeInTheDocument()
      fail = false
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByText('WEG')).toBeInTheDocument()
    })
  })

  describe('modelos', () => {
    it('lista activos e inactivos con su estado y pide estado ALL al servidor', async () => {
      const m = setup()
      renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog?tab=models' })
      expect(await screen.findByText('Bolas 16.5x24 ft')).toBeInTheDocument()
      expect(within(screen.getByText('Motor 4.0 MW 6 polos').closest('tr')!).getByText('Inactivo')).toBeInTheDocument()
      expect(within(screen.getByText('Bolas 16.5x24 ft').closest('tr')!).getByText('Activo')).toBeInTheDocument()
      expect(m.calls.find((c) => c.path === '/catalog/assets')!.query.get('status')).toBe('ALL')
    })

    it('la búsqueda se envía con debounce', async () => {
      const m = setup()
      renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog?tab=models' })
      await screen.findByText('Bolas 16.5x24 ft')
      await userEvent.type(screen.getByLabelText('Buscar'), 'motor')
      await waitFor(() => expect(m.calls.filter((c) => c.path === '/catalog/assets').at(-1)!.query.get('search')).toBe('motor'))
    })

    it('crear: JSON de especificaciones validado en el cliente', async () => {
      const m = setup({ 'POST /catalog/models': { status: 201, body: {} } })
      renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog?tab=models' })
      await userEvent.click(await screen.findByRole('button', { name: /Nuevo modelo/ }))
      const dialog = await screen.findByRole('dialog')

      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Tipo' }))
      await userEvent.click(await screen.findByRole('option', { name: /Molino de bolas/ }))
      await userEvent.type(within(dialog).getByLabelText('Modelo'), 'Bolas 20x32 ft')
      await userEvent.clear(within(dialog).getByLabelText(/Especificaciones/))
      await userEvent.type(within(dialog).getByLabelText(/Especificaciones/), 'esto no es json')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear modelo' }))
      expect(await within(dialog).findByText('JSON inválido')).toBeInTheDocument()
      expect(m.calls.some((c) => c.method === 'POST')).toBe(false)

      await userEvent.clear(within(dialog).getByLabelText(/Especificaciones/))
      await userEvent.click(within(dialog).getByLabelText(/Especificaciones/))
      await userEvent.paste('{"powerKw": 5600}')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear modelo' }))
      await waitFor(() => expect(body(m, 'POST', '/catalog/models')).toEqual({ typeCode: 'MOLINO_BOLAS', modelName: 'Bolas 20x32 ft', specifications: { powerKw: 5600 }, technicalData: { fabricantesReferencia: [] } }))
    })

    it('muestra los errores del servidor en referencias dentro del formulario', async () => {
      setup({ 'PATCH /catalog/models/m1': { status: 400, body: { message: 'Datos inválidos', errors: [{ path: 'technicalData.fabricantesReferencia.0.sitioWeb', message: 'La web debe usar HTTP(S)' }] } } })
      renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog?tab=models' })
      await userEvent.click(await screen.findByRole('button', { name: 'Editar Bolas 16.5x24 ft' }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
      expect(await within(dialog).findByText('La web debe usar HTTP(S)')).toBeInTheDocument()
    })

    it('editar: puede desactivar un modelo y agregar referencias sin fabricante principal', async () => {
      const m = setup({ 'PATCH /catalog/models/m1': { body: {} } })
      renderWithProviders(<AdminCatalogPage />, { route: '/admin/catalog?tab=models' })
      await userEvent.click(await screen.findByRole('button', { name: 'Editar Bolas 16.5x24 ft' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/sin afectar a los activos que ya lo usan/)).toBeInTheDocument()

      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Estado' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Inactivo' }))
      expect(within(dialog).queryByRole('combobox', { name: 'Fabricante' })).not.toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir fabricante de referencia' }))
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Fabricante 1' }), 'WEG')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
      await waitFor(() => expect(body(m, 'PATCH', '/catalog/models/m1')).toMatchObject({ status: 'INACTIVE', technicalData: { fabricantesReferencia: [{ nombre: 'WEG', alcance: null, sitioWeb: null }] }, modelName: 'Bolas 16.5x24 ft', specifications: { diameterFt: 16.5, powerKw: 3000 } }))
    })
  })
})
