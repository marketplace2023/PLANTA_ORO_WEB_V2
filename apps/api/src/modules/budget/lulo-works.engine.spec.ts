import { randomUUID } from 'node:crypto'
import { balanceResult, computationResult, measurementResult, reconciliation, valuationResult, workRecordResult, type WorkContext, type WorkRecord } from './lulo-works.engine'
import type { WorkRecordInput } from './lulo-works.schemas'

const evidence = [{ name: 'Acta de prueba', url: 'https://example.test/acta.pdf' }]
function record(payload: WorkRecordInput, status = 'APPROVED', result: Record<string, unknown> = {}): WorkRecord { return { id: randomUUID(), contractId: 'contract', kind: payload.kind, title: payload.title, code: `${payload.kind}-${randomUUID()}`, reference: null, status, revision: 1, predecessorId: null, payload, result, contentHash: randomUUID(), createdBy: 'user', approvedBy: 'manager', issuedAt: new Date(), createdAt: new Date(), updatedAt: new Date() } }
function context(): WorkContext { return { contract: { id: 'contract', plantId: 'plant', workId: 'work', documentId: 'document', code: 'CTR-1', name: 'Obra', currency: 'USD', status: 'ACTIVE', revision: 1, baseline: {}, createdAt: new Date(), updatedAt: new Date(), input: { documentId: 'document', workId: 'work', code: 'CTR-1', name: 'Obra', startDate: '2026-01-01', endDate: '2026-12-31', taxPct: '0', amortizationPct: '20', retentionPct: '5', advanceAmount: '300', priceDateBasis: 'EXECUTION_DATE', precision: 2, notes: '' } }, items: [{ id: 'item', contractId: 'contract', sourceLineId: 'line', code: 'PART-01', name: 'Partida', unit: 'UND', chapter: 'Capítulo', quantity: '110', price: '25', assetId: null, taxable: true }], records: [] } }
describe('Control, reconsideración y cierre con decimales', () => {
  it('applies approved tax, retention and amortization to the adjustment and reconciles its net', () => {
    const ctx = context(); ctx.contract.input.taxPct = '16'
    ctx.records.push(record({ kind: 'BALANCE', title: 'Advance', evidence, type: 'ADVANCE', date: '2026-01-01', amount: '300', reference: 'ANT-TAX', reason: 'Authorized advance' }))
    const m = record({ kind: 'MEASUREMENT', title: 'Execution', evidence, itemId: 'item', date: '2026-02-10', location: 'Zone A', quantity: '20', unit: 'UND', fieldReference: 'TAX-01', correctionOf: null, correctionReason: '', computationId: null })
    m.result = measurementResult(ctx, m); ctx.records.push(m)
    const v = record({ kind: 'VALUATION', title: 'February', evidence, startDate: '2026-02-01', endDate: '2026-02-28', allocations: [{ measurementId: m.id, quantity: '20' }], correctionOf: null, reason: '' }, 'ISSUED')
    v.result = valuationResult(ctx, v); ctx.records.push(v)
    expect(v.result).toMatchObject({ gross: '500.00', tax: '80.00', amortization: '100.00', retention: '25.00', net: '455.00' })
    const profile = record({ kind: 'PROFILE', title: 'Approved rule', evidence, formula: 'POLYNOMIAL_V1', date: '2026-01-01', baseDate: '2026-01-01', fixed: '0', allowNegative: false, taxAdjustment: true, retentionAdjustment: true, amortizationAdjustment: true, eligibleItemIds: ['item'], terms: [{ series: 'COST', coefficient: '1' }] })
    ctx.records.push(profile)
    for (const [date, value] of [['2026-01-01', '100'], ['2026-02-01', '110']]) ctx.records.push(record({ kind: 'INDEX', title: 'Published index', evidence, series: 'COST', date, value, source: 'Approved source', supersedes: null }))
    const adjustment = record({ kind: 'RECONSIDERATION', title: 'Price adjustment', evidence, valuationId: v.id, profileId: profile.id, date: '2026-03-01', itemIds: ['item'], correctionOf: null, reason: 'Approved monthly adjustment' }, 'ISSUED')
    adjustment.result = workRecordResult(ctx, adjustment); ctx.records.push(adjustment)
    expect(adjustment.result).toMatchObject({ difference: '50.00', tax: '8.00', retention: '2.50', amortization: '10.00', net: '45.50' })
    expect(balanceResult(ctx, '2026-03-01')).toMatchObject({ tax: '88.00', retention: '27.50', amortization: '110.00', net: '500.50', advanceBalance: '190.00' })
  })
  it('conciles the specified 2,362.50 net from three periods, a capped advance and the adjustment', () => {
    const ctx = context()
    ctx.records.push(record({ kind: 'BALANCE', title: 'Anticipo', evidence, type: 'ADVANCE', date: '2026-01-01', amount: '300', reference: 'ANT-01', reason: 'Anticipo contractual aprobado' }))
    for (const [month, quantity] of [['01', '30'], ['02', '20'], ['03', '60']]) {
      const m = record({ kind: 'MEASUREMENT', title: `Medición ${month}`, evidence, itemId: 'item', date: `2026-${month}-10`, location: 'Zona A', quantity, unit: 'UND', fieldReference: `PARTE-${month}`, correctionOf: null, correctionReason: '', computationId: null }); m.result = measurementResult(ctx, m); ctx.records.push(m)
      const v = record({ kind: 'VALUATION', title: `Valuación ${month}`, evidence, startDate: `2026-${month}-01`, endDate: `2026-${month}-${month === '02' ? '28' : '31'}`, allocations: [{ measurementId: m.id, quantity }], correctionOf: null, reason: '' }, 'ISSUED'); v.result = valuationResult(ctx, v); ctx.records.push(v)
    }
    ctx.records.push(record({ kind: 'RECONSIDERATION', title: 'Ajuste contractual', evidence, valuationId: ctx.records[4].id, profileId: 'profile', date: '2026-04-01', itemIds: ['item'], correctionOf: null, reason: 'Ajuste aprobado por índices' }, 'ISSUED', { difference: '50.00' }))
    const balances = balanceResult(ctx, '2026-12-31')
    expect(balances).toMatchObject({ gross: '2750.00', adjustments: '50.00', amortization: '300.00', retention: '137.50', net: '2362.50', advanceBalance: '0.00', retentionBalance: '137.50' })
    const view = reconciliation(ctx, '2026-12-31'); expect(view.lines[0]).toMatchObject({ valued: '110.00000000', remaining: '0.00000000', measuredNotValued: '0.00000000' })
  })
  it('uses dimensional conversions for geometric quantities and rejects mismatched dimensions', () => {
    const p = { kind: 'COMPUTATION', title: 'Volumen', evidence, itemId: 'item', location: 'Zona', rows: [{ label: 'Bloque', formula: 'VOLUME', length: '200', width: '100', height: '50', count: '2', factor: '1', lengthUnit: 'CM', targetUnit: 'M3', conversionNote: 'Centímetros a metros' }] } as const
    const mutable = JSON.parse(JSON.stringify(p)) as Extract<WorkRecordInput, { kind: 'COMPUTATION' }>
    expect(computationResult(mutable).quantity).toBe('2.00000000')
    mutable.rows[0].targetUnit = 'M2'; expect(() => computationResult(mutable)).toThrow(/unidad/)
  })
  it('does not permit an unsupported closing difference or an index without its source', () => {
    const ctx = context(), view = reconciliation(ctx, '2026-12-31')
    const closure = record({ kind: 'CLOSURE', title: 'Cierre', evidence, cutoff: '2026-12-31', sourceHash: view.sourceHash, resolutions: [], correctionOf: null, reason: 'Cierre de prueba autorizado' }, 'DRAFT')
    expect(() => workRecordResult(ctx, closure)).toThrow(/resolver/)
    const index = record({ kind: 'INDEX', title: 'Índice', evidence: [], series: 'COSTO', date: '2026-01-01', value: '100', source: 'Fuente documentada', supersedes: null }, 'DRAFT')
    expect(() => workRecordResult(ctx, index)).toThrow(/evidencia/)
  })
  it('requires explicit predecessor and bounds for negative field corrections', () => {
    const ctx = context(), m = record({ kind: 'MEASUREMENT', title: 'Original', evidence, itemId: 'item', date: '2026-01-10', location: 'Zona', quantity: '30', unit: 'UND', fieldReference: '01', correctionOf: null, correctionReason: '', computationId: null }); ctx.records.push(m)
    const correction = record({ ...m.payload, kind: 'MEASUREMENT', itemId: 'item', date: '2026-02-10', location: 'Zona', unit: 'UND', fieldReference: '02', quantity: '-31', correctionOf: m.id, correctionReason: 'Corrección documentada', computationId: null }, 'DRAFT')
    expect(() => measurementResult(ctx, correction)).toThrow(/excede/)
    correction.payload = { ...correction.payload, kind: 'MEASUREMENT', quantity: '-5' } as WorkRecordInput
    expect(measurementResult(ctx, correction).measuredTotal).toBe('25.00000000')
  })
})
