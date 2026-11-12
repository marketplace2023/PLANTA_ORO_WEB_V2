import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocation } from 'react-router-dom'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import fixture from '@/test/lulo-fixture.json'
import { LuloEditor } from './lulo-editor'
import { LULO_STORAGE_KEY, readLuloDraft } from './local-draft'
import type { Calculation, LuloDocument, LuloInput } from './types'

const state = vi.hoisted(() => ({ authenticated: false }))
const plant = { id: 'p1', code: 'REV', slug: 'revemin-ii', name: 'REVEMIN II', description: null, countryCode: null, timezone: 'America/Caracas', status: 'ACTIVE', visibility: 'PRIVATE' as const, logoUrl: null, heroImageUrl: null }
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ status: state.authenticated ? 'authenticated' : 'anonymous', user: state.authenticated ? { id: 'u1', isGlobalAdmin: false } : null, access: [{ plantId: 'p1', slug: 'revemin-ii', name: 'REVEMIN II', permissions: ['budget.read', 'budget.edit'] }] }) }))
vi.mock('@/features/plant/plant-context', () => ({ usePlant: () => ({ currentPlant: null, availablePlants: [plant], permissions: [] }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
const input = fixture.input as LuloInput
const calculated = fixture.calculation as Calculation
const publication = { id: input.publicationId, label: 'Ejemplo FUR', version: 1, demo: true, profile: 'FUR_LULO_MVP_1' }
const routes = () => ({
  'GET /budget-estimates/publications': { body: [publication] },
  'GET /budget-estimates/example': { body: { available: true, input } },
  [`GET /budget-estimates/publications/${input.publicationId}/apus`]: { body: { items: [{ id: input.lines[0].apuId, code: input.lines[0].code, name: input.lines[0].description, unit: 'UND' }], total: 1, currency: 'USD', denomination: 'USD ficticio' } },
  'POST /budget-estimates/calculate': { body: calculated },
})
function Location() { return <output data-testid="location">{useLocation().pathname}</output> }
function document(status: LuloDocument['status'] = 'DRAFT'): LuloDocument { return { id: 'doc1', code: 'LUL-2026-00001', title: input.title, version: 1, revision: 4, groupId: 'g1', predecessorId: null, status, input, catalog: calculated.catalog, result: calculated.result, contentHash: calculated.hash, issuedAt: status === 'ISSUED' ? '2026-11-11T12:00:00Z' : null, warnings: [], history: [] } }
beforeEach(() => { localStorage.clear(); state.authenticated = false })
afterEach(() => vi.unstubAllGlobals())

describe('LULO visible public and plant editor', () => {
  it('lets a visitor load the full example, displays the server total and saves a browser draft without authentication', async () => {
    const mock = mockApi(routes()); renderWithProviders(<LuloEditor />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cargar ejemplo completo' }))
    expect(await screen.findByTestId('lulo-total')).toHaveTextContent('4.580,26')
    await waitFor(() => expect(screen.getByTestId('lulo-total')).toHaveTextContent('4.580,26'))
    expect(screen.getByText('Demostración con datos ficticios.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Iniciar sesión para llevarlo a planta' })).toHaveAttribute('href', '/login')
    await waitFor(() => expect(readLuloDraft()?.lines).toHaveLength(2))
    expect(mock.calls.some(c => c.path.includes('/plants/'))).toBe(false)
    expect(screen.getByRole('button', { name: 'PDF' })).toBeEnabled()
  })
  it('does not mark an old response as current if the quantity changes while calculation is in flight', async () => {
    let finish: (value: { body: Calculation }) => void = () => undefined
    const pending = new Promise<{ body: Calculation }>(resolve => { finish = resolve })
    localStorage.setItem(LULO_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, input }))
    mockApi({ ...routes(), 'POST /budget-estimates/calculate': () => pending })
    renderWithProviders(<LuloEditor />)
    await userEvent.click(screen.getByRole('button', { name: 'Calcular presupuesto' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad de partida 1' }), { target: { value: '30' } })
    finish({ body: calculated })
    expect(await screen.findByText('Hay cambios por calcular. Los importes mostrados corresponden al último cálculo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeDisabled()
  })
  it('adopts the current draft into an authorized plant and navigates to its stored document', async () => {
    state.authenticated = true
    localStorage.setItem(LULO_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, input }))
    const doc = document()
    const mock = mockApi({ ...routes(), 'POST /plants/revemin-ii/lulo/documents': { body: doc } })
    renderWithProviders(<><LuloEditor /><Location /></>)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Planta de destino' }), 'revemin-ii')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar en planta' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/plants/revemin-ii/budgets/lulo/doc1'))
    const saved = mock.calls.find(c => c.method === 'POST' && c.path.includes('/plants/'))!
    const payload = JSON.parse(String(saved.init.body))
    expect(payload.input).toEqual(input); expect(payload.requestId).toMatch(/^[a-f0-9-]{36}$/)
    expect(payload).not.toHaveProperty('total')
  })
  it('keeps plant data out of browser storage and makes issued budgets immutable', async () => {
    state.authenticated = true
    const mock = mockApi(routes())
    renderWithProviders(<LuloEditor doc={document('ISSUED')} plant={plant} canEdit canApprove />)
    expect(screen.getByRole('textbox', { name: 'Cantidad de partida 1' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear nueva versión' })).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: 'Motivo de operación' }), 'Modificar el alcance de la intervención')
    expect(screen.getByRole('button', { name: 'Crear nueva versión' })).toBeEnabled()
    expect(localStorage.getItem(LULO_STORAGE_KEY)).toBeNull()
    expect(mock.calls.some(c => c.method === 'PATCH')).toBe(false)
  })
  it('adds nested chapters and manual prices without mutating any catalog', async () => {
    const mock = mockApi(routes()); renderWithProviders(<LuloEditor />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre del nuevo capítulo' }), 'Desmontaje')
    const parent = screen.getByRole('combobox', { name: 'Capítulo padre' })
    const option = (parent as HTMLSelectElement).options[1].value
    await userEvent.selectOptions(parent, option)
    await userEvent.click(screen.getByRole('button', { name: 'Agregar capítulo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Partida manual' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Motivo del precio 1' }), 'Cotización manual del trabajo requerido')
    await waitFor(() => expect(readLuloDraft()?.chapters).toHaveLength(2))
    expect(readLuloDraft()!.chapters[1].parentId).toBe(option)
    expect(readLuloDraft()!.lines[0]).toMatchObject({ mode: 'MANUAL', chapterId: readLuloDraft()!.chapters[1].id })
    expect(mock.calls.some(c => c.method !== 'GET')).toBe(false)
  })
})
