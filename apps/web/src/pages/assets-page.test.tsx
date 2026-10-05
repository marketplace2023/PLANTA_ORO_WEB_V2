import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asset, FAMILIES, NETWORKS, page, plantDetail, STAGES } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { AssetsPage } from './assets-page'
import { PlantRoute } from './plant-route'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ permissions: state.permissions, currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }),
}))

const BASE = '/plants/revemin-ii/assets'

function setup(listReply: unknown | (() => unknown) = page([asset(), asset({ id: 'a2', tag: 'MT-301', name: 'Motor del molino', status: 'MAINTENANCE', criticality: 'HIGH', stage: null, networks: [] })])) {
  const mock = mockApi({
    'GET /plants/revemin-ii': { body: plantDetail() },
    'GET /plants/revemin-ii/stages': { body: STAGES },
    'GET /plants/revemin-ii/networks': { body: NETWORKS },
    'GET /catalog/families': { body: FAMILIES },
    'GET /plants/revemin-ii/assets': () => ({ body: typeof listReply === 'function' ? (listReply as () => unknown)() : listReply }),
  })
  return mock
}

const renderAssets = (route = BASE) =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="assets" element={<AssetsPage />} />
        <Route path="assets/:assetId" element={<p>Ficha del activo</p>} />
      </Route>
    </Routes>,
    { route },
  )

const listCalls = (mock: ReturnType<typeof setup>) => mock.calls.filter((c) => c.path === '/plants/revemin-ii/assets')
const lastQuery = (mock: ReturnType<typeof setup>) => listCalls(mock).at(-1)!.query

