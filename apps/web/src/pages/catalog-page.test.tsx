import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAMILIES, MODELS, page } from '@/test/assets-fixtures'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { CatalogPage } from './catalog-page'

type TestPlant = { id: string; code: string; name: string }
const PLANTS: TestPlant[] = [
  { id: 'p1', code: 'REV-II', name: 'REVEMIN II' },
  { id: 'p2', code: 'MCO-01', name: 'Mina Colombia' },
  { id: 'p3', code: 'NUEVA-01', name: 'Planta Nueva' },
]
const plantState = vi.hoisted(() => ({ currentPlant: null as { id: string; code: string; name: string } | null }))

vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ currentPlant: plantState.currentPlant, availablePlants: PLANTS }),
}))

const MAKERS = [{ id: 'mf1', name: 'Metso', countryCode: 'FI' }]
const STAGES = [
  { id: 's6', code: 'D06', name: 'Molienda Primaria', sequenceDefault: 6, description: null, stageGroup: 'MOLIENDA', colorToken: 'blue' },
  { id: 's7', code: 'D07', name: 'Molienda Secundaria', sequenceDefault: 7, description: null, stageGroup: 'MOLIENDA', colorToken: 'blue' },
  { id: 's8', code: 'D08', name: 'Clasificación', sequenceDefault: 8, description: null, stageGroup: 'MOLIENDA', colorToken: 'blue' },
]
const NETWORKS = [
  { id: 'n1', code: 'FUR-PTE', name: 'Potencia Eléctrica', description: null, icon: 'zap', colorToken: 'network-pte' },
  { id: 'n2', code: 'FUR-IOT', name: 'IoT / Instrumentación', description: null, icon: 'radio', colorToken: 'network-iot' },
]

function setup(models: unknown = page(MODELS, 2, 1, 24)) {
  return mockApi({
    'GET /catalog/assets': { body: models },
    'GET /catalog/families': { body: FAMILIES },
    'GET /catalog/manufacturers': { body: MAKERS },
    'GET /stages/catalog': { body: STAGES },
    'GET /networks/catalog': { body: NETWORKS },
  })
}
const modelCalls = (mock: ReturnType<typeof setup>) => mock.calls.filter((c) => c.path === '/catalog/assets')

