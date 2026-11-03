import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { mockApi } from '@/test/fetch-mock'
import { detail, MODELS, NETWORKS, page, STAGES } from '@/test/assets-fixtures'
import { AssetFormDialog } from './asset-form-dialog'

const template = { ...MODELS[0], specifications: { 'Potencia (kW)': '30–37', 'Tensión (V)': 480 }, technicalData: { componentes: ['Impulsor', 'Rodamientos'] } }
function setup({ empty = false, failFirst = false } = {}) {
  let attempts = 0
  return mockApi({
    'GET /catalog/assets': () => failFirst && attempts++ === 0 ? { status: 500, body: { message: 'Error de catálogo' } } : { body: page(empty ? [] : [template]) },
    'GET /plants/revemin-ii/stages': { body: STAGES },
    'GET /plants/revemin-ii/networks': { body: NETWORKS },
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
    await userEvent.type(within(dialog).getByLabelText('Tag'), 'AG-01')
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Modelo del catálogo' })).toBeEnabled())
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Modelo del catálogo' }))
    await userEvent.click(await screen.findByRole('option', { name: /Bolas 16.5x24 ft/ }))
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue(template.modelName)
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
    expect(body).toMatchObject({ name: 'Agitador instalado', specifications: { 'Potencia (kW)': '37', 'Tensión (V)': 480 }, components: ['Impulsor instalado'] })
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
})