describe('Activos Físicos (listado)', () => {
  beforeEach(() => {
    state.permissions = []
  })
  afterEach(() => vi.unstubAllGlobals())

  it('muestra las columnas del diseño con estado e icono+texto, etapa, redes y enlace a la FUR', async () => {
    setup()
    renderAssets()

    const row = (await screen.findByRole('link', { name: 'MB-301' })).closest('tr')!
    expect(within(row).getByText('Molino de bolas 1')).toBeInTheDocument()
    expect(within(row).getByText('Bolas 16.5x24 ft')).toBeInTheDocument()
    expect(within(row).getByText('D06')).toBeInTheDocument()
    expect(within(row).getByText('FUR-IOT')).toBeInTheDocument()
    expect(within(row).getByText('Operativo')).toBeInTheDocument() // el estado nunca es solo color
    expect(within(row).getByText('Crítica')).toBeInTheDocument()
    expect(within(row).getByText('Nave de molienda')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'MB-301' })).toHaveAttribute('href', '/plants/revemin-ii/assets/a1')

    const second = screen.getByRole('link', { name: 'MT-301' }).closest('tr')!
    expect(within(second).getByText('En mantenimiento')).toBeInTheDocument()
    expect(within(second).getAllByText('—').length).toBeGreaterThanOrEqual(2) // sin etapa ni redes
  })

  it('pide la primera página de 25 y no envía filtros vacíos', async () => {
    const mock = setup()
    renderAssets()
    await screen.findByRole('link', { name: 'MB-301' })
    const q = lastQuery(mock)
    expect(q.get('pageSize')).toBe('25')
    expect([...q.keys()].sort()).toEqual(['pageSize'])
  })

  it('los filtros de la URL llegan a la API y se muestran como chips', async () => {
    const mock = setup()
    renderAssets(`${BASE}?stage=D06&status=OPERATIVE&network=FUR-IOT`)
    await screen.findByRole('link', { name: 'MB-301' })

    const q = lastQuery(mock)
    expect(Object.fromEntries(q)).toMatchObject({ stage: 'D06', status: 'OPERATIVE', network: 'FUR-IOT' })

    const chips = screen.getByRole('list', { name: 'Filtros activos' })
    expect(within(chips).getByRole('button', { name: /Quitar filtro Etapa: D06/ })).toBeInTheDocument()
    expect(within(chips).getByRole('button', { name: /Quitar filtro Estado: Operativo/ })).toBeInTheDocument()
    expect(within(chips).getByRole('button', { name: /Quitar filtro Red: FUR-IOT/ })).toBeInTheDocument()
  })

  it('quitar un chip vuelve a consultar sin ese filtro; "Limpiar filtros" quita todos', async () => {
    const mock = setup()
    renderAssets(`${BASE}?stage=D06&status=OPERATIVE`)
    await screen.findByRole('link', { name: 'MB-301' })

    await userEvent.click(screen.getByRole('button', { name: /Quitar filtro Etapa: D06/ }))
    await waitFor(() => expect(lastQuery(mock).has('stage')).toBe(false))
    expect(lastQuery(mock).get('status')).toBe('OPERATIVE')

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    await waitFor(() => expect(lastQuery(mock).has('status')).toBe(false))
    expect(screen.queryByRole('list', { name: 'Filtros activos' })).not.toBeInTheDocument()
  })

  it('la búsqueda se envía con debounce (no una petición por tecla)', async () => {
    const mock = setup()
    renderAssets()
    await screen.findByRole('link', { name: 'MB-301' })
    const before = listCalls(mock).length

    await userEvent.type(screen.getByLabelText('Buscar'), 'molino')
    await waitFor(() => expect(lastQuery(mock).get('search')).toBe('molino'))
    expect(listCalls(mock).length - before).toBeLessThanOrEqual(2) // 6 teclas, no 6 peticiones
  })

  it('ordenar por una columna alterna asc/desc y lo indica con aria-sort', async () => {
    const mock = setup()
    renderAssets()
    await screen.findByRole('link', { name: 'MB-301' })
    expect(screen.getByRole('columnheader', { name: /Tag/ })).toHaveAttribute('aria-sort', 'ascending')

    await userEvent.click(screen.getByRole('button', { name: /Tag/ }))
    await waitFor(() => expect(Object.fromEntries(lastQuery(mock))).toMatchObject({ sort: 'tag', dir: 'desc' }))
    expect(screen.getByRole('columnheader', { name: /Tag/ })).toHaveAttribute('aria-sort', 'descending')

    await userEvent.click(screen.getByRole('button', { name: /Activo/ }))
    await waitFor(() => expect(Object.fromEntries(lastQuery(mock))).toMatchObject({ sort: 'name', dir: 'asc' }))
  })

  it('pagina: muestra el rango y pide la página siguiente', async () => {
    const mock = setup(() => page([asset()], 60, Number(1), 25))
    renderAssets()
    await screen.findByRole('link', { name: 'MB-301' })
    expect(screen.getByText('1–25 de 60')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(lastQuery(mock).get('page')).toBe('2'))
    expect(screen.getByText(/Página 2 de 3/)).toBeInTheDocument()
  })

  it('cambiar un filtro reinicia a la página 1', async () => {
    const mock = setup(() => page([asset()], 60))
    renderAssets(`${BASE}?page=3`)
    await screen.findByRole('link', { name: 'MB-301' })
    expect(lastQuery(mock).get('page')).toBe('3')

    await userEvent.type(screen.getByLabelText('Buscar'), 'x')
    await waitFor(() => expect(lastQuery(mock).get('search')).toBe('x'))
    expect(lastQuery(mock).has('page')).toBe(false)
  })

  describe('estados vacíos y de error', () => {
    it('visitante sin activos: mensaje claro y sin CTA de gestión', async () => {
      setup(page([]))
      renderAssets()
      expect(await screen.findByText('No hay activos registrados en esta planta')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /activo/i })).not.toBeInTheDocument()
    })

    it('con permiso asset.create el estado vacío ofrece registrar el primero', async () => {
      state.permissions = ['asset.create']
      setup(page([]))
      renderAssets()
      expect(await screen.findByRole('button', { name: /Registrar el primer activo/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Nuevo activo/ })).toBeInTheDocument()
    })

    it('sin resultados con filtros: lo explica y permite limpiarlos', async () => {
      const mock = setup(page([]))
      renderAssets(`${BASE}?status=STOCK`)
      expect(await screen.findByText('Ningún activo coincide con los filtros')).toBeInTheDocument()
      await userEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0])
      await waitFor(() => expect(lastQuery(mock).has('status')).toBe(false))
    })

    it('error del servidor: alerta con reintentar', async () => {
      let fail = true
      setup(() => {
        if (fail) throw new Error('x')
        return page([asset()])
      })
      // El mock lanza → fetch rechaza → error de red
      renderAssets()
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar')
      fail = false
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByRole('link', { name: 'MB-301' })).toBeInTheDocument()
    })

    it('muestra esqueletos accesibles mientras carga', async () => {
      setup(() => new Promise(() => undefined))
      renderAssets()
      expect(await screen.findByLabelText('Cargando activos')).toHaveAttribute('aria-busy', 'true')
    })
  })

  describe('permisos', () => {
    it('visitante: sin botón "Nuevo activo"', async () => {
      setup()
      renderAssets()
      await screen.findByRole('link', { name: 'MB-301' })
      expect(screen.queryByRole('button', { name: /Nuevo activo/ })).not.toBeInTheDocument()
    })
  })

  describe('alta de activo', () => {
    beforeEach(() => {
      state.permissions = ['asset.create']
    })

    async function openForm(mock: ReturnType<typeof setup>) {
      mock.calls.length = 0
      await userEvent.click(await screen.findByRole('button', { name: /Nuevo activo/ }))
      return screen.findByRole('dialog')
    }

    function withModelsAndPost(post: () => { status?: number; body?: unknown }) {
      return mockApi({
        'GET /plants/revemin-ii': { body: plantDetail() },
        'GET /plants/revemin-ii/stages': { body: STAGES },
        'GET /plants/revemin-ii/networks': { body: NETWORKS },
        'GET /catalog/families': { body: FAMILIES },
        'GET /catalog/assets': { body: page([{ id: 'm1', modelName: 'Bolas 16.5x24 ft', type: { name: 'Molino de bolas' }, manufacturer: { name: 'Metso' } }]) },
        'GET /plants/revemin-ii/assets': { body: page([asset()]) },
        'POST /plants/revemin-ii/assets': post,
      })
    }

    it('valida los campos obligatorios sin llamar al servidor', async () => {
      const mock = withModelsAndPost(() => ({ status: 201, body: {} }))
      renderAssets()
      const dialog = await openForm(mock as never)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear activo' }))

      expect(await within(dialog).findAllByText('Requerido')).toHaveLength(2)
      expect(within(dialog).getByText('Selecciona un modelo del catálogo')).toBeInTheDocument()
      expect(mock.count('POST /plants/revemin-ii/assets')).toBe(0)
    })

    it('solo ofrece etapas y redes HABILITADAS en la planta', async () => {
      const mock = withModelsAndPost(() => ({ status: 201, body: {} }))
      renderAssets()
      const dialog = await openForm(mock as never)

      expect(await within(dialog).findByRole('checkbox', { name: /FUR-IOT/ })).toBeInTheDocument()
      expect(within(dialog).getByRole('checkbox', { name: /FUR-PTE/ })).toBeInTheDocument()
      expect(within(dialog).queryByRole('checkbox', { name: /FUR-MNT/ })).not.toBeInTheDocument() // deshabilitada

      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Etapa' }))
      const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
      expect(options).toEqual(expect.arrayContaining(['Sin etapa asignada', 'D06 — Molienda Primaria', 'D07 — Molienda Secundaria']))
      expect(options.some((o) => o?.includes('D11'))).toBe(false) // deshabilitada
    })

    it('crea el activo con el cuerpo esperado y navega a su FUR', async () => {
      const mock = withModelsAndPost(() => ({ status: 201, body: { ...asset({ id: 'nuevo' }), furCode: 'FUR-REV-II-00042' } }))
      renderAssets()
      const dialog = await openForm(mock as never)

      await userEvent.type(within(dialog).getByLabelText('Tag'), 'mb-401')
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Molino nuevo')
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Modelo del catálogo' }))
      await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
      await userEvent.click(await within(dialog).findByRole('checkbox', { name: /FUR-IOT/ }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear activo' }))

      expect(await screen.findByText('Ficha del activo')).toBeInTheDocument()
      const body = JSON.parse(mock.calls.find((c) => c.method === 'POST')!.init.body as string)
      expect(body).toEqual({
        tag: 'mb-401',
        name: 'Molino nuevo',
        assetModelId: 'm1',
        criticality: 'MEDIUM',
        isPublic: false,
        networkCodes: ['FUR-IOT'],
        status: 'OPERATIVE',
      })
    })

    it('un tag repetido (409) se muestra en el campo Tag y el diálogo sigue abierto', async () => {
      const mock = withModelsAndPost(() => ({ status: 409, body: { message: 'Ya existe un activo con el tag MB-301 en esta planta' } }))
      renderAssets()
      const dialog = await openForm(mock as never)

      await userEvent.type(within(dialog).getByLabelText('Tag'), 'MB-301')
      await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Duplicado')
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Modelo del catálogo' }))
      await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Crear activo' }))

      expect(await within(dialog).findByText(/Ya existe un activo con el tag MB-301/)).toBeInTheDocument()
      expect(within(dialog).getByLabelText('Tag')).toHaveAttribute('aria-invalid', 'true')
    })
  })
})
