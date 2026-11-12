import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/test/fetch-mock'
import { renderWithProviders } from '@/test/render'
import { LuloMasterLibrary, inputFromMaster, type MasterDetail } from './master-library'

const catalog = { id: 'cat1', name: 'Maestros originales', counts: { items: 8057, materials: 3209, equipment: 672, labor: 164, families: 40 } }
const item = { id: 'item1', catalogId: 'cat1', code: 'EDF-9001', name: 'Concreto original del MDB', unit: 'M3', price: '99.00000000', originalUnitPrice: '99.00000000', yieldValue: '5.09000000' }
const detail: MasterDetail = { kind: 'ITEM', item, revision: 0, value: null, components: [{ id: 'c1', resourceId: 'r1', resourceType: 'MATERIAL', originalCode: 'MAT0001', quantity: '2.00000000', wastePct: '0', resource: { id: 'r1', catalogId: 'cat1', code: 'MAT0001', name: 'Alambre original', unit: 'KG', amount: '3.28000000' } }] }
function setup(root = '/budget-masters') { return mockApi({ [`GET ${root}/catalogs`]: { body: [catalog] }, [`GET ${root}`]: { body: { items: [item], total: 1, pageSize: 30 } }, [`GET ${root}/item1`]: { body: detail }, [`PATCH ${root}/item1`]: { body: { ...detail, revision: 1 } } }) }
afterEach(() => vi.unstubAllGlobals())
describe('Maestros LULO visibles', () => {
  it('shows separate original catalogs, searches by code and opens an APU with its material composition', async () => {
    const mock = setup(); const use = vi.fn(); renderWithProviders(<LuloMasterLibrary onUse={use} />)
    await waitFor(() => expect(screen.getByRole('tab', { name: /Materiales/ })).toHaveTextContent(/3.?209/))
    expect(screen.getByRole('tab', { name: /Mano de obra/ })).toHaveTextContent('164')
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar maestros LULO' }), 'EDF-9001')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(mock.calls.some(c => c.query.get('search') === 'EDF-9001')).toBe(true))
    await userEvent.click(await screen.findByRole('button', { name: 'EDF-9001' }))
    expect(await screen.findByRole('button', { name: 'MAT0001' })).toBeInTheDocument()
    expect(screen.getByText('Alambre original')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar para esta planta' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Presupuestar con este APU' })); expect(use).toHaveBeenCalledWith(item, true)
    await userEvent.click(screen.getByRole('button', { name: 'Usar PU original sin desglose' })); expect(use).toHaveBeenLastCalledWith(item, false)
  })
  it('saves an adjustment with revision and reason exclusively through the plant endpoint', async () => {
    const root = '/plants/revemin-ii/lulo/masters', mock = setup(root)
    renderWithProviders(<LuloMasterLibrary plantSlug="revemin-ii" canEdit />)
    await userEvent.click(await screen.findByRole('button', { name: 'EDF-9001' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Editar para esta planta' }))
    const amount = screen.getByRole('textbox', { name: 'Mi precio unitario' }); await userEvent.clear(amount); await userEvent.type(amount, '120')
    await userEvent.type(screen.getByRole('textbox', { name: 'Motivo del cambio' }), 'Cotización propia de la planta')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes de planta' }))
    await waitFor(() => expect(mock.calls.some(c => c.method === 'PATCH')).toBe(true))
    const call = mock.calls.find(c => c.method === 'PATCH')!; expect(call.path).toBe(`${root}/item1`)
    expect(JSON.parse(String(call.init.body))).toMatchObject({ expectedRevision: 0, reason: 'Cotización propia de la planta', value: { amount: '120', verified: false } })
    expect(mock.calls.every(c => !c.path.startsWith('/admin/') && !c.path.startsWith('/budget-masters'))).toBe(true)
  })
  it('keeps a source link and original PU when starting without a breakdown, while calculated lines use the APU', () => {
    const manual = inputFromMaster(item, false), calculated = inputFromMaster(item, true)
    expect(manual.lines[0]).toMatchObject({ mode: 'MANUAL', apuId: null, sourceMasterId: item.id, manualPrice: '99.00000000' })
    expect(calculated.lines[0]).toMatchObject({ mode: 'CALCULATED', apuId: item.id, manualPrice: null })
    expect(manual.publicationId).toBe('cat1'); expect(manual.referenceMode).not.toBe(true)
  })
})
