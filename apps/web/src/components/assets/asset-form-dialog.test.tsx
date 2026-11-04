import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { mockApi } from '@/test/fetch-mock'
import { detail, MODELS, NETWORKS, page, STAGES } from '@/test/assets-fixtures'
import { AssetFormDialog } from './asset-form-dialog'

const families = [{ id: 'f1', code: 'MOLINOS', name: 'Molinos', tagCode: 'MOL', icon: null }, { id: 'f2', code: 'MOTORES', name: 'Motores', tagCode: 'MOT', icon: null }]
function setup(routes: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /catalog/specifications': { body: [] },
    'GET /catalog/families': { body: families },
    'GET /catalog/assets': ({ query }) => ({ body: page(query.get('stage') === 'D06' && query.get('network') === 'FUR-PTE' ? [MODELS[query.get('family') === 'MOTORES' ? 1 : 0]] : []) }),
    'GET /plants/revemin-ii/stages': { body: STAGES },
    'GET /plants/revemin-ii/networks': { body: NETWORKS },
    'GET /plants/revemin-ii/assets/tag-preview': ({ query }) => ({ body: { tag: `${query.get('networkCode')}-${query.get('stageCode')}-${query.get('familyId') === 'f2' ? 'MOT' : 'MOL'}-007` } }),
    'POST /plants/revemin-ii/assets': { status: 201, body: detail() },
    'PATCH /plants/revemin-ii/assets/a1': { body: detail() },
    ...routes,
  })
}
async function family(name = 'MOL · Molinos') {
  if (screen.getByRole('combobox', { name: 'Red transversal' }).textContent?.includes('Sin red')) {
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Red transversal' })).toBeEnabled())
    await userEvent.click(screen.getByRole('combobox', { name: 'Red transversal' }))
    await userEvent.click(await screen.findByRole('option', { name: /FUR-PTE/ }))
  }
  if (screen.getByRole('combobox', { name: 'Etapa' }).textContent?.includes('Sin etapa')) {
    await userEvent.click(screen.getByRole('combobox', { name: 'Etapa' }))
    await userEvent.click(await screen.findByRole('option', { name: 'D06 - Molienda Primaria' }))
  }
  await userEvent.click(await screen.findByRole('combobox', { name: 'Familia' }))
  await userEvent.click(await screen.findByRole('option', { name }))
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Activo propio de planta', () => {
  it('ordena red, etapa y familia; registra datos propios sin precargas aunque se agregue una referencia', async () => {
    const api = setup()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    expect(screen.getByLabelText('Tag')).toHaveValue('XXX-XXX-XXX-001')
    const boxes = screen.getAllByRole('combobox')
    expect(boxes.slice(0, 3).map(box => box.getAttribute('aria-label'))).toEqual(['Red transversal', 'Etapa', 'Familia'])
    await waitFor(() => expect(boxes[0]).toBeEnabled())
    await userEvent.click(boxes[0]); await userEvent.click(await screen.findByRole('option', { name: /FUR-PTE/ }))
    await userEvent.click(boxes[1]); await userEvent.click(await screen.findByRole('option', { name: 'D06 - Molienda Primaria' }))
    await family()
    await waitFor(() => expect(screen.getByLabelText('Tag')).toHaveValue('FUR-PTE-D06-MOL-007'))
    expect(screen.getByLabelText('Nombre')).toHaveValue('')
    expect(await screen.findByText('Esta familia aún no tiene especificaciones definidas.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nombre'), 'Equipo de mi planta')
    await userEvent.click(screen.getByRole('combobox', { name: 'Modelo del catálogo' }))
    await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Equipo de mi planta')
    expect(screen.getByText('Sin componentes registrados.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Crear activo' }))
    await waitFor(() => expect(api.count('POST /plants/revemin-ii/assets')).toBe(1))
    const body = JSON.parse(api.calls.find(call => call.method === 'POST')!.init.body as string)
    expect(body).toMatchObject({ familyId: 'f1', referenceModelIds: ['m1'], name: 'Equipo de mi planta', specifications: {}, components: [], networkCodes: ['FUR-PTE'] })
    expect(body).not.toHaveProperty('assetModelId')
  })

  it('carga parámetros de la familia sin nombres libres y registra valores numéricos y sí/no', async () => {
    const api = setup({ 'GET /catalog/specifications': { body: [
      { id: 'power', familyId: 'f1', label: 'Potencia', unit: 'kW', key: 'Potencia (kW)', valueType: 'NUMBER', required: true, sortOrder: 1 },
      { id: 'lube', familyId: 'f1', label: 'Requiere lubricación', unit: null, key: 'Requiere lubricación', valueType: 'BOOLEAN', required: true, sortOrder: 2 },
    ] } })
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    await family()
    expect(screen.queryByRole('button', { name: 'Agregar especificación' })).not.toBeInTheDocument()
    await userEvent.type(await screen.findByLabelText(/Potencia/), '12,5')
    await userEvent.selectOptions(screen.getByLabelText(/Requiere lubricación/), 'false')
    await userEvent.type(screen.getByLabelText('Nombre'), 'Activo con ficha propia')
    await userEvent.click(screen.getByRole('button', { name: 'Crear activo' }))
    await waitFor(() => expect(api.count('POST /plants/revemin-ii/assets')).toBe(1))
    const body = JSON.parse(api.calls.find(call => call.method === 'POST')!.init.body as string)
    expect(body.specifications).toEqual({ 'Potencia (kW)': 12.5, 'Requiere lubricación': false })
    expect(api.calls.some(call => call.path === '/catalog/specifications' && call.query.get('familyId') === 'f1')).toBe(true)
  })

  it('mantiene las referencias seleccionadas en el desplegable con un check y permite desmarcarlas', async () => {
    setup()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    await family()
    await userEvent.click(screen.getByRole('combobox', { name: 'Modelo del catálogo' }))
    const initial = await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ })
    expect(initial).toHaveAttribute('data-checked', 'false')
    await userEvent.click(initial)
    expect(screen.getByRole('button', { name: /Quitar referencia/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Modelo del catálogo' }))
    const selected = await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ })
    expect(selected).toHaveAttribute('data-checked', 'true')
    expect(within(selected).getByText('Seleccionado')).toBeInTheDocument()
    expect(selected.querySelectorAll('svg.lucide-check')).toHaveLength(1)
    await userEvent.click(selected)
    expect(screen.queryByRole('button', { name: /Quitar referencia/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Modelo del catálogo' }))
    expect(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ })).toHaveAttribute('data-checked', 'false')
  })
  it('filtra referencias por familia y etapa y limpia la selección al cambiar de etapa', async () => {
    const api = setup()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    expect(screen.queryByRole('combobox', { name: 'Modelo del catálogo' })).not.toBeInTheDocument()
    await family()
    await userEvent.click(screen.getByRole('combobox', { name: 'Modelo del catálogo' }))
    await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
    expect(api.calls.some(call => call.path === '/catalog/assets' && call.query.get('family') === 'MOLINOS' && call.query.get('stage') === 'D06')).toBe(true)
    await userEvent.click(screen.getByRole('combobox', { name: 'Etapa' }))
    await userEvent.click(await screen.findByRole('option', { name: 'D07 - Molienda Secundaria' }))
    expect(screen.queryByRole('button', { name: /Quitar referencia/ })).not.toBeInTheDocument()
    await waitFor(() => expect(api.calls.some(call => call.path === '/catalog/assets' && call.query.get('family') === 'MOLINOS' && call.query.get('stage') === 'D07')).toBe(true))
    await userEvent.click(screen.getByRole('combobox', { name: 'Modelo del catálogo' }))
    expect(await screen.findByText('No hay modelos activos disponibles.')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Bolas 16.5x24 ft/ })).not.toBeInTheDocument()
  })
  it('combina familia, etapa y red; limpia referencias al cambiar la red y espera una red seleccionada', async () => {
    const api = setup()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    await family()
    await userEvent.click(screen.getByRole('combobox', { name: 'Modelo del catálogo' }))
    await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
    expect(api.calls.some(call => call.path === '/catalog/assets' && call.query.get('family') === 'MOLINOS' && call.query.get('stage') === 'D06' && call.query.get('network') === 'FUR-PTE')).toBe(true)
    await userEvent.click(screen.getByRole('combobox', { name: 'Red transversal' }))
    await userEvent.click(await screen.findByRole('option', { name: /FUR-IOT/ }))
    expect(screen.queryByRole('button', { name: /Quitar referencia/ })).not.toBeInTheDocument()
    await waitFor(() => expect(api.calls.some(call => call.path === '/catalog/assets' && call.query.get('family') === 'MOLINOS' && call.query.get('stage') === 'D06' && call.query.get('network') === 'FUR-IOT')).toBe(true))
    await userEvent.click(screen.getByRole('combobox', { name: 'Modelo del catálogo' }))
    expect(await screen.findByText('No hay modelos activos disponibles.')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Bolas 16.5x24 ft/ })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('combobox', { name: 'Red transversal' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Sin red asignada' }))
    expect(screen.queryByRole('combobox', { name: 'Modelo del catálogo' })).not.toBeInTheDocument()
  })
  it('busca familias por nombre o código y cambia las referencias ofrecidas sin alterar el nombre', async () => {
    const api = setup()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    await family()
    await userEvent.click(screen.getByRole('combobox', { name: 'Modelo del catálogo' }))
    await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
    await userEvent.type(screen.getByLabelText('Nombre'), 'Propio')
    await userEvent.click(screen.getByRole('combobox', { name: 'Familia' }))
    await userEvent.type(await screen.findByRole('combobox', { name: 'Buscar familia' }), 'mot')
    expect(screen.queryByRole('option', { name: 'MOL · Molinos' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: 'MOT · Motores' }))
    expect(screen.queryByRole('button', { name: /Quitar referencia/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Propio')
    await waitFor(() => expect(api.calls.some(call => call.path === '/catalog/assets' && call.query.get('family') === 'MOTORES')).toBe(true))
  })

  it('edita especificaciones propias y conserva TAG y referencias guardadas', async () => {
    const api = setup()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" asset={detail({ family: { id: 'f1', code: 'MOLINOS', name: 'Molinos' }, specifications: { Potencia: '22 kW' }, referenceModels: [{ id: 'm1', modelName: 'Referencia guardada' }] })} />)
    expect(screen.getByLabelText('Tag')).toHaveValue('MB-301')
    expect(await screen.findByText('22 kW')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Familia' })).toHaveTextContent('MOL'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.count('PATCH /plants/revemin-ii/assets/a1')).toBe(1))
    expect(JSON.parse(api.calls.find(call => call.method === 'PATCH')!.init.body as string)).toMatchObject({ familyId: 'f1', referenceModelIds: ['m1'], specifications: { Potencia: '22 kW' } })
  })
})
