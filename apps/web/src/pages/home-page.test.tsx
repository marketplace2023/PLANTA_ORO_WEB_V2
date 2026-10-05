import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/render'
import { HomePage } from './home-page'

vi.mock('@/features/plant/plant-context', () => ({
  usePlant: () => ({ currentPlant: null }),
}))

const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, statusText: 'x', json: async () => body })

function stubApi(routes: Record<string, () => unknown>) {
  const fn = vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((k) => url.endsWith(k))
    if (!key) throw new Error(`ruta no simulada: ${url}`)
    return routes[key]()
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const stages = [
  { id: '1', code: 'D01', name: 'Recepción y Alimentación', sequenceDefault: 1, description: null, stageGroup: 'TRITURACION', colorToken: 'orange' },
  { id: '2', code: 'D06', name: 'Molienda Primaria', sequenceDefault: 6, description: null, stageGroup: 'MOLIENDA', colorToken: 'blue' },
]
const networks = [{ id: 'n1', code: 'FUR-IOT', name: 'IoT / Instrumentación', description: null, icon: 'radio', colorToken: 'network-iot' }]

describe('HomePage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('muestra salud del sistema, redes y etapas del catálogo', async () => {
    stubApi({
      '/health': () => json({ status: 'ok', service: 'fur-api', database: 'up', timestamp: '' }),
      '/stages/catalog': () => json(stages),
      '/networks/catalog': () => json(networks),
    })
    renderWithProviders(<HomePage />)

    expect(await screen.findByText('D06')).toBeInTheDocument()
    expect(screen.getByText('Molienda Primaria')).toBeInTheDocument()
    expect(screen.getByText('FUR-IOT')).toBeInTheDocument()
    expect(await screen.findByText(/API: en línea/)).toBeInTheDocument()
    expect(screen.getByText(/Base de datos: conectada/)).toBeInTheDocument()
    // Contexto siempre visible (design.md §54)
    expect(screen.getByText('Ecosistema global')).toBeInTheDocument()
  })

  it('informa si la base de datos está caída sin ocultar que la API responde', async () => {
    stubApi({
      '/health': () => json({ status: 'degraded', service: 'fur-api', database: 'down', timestamp: '' }),
      '/stages/catalog': () => json(stages),
      '/networks/catalog': () => json(networks),
    })
    renderWithProviders(<HomePage />)
    expect(await screen.findByText(/API: en línea/)).toBeInTheDocument()
    expect(screen.getByText(/Base de datos: sin conexión/)).toBeInTheDocument()
  })

  it('muestra error con "Reintentar" cuando falla el catálogo y se recupera al reintentar', async () => {
    let fail = true
    stubApi({
      '/health': () => json({ status: 'ok', service: 'fur-api', database: 'up', timestamp: '' }),
      '/stages/catalog': () => (fail ? json({ message: 'boom' }, false) : json(stages)),
      '/networks/catalog': () => json(networks),
    })
    renderWithProviders(<HomePage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo cargar')

    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Molienda Primaria')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('indica "sin conexión" si la API no responde', async () => {
    stubApi({
      '/health': () => {
        throw new TypeError('Failed to fetch')
      },
      '/stages/catalog': () => json(stages),
      '/networks/catalog': () => json(networks),
    })
    renderWithProviders(<HomePage />)
    expect(await screen.findByText(/API: sin conexión/)).toBeInTheDocument()
  })
})
