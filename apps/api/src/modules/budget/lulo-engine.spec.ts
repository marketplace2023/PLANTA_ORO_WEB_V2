import { calculationFixture } from '../../../test/fixtures/lulo-calculation'
import { calculateLulo, luloValidity } from './lulo-engine'
import { luloInputSchema } from './lulo.schemas'
import { luloHash } from './lulo-hash'

describe('Shared decimal LULO engine', () => {
  it('matches the supplied Python reference case, including compounded utility and FCAS', () => {
    const { input, catalog } = calculationFixture(); const r = calculateLulo(input, catalog)
    expect(r.lines[0].apu!.breakdown).toMatchObject({ material: '84.00000000', equipment: '12.00000000', labor: '18.00000000', direct: '114.00000000', overhead: '11.40000000', utility: '12.54000000' })
    expect(r.lines[0].price).toBe('137.94'); expect(r.totals).toEqual({ subtotal: '3948.50', taxable: '3948.50', tax: '631.76', total: '4580.26' })
    expect(r.resources.find(c => c.type === 'LABOR')!.quantity).toBe('5.00000000')
  })
  it('normalizes daily and hourly usage rates consistently without applying acquisition depreciation again', () => {
    const { input, catalog } = calculationFixture()
    for (const c of catalog.apus[0].components.filter(c => c.resource.type !== 'MATERIAL')) { c.resource.costBasis = 'HOUR'; c.resource.unit = 'H'; c.resource.amount = c.resource.type === 'LABOR' ? '7.5' : '15' }
    expect(calculateLulo(input, catalog).totals.total).toBe('4580.26')
    for (const c of catalog.apus[0].components.filter(c => c.resource.type !== 'MATERIAL')) { c.resource.costBasis = 'DAY'; c.resource.unit = 'DIA'; c.resource.amount = c.resource.type === 'LABOR' ? '60' : '120' }
    catalog.apus[0].yieldBasis = 'HOUR'; catalog.apus[0].yieldValue = '1.25'
    expect(calculateLulo(input, catalog).totals.total).toBe('4580.26')
  })
  it('supports consumption per item and keeps parent chapter totals from being counted twice', () => {
    const { input, catalog } = calculationFixture()
    catalog.apus[0].yieldBasis = 'ITEM'; catalog.apus[0].components[1].quantity = '0.1'; catalog.apus[0].components[2].quantity = '0.2'
    input.chapters.unshift({ id: 'parent', name: 'Obra', parentId: null }); input.chapters[1].parentId = 'parent'
    const r = calculateLulo(input, catalog)
    expect(r.totals.total).toBe('4580.26'); expect(r.chapters[0].subtotal).toBe('3448.50')
  })
  it('rounds unit prices half up before multiplying quantities, using decimal strings throughout', () => {
    const { input, catalog } = calculationFixture()
    input.lines = [{ ...input.lines[1], quantity: '3', manualPrice: '0.005' }]; input.rates.taxPct = '0'
    const r = calculateLulo(input, catalog)
    expect(r.lines[0].price).toBe('0.01'); expect(r.totals.total).toBe('0.03')
    input.lines[0].manualPrice = '0.1'; input.lines[0].quantity = '3'; expect(calculateLulo(input, catalog).totals.total).toBe('0.30')
  })
  it('keeps assumed prices separate from the calculated APU and taxes only taxable lines', () => {
    const { input, catalog } = calculationFixture()
    input.lines[0] = { ...input.lines[0], mode: 'ASSUMED', manualPrice: '100', reason: 'Precio asumido documentado', taxable: false }
    const r = calculateLulo(input, catalog)
    expect(r.lines[0].apu!.price).toBe('137.94'); expect(r.lines[0].price).toBe('100.00'); expect(r.totals).toMatchObject({ subtotal: '3000.00', taxable: '500.00', tax: '80.00', total: '3080.00' }); expect(r.resources).toHaveLength(0)
  })
  it('allows private price scenarios without mutating the common catalog', () => {
    const { input, catalog } = calculationFixture()
    input.overrides = [{ resourceId: catalog.apus[0].components[0].resource.id, amount: '50', baseDate: '2026-01-01', validUntil: '2099-01-01', reason: 'Cotización propia verificada' }]
    expect(calculateLulo(input, catalog).totals.total).toBe('5317.15')
    expect(catalog.apus[0].components[0].resource.amount).toBe('40')
    input.overrides[0].validUntil = '2026-01-02'; expect(luloValidity(input, catalog, '2026-11-11')).toEqual(['Verifique la vigencia del precio de R3'])
  })
  it('rejects forged input, malformed decimals, chapter cycles, bad references and unsupported unit changes', () => {
    const { input, catalog } = calculationFixture()
    expect(luloInputSchema.safeParse({ ...input, total: '1' }).success).toBe(false)
    input.lines[0].quantity = '1,5'; expect(luloInputSchema.safeParse(input).success).toBe(false)
    input.lines[0].quantity = '1'; input.chapters[0].parentId = input.chapters[0].id; expect(luloInputSchema.safeParse(input).success).toBe(false)
    input.chapters[0].parentId = null; input.lines[0].unit = 'KG'; expect(() => calculateLulo(input, catalog)).toThrow('unidad')
    input.lines[0].unit = 'UND'; input.lines[0].apuId = '10000000-0000-4000-8000-000000000009'; expect(() => calculateLulo(input, catalog)).toThrow('no pertenece')
  })
  it('produces stable hashes regardless of JSONB object key ordering', () => {
    expect(luloHash({ a: '0.1', b: { x: 1, y: 2 } })).toBe(luloHash({ b: { y: 2, x: 1 }, a: '0.1' }))
  })
})
