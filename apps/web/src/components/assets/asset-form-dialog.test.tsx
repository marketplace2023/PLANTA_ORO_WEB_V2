import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { mockApi } from '@/test/fetch-mock'
import { detail, MODELS, NETWORKS, page, STAGES } from '@/test/assets-fixtures'
import { AssetFormDialog } from './asset-form-dialog'

const template = { ...MODELS[0], family: { ...MODELS[0].family, tagCode: 'MOL' }, networkCodes: ['FUR-PTE'], specifications: { 'Potencia (kW)': '30–37', 'Tensión (V)': 480 }, technicalData: { componentes: ['Impulsor', 'Rodamientos'] } }
async function selectStage() {
  await userEvent.click(await screen.findByRole('combobox', { name: 'Etapa' }))
  await userEvent.click(await screen.findByRole('option', { name: 'D06 - Molienda Primaria' }))
}
function setup({ empty = false, failFirst = false, catalogModels = [template], previewFails = false } = {}) {
  let attempts = 0
  return mockApi({
    'GET /catalog/assets': () => failFirst && attempts++ === 0 ? { status: 500, body: { message: 'Error de catálogo' } } : { body: page(empty ? [] : catalogModels) },
    'GET /plants/revemin-ii/stages': { body: STAGES },
    'GET /plants/revemin-ii/networks': { body: NETWORKS },
    'GET /plants/revemin-ii/assets/tag-preview': ({ query }) => previewFails
      ? { status: 500, body: { message: 'Error de vista previa' } }
      : { body: { tag: `${query.get('networkCode')}-${query.get('stageCode')}-MOL-${query.get('stageCode') === 'D07' ? '004' : '007'}` } },
    'POST /plants/revemin-ii/assets': { status: 201, body: detail() },
    'PATCH /plants/revemin-ii/assets/a1': { body: detail() },
  })
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Ficha propia del activo', () => {
  it('precarga la plantilla y envía las modificaciones sin alterar el modelo', async () => {
    const api = setup()
    const onSaved = vi.fn()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" onSaved={onSaved} />)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Tag')).toHaveAttribute('readonly')
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Modelo del catálogo' })).toBeEnabled())
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Modelo del catálogo' }))
    await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue(template.modelName)
    expect(within(dialog).getByRole('combobox', { name: 'Red transversal' })).toHaveTextContent('FUR-PTE')
    await selectStage()
    await waitFor(() => expect(within(dialog).getByLabelText('Tag')).toHaveValue('FUR-PTE-D06-MOL-007'))
    await userEvent.clear(within(dialog).getByLabelText('Nombre'))
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Agitador instalado')
    expect(within(dialog).getByLabelText('Valor de especificación 1')).toHaveValue('30–37')
    expect(within(dialog).getByLabelText('Componente 1')).toHaveValue('Impulsor')
    await userEvent.clear(within(dialog).getByLabelText('Valor de especificación 1'))
    await userEvent.type(within(dialog).getByLabelText('Valor de especificación 1'), '37')
    await userEvent.clear(within(dialog).getByLabelText('Componente 1'))
    await userEvent.type(within(dialog).getByLabelText('Componente 1'), 'Impulsor instalado')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar componente 2' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear activo' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    const body = JSON.parse(api.calls.find(call => call.method === 'POST')!.init.body as string)
    expect(body).toMatchObject({ name: 'Agitador instalado', networkCodes: ['FUR-PTE'], specifications: { 'Potencia (kW)': '37', 'Tensión (V)': 480 }, components: ['Impulsor instalado'] })
    expect(body).not.toHaveProperty('tag')
    expect(template.specifications['Potencia (kW)']).toBe('30–37')
    expect(template.technicalData.componentes).toEqual(['Impulsor', 'Rodamientos'])
  })

  it('edita la ficha guardada, permite vaciarla y conserva vacíos tras volver a abrir', async () => {
    const api = setup()
    const own = detail({ id: 'a1', specifications: { 'Potencia (kW)': '22' }, technicalData: { componentes: ['Motor real'] } })
    const first = renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" asset={own} />)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Valor de especificación 1')).toHaveValue('22')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Reemplazar ficha por la del modelo' })).toBeEnabled())
    expect(within(dialog).getByLabelText('Componente 1')).toHaveValue('Motor real')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar especificación 1' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar componente 1' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.count('PATCH /plants/revemin-ii/assets/a1')).toBe(1))
    const body = JSON.parse(api.calls.find(call => call.method === 'PATCH')!.init.body as string)
    expect(body).toMatchObject({ specifications: {}, components: [] })
    first.unmount()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" asset={detail({ specifications: {}, technicalData: { componentes: [] } })} />)
    expect(await screen.findByText('Sin especificaciones registradas.')).toBeInTheDocument()
    expect(screen.getByText('Sin componentes registrados.')).toBeInTheDocument()
  })

  it('reemplaza la ficha solo al pedirlo expresamente y rechaza parámetros repetidos', async () => {
    const api = setup()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" asset={detail({ id: 'a1', specifications: { Original: 'propio' }, technicalData: { componentes: [] } })} />)
    const dialog = await screen.findByRole('dialog')
    const reset = within(dialog).getByRole('button', { name: 'Reemplazar ficha por la del modelo' })
    await waitFor(() => expect(reset).toBeEnabled())
    expect(within(dialog).getByLabelText('Valor de especificación 1')).toHaveValue('propio')
    await userEvent.click(reset)
    expect(within(dialog).getByLabelText('Valor de especificación 1')).toHaveValue('30–37')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar especificación' }))
    await userEvent.type(within(dialog).getByLabelText('Especificación 3'), 'potencia (kW)')
    await userEvent.type(within(dialog).getByLabelText('Valor de especificación 3'), '55')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Hay nombres de especificación repetidos.')).toBeInTheDocument()
    expect(api.count('PATCH /plants/revemin-ii/assets/a1')).toBe(0)
  })

  it('busca modelos en el servidor y conserva la selección al filtrar', async () => {
    const api = setup()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Modelo del catálogo' })).toBeEnabled())
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Modelo del catálogo' }))
    await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
    expect(within(dialog).queryByLabelText('Buscar modelo del catálogo')).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Modelo del catálogo' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar modelo del catálogo' }), 'OTRO-TAG')
    await waitFor(() => expect(api.calls.some(call => call.path === '/catalog/assets' && call.query.get('search') === 'OTRO-TAG')).toBe(true))
    await userEvent.keyboard('{Escape}')
    expect(within(dialog).getByLabelText('Valor de especificación 1')).toHaveValue('30–37')
    expect(within(dialog).getByRole('combobox', { name: 'Modelo del catálogo' })).toHaveTextContent('Bolas 16.5x24 ft')
  })

  it('permite buscar y seleccionar con teclado; Escape cierra el selector y conserva el formulario', async () => {
    const api = setup()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo activo' })
    const selector = within(dialog).getByRole('combobox', { name: 'Modelo del catálogo' })
    selector.focus()
    await userEvent.keyboard('{ArrowDown}')
    const search = await screen.findByRole('combobox', { name: 'Buscar modelo del catálogo' })
    expect(search).toHaveFocus()
    expect(selector.getAttribute('aria-controls')).toBe(search.closest('[role="dialog"]')!.id)
    const option = await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ })
    await waitFor(() => expect(option).toHaveAttribute('aria-selected', 'true'))
    expect(search.getAttribute('aria-controls')).toBe(option.closest('[role="listbox"]')!.id)
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(selector).toHaveAttribute('aria-expanded', 'false'))
    expect(api.count('POST /plants/revemin-ii/assets')).toBe(0)
    await userEvent.click(selector)
    await screen.findByRole('combobox', { name: 'Buscar modelo del catálogo' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(selector).toHaveFocus())
    expect(screen.getByRole('dialog', { name: 'Nuevo activo' })).toBe(dialog)
  })

  it('explica el catálogo vacío y permite reintentar un error desde el selector', async () => {
    setup({ empty: true })
    const first = renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    await userEvent.click(await screen.findByRole('combobox', { name: 'Modelo del catálogo' }))
    expect(await screen.findByText('No hay modelos activos disponibles.')).toBeInTheDocument()
    first.unmount()
    setup({ failFirst: true })
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    await userEvent.click(await screen.findByRole('combobox', { name: 'Modelo del catálogo' }))
    expect(await screen.findByText('No se pudo cargar el catálogo.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ })).toBeInTheDocument()
  })

  it('permite rueda y gestos dentro del selector sin desbloquear el fondo del modal', async () => {
    setup()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    const selector = await screen.findByRole('combobox', { name: 'Modelo del catálogo' })
    await userEvent.click(selector)
    const option = await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ })
    const list = option.closest('[role="listbox"]') as HTMLElement
    // jsdom no calcula geometría: simula una lista desplazable a media altura.
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 1600 },
      clientHeight: { configurable: true, value: 256 },
      scrollTop: { configurable: true, writable: true, value: 100 },
    })
    list.style.overflowY = 'auto'
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 })
    fireEvent(option, wheel)
    expect(wheel.defaultPrevented).toBe(false)

    fireEvent.touchStart(option, { changedTouches: [{ clientX: 10, clientY: 200 }], touches: [{ clientX: 10, clientY: 200 }] })
    const touchMove = new Event('touchmove', { bubbles: true, cancelable: true })
    Object.defineProperties(touchMove, {
      changedTouches: { value: [{ clientX: 10, clientY: 150 }] },
      touches: { value: [{ clientX: 10, clientY: 150 }] },
    })
    fireEvent(option, touchMove)
    expect(touchMove.defaultPrevented).toBe(false)

    const outsideWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 })
    fireEvent(document.body, outsideWheel)
    expect(outsideWheel.defaultPrevented).toBe(true)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(selector).toHaveFocus())
    const closedWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 })
    fireEvent(document.body, closedWheel)
    expect(closedWheel.defaultPrevented).toBe(true)
    expect(screen.getByRole('dialog', { name: 'Nuevo activo' })).toBeInTheDocument()
  })

  it('sugiere solo la primera red habilitada del modelo y permite reemplazarla por una sola red', async () => {
    const api = setup({ catalogModels: [{ ...template, networkCodes: ['FUR-MNT', 'FUR-PTE', 'FUR-IOT'] }] })
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    await userEvent.click(await screen.findByRole('combobox', { name: 'Modelo del catálogo' }))
    await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
    const network = screen.getByRole('combobox', { name: 'Red transversal' })
    expect(network).toHaveTextContent('FUR-PTE')
    await userEvent.click(network)
    expect(screen.queryByRole('option', { name: /FUR-MNT/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: /FUR-IOT/ }))
    await selectStage()
    await userEvent.click(screen.getByRole('button', { name: 'Crear activo' }))
    await waitFor(() => expect(api.count('POST /plants/revemin-ii/assets')).toBe(1))
    expect(JSON.parse(api.calls.find(call => call.method === 'POST')!.init.body as string).networkCodes).toEqual(['FUR-IOT'])
  })

  it('al cambiar de modelo limpia la red anterior si no hay ninguna habilitada en el nuevo', async () => {
    const api = setup({ catalogModels: [template, { ...template, id: 'm2', modelName: 'Modelo sin red', networkCodes: [] }, { ...template, id: 'm3', modelName: 'Modelo de mantenimiento', networkCodes: ['FUR-MNT'] }] })
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    const picker = await screen.findByRole('combobox', { name: 'Modelo del catálogo' })
    await userEvent.click(picker)
    await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
    expect(screen.getByRole('combobox', { name: 'Red transversal' })).toHaveTextContent('FUR-PTE')
    await userEvent.click(picker)
    await userEvent.click(await screen.findByRole('option', { name: /Modelo sin red/ }))
    expect(screen.getByRole('combobox', { name: 'Red transversal' })).toHaveTextContent('Sin red asignada')
    await userEvent.click(picker)
    await userEvent.click(await screen.findByRole('option', { name: /Modelo de mantenimiento/ }))
    expect(screen.getByRole('combobox', { name: 'Red transversal' })).toHaveTextContent('Sin red asignada')
    await selectStage()
    await userEvent.click(screen.getByRole('button', { name: 'Crear activo' }))
    expect(await screen.findByText('Selecciona una red para generar el TAG')).toBeInTheDocument()
    expect(api.count('POST /plants/revemin-ii/assets')).toBe(0)
  })

  it('conserva las redes de un activo existente hasta elegir expresamente una sola', async () => {
    const api = setup()
    const own = detail({ networks: NETWORKS.filter(network => network.isEnabled) })
    const first = renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" asset={own} />)
    expect(await screen.findByRole('combobox', { name: 'Red transversal' })).toHaveTextContent('Conservar redes actuales (2)')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.count('PATCH /plants/revemin-ii/assets/a1')).toBe(1))
    expect(JSON.parse(api.calls.find(call => call.method === 'PATCH')!.init.body as string).networkCodes).toEqual(['FUR-IOT', 'FUR-PTE'])
    first.unmount()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" asset={own} />)
    await userEvent.click(await screen.findByRole('combobox', { name: 'Red transversal' }))
    await userEvent.click(await screen.findByRole('option', { name: /FUR-PTE/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.count('PATCH /plants/revemin-ii/assets/a1')).toBe(2))
    expect(JSON.parse(api.calls.filter(call => call.method === 'PATCH')[1].init.body as string).networkCodes).toEqual(['FUR-PTE'])
  })

  it('muestra el TAG progresivo en input y cabecera y consulta el correlativo sin crear el activo', async () => {
    const api = setup()
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    const input = await screen.findByLabelText('Tag')
    const headerTag = screen.getByLabelText('Vista previa del TAG')
    const expectTag = (tag: string) => { expect(input).toHaveValue(tag); expect(headerTag).toHaveTextContent(tag) }
    expectTag('XXX-XXX-XXX-001')
    expect(api.count('GET /plants/revemin-ii/assets/tag-preview')).toBe(0)
    const network = screen.getByRole('combobox', { name: 'Red transversal' })
    await waitFor(() => expect(network).toBeEnabled())
    await userEvent.click(network)
    await userEvent.click(await screen.findByRole('option', { name: /FUR-PTE/ }))
    expectTag('FUR-PTE-XXX-XXX-001')
    await selectStage()
    expectTag('FUR-PTE-D06-XXX-001')
    expect(api.count('GET /plants/revemin-ii/assets/tag-preview')).toBe(0)
    await userEvent.click(screen.getByRole('combobox', { name: 'Modelo del catálogo' }))
    await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
    await waitFor(() => expectTag('FUR-PTE-D06-MOL-007'))
    await userEvent.click(screen.getByRole('combobox', { name: 'Etapa' }))
    await userEvent.click(await screen.findByRole('option', { name: 'D07 - Molienda Secundaria' }))
    await waitFor(() => expectTag('FUR-PTE-D07-MOL-004'))
    expect(api.count('POST /plants/revemin-ii/assets')).toBe(0)
    const query = api.calls.filter(call => call.path.endsWith('tag-preview')).at(-1)!.query
    expect(Object.fromEntries(query)).toEqual({ assetModelId: 'm1', stageCode: 'D07', networkCode: 'FUR-PTE' })
  })

  it('el error de vista previa conserva los segmentos elegidos y no bloquea el alta', async () => {
    const api = setup({ previewFails: true })
    renderWithProviders(<AssetFormDialog open onOpenChange={vi.fn()} plantSlug="revemin-ii" />)
    await userEvent.click(await screen.findByRole('combobox', { name: 'Modelo del catálogo' }))
    await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
    await selectStage()
    expect(await screen.findByText('No se pudo actualizar la vista previa. El TAG se asignará al guardar.')).toBeInTheDocument()
    expect(screen.getByLabelText('Tag')).toHaveValue('FUR-PTE-D06-MOL-…')
    await userEvent.click(screen.getByRole('button', { name: 'Crear activo' }))
    await waitFor(() => expect(api.count('POST /plants/revemin-ii/assets')).toBe(1))
  })
})
