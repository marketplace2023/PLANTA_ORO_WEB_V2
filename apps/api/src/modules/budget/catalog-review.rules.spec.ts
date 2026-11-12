import { catalogDraftSchema, initialCatalogDraft, referenceKey, validateCatalogNode, type CatalogNode } from './catalog-review.rules'

const today = '2026-11-11'
function node(kind = 'RESOURCE', resourceType = 'MATERIAL'): CatalogNode {
  const source = { id: kind, batchId: 'batch', kind, resourceType, sourceId: kind, code: '001', name: 'Material', unit: 'KG', sourceContext: '', data: { familySourceId: 'family', yieldValue: '1' } }
  return { source, revision: 1, state: 'DRAFT', draft: initialCatalogDraft(source), dependencies: {} }
}
const price = () => ({ amount: '12.50000001', currency: 'USD', denomination: 'Dólar estadounidense', baseDate: '2026-11-01', validUntil: '2026-12-01', costBasis: 'UNIT' as const, evidence: 'Cotización comprobada de noviembre' })
function validResource() {
  const resource = node()
  resource.draft.price = price()
  const family = node('FAMILY')
  family.source.sourceId = 'family'; family.state = 'APPROVED'; family.draft.unit = null
  const graph = new Map([[referenceKey(family.source), family], [referenceKey(resource.source), resource]])
  return { resource, family, graph }
}

describe('LULO master review rules', () => {
  it('never upgrades a recovered historical price to a verified price by default', () => {
    const n = node(); n.source.data.historicalPrice = '12.50'
    expect(initialCatalogDraft(n.source).price).toBeNull()
    expect(validateCatalogNode(n, new Map(), today)).toEqual(expect.arrayContaining([expect.stringContaining('Falta verificar'), expect.stringContaining('Referencia inexistente')]))
  })
  it('preserves decimal strings, rejects malformed values and requires real dates and explicit economic metadata', () => {
    const { resource } = validResource()
    expect(catalogDraftSchema.parse(resource.draft).price!.amount).toBe('12.50000001')
    for (const amount of ['NaN', '-1', '12,50', '1e2', '0.000000001']) expect(catalogDraftSchema.safeParse({ ...resource.draft, price: { ...price(), amount } }).success).toBe(false)
    expect(catalogDraftSchema.safeParse({ ...resource.draft, price: { ...price(), baseDate: '2026-02-30' } }).success).toBe(false)
    expect(catalogDraftSchema.safeParse({ ...resource.draft, price: { ...price(), denomination: '' } }).success).toBe(false)
  })
  it('blocks zero amounts, expired dates and future base dates even if the draft can be saved', () => {
    for (const changes of [{ amount: '0' }, { validUntil: '2026-11-02' }, { baseDate: '2026-11-12' }]) {
      const { resource, graph } = validResource(); resource.draft.price = { ...price(), ...changes }
      expect(validateCatalogNode(resource, graph, today).length).toBeGreaterThan(0)
    }
  })
  it('does not permit acquisition costs or mismatched time units as equipment usage rates', () => {
    const { resource, family, graph } = validResource()
    graph.clear(); resource.source.resourceType = 'EQUIPMENT'; family.source.resourceType = 'EQUIPMENT'
    graph.set(referenceKey(family.source), family)
    expect(validateCatalogNode(resource, graph, today)).toContain('Confirme una tarifa por hora o por día; no use el costo de adquisición')
    resource.draft.price = { ...price(), costBasis: 'DAY' }; resource.draft.unit = 'H'
    expect(validateCatalogNode(resource, graph, today)).toContain('La tarifa por día debe usar la unidad DIA')
    resource.draft.unit = 'DIA'; expect(validateCatalogNode(resource, graph, today)).toEqual([])
  })
  it('detects changed dependencies transitively after an approval', () => {
    const { resource, family, graph } = validResource()
    resource.state = 'APPROVED'; resource.dependencies = { [family.source.id]: family.revision }
    expect(validateCatalogNode(resource, graph, today)).toEqual([])
    family.revision++
    expect(validateCatalogNode(resource, graph, today)).toContain('Cambió 001 después de la aprobación')
  })
  it('rejects invalid composition quantities and source/code mismatches instead of silently removing lines', () => {
    const { resource, graph } = validResource(); resource.state = 'APPROVED'; resource.dependencies = { FAMILY: 1 }
    const apu = node('APU', ''); apu.source.data.masterSourceId = null; apu.draft.yieldBasis = 'ITEM'; apu.draft.methodNote = 'Consumo por unidad de partida'
    apu.draft.composition = [{ resourceSourceId: resource.source.sourceId, resourceType: 'MATERIAL', code: 'wrong', quantity: '0', wastePct: '101', sourceDepreciation: null }]
    expect(validateCatalogNode(apu, graph, today)).toEqual(expect.arrayContaining([expect.stringContaining('cantidad no positiva'), expect.stringContaining('desperdicio fuera'), expect.stringContaining('no coinciden')]))
    expect(apu.draft.composition).toHaveLength(1)
  })
})
