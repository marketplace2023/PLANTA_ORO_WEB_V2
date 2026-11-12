import type { LuloInput } from './lulo.schemas'
import type { LuloApu } from './lulo-engine'

export function demoLuloInput(publicationId: string, apu: Pick<LuloApu, 'id' | 'code' | 'name' | 'unit'>): LuloInput {
  return { title: 'Ejemplo · Montaje de soportes', project: 'Obra de demostración', client: 'Cliente de demostración', notes: 'Datos ficticios para verificar el flujo. Tarifas e impuesto ilustrativos, sin validez comercial.',
    publicationId, currency: 'USD', precision: 2, rates: { fcasPct: '50', overheadPct: '10', utilityPct: '10', financePct: '0', taxPct: '16' },
    chapters: [{ id: 'montaje', name: 'Montaje', parentId: null }, { id: 'inspeccion', name: 'Inspección', parentId: null }], overrides: [],
    lines: [{ id: 'demo-montaje', chapterId: 'montaje', apuId: apu.id, mode: 'CALCULATED', code: apu.code, description: apu.name, unit: apu.unit, quantity: '25', manualPrice: null, reason: '', taxable: true },
      { id: 'demo-inspeccion', chapterId: 'inspeccion', apuId: null, mode: 'MANUAL', code: 'DEMO-INS-001', description: 'Inspección de montaje', unit: 'UND', quantity: '4', manualPrice: '125', reason: 'Servicio ficticio para comprobar una partida manual', taxable: true }] }
}
