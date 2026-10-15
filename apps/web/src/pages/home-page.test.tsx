import { screen, within } from '@testing-library/react'
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
  { id: '1', code: 'D01', name: 'Recepción y Alimentación', sequenceDefault: 1, description: 'Recibe el mineral ROM y lo alimenta a la trituración.', stageGroup: 'TRITURACION', colorToken: 'orange', layoutImageUrl: '/stages/catalog/1/layout?v=1' },
  { id: '2', code: 'D06', name: 'Molienda Primaria', sequenceDefault: 6, description: null, stageGroup: 'MOLIENDA', colorToken: 'blue', layoutImageUrl: null },
]
const networks = [
  { id: 'n1', code: 'FUR-IOT', name: 'IoT / Instrumentación', description: 'Sensores y telemetría de la planta.', icon: 'radio', colorToken: 'network-iot', layoutImageUrl: '/networks/catalog/n1/layout?v=1' },
  { id: 'n2', code: 'FUR-CAM', name: 'Cámaras / Seguridad', description: null, icon: 'camera', colorToken: 'network-cam', layoutImageUrl: null },
]

describe('HomePage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('muestra los mapas de las plantas como tarjetas, y las redes y etapas del catálogo', async () => {
    stubApi({
      '/health': () => json({ status: 'ok', service: 'fur-api', database: 'up', timestamp: '' }),
      '/stages/catalog': () => json(stages),
      '/networks/catalog': () => json(networks),
    })
    renderWithProviders(<HomePage />)

    expect(await screen.findByText('D06')).toBeInTheDocument()
    expect(screen.getByText('Molienda Primaria')).toBeInTheDocument()
    expect(screen.getByText('FUR-IOT')).toBeInTheDocument()
    // Una tarjeta por mapa, con su imagen; ya no hay tarjeta de salud del sistema.
    for (const name of ['Caratal', 'Mina Colombia', 'Revemin', 'Mina Sosa']) {
      expect(screen.getByRole('img', { name: `Mapa de ${name}` })).toBeInTheDocument()
    }
    // Orden de las tarjetas: Caratal, Mina Colombia, Revemin y Mina Sosa.
    expect(screen.getAllByRole('img', { name: /^Mapa de / }).map((i) => i.getAttribute('alt'))).toEqual(['Mapa de Caratal', 'Mapa de Mina Colombia', 'Mapa de Revemin', 'Mapa de Mina Sosa'])
    expect(screen.getByRole('img', { name: 'Mapa de Revemin' })).toHaveAttribute('src', '/MAPA%20REVEMIN.png')
    expect(screen.queryByText('Salud del sistema')).not.toBeInTheDocument()
    // Sin encabezado de presentación: la página abre directo en el contenido (queda un h1 solo para lectores de pantalla).
    expect(screen.getByRole('heading', { level: 1, name: 'Página principal' })).toBeInTheDocument()
    expect(screen.queryByText('Ecosistema Digital FUR')).not.toBeInTheDocument()
  })

  it('el orden es: mapas, etapas del proceso y, debajo, redes transversales', async () => {
    stubApi({
      '/stages/catalog': () => json(stages),
      '/networks/catalog': () => json(networks),
    })
    renderWithProviders(<HomePage />)

    const stagesTitle = await screen.findByRole('heading', { name: 'Etapas del proceso' })
    const networksTitle = screen.getByRole('heading', { name: 'Redes Transversales' })
    expect(stagesTitle.compareDocumentPosition(networksTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('al pulsar una etapa abre un modal con la imagen del layout y su descripción', async () => {
    stubApi({
      '/stages/catalog': () => json(stages),
      '/networks/catalog': () => json(networks),
    })
    renderWithProviders(<HomePage />)

    await userEvent.click(await screen.findByRole('button', { name: /Ver la etapa D01/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Recepción y Alimentación')).toBeInTheDocument()
    expect(within(dialog).getByText('Recibe el mineral ROM y lo alimenta a la trituración.')).toBeInTheDocument()
    expect(within(dialog).getByRole('img', { name: /Layout de la etapa D01/ })).toHaveAttribute('src', expect.stringContaining('/stages/catalog/1/layout?v=1'))
  })

  it('la imagen del layout se puede ampliar y se vuelve al detalle de la etapa', async () => {
    stubApi({
      '/stages/catalog': () => json(stages),
      '/networks/catalog': () => json(networks),
    })
    renderWithProviders(<HomePage />)

    await userEvent.click(await screen.findByRole('button', { name: /Ver la etapa D01/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Ampliar el layout de la etapa D01/ }))
    // El de abajo queda oculto para lectores de pantalla mientras el de arriba está abierto.
    const dialogs = await screen.findAllByRole('dialog', { hidden: true })
    expect(dialogs).toHaveLength(2)
    expect(within(dialogs[1]).getByRole('img', { name: /Layout de la etapa D01/ })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1)
    expect(screen.getByText('Recibe el mineral ROM y lo alimenta a la trituración.')).toBeInTheDocument()
  })

  it('desde el modal se navega a la etapa anterior y a la siguiente sin cerrarlo', async () => {
    stubApi({
      '/stages/catalog': () => json(stages),
      '/networks/catalog': () => json(networks),
    })
    renderWithProviders(<HomePage />)

    await userEvent.click(await screen.findByRole('button', { name: /Ver la etapa D01/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Etapa 1 de 2/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Etapa anterior' })).toBeDisabled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Etapa siguiente' }))
    expect(within(dialog).getByText('Molienda Primaria')).toBeInTheDocument()
    expect(within(dialog).getByText(/Etapa 2 de 2/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Etapa siguiente' })).toBeDisabled()

    await userEvent.keyboard('{ArrowLeft}')
    expect(within(dialog).getByText('Recepción y Alimentación')).toBeInTheDocument()
  })

  it('al pulsar una red abre el modal con su imagen y descripción, y se navega entre redes', async () => {
    stubApi({
      '/stages/catalog': () => json(stages),
      '/networks/catalog': () => json(networks),
    })
    renderWithProviders(<HomePage />)

    await userEvent.click(await screen.findByRole('button', { name: /Ver la red FUR-IOT/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('IoT / Instrumentación')).toBeInTheDocument()
    expect(within(dialog).getByText('Sensores y telemetría de la planta.')).toBeInTheDocument()
    expect(within(dialog).getByRole('img', { name: /Imagen de la red FUR-IOT/ })).toHaveAttribute('src', expect.stringContaining('/networks/catalog/n1/layout?v=1'))
    expect(within(dialog).getByText(/Red 1 de 2/)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Red siguiente' }))
    expect(within(dialog).getByText('Cámaras / Seguridad')).toBeInTheDocument()
    expect(within(dialog).getByText('Esta red aún no tiene imagen.')).toBeInTheDocument()
    expect(within(dialog).getByText('Esta red aún no tiene descripción.')).toBeInTheDocument()
  })

  it('una etapa sin imagen ni descripción lo dice en el modal', async () => {
    stubApi({
      '/stages/catalog': () => json(stages),
      '/networks/catalog': () => json(networks),
    })
    renderWithProviders(<HomePage />)

    await userEvent.click(await screen.findByRole('button', { name: /Ver la etapa D06/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Esta etapa aún no tiene imagen de layout.')).toBeInTheDocument()
    expect(within(dialog).getByText('Esta etapa aún no tiene descripción.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument()
  })

  it('al pulsar una tarjeta abre el mapa a tamaño completo', async () => {
    stubApi({
      '/stages/catalog': () => json(stages),
      '/networks/catalog': () => json(networks),
    })
    renderWithProviders(<HomePage />)

    await userEvent.click(screen.getByRole('button', { name: 'Ampliar el mapa de Caratal' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('img', { name: 'Mapa de Caratal' })).toHaveAttribute('src', '/MAPA%20CARATAL.jpeg')
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
})
