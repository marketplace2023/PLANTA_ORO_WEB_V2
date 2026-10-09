import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asset, FAMILIES, fur, NETWORKS, page, plantDetail, STAGES } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { AssetsPage } from './assets-page'
import { PlantRoute } from './plant-route'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ permissions: state.permissions, currentPlant: { name: 'REVEMIN II', slug: 'revemin-ii' } }),
}))

const BASE = '/plants/revemin-ii/assets'

const SUMMARY = {
  total: 3,
  byStatus: { OPERATIVE: 1, MAINTENANCE: 1, REPAIR: 1 },
  byCriticality: { CRITICAL: 1, HIGH: 1, LOW: 1 },
  byStage: { D07: 3 }, // D06 no tiene activos: la vista abre en D07, la primera que sí
  byNetwork: { 'FUR-IOT': 2, 'FUR-PTE': 1 },
}

const D07 = { code: 'D07', name: 'Molienda Secundaria', group: 'MOLIENDA' }
const ASSETS = [
  asset({ id: 'a1', tag: 'MB-301', name: 'Molino de bolas 1', stage: D07, mapPosition: { x: 40, y: 50 }, model: { id: 'm1', name: 'Bolas 16.5x24 ft', imageUrl: '/catalog/models/m1/image?v=1' } }),
  asset({ id: 'a2', tag: 'MT-301', name: 'Motor del molino', status: 'MAINTENANCE', criticality: 'HIGH', stage: D07, family: { code: 'MOTORES', name: 'Motores' } }),
  asset({ id: 'a3', tag: 'HC-801', name: 'Hidrociclón', status: 'REPAIR', criticality: 'LOW', stage: D07, family: { code: 'CRIBAS', name: 'Cribas y clasificadores' } }),
]
// D07 ya está ubicada en el mapa; D06 no.
const MAPPED_STAGES = STAGES.map((s) => ({ ...s, mapPosition: s.code === 'D07' ? { x: 30, y: 20 } : null }))

function setup(assets: unknown = page(ASSETS, 3, 1, 100), summary: unknown = SUMMARY) {
  return mockApi({
    'GET /plants/revemin-ii': { body: plantDetail() },
    'GET /plants/revemin-ii/stages': { body: MAPPED_STAGES },
    'GET /plants/revemin-ii/networks': { body: NETWORKS },
    'GET /plants/revemin-ii/assets/summary': { body: summary },
    'GET /catalog/families': { body: FAMILIES },
    'GET /plants/revemin-ii/assets': { body: assets },
    'GET /plants/revemin-ii/assets/a1/fur': { body: fur({}, { id: 'a1', specifications: { powerKw: 3000, voltageV: 4160 } }) },
    'GET /plants/revemin-ii/assets/a2/fur': { body: fur({}, { id: 'a2', tag: 'MT-301', name: 'Motor del molino', status: 'MAINTENANCE', specifications: { poles: 6 } }) },
    'GET /plants/revemin-ii/assets/a3/fur': { body: fur({}, { id: 'a3', tag: 'HC-801', name: 'Hidrociclón', specifications: {} }) },
    'PATCH /plants/revemin-ii/assets/a1': { body: {} },
    'PATCH /plants/revemin-ii/assets/a2': { body: {} },
    'PATCH /plants/revemin-ii/stages/s7': { body: {} },
  })
}

const renderGeo = (route = BASE) =>
  renderWithProviders(
    <Routes>
      <Route path="/plants/:plantSlug" element={<PlantRoute />}>
        <Route path="assets" element={<AssetsPage />} />
        <Route path="assets/:assetId" element={<p>Ficha del activo</p>} />
      </Route>
    </Routes>,
    { route },
  )

/** Las tarjetas de la etapa (el mismo activo también aparece como marcador en el mapa). */
const cards = async () => within(await screen.findByRole('list', { name: 'Activos de la etapa' }))

const listCalls = (mock: ReturnType<typeof setup>) => mock.calls.filter((c) => c.path === '/plants/revemin-ii/assets')
const lastQuery = (mock: ReturnType<typeof setup>) => listCalls(mock).at(-1)!.query
const patches = (mock: ReturnType<typeof setup>) => mock.calls.filter((c) => c.method === 'PATCH')

