import type { INestApplication } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { bearer, createApp, login, TestDb, type Session } from './helpers'
import { storeRecoveredMasters } from '../src/modules/budget/master-recovery-store'
import { convertLuloMasters } from '../src/database/convert-lulo-masters'
import { auditEvents, budgetMasterBatches, luloMasterCatalogs } from '../src/database/schema'
import type { MasterEntry, RecoveredMasters } from '../src/modules/budget/legacy-masters'
import type { LuloInput } from '../src/modules/budget/lulo.schemas'

describe('Maestros originales: conversión, catálogo público y trabajo privado de planta', () => {
  let app: INestApplication, db: TestDb, editor: Session, reader: Session, outsider: Session
  let catalogId: string, itemId: string, materialId: string, equipmentId: string, laborId: string
  const P = '/api/v1/budget-masters', B = '/api/v1/plants/e2e-master1/lulo'
  const get = (url: string, user?: Session) => { const q = request(app.getHttpServer()).get(url); return user ? q.set('Authorization', bearer(user)) : q }
  const post = (url: string, body: object, user?: Session) => { const q = request(app.getHttpServer()).post(url); return (user ? q.set('Authorization', bearer(user)) : q).send(body) }
  const value = { name: 'Material con precio propio', unit: 'KG', amount: '20', currency: 'USD', baseDate: '2026-01-01', validUntil: '2099-01-01', evidence: 'Cotización de prueba documentada', verified: true }
  const patch = (id: string, data: object, user = editor) => request(app.getHttpServer()).patch(`${B}/masters/${id}`).set('Authorization', bearer(user)).send(data)
  const input = (): LuloInput => ({ title: 'Presupuesto con maestros originales', project: '', client: '', notes: '', publicationId: catalogId, currency: 'USD', precision: 2, referenceMode: true, rates: { fcasPct: '0', overheadPct: '0', utilityPct: '0', financePct: '0', taxPct: '0' }, chapters: [{ id: 'c1', name: 'Trabajos', parentId: null }], lines: [{ id: 'l1', chapterId: 'c1', mode: 'CALCULATED', apuId: itemId, code: 'PART-01', description: 'Partida original', unit: 'M3', quantity: '1', manualPrice: null, reason: '', taxable: true }], overrides: [] })
  beforeAll(async () => {
    app = await createApp(); db = new TestDb(); await db.cleanup()
    const plant = await db.plant('master1', 'PRIVATE'), other = await db.plant('master2', 'PRIVATE')
    const u = await db.user('master-editor'); await db.assign(u.id, plant.id, 'BUDGET')
    const r = await db.user('master-reader'); await db.assign(r.id, plant.id, 'CONSUMER')
    const o = await db.user('master-outsider'); await db.assign(o.id, other.id, 'PLANT_ADMIN')
    ;[editor, reader, outsider] = await Promise.all(['master-editor', 'master-reader', 'master-outsider'].map(n => login(app, n)))
    const entry = (kind: MasterEntry['kind'], resourceType: string, code: string, data: Record<string, unknown>): MasterEntry => ({ kind, resourceType, code, sourceId: code, name: `Original ${code}`, unit: kind === 'APU' ? 'M3' : 'KG', sourceContext: kind === 'APU' ? 'MASTER' : '', status: 'RECOVERED', issues: [], data })
    const entries = [entry('FAMILY', 'MATERIAL', 'F01', {}), entry('RESOURCE', 'MATERIAL', 'MAT-01', { historicalPrice: '10', familySourceId: 'F01', priceDate: '2006-12-01', wastePct: '0' }), entry('RESOURCE', 'EQUIPMENT', 'EQU-01', { historicalPrice: '1000', sourceDailyCost: '5', sourceDepreciation: '0.005' }), entry('RESOURCE', 'LABOR', 'MO-01', { historicalPrice: '20' }), entry('APU', '', 'PART-01', { yieldValue: '2', historicalUnitPrice: '99', composition: [
      { resourceType: 'MATERIAL', resourceSourceId: 'MAT-01', code: 'MAT-01', quantity: '2', sourceWastePct: '0' },
      { resourceType: 'EQUIPMENT', resourceSourceId: 'EQU-01', code: 'EQU-01', quantity: '1' },
      { resourceType: 'LABOR', resourceSourceId: 'MO-01', code: 'MO-01', quantity: '1' },
    ] }), entry('APU', '', 'PART-ORPHAN', { yieldValue: '1', historicalUnitPrice: '12', composition: [{ resourceType: 'EQUIPMENT', resourceSourceId: 'MISSING', code: 'EQU-MISSING', quantity: '0' }] })]
    const recovered: RecoveredMasters = { fingerprint: randomUUID(), entries, report: { files: [{ name: 'LULO.MDB', sha256: 'a'.repeat(64), bytes: 1, records: entries.length }], counts: { items: 2, materials: 1, equipment: 1, labor: 1, families: 1 }, compositionLines: 4, quarantined: 0, issues: {}, excluded: [], currencyStatus: 'UNKNOWN', priceStatus: 'HISTORICAL', relationships: { orphanFamilies: 0, orphanResources: 1 } } }
    catalogId = (await storeRecoveredMasters(db.db, recovered, 'e2e-original-masters')).batch.id
    const converted = await convertLuloMasters(db.db, catalogId); expect(converted).toMatchObject({ created: true, items: 2, resources: 3, componentCount: 4 })
    expect(await convertLuloMasters(db.db, catalogId)).toMatchObject({ created: false })
    const items = (await get(`${P}?catalogId=${catalogId}`).expect(200)).body.items; itemId = items.find((i: { code: string }) => i.code === 'PART-01').id
    materialId = (await get(`${P}?catalogId=${catalogId}&kind=MATERIAL`).expect(200)).body.items[0].id
    equipmentId = (await get(`${P}?catalogId=${catalogId}&kind=EQUIPMENT`).expect(200)).body.items[0].id
    laborId = (await get(`${P}?catalogId=${catalogId}&kind=LABOR`).expect(200)).body.items[0].id
  })
  afterAll(async () => { try { await db.cleanup(); if (catalogId) { await db.db.delete(auditEvents).where(eq(auditEvents.entityId, materialId)); await db.db.delete(luloMasterCatalogs).where(eq(luloMasterCatalogs.id, catalogId)); await db.db.delete(budgetMasterBatches).where(eq(budgetMasterBatches.id, catalogId)) } } finally { await db.close(); await app.close() } })
  it('makes actual master kinds and APU composition searchable without a session, with original PU and daily equipment cost separated', async () => {
    const list = (await get(`${P}?kind=ITEM&catalogId=${catalogId}&search=PART-01`).expect(200)).body
    expect(list.total).toBe(1); expect(list.items[0]).toMatchObject({ originalUnitPrice: '99.00000000', yieldValue: '2.00000000' }); expect(list.items[0]).not.toHaveProperty('sourceFields')
    const detail = (await get(`${P}/${itemId}`).expect(200)).body; expect(detail.components).toHaveLength(3); expect(detail).not.toHaveProperty('sourceFields')
    const equipment = (await get(`${P}/${equipmentId}`).expect(200)).body.item
    expect(equipment).toMatchObject({ historicalPrice: '1000.00000000', dailyCost: '5.00000000', amount: '5.00000000', currency: null, priceStatus: 'HISTORICAL' })
    const orphan = (await get(`${P}?catalogId=${catalogId}&search=ORPHAN`).expect(200)).body.items[0]
    const missing = (await get(`${P}/${orphan.id}`).expect(200)).body.components[0]; expect(missing.resource).toBeNull(); expect(missing.quantity).toBe('0.00000000')
  })
  it('requires historical acknowledgement and calculates using daily equipment cost and master yield', async () => {
    await post('/api/v1/budget-estimates/calculate', { ...input(), referenceMode: false }).expect(422)
    const calculated = (await post('/api/v1/budget-estimates/calculate', input()).expect(201)).body
    expect(calculated.result.totals.total).toBe('32.50'); expect(calculated.warnings).toHaveLength(3)
    expect(calculated.catalog.historical).toBe(true)
  })
  it('enforces plant membership, edit permission, evidence and optimistic revision', async () => {
    await get(`${B}/masters`).expect(401); await get(`${B}/masters`, outsider).expect(404)
    const data = { expectedRevision: 0, reason: 'Actualizar precio de la planta', value }
    await patch(materialId, data, reader).expect(403)
    await patch(materialId, { ...data, value: { ...value, evidence: '' } }).expect(400)
    const own = (await patch(materialId, data).expect(200)).body
    expect(own.revision).toBe(1); expect(own.item.amount).toBe('20')
    await patch(materialId, data).expect(409)
    expect((await get(`${P}/${materialId}`).expect(200)).body.item.amount).toBe('10.00000000')
  })
  it('uses plant adjustments only in private calculations and preserves frozen budget prices', async () => {
    await post(`${B}/calculate`, { ...input(), currency: 'EUR' }, editor).expect(422)
    const own = (await post(`${B}/calculate`, input(), editor).expect(201)).body; expect(own.result.totals.total).toBe('52.50')
    const publicResult = (await post('/api/v1/budget-estimates/calculate', input()).expect(201)).body; expect(publicResult.result.totals.total).toBe('32.50')
    const doc = (await post(`${B}/documents`, { requestId: randomUUID(), input: input() }, editor).expect(201)).body
    await patch(materialId, { expectedRevision: 1, reason: 'Nueva cotización de material', value: { ...value, amount: '30' } }).expect(200)
    const old = (await get(`${B}/documents/${doc.id}`, editor).expect(200)).body; expect(old.result.totals.total).toBe('52.50')
    expect((await post(`${B}/calculate`, input(), editor).expect(201)).body.result.totals.total).toBe('72.50')
    await post(`${B}/documents/${doc.id}/submit`, { expectedRevision: doc.revision, reason: 'Revisión de valores originales' }, editor).expect(422)
    await patch(equipmentId, { expectedRevision: 0, reason: 'Confirmar costo diario equipo', value: { ...value, name: 'Equipo', unit: 'DIA', amount: '5' } }).expect(200)
    await patch(laborId, { expectedRevision: 0, reason: 'Confirmar salario de cuadrilla', value: { ...value, name: 'Cuadrilla', unit: 'DIA', amount: '20' } }).expect(200)
    const current = (await post(`${B}/calculate`, { ...input(), referenceMode: false }, editor).expect(201)).body
    expect(current.warnings).toEqual([]); expect(current.result.totals.total).toBe('72.50')
  })
})
