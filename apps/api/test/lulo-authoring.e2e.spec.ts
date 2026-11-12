import type { INestApplication } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import ExcelJS from 'exceljs'
import { bearer, createApp, login, TestDb, type Session } from './helpers'
import { budgetMasterBatches, luloMasterCatalogs } from '../src/database/schema'
import { masterHeaders } from '../src/modules/budget/lulo-master-import'
import type { LuloInput } from '../src/modules/budget/lulo.schemas'

describe('Etapa 1: alta de maestros, precios con vigencias, importación y borradores pendientes', () => {
  let app: INestApplication, db: TestDb, editor: Session, other: Session, manager: Session, catalogId: string, materialId: string, itemId: string, priceListId: string
  const B = '/api/v1/plants/e2e-author1/lulo', reason = 'Revisión de fuentes y vigencias de la planta'
  const post = (url: string, body: object, user = editor) => request(app.getHttpServer()).post(url).set('Authorization', bearer(user)).send(body)
  const get = (url: string, user = editor) => request(app.getHttpServer()).get(url).set('Authorization', bearer(user))
  const master = (kind: string, code: string, extra: object = {}) => ({ catalogId, kind, code, name: `Maestro de prueba ${code}`, unit: kind === 'MATERIAL' ? 'KG' : 'UND', familyId: null, amount: '10', yieldValue: '2', components: [], ...extra })
  const input = (): LuloInput => ({ title: 'Presupuesto con lista vigente', project: '', client: '', notes: '', publicationId: catalogId, currency: 'USD', precision: 2, priceListId, baseDate: '2026-06-01', rates: { fcasPct: '0', overheadPct: '0', utilityPct: '0', financePct: '0', taxPct: '0' }, chapters: [{ id: 'c', name: 'Capítulo', parentId: null }], lines: [{ id: 'l', chapterId: 'c', mode: 'CALCULATED', apuId: itemId, code: 'MI-APU', description: 'Partida de prueba', unit: 'UND', quantity: '1', manualPrice: null, reason: '', taxable: true }], overrides: [] })
  beforeAll(async () => {
    app = await createApp(); db = new TestDb(); await db.cleanup()
    const p = await db.plant('author1', 'PRIVATE'), p2 = await db.plant('author2', 'PRIVATE')
    const e = await db.user('author-editor'); await db.assign(e.id, p.id, 'BUDGET'); const m = await db.user('author-manager'); await db.assign(m.id, p.id, 'PLANT_MANAGER'); const o = await db.user('author-other'); await db.assign(o.id, p2.id, 'PLANT_ADMIN')
    ;[editor, manager, other] = await Promise.all(['author-editor', 'author-manager', 'author-other'].map(n => login(app, n)))
    const [batch] = await db.db.insert(budgetMasterBatches).values({ fingerprint: randomUUID(), source: 'e2e-authoring', report: { files: [], counts: { items: 0, materials: 0, equipment: 0, labor: 0, families: 0 }, quarantined: 0, issues: {}, excluded: [], currencyStatus: 'UNKNOWN', priceStatus: 'REFERENCE', relationships: { orphanFamilies: 0, orphanResources: 0 }, compositionLines: 0 } }).returning(); catalogId = batch.id
    await db.db.insert(luloMasterCatalogs).values({ id: catalogId, name: 'Catálogo de prueba', sourceHash: 'a'.repeat(64), counts: batch.report.counts })
  })
  afterAll(async () => { try { await db.cleanup(); if (catalogId) { await db.db.delete(luloMasterCatalogs).where(eq(luloMasterCatalogs.id, catalogId)); await db.db.delete(budgetMasterBatches).where(eq(budgetMasterBatches.id, catalogId)) } } finally { await db.close(); await app.close() } })
  it('creates plant-only resources and APUs without changing the shared public masters', async () => {
    materialId = (await post(`${B}/masters`, master('MATERIAL', 'MI-MAT')).expect(201)).body.id
    itemId = (await post(`${B}/masters`, master('ITEM', 'MI-APU', { components: [{ resourceId: materialId, quantity: '2', wastePct: '0' }] })).expect(201)).body.id
    expect((await get(`${B}/masters/${itemId}`).expect(200)).body.components[0].resource.code).toBe('MI-MAT')
    await request(app.getHttpServer()).get(`/api/v1/budget-masters/${materialId}`).expect(404)
    await get(`/api/v1/plants/e2e-author2/lulo/masters/${materialId}`, other).expect(404)
    const shared = (await request(app.getHttpServer()).get(`/api/v1/budget-masters?catalogId=${catalogId}&kind=MATERIAL`).expect(200)).body; expect(shared.total).toBe(0)
    await post(`${B}/masters`, master('MATERIAL', 'MI-MAT')).expect(409)
  })
  it('publishes immutable price revisions and resolves the date base and selected currency', async () => {
    priceListId = (await post(`${B}/price-lists`, { code: 'PRE-USD', name: 'Precios autorizados', currency: 'USD', status: 'ACTIVE' }).expect(201)).body.id
    const price = { resourceId: materialId, amount: '20', baseDate: '2026-01-01', validUntil: '2099-12-31', unit: 'KG', costBasis: 'UNIT', evidence: 'Cotización de prueba original', supplier: 'Proveedor de prueba', zeroReason: '' }
    await post(`${B}/price-lists/${priceListId}/prices`, price).expect(201)
    await post(`${B}/price-lists/${priceListId}/prices`, { ...price, amount: '30' }).expect(201)
    await post(`${B}/price-lists/${priceListId}/prices`, { ...price, amount: '40', baseDate: '2026-07-01' }).expect(201)
    const result = (await post(`${B}/calculate`, input()).expect(201)).body; expect(result.result.totals.total).toBe('60.00'); expect(result.warnings).toEqual([])
    expect((await post(`${B}/calculate`, { ...input(), baseDate: '2026-08-01' }).expect(201)).body.result.totals.total).toBe('80.00')
    await post(`${B}/calculate`, { ...input(), currency: 'EUR' }).expect(422)
    const history = (await get(`${B}/price-lists/${priceListId}/prices`).expect(200)).body; expect(history).toHaveLength(3); expect(history.some((r: any) => r.price.amount === '20.00000000')).toBe(true)
  })
  it('saves an unresolved draft with provisional totals and blocks its review', async () => {
    const draft = input(); draft.lines[0].pendingReason = 'Falta confirmar la cotización del material'
    const doc = (await post(`${B}/documents`, { requestId: randomUUID(), input: draft }).expect(201)).body
    expect(doc.result.totals.total).toBe('0.00'); expect(doc.warnings.join()).toContain('Partida pendiente')
    await post(`${B}/documents/${doc.id}/submit`, { expectedRevision: doc.revision, reason }).expect(422)
  })
  it('previews and confirms strict Excel imports atomically and supports safe retries', async () => {
    const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Maestros'); sheet.addRow(masterHeaders); sheet.addRow(['MATERIAL', 'EXCEL-MAT', 'Material importado', 'KG', '15', '1', '', '', '', '', '0'])
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer())
    const preview = (await request(app.getHttpServer()).post(`${B}/master-imports/upload`).set('Authorization', bearer(editor)).field('catalogId', catalogId).attach('file', bytes, 'maestros.xlsx').expect(201)).body
    expect(preview.result.errors).toEqual([])
    const committed = (await post(`${B}/master-imports/${preview.id}/confirm`, { hash: preview.hash }).expect(201)).body; expect(committed.status).toBe('CONFIRMED')
    expect((await post(`${B}/master-imports/${preview.id}/confirm`, { hash: preview.hash }).expect(201)).body.id).toBe(preview.id)
    sheet.addRow(['MATERIAL', 'EXCEL-MAT', 'Duplicado', 'KG', '1', '1', '', '', '', '', '0'])
    const bad = (await request(app.getHttpServer()).post(`${B}/master-imports/upload`).set('Authorization', bearer(editor)).field('catalogId', catalogId).attach('file', Buffer.from(await workbook.xlsx.writeBuffer()), 'duplicados.xlsx').expect(201)).body
    expect(bad.result.errors.length).toBeGreaterThan(0); await post(`${B}/master-imports/${bad.id}/confirm`, { hash: bad.hash }).expect(422)
  })
  it('confirms selective recalculation once and retains old emitted headers and prices', async () => {
    let doc = (await post(`${B}/documents`, { requestId: randomUUID(), input: input() }).expect(201)).body
    const refresh = { expectedRevision: doc.revision, publicationId: catalogId, apuIds: [itemId], reason, resourceTypes: ['MATERIAL'], replaceStructure: false }
    const preview = (await post(`${B}/documents/${doc.id}/recalculate-preview`, refresh).expect(201)).body
    const confirmed = (await post(`${B}/documents/${doc.id}/recalculate`, { ...refresh, previewHash: preview.previewHash }).expect(201)).body; expect(confirmed.revision).toBe(doc.revision + 1)
    expect((await post(`${B}/documents/${doc.id}/recalculate`, { ...refresh, previewHash: preview.previewHash }).expect(201)).body.revision).toBe(confirmed.revision)
    doc = (await post(`${B}/documents/${doc.id}/submit`, { expectedRevision: confirmed.revision, reason, requestId: randomUUID() }).expect(201)).body
    const issue = { expectedRevision: doc.revision, reason, requestId: randomUUID() }
    const issued = (await post(`${B}/documents/${doc.id}/issue`, issue, manager).expect(201)).body
    expect((await post(`${B}/documents/${doc.id}/issue`, issue, manager).expect(201)).body.revision).toBe(issued.revision)
  })
})