describe('Catálogo global', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    plantState.currentPlant = null
  })

  it('lista modelos con familia, tipo, fabricante y especificaciones; deja claro que es global', async () => {
    setup()
    renderWithProviders(<CatalogPage />, { route: '/catalog' })

    const card = (await screen.findByRole('heading', { name: 'Bolas 16.5x24 ft' })).closest('li')!
    expect(within(card).getByText('Molinos')).toBeInTheDocument()
    expect(within(card).getByText('Molino de bolas')).toBeInTheDocument()
    expect(within(card).getByText('Metso · FI')).toBeInTheDocument()
    expect(within(card).getByText('diameterFt:')).toBeInTheDocument()
    expect(screen.getByText('Motor 4.0 MW 6 polos').closest('li')).toHaveTextContent('Genérico') // sin fabricante
    expect(screen.getByText('Ecosistema global')).toBeInTheDocument()
  })

  it('los filtros de la URL llegan a la API (familia, fabricante, búsqueda) y se ven como chips', async () => {
    const mock = setup()
    renderWithProviders(<CatalogPage />, { route: '/catalog?family=MOLINOS&manufacturerId=mf1&search=bolas' })
    await screen.findByRole('heading', { name: 'Bolas 16.5x24 ft' })

    expect(Object.fromEntries(modelCalls(mock).at(-1)!.query)).toMatchObject({ family: 'MOLINOS', manufacturerId: 'mf1', search: 'bolas', pageSize: '24' })
    const chips = screen.getByRole('list', { name: 'Filtros activos' })
    expect(await within(chips).findByRole('button', { name: /Quitar filtro Familia: Molinos/ })).toBeInTheDocument()
    expect(await within(chips).findByRole('button', { name: /Quitar filtro Fabricante: Metso/ })).toBeInTheDocument()
  })

  describe('Filtros por etapa y red transversal', () => {
    it('Etapa va primero y Red transversal después; ambas llegan a la API y se ven como chips', async () => {
      const mock = setup()
      renderWithProviders(<CatalogPage />, { route: '/catalog?stage=D06&network=FUR-PTE' })
      await screen.findByRole('heading', { name: 'Bolas 16.5x24 ft' })

      expect(Object.fromEntries(modelCalls(mock).at(-1)!.query)).toMatchObject({ stage: 'D06', network: 'FUR-PTE' })
      const chips = screen.getByRole('list', { name: 'Filtros activos' })
      expect(await within(chips).findByRole('button', { name: /Quitar filtro Etapa: D06 · Molienda Primaria/ })).toBeInTheDocument()
      expect(await within(chips).findByRole('button', { name: /Quitar filtro Red transversal: Potencia Eléctrica/ })).toBeInTheDocument()

      const order = screen.getAllByRole('combobox').map((c) => c.getAttribute('aria-label'))
      expect(order.indexOf('Etapa')).toBeLessThan(order.indexOf('Red transversal'))
      expect(order.indexOf('Red transversal')).toBeLessThan(order.indexOf('Familia'))
    })

    it('elegir una etapa y luego una red consulta con ambas', async () => {
      const mock = setup()
      renderWithProviders(<CatalogPage />, { route: '/catalog' })
      await screen.findByRole('heading', { name: 'Bolas 16.5x24 ft' })

      await userEvent.click(screen.getByRole('combobox', { name: 'Etapa' }))
      await userEvent.click(await screen.findByRole('option', { name: 'D07 · Molienda Secundaria' }))
      await waitFor(() => expect(modelCalls(mock).at(-1)!.query.get('stage')).toBe('D07'))

      await userEvent.click(screen.getByRole('combobox', { name: 'Red transversal' }))
      await userEvent.click(await screen.findByRole('option', { name: 'IoT / Instrumentación' }))
      await waitFor(() => expect(Object.fromEntries(modelCalls(mock).at(-1)!.query)).toMatchObject({ stage: 'D07', network: 'FUR-IOT' }))
    })

    it('quitar el chip de etapa conserva la red', async () => {
      const mock = setup()
      renderWithProviders(<CatalogPage />, { route: '/catalog?stage=D06&network=FUR-PTE' })
      await userEvent.click(await screen.findByRole('button', { name: /Quitar filtro Etapa/ }))
      await waitFor(() => expect(modelCalls(mock).at(-1)!.query.has('stage')).toBe(false))
      expect(modelCalls(mock).at(-1)!.query.get('network')).toBe('FUR-PTE')
    })

    it('cada tarjeta muestra las etapas y redes de su tipo; sin asignar no muestra nada', async () => {
      setup()
      renderWithProviders(<CatalogPage />, { route: '/catalog' })
      const card = (await screen.findByRole('heading', { name: 'Bolas 16.5x24 ft' })).closest('li')!
      const tags = within(card).getByRole('list', { name: 'Etapas y redes del tipo' })
      expect(within(tags).getByText('D06')).toBeInTheDocument()
      expect(within(tags).getByText('D07')).toBeInTheDocument()
      expect(await within(tags).findByText('Potencia Eléctrica')).toBeInTheDocument()
      const other = screen.getByText('Motor 4.0 MW 6 polos').closest('li')!
      expect(within(other).queryByRole('list', { name: 'Etapas y redes del tipo' })).not.toBeInTheDocument()
    })

    it('resume las etapas cuando son muchas: «Todas las etapas» o «+N etapas»', async () => {
      const codes = (n: number) => Array.from({ length: n }, (_, i) => `D${String(i + 1).padStart(2, '0')}`)
      const stages = codes(19).map((code, i) => ({ id: `s${i}`, code, name: `Etapa ${code}`, sequenceDefault: i + 1, description: null, stageGroup: 'X', colorToken: null }))
      const all = { ...MODELS[0], id: 'mall', modelName: 'Modelo en todas', type: { ...MODELS[0].type, stageCodes: codes(19) } }
      const many = { ...MODELS[1], id: 'mmany', modelName: 'Modelo en varias', type: { ...MODELS[1].type, stageCodes: codes(9), networkCodes: [] } }
      mockApi({
        'GET /catalog/assets': { body: page([all, many], 2, 1, 24) },
        'GET /catalog/families': { body: FAMILIES },
        'GET /catalog/manufacturers': { body: MAKERS },
        'GET /stages/catalog': { body: stages },
        'GET /networks/catalog': { body: NETWORKS },
      })
      renderWithProviders(<CatalogPage />, { route: '/catalog' })
      const allCard = (await screen.findByRole('heading', { name: 'Modelo en todas' })).closest('li')!
      expect(await within(allCard).findByText('Todas las etapas')).toBeInTheDocument()
      expect(within(allCard).queryByText('D19')).not.toBeInTheDocument()
      const manyCard = screen.getByRole('heading', { name: 'Modelo en varias' }).closest('li')!
      expect(within(manyCard).getByText('D06')).toBeInTheDocument()
      expect(within(manyCard).queryByText('D07')).not.toBeInTheDocument()
      expect(within(manyCard).getByText('+3 etapas')).toBeInTheDocument()
    })

    it('limpiar filtros quita también etapa y red', async () => {
      const mock = setup(page([], 0, 1, 24))
      renderWithProviders(<CatalogPage />, { route: '/catalog?stage=D06&network=FUR-PTE' })
      await userEvent.click(await screen.findByRole('button', { name: 'Limpiar filtros' }))
      await waitFor(() => {
        const q = modelCalls(mock).at(-1)!.query
        expect(q.has('stage') || q.has('network')).toBe(false)
      })
    })
  })

  it('quitar un chip vuelve a consultar sin ese filtro', async () => {
    const mock = setup()
    renderWithProviders(<CatalogPage />, { route: '/catalog?family=MOLINOS' })
    await screen.findByRole('heading', { name: 'Bolas 16.5x24 ft' })
    await userEvent.click(await screen.findByRole('button', { name: /Quitar filtro Familia/ }))
    await waitFor(() => expect(modelCalls(mock).at(-1)!.query.has('family')).toBe(false))
  })

  it('sin resultados: lo explica según haya o no filtros', async () => {
    setup(page([], 0, 1, 24))
    const { unmount } = renderWithProviders(<CatalogPage />, { route: '/catalog?search=zzz' })
    expect(await screen.findByText('Ningún modelo coincide')).toBeInTheDocument()
    unmount()

    setup(page([], 0, 1, 24))
    renderWithProviders(<CatalogPage />, { route: '/catalog' })
    expect(await screen.findByText('El catálogo está vacío')).toBeInTheDocument()
  })

  it('error: alerta con reintentar', async () => {
    let fail = true
    mockApi({
      'GET /catalog/assets': () => (fail ? { status: 500, body: {} } : { body: page(MODELS, 2, 1, 24) }),
      'GET /catalog/families': { body: FAMILIES },
      'GET /catalog/manufacturers': { body: MAKERS },
      'GET /stages/catalog': { body: STAGES },
      'GET /networks/catalog': { body: NETWORKS },
    })
    renderWithProviders(<CatalogPage />, { route: '/catalog' })
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar')
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Bolas 16.5x24 ft' })).toBeInTheDocument()
  })
  describe('Foto del modelo', () => {
    it('muestra la foto en la tarjeta de los modelos que la tienen y nada en los demás', async () => {
      const withPhoto = { ...MODELS[0], imageUrl: '/catalog/models/m-foto/image?v=123' }
      const without = { ...MODELS[1], imageUrl: null }
      setup(page([withPhoto, without], 2, 1, 24))
      renderWithProviders(<CatalogPage />, { route: '/catalog' })

      const card = (await screen.findByRole('heading', { name: withPhoto.modelName })).closest('li')!
      // la ruta del API es relativa a la URL base del API
      expect(within(card).getByAltText(`Foto de ${withPhoto.modelName}`)).toHaveAttribute('src', 'http://localhost:3000/api/v1/catalog/models/m-foto/image?v=123')
      const other = screen.getByRole('heading', { name: without.modelName }).closest('li')!
      expect(within(other).queryByRole('img')).not.toBeInTheDocument()
    })
  })

  describe('Mapa de la planta', () => {
    it('en el contexto global muestra los mapas de las plantas que tienen uno', async () => {
      setup()
      renderWithProviders(<CatalogPage />, { route: '/catalog' })
      expect(await screen.findByRole('heading', { name: 'Mapas de las plantas' })).toBeInTheDocument()
      expect(screen.getByAltText('Mapa de REVEMIN II')).toHaveAttribute('src', '/MAPA%20REVEMIN_NUEVO.jpg')
      expect(screen.getByAltText('Mapa de Mina Colombia')).toHaveAttribute('src', '/MAPA%20MINERVEN.jpeg')
      expect(screen.queryByAltText('Mapa de Planta Nueva')).not.toBeInTheDocument() // sin mapa: no se muestra
    })

    it('con una planta elegida muestra solo su mapa', async () => {
      plantState.currentPlant = PLANTS[1]
      setup()
      renderWithProviders(<CatalogPage />, { route: '/catalog' })
      expect(await screen.findByRole('heading', { name: 'Mapa de Mina Colombia' })).toBeInTheDocument()
      expect(screen.getByAltText('Mapa de Mina Colombia')).toBeInTheDocument()
      expect(screen.queryByAltText('Mapa de REVEMIN II')).not.toBeInTheDocument()
    })

    it('si la planta elegida no tiene mapa lo avisa en vez de dejar un hueco', async () => {
      plantState.currentPlant = PLANTS[2]
      setup()
      renderWithProviders(<CatalogPage />, { route: '/catalog' })
      expect(await screen.findByText('Planta Nueva aún no tiene un mapa cargado.')).toBeInTheDocument()
    })

    it('al pulsar el mapa se abre ampliado', async () => {
      plantState.currentPlant = PLANTS[0]
      setup()
      renderWithProviders(<CatalogPage />, { route: '/catalog' })
      await userEvent.click(await screen.findByRole('button', { name: 'Ampliar el mapa de REVEMIN II' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByAltText('Mapa de REVEMIN II')).toBeInTheDocument()
    })
  })
})
