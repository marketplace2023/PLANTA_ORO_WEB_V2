import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { LuloWorksPortfolio } from './works-portfolio'
import { LuloContractWorkspace } from './contract-workspace'
import { WorkRecordForm } from './work-record-form'
import type { ContractDetail, Reconciliation } from './work-types'

const detail: ContractDetail = { contract: { id: 'ctr', code: 'CTR-01', name: 'Obra de prueba', status: 'ACTIVE', currency: 'USD', revision: 1, documentId: 'doc', workId: 'work', input: { documentId: 'doc', workId: 'work', code: 'CTR-01', name: 'Obra de prueba', startDate: '2026-01-01', endDate: '2026-12-31', taxPct: '0', amortizationPct: '10', retentionPct: '5', advanceAmount: '300', priceDateBasis: 'EXECUTION_DATE', precision: 2, notes: '' } }, items: [{ id: 'item1', code: 'PART-01', name: 'Partida contractual', unit: 'UND', quantity: '100', price: '25', sourceLineId: 'line1' }], records: [], assignments: [], history: [] }
const view: Reconciliation = { cutoff: '2026-12-31', sourceHash: 'a'.repeat(64), originalAmount: '2500.00', currentAmount: '2750.00', balances: { gross: '1250.00', net: '1250.00', paymentBalance: '1250.00' }, lines: [{ itemId: 'item1', code: 'PART-01', name: 'Partida contractual', unit: 'UND', original: '100', current: '110', measured: '50', valued: '50', remaining: '60', measuredNotValued: '0', originalAmount: '2500', currentAmount: '2750' }], differences: [{ key: 'remaining:item1', label: 'Cantidad pendiente', amount: '60' }], pending: [], sources: [] }
afterEach(() => vi.unstubAllGlobals())
describe('Recorrido de obra desde las pantallas de planta', () => {
  it('registers a client through the work portfolio instead of an administrative screen', async () => {
    const root = '/plants/revemin-ii/lulo', mock = mockApi({ [`GET ${root}/clients`]: { body: [] }, [`GET ${root}/works`]: { body: [] }, [`GET ${root}/contracts`]: { body: [] }, [`POST ${root}/clients`]: { body: { id: 'client' } } })
    renderWithProviders(<LuloWorksPortfolio slug="revemin-ii" canEdit canApprove />)
    await userEvent.click(screen.getByRole('button', { name: 'Clientes' })); await userEvent.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Código del cliente' }), 'CLI-01'); await userEvent.type(screen.getByRole('textbox', { name: 'Nombre o razón social' }), 'Cliente de prueba')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }))
    await waitFor(() => expect(mock.calls.some(c => c.method === 'POST')).toBe(true))
    expect(JSON.parse(String(mock.calls.find(c => c.method === 'POST')!.init.body))).toMatchObject({ code: 'CLI-01', name: 'Cliente de prueba' })
    expect(mock.calls.every(c => !c.path.startsWith('/admin'))).toBe(true)
  })
  it('opens a continuous contract workspace with all execution and closure sections', async () => {
    const root = '/plants/revemin-ii/lulo/contracts/ctr'
    mockApi({ [`GET ${root}`]: { body: detail }, [`GET ${root}/reconciliation`]: { body: view }, [`GET ${root}/progress`]: { body: { physicalPct: '45.45', plannedPct: '50.00', economicPct: '45.45', activities: [] } } })
    renderWithProviders(<LuloContractWorkspace slug="revemin-ii" contractId="ctr" canEdit canApprove canUpload={false} />)
    expect(await screen.findByRole('heading', { name: 'Obra de prueba' })).toBeInTheDocument()
    for (const name of ['Mediciones', 'Órdenes de cambio', 'Valuaciones', 'Cronograma', 'Índices', 'Reconsideraciones', 'Cierres']) expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Mediciones/ })); await userEvent.click(screen.getByRole('button', { name: 'Nuevo documento' }))
    expect(screen.getByRole('textbox', { name: 'Cantidad ejecutada' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Referencia única del parte de campo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Presupuesto de origen' })).toHaveAttribute('href', '/plants/revemin-ii/budgets/lulo/doc')
  })
  it('submits a measurement with its evidence and contractual item using the plant route', async () => {
    const done = vi.fn(), mock = mockApi({ 'POST /plants/revemin-ii/lulo/contracts/ctr/records': { body: { id: 'measurement1' } } })
    renderWithProviders(<WorkRecordForm slug="revemin-ii" data={detail} kind="MEASUREMENT" canUpload={false} onDone={done} />)
    for (const [label, value] of [['Título del documento', 'Medición de campo'], ['Referencia única del parte de campo', 'CAMPO-01'], ['Ubicación de la medición', 'Zona A'], ['Cantidad ejecutada', '20'], ['Nombre de la evidencia', 'Acta de campo'], ['Enlace HTTPS', 'https://example.test/acta.pdf']]) await userEvent.type(screen.getByRole('textbox', { name: label }), value)
    await userEvent.click(screen.getByRole('button', { name: 'Agregar enlace de evidencia' })); await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    await waitFor(() => expect(done).toHaveBeenCalledWith('measurement1'))
    const body = JSON.parse(String(mock.calls.find(c => c.method === 'POST')!.init.body)); expect(body.input).toMatchObject({ kind: 'MEASUREMENT', itemId: 'item1', quantity: '20', evidence: [{ name: 'Acta de campo', url: 'https://example.test/acta.pdf' }] })
    expect(body.requestId).toBeTruthy()
  })
  it('requires explicit resolutions for residual quantities in the closing form', () => {
    mockApi({}); renderWithProviders(<WorkRecordForm slug="revemin-ii" data={detail} kind="CLOSURE" view={view} canUpload={false} onDone={() => undefined} />)
    expect(screen.getByRole('textbox', { name: 'Resolución de la diferencia' })).toBeRequired()
    expect(screen.getByRole('textbox', { name: 'Responsable de liquidación' })).toBeRequired()
    expect(screen.getByRole('textbox', { name: 'Condición o compromiso pendiente' })).toBeRequired()
  })
})
