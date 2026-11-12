import { effectiveUnitPrice, salesRulesSchema, shippingFor } from './commerce-rules'

describe('Marketplace pricing and delivery rules', () => {
  const now = new Date('2026-11-09T12:00:00Z')
  it('selects the highest applicable quantity threshold and rounds promotions to cents', () => {
    const salesRules = { tiers: [{ quantity: 20, price: 7.05 }, { quantity: 10, price: 8 }], promotion: { percent: 10, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-10T00:00:00Z' } }
    expect(effectiveUnitPrice({ price: '10.00', salesRules }, 9, now)).toBe('9.00')
    expect(effectiveUnitPrice({ price: '10.00', salesRules }, 10, now)).toBe('7.20')
    expect(effectiveUnitPrice({ price: '10.00', salesRules }, 20, now)).toBe('6.35')
    expect(effectiveUnitPrice({ price: '10.00', salesRules }, 20, new Date('2026-12-01'))).toBe('7.05')
  })
  it('rejects ambiguous thresholds, invalid minimum quantities and reversed promotion dates', () => {
    expect(salesRulesSchema.safeParse({ minQuantity: 0 }).success).toBe(false)
    expect(salesRulesSchema.safeParse({ tiers: [{ quantity: 10, price: 8 }, { quantity: 10, price: 7 }] }).success).toBe(false)
    expect(salesRulesSchema.safeParse({ promotion: { percent: 10, startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' } }).success).toBe(false)
  })
  it('requires an existing zone matching geography and normalizes accents and whitespace', () => {
    const zone = { id: 'capital', name: 'Capital', country: 'Perú', cities: ['Lima'], fee: 12, days: 2, carrier: '' }
    expect(shippingFor([zone], { country: ' PERU ', city: 'lima' }, zone.id)).toEqual(zone)
    expect(shippingFor([zone], { country: 'Perú', city: 'Cusco' }, zone.id)).toBeUndefined()
    expect(shippingFor([zone], { country: 'Perú', city: 'Lima' }, 'fake')).toBeUndefined()
    expect(shippingFor([{ ...zone, cities: [] }], { country: 'Perú', city: 'Cusco' }, zone.id)).toBeDefined()
    expect(shippingFor([], { country: 'Perú', city: 'Lima' })).toBeNull()
  })
})