describe('Geoportal de Activos Físicos', () => {
  beforeEach(() => {
    state.permissions = []
  })
  afterEach(() => vi.unstubAllGlobals())

  it('es la vista por defecto: indicadores del servidor, etapas con su conteo y redes habilitadas', async () => {
    setup()
    renderGeo()

    expect(await screen.findByRole('heading', { name: 'Geoportal de Activos Físicos' })).toBeInTheDocument()
    const kpis = await screen.findByRole('list', { name: 'Indicadores de la planta' })
    await waitFor(() => expect(within(kpis).getByText('Activos físicos').previousElementSibling).toHaveTextContent('3'))
    expect(within(kpis).getByText('Etapas del proceso').previousElementSibling).toHaveTextContent('2') // la etapa D11 está deshabilitada
    expect(within(kpis).getByText('Operativos').previousElementSibling).toHaveTextContent('1')
    expect(within(kpis).getByText('En mantenimiento o reparación').previousElementSibling).toHaveTextContent('2')
    expect(within(kpis).getByText('Criticidad crítica').previousElementSibling).toHaveTextContent('1')
    expect(within(kpis).getByText('Redes transversales').previousElementSibling).toHaveTextContent('2') // FUR-MNT está deshabilitada

    const stages = screen.getByRole('list', { name: 'Etapas' })
    expect(within(stages).getAllByRole('button')).toHaveLength(2)
    expect(within(stages).queryByText('Lixiviación')).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Redes' })).getAllByRole('button')).toHaveLength(2)
  })

  it('abre en la primera etapa que tiene activos y consulta solo esa etapa', async () => {
    const mock = setup()
    renderGeo()

    await cards()
    expect(within(screen.getByRole('list', { name: 'Etapas' })).getByRole('button', { name: /Molienda Secundaria/ })).toHaveAttribute('aria-current', 'true')
    expect(Object.fromEntries(lastQuery(mock))).toMatchObject({ stage: 'D07', pageSize: '100' })
    expect(lastQuery(mock).has('view')).toBe(false)
    expect(screen.getByRole('heading', { name: 'Etapa 07 · Molienda Secundaria' })).toBeInTheDocument()
    expect(screen.getByText('REVEMIN II · Mapa integral de activos físicos · Etapa 07 – Molienda Secundaria')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Activos asociados a la etapa 07' })).toBeInTheDocument()
  })

  it('la etapa de la URL manda y elegir otra cambia la consulta y la ficha de la etapa', async () => {
    const mock = setup()
    renderGeo(`${BASE}?stage=D06`)
    await screen.findByRole('heading', { name: 'Etapa 06 · Molienda Primaria' })
    expect(lastQuery(mock).get('stage')).toBe('D06')

    await userEvent.click(within(screen.getByRole('list', { name: 'Etapas' })).getByRole('button', { name: /Molienda Secundaria/ }))
    await screen.findByRole('heading', { name: 'Etapa 07 · Molienda Secundaria' })
    await waitFor(() => expect(lastQuery(mock).get('stage')).toBe('D07'))
  })

  it('cada activo es una tarjeta con su estado y la foto del modelo (si la hay)', async () => {
    setup()
    renderGeo()

    const grid = await cards()
    const withPhoto = grid.getByRole('button', { name: /MB-301/ })
    expect(within(withPhoto).getByText('Operativo')).toBeInTheDocument()
    expect(within(withPhoto).getByAltText('Foto de Bolas 16.5x24 ft')).toHaveAttribute('src', 'http://localhost:3000/api/v1/catalog/models/m1/image?v=1')
    const noPhoto = grid.getByRole('button', { name: /MT-301/ })
    expect(within(noPhoto).getByText('En mantenimiento')).toBeInTheDocument()
    expect(within(noPhoto).queryByRole('img')).not.toBeInTheDocument()
  })

  it('los indicadores de la etapa salen de sus activos', async () => {
    setup()
    renderGeo()
    await cards()
    const detail = screen.getByRole('heading', { name: 'Etapa 07 · Molienda Secundaria' }).closest('section')!
    expect(within(detail).getByText('activos asociados').previousElementSibling).toHaveTextContent('3')
    expect(within(detail).getByText('operativos').previousElementSibling).toHaveTextContent('1')
    expect(within(detail).getByText('en mantenimiento o reparación').previousElementSibling).toHaveTextContent('2')
  })

  describe('Ficha técnica general', () => {
    it('muestra el primer activo de la etapa con sus datos y especificaciones legibles', async () => {
      setup()
      renderGeo()

      const ficha = (await screen.findByRole('heading', { name: 'Ficha técnica general' })).closest('section')!
      const data = await within(ficha).findByRole('list', { name: 'Datos del activo' }).catch(() => within(ficha).findByLabelText('Datos del activo'))
      expect(within(ficha).getByText('Operativo')).toBeInTheDocument()
      expect(within(data).getByText('Código FUR').nextElementSibling).toHaveTextContent('FUR-REV-II-00001')
      expect(within(data).getByText('Tag').nextElementSibling).toHaveTextContent('MB-301')
      expect(within(data).getByText('Etapa').nextElementSibling).toHaveTextContent('07 · Molienda Secundaria')
      expect(within(data).getByText('Redes activas').nextElementSibling).toHaveTextContent('FUR-IOT')
      expect(await within(data).findByText('Potencia (kW)')).toBeInTheDocument()
      expect(within(data).getByText('Tensión (V)').nextElementSibling).toHaveTextContent('4160')
      expect(within(ficha).getByRole('link', { name: /Abrir la ficha completa/ })).toHaveAttribute('href', '/plants/revemin-ii/assets/a1')
    })

    it('elegir otra tarjeta cambia la ficha y el activo elegido queda en la URL', async () => {
      setup()
      renderGeo()
      const grid = await cards()
      const card = grid.getByRole('button', { name: /MT-301/ })
      await userEvent.click(card)

      expect(card).toHaveAttribute('aria-pressed', 'true')
      const ficha = screen.getByRole('heading', { name: 'Ficha técnica general' }).closest('section')!
      await waitFor(() => expect(within(ficha).getByRole('link', { name: /Abrir la ficha completa/ })).toHaveAttribute('href', '/plants/revemin-ii/assets/a2'))
      expect(await within(ficha).findByText('Polos')).toBeInTheDocument()
    })

    it('si no hay activos lo dice', async () => {
      setup(page([], 0, 1, 100))
      renderGeo(`${BASE}?stage=D06`)
      expect(await screen.findByText('Elige un activo para ver su ficha técnica.')).toBeInTheDocument()
    })
  })

  describe('Red transversal (segundo filtro)', () => {
    it('se aplica, se ve como activa y se quita al pulsarla de nuevo', async () => {
      const mock = setup()
      renderGeo()
      await cards()

      const iot = screen.getByRole('button', { name: /FUR-IOT/ })
      await userEvent.click(iot)
      await waitFor(() => expect(Object.fromEntries(lastQuery(mock))).toMatchObject({ stage: 'D07', network: 'FUR-IOT' }))
      expect(iot).toHaveAttribute('aria-pressed', 'true')
      expect(within(iot).getByText('Activa')).toBeInTheDocument()

      await userEvent.click(iot)
      await waitFor(() => expect(lastQuery(mock).has('network')).toBe(false))
    })

    it('nombra la red en el encabezado, en el título de las tarjetas y en la ficha técnica', async () => {
      setup()
      renderGeo(`${BASE}?stage=D07&network=FUR-PTE`)

      expect(await screen.findByText('REVEMIN II · Mapa integral de activos físicos · Etapa 07 – Molienda Secundaria · Red transversal – Potencia Eléctrica')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Activos asociados a la red Potencia Eléctrica (Etapa 07)' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Ficha técnica general / Potencia Eléctrica' })).toBeInTheDocument()
    })
  })

  it('la búsqueda se envía al servidor con la etapa elegida', async () => {
    const mock = setup()
    renderGeo()
    await cards()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar activos' }), 'molino')
    await waitFor(() => expect(Object.fromEntries(lastQuery(mock))).toMatchObject({ search: 'molino', stage: 'D07' }))
  })

  it('con muchos activos muestra los primeros ocho y «Ver los N activos» abre el resto', async () => {
    const many = Array.from({ length: 11 }, (_, i) => asset({ id: `x${i}`, tag: `T-${String(i).padStart(2, '0')}`, name: `Equipo ${i}`, stage: D07 }))
    setup(page(many, 11, 1, 100))
    renderGeo()

    const list = await screen.findByRole('list', { name: 'Activos de la etapa' })
    expect(within(list).getAllByRole('button')).toHaveLength(8)
    await userEvent.click(screen.getByRole('button', { name: 'Ver los 11 activos' }))
    expect(within(screen.getByRole('list', { name: 'Activos de la etapa' })).getAllByRole('button')).toHaveLength(11)
    expect(screen.queryByRole('button', { name: /Ver los 11 activos/ })).not.toBeInTheDocument()
  })

  it('una etapa sin activos lo dice; con filtros distingue que no hay coincidencias', async () => {
    setup(page([], 0, 1, 100))
    const { unmount } = renderGeo(`${BASE}?stage=D06`)
    expect(await screen.findByText('Esta etapa aún no tiene activos registrados.')).toBeInTheDocument()
    unmount()

    setup(page([], 0, 1, 100))
    renderGeo(`${BASE}?stage=D06&network=FUR-PTE`)
    expect(await screen.findByText('Ningún activo de esta etapa coincide con los filtros.')).toBeInTheDocument()
  })

  it('error al cargar los activos: alerta con reintentar', async () => {
    let fail = true
    mockApi({
      'GET /plants/revemin-ii': { body: plantDetail() },
      'GET /plants/revemin-ii/stages': { body: MAPPED_STAGES },
      'GET /plants/revemin-ii/networks': { body: NETWORKS },
      'GET /plants/revemin-ii/assets/summary': { body: SUMMARY },
      'GET /plants/revemin-ii/assets': () => (fail ? { status: 500, body: {} } : { body: page(ASSETS, 3, 1, 100) }),
      'GET /plants/revemin-ii/assets/a1/fur': { body: fur({}, { id: 'a1' }) },
    })
    renderGeo()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar')
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect((await cards()).getByRole('button', { name: /MB-301/ })).toBeInTheDocument()
  })

  describe('Mapa', () => {
    it('muestra la imagen de la planta con las etapas y los activos ya ubicados, que se pueden elegir', async () => {
      setup()
      renderGeo()

      expect(await screen.findByAltText('Mapa de REVEMIN II')).toHaveAttribute('src', '/MAPA%20REVEMIN_NUEVO.jpg')
      const stageChip = await screen.findByRole('button', { name: 'Etapa 07 Molienda Secundaria' })
      expect(stageChip).toHaveStyle({ left: '30%', top: '20%' })
      expect(stageChip).toHaveAttribute('aria-pressed', 'true') // es la etapa elegida
      const marker = await screen.findByRole('button', { name: 'Activo MB-301 Molino de bolas 1' })
      expect(marker).toHaveStyle({ left: '40%', top: '50%' })
      // MT-301 y HC-801 no tienen posición: no aparecen en el mapa
      expect(screen.queryByRole('button', { name: /^Activo MT-301/ })).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /^Activo MB-301/ }))
      expect(marker).toHaveAttribute('aria-pressed', 'true')
    })

    it('elegir un activo desde el mapa actualiza la ficha técnica', async () => {
      setup()
      renderGeo(`${BASE}?stage=D07&asset=a2`)
      const ficha = (await screen.findByRole('heading', { name: 'Ficha técnica general' })).closest('section')!
      await waitFor(() => expect(within(ficha).getByRole('link', { name: /Abrir la ficha completa/ })).toHaveAttribute('href', '/plants/revemin-ii/assets/a2'))

      await userEvent.click(await screen.findByRole('button', { name: /^Activo MB-301/ }))
      await waitFor(() => expect(within(ficha).getByRole('link', { name: /Abrir la ficha completa/ })).toHaveAttribute('href', '/plants/revemin-ii/assets/a1'))
    })

    it('las capas se activan y desactivan', async () => {
      setup()
      renderGeo()
      await screen.findByRole('button', { name: /^Activo MB-301/ })

      await userEvent.click(screen.getByRole('checkbox', { name: 'Activos físicos' }))
      expect(screen.queryByRole('button', { name: /^Activo MB-301/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Etapa 07/ })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('checkbox', { name: 'Etapas' }))
      expect(screen.queryByRole('button', { name: 'Etapa 07 Molienda Secundaria' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('checkbox', { name: 'Activos físicos' }))
      expect(await screen.findByRole('button', { name: /^Activo MB-301/ })).toBeInTheDocument()
    })

    it('se puede ampliar y el mapa ampliado conserva los marcadores', async () => {
      setup()
      renderGeo()
      await screen.findByRole('button', { name: /^Activo MB-301/ })
      await userEvent.click(screen.getByRole('button', { name: 'Ampliar el mapa de REVEMIN II' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByAltText('Mapa de REVEMIN II')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: /^Activo MB-301/ })).toBeInTheDocument()
    })

    describe('ubicar en el mapa', () => {
      beforeEach(() => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
      })
      afterEach(() => vi.restoreAllMocks())

      it('sin permisos no hay botón para ubicar', async () => {
        setup()
        renderGeo()
        await screen.findByRole('button', { name: /^Activo MB-301/ })
        expect(screen.queryByRole('button', { name: /Ubicar en el mapa/ })).not.toBeInTheDocument()
      })

      it('con permiso de editar activos ubica el activo elegido donde se hace clic (en porcentaje) y se guarda', async () => {
        state.permissions = ['asset.update']
        const mock = setup()
        renderGeo(`${BASE}?stage=D07&asset=a2`)
        await screen.findByRole('button', { name: /^Activo MB-301/ })

        await userEvent.click(screen.getByRole('button', { name: /Ubicar en el mapa/ }))
        expect(screen.queryByRole('button', { name: 'Etapa 07' })).not.toBeInTheDocument() // sin permiso de configurar no se ofrece ubicar etapas
        expect(screen.getByText('Haz clic en el mapa para ubicar el activo MT-301.')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Colocar el activo MT-301 en el mapa' }), { clientX: 50, clientY: 25 })
        await waitFor(() => expect(patches(mock)).toHaveLength(1))
        expect(patches(mock)[0].path).toBe('/plants/revemin-ii/assets/a2')
        expect(JSON.parse(String(patches(mock)[0].init.body))).toEqual({ mapPosition: { x: 25, y: 25 } })
      })

      it('con permiso de configurar la planta ubica la etapa elegida', async () => {
        state.permissions = ['plant.configure']
        const mock = setup()
        renderGeo()
        await screen.findByRole('button', { name: /^Activo MB-301/ })

        await userEvent.click(screen.getByRole('button', { name: /Ubicar en el mapa/ }))
        expect(screen.getByText('Haz clic en el mapa para ubicar la etapa 07.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Colocar la etapa 07 en el mapa' }), { clientX: 400, clientY: 200 })
        await waitFor(() => expect(patches(mock)).toHaveLength(1))
        expect(patches(mock)[0].path).toBe('/plants/revemin-ii/stages/s7')
        expect(JSON.parse(String(patches(mock)[0].init.body))).toEqual({ mapPosition: { x: 100, y: 100 } }) // fuera de la imagen se ajusta al borde
      })

      it('«Quitar posición» envía null y «Listo» sale del modo ubicar', async () => {
        state.permissions = ['asset.update']
        const mock = setup()
        renderGeo()
        await screen.findByRole('button', { name: /^Activo MB-301/ })
        await userEvent.click(screen.getByRole('button', { name: /Ubicar en el mapa/ }))

        await userEvent.click(screen.getByRole('button', { name: /Quitar posición/ }))
        await waitFor(() => expect(patches(mock)).toHaveLength(1))
        expect(JSON.parse(String(patches(mock)[0].init.body))).toEqual({ mapPosition: null })

        await userEvent.click(screen.getByRole('button', { name: 'Listo' }))
        expect(screen.queryByRole('button', { name: /Colocar el activo/ })).not.toBeInTheDocument()
      })

      it('mientras se ubica, los marcadores no se pueden pulsar (el clic es para colocar)', async () => {
        state.permissions = ['asset.update']
        setup()
        renderGeo()
        const marker = await screen.findByRole('button', { name: /^Activo MB-301/ })
        await userEvent.click(screen.getByRole('button', { name: /Ubicar en el mapa/ }))
        expect(marker).toBeDisabled()
      })
    })
  })

  describe('Alternar con la lista', () => {
    it('«Lista» muestra la tabla completa y «Geoportal» vuelve; la etapa y la red se conservan', async () => {
      const mock = setup()
      renderGeo(`${BASE}?stage=D07&network=FUR-IOT`)
      await screen.findByRole('heading', { name: 'Geoportal de Activos Físicos' })

      await userEvent.click(screen.getByRole('button', { name: 'Lista' }))
      expect(await screen.findByRole('columnheader', { name: /Criticidad/ })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Activos Físicos' })).toBeInTheDocument()
      await waitFor(() => expect(Object.fromEntries(lastQuery(mock))).toMatchObject({ stage: 'D07', network: 'FUR-IOT' }))
      expect(lastQuery(mock).has('view')).toBe(false)

      await userEvent.click(screen.getByRole('button', { name: 'Geoportal' }))
      expect(await screen.findByRole('heading', { name: 'Geoportal de Activos Físicos' })).toBeInTheDocument()
    })

    it('«Nuevo activo» solo aparece con permiso de crear, en las dos vistas', async () => {
      setup()
      const { unmount } = renderGeo()
      await screen.findByRole('heading', { name: 'Geoportal de Activos Físicos' })
      expect(screen.queryByRole('button', { name: /Nuevo activo/ })).not.toBeInTheDocument()
      unmount()

      state.permissions = ['asset.create']
      setup()
      renderGeo()
      expect(await screen.findByRole('button', { name: /Nuevo activo/ })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Lista' }))
      expect(await screen.findByRole('button', { name: /Nuevo activo/ })).toBeInTheDocument()
    })
  })
})
