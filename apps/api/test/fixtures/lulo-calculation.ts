import { demoLuloInput } from '../../src/modules/budget/lulo-demo'
import { LULO_PROFILE } from '../../src/modules/budget/lulo.schemas'
import type { LuloCatalog, LuloResource } from '../../src/modules/budget/lulo-engine'

export function calculationFixture() {
  const publicationId = '10000000-0000-4000-8000-000000000001'
  const apuId = '10000000-0000-4000-8000-000000000002'
  const resource = (i: number, type: LuloResource['type'], amount: string): LuloResource => ({ id: `10000000-0000-4000-8000-00000000000${i}`, code: `R${i}`, name: `Recurso ${i}`, type, unit: type === 'MATERIAL' ? 'UND' : 'DIA', amount, costBasis: type === 'MATERIAL' ? 'UNIT' : 'DAY', baseDate: '2026-01-01', validUntil: '2099-12-31', evidence: 'Ejemplo de aceptación', currency: 'USD', denomination: 'USD de ejemplo' })
  const catalog: LuloCatalog = { profile: LULO_PROFILE, publicationId, label: 'Ejemplo de aceptación', version: 1, demo: true, currency: 'USD', denomination: 'USD de ejemplo', hash: 'a'.repeat(64), apus: [{ id: apuId, code: 'DEMO-MON-001', name: 'Montaje de soporte', unit: 'UND', yieldBasis: 'DAY', yieldValue: '10', hoursPerDay: '8', methodNote: 'Cuadrilla por jornada y material por unidad', publicationId, components: [
    { resource: resource(3, 'MATERIAL', '40'), quantity: '2', wastePct: '5' },
    { resource: resource(4, 'EQUIPMENT', '120'), quantity: '1', wastePct: '0' },
    { resource: resource(5, 'LABOR', '60'), quantity: '2', wastePct: '0' },
  ] }] }
  return { catalog, input: demoLuloInput(publicationId, catalog.apus[0]) }
}
