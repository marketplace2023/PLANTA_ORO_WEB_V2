import type { INestApplication } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import request from 'supertest'
import ExcelJS from 'exceljs'
import { bearer, createApp, login, type Session, TestDb } from './helpers'
import { seedLuloDemo } from '../src/database/seed-lulo-demo'
import { auditEvents, budgetCatalogReleases, budgetMasterBatches, budgetPublications, budgets, resources } from '../src/database/schema'
import type { LuloInput } from '../src/modules/budget/lulo.schemas'
import type { LuloCatalog, LuloResult } from '../src/modules/budget/lulo-engine'

type Doc = { id: string; code: string; version: number; revision: number; groupId: string; predecessorId: string | null; status: string; input: LuloInput; result: LuloResult; catalog: LuloCatalog; contentHash: string; issuedAt: string | null }

describe('LULO: anonymous estimate → plant → review → issue → successor', () => {
  let app: INestApplication, db: TestDb, admin: Session, editor: Session, manager: Session, reader: Session, outsider: Session
  let publicationId: string, releaseId: string, batchId: string, secondPublicationId: string
  let input: LuloInput, doc: Doc, oldHash: string
  let initial: { budgets: number; resources: number }
  const B = '/api/v1/plants/e2e-lulo1/lulo/documents'
  const P = '/api/v1/budget-estimates'
  const A = '/api/v1/admin/budget-catalog'
  const reason = 'Verificación documentada del caso de aceptación'
  const get = (url: string, user?: Session) => { const q = request(app.getHttpServer()).get(url); return user ? q.set('Authorization', bearer(user)) : q }
  const post = (url: string, body: object, user?: Session) => { const q = request(app.getHttpServer()).post(url); return (user ? q.set('Authorization', bearer(user)) : q).send(body) }
  const patch = (body: object, user = editor) => request(app.getHttpServer()).patch(`${B}/${doc.id}`).set('Authorization', bearer(user)).send(body)
  const counts = async () => ({ budgets: Number((await db.db.select({ n: sql<number>`count(*)::int` }).from(budgets))[0].n), resources: Number((await db.db.select({ n: sql<number>`count(*)::int` }).from(resources))[0].n) })
  beforeAll(async () => {
    app = await createApp(); db = new TestDb(); await db.cleanup()
    const p1 = await db.plant('lulo1', 'PRIVATE'); const p2 = await db.plant('lulo2', 'PRIVATE')
    for (const [name, role] of [['lulo-editor', 'BUDGET'], ['lulo-manager', 'PLANT_MANAGER'], ['lulo-reader', 'CONSUMER']] as const) {
      const u = await db.user(name); await db.assign(u.id, p1.id, role)
    }
    const out = await db.user('lulo-outsider'); await db.assign(out.id, p2.id, 'PLANT_ADMIN'); await db.user('lulo-global', { isGlobalAdmin: true })
    ;[admin, editor, manager, reader, outsider] = await Promise.all(['lulo-global', 'lulo-editor', 'lulo-manager', 'lulo-reader', 'lulo-outsider'].map(n => login(app, n)))
    const publication = await seedLuloDemo(db.db); publicationId = publication!.id; releaseId = publication!.releaseId
    const [release] = await db.db.select().from(budgetCatalogReleases).where(eq(budgetCatalogReleases.id, releaseId)); batchId = release.batchId
    input = (await get(`${P}/example`).expect(200)).body.input
    initial = await counts()
  })
  afterAll(async () => {
    try {
      await db.cleanup()
      if (batchId) {
        const publications = await db.db.select().from(budgetPublications).innerJoin(budgetCatalogReleases, eq(budgetCatalogReleases.id, budgetPublications.releaseId)).where(eq(budgetCatalogReleases.batchId, batchId))
        for (const p of publications) await db.db.delete(auditEvents).where(eq(auditEvents.entityId, p.catalog_publications.id))
        await db.db.delete(budgetMasterBatches).where(eq(budgetMasterBatches.id, batchId))
      }
    } finally { await db.close(); await app.close() }
  })

  it('exposes only active, projected catalog data anonymously in members access mode', async () => {
    const list = (await get(`${P}/publications`).expect(200)).body
    expect(list.find((p: { id: string }) => p.id === publicationId)).toMatchObject({ demo: true })
    expect(list[0]).not.toHaveProperty('createdBy'); expect(list[0]).not.toHaveProperty('releaseId')
    const apus = (await get(`${P}/publications/${publicationId}/apus?search=DEMO-MON`).expect(200)).body
    expect(apus.total).toBe(1); expect(apus.items[0]).not.toHaveProperty('snapshot'); expect(apus.items[0]).not.toHaveProperty('sourceContext')
    await get(`${A}/publications`).expect(401)
    await post(`${A}/releases/${releaseId}/activate`, {}, editor).expect(403)
    await get(B).expect(401); await get(B, outsider).expect(404)
  })
  it('calculates the supplied reference total without a session and rejects forged or inconsistent inputs', async () => {
    const calculated = (await post(`${P}/calculate`, input).expect(201)).body
    expect(calculated.result.totals.total).toBe('4580.26'); expect(calculated.result.demo).toBe(true)
    expect(JSON.stringify(calculated)).not.toContain('DEMO_MASTER'); expect(JSON.stringify(calculated)).not.toContain('createdBy')
    await post(`${P}/calculate`, { ...input, total: '1' }).expect(400)
    await post(`${P}/calculate`, { ...input, currency: 'EUR' }).expect(422)
    await post(`${P}/calculate`, { ...input, lines: [{ ...input.lines[0], quantity: 'NaN' }] }).expect(400)
    await post(B, { requestId: randomUUID(), input }).expect(401)
  })
  it('adopts the same calculation server-side exactly once even for concurrent retries', async () => {
    const requestId = randomUUID()
    const [a, b] = await Promise.all([post(B, { requestId, input }, editor), post(B, { requestId, input }, editor)])
    expect([a.status, b.status]).toEqual([201, 201]); expect(a.body.id).toBe(b.body.id)
    doc = a.body
    const calculated = (await post(`${P}/calculate`, input).expect(201)).body
    expect(doc.result).toEqual(calculated.result); expect(doc.contentHash).toBe(calculated.hash)
    await post(B, { requestId, input: { ...input, title: 'Otro contenido' } }, editor).expect(409)
    expect((await get(B, editor).expect(200)).body.total).toBe(1)
  })
  it('enforces plant and action permissions for viewing, editing, issuing and downloading reports', async () => {
    await get(`${B}/${doc.id}`, reader).expect(200)
    await patch({ expectedRevision: doc.revision, reason, input }, reader).expect(403)
    await post(`${B}/${doc.id}/issue`, { expectedRevision: doc.revision, reason }, editor).expect(403)
    await get(`${B}/${doc.id}/report?format=pdf`, outsider).expect(404)
    await get(`/api/v1/plants/e2e-lulo2/lulo/documents/${doc.id}`, outsider).expect(404)
  })
  it('saves a private revision with fixed prices and rejects stale saves', async () => {
    input = { ...doc.input, lines: doc.input.lines.map((l, i) => i === 0 ? { ...l, quantity: '30' } : l) }
    const preview = (await post(`${B}/${doc.id}/preview`, { expectedRevision: doc.revision, reason, input }, editor).expect(201)).body
    expect(preview.result.totals.total).toBe('5380.31')
    const revision = doc.revision
    doc = (await patch({ expectedRevision: revision, reason, input }).expect(200)).body
    expect(doc.result.totals.total).toBe('5380.31'); expect(doc.revision).toBe(revision + 1)
    await patch({ expectedRevision: revision, reason, input }).expect(409)
  })
  it('withdraws a publication for new work while existing plant drafts retain their saved prices', async () => {
    await post(`${A}/publications/${publicationId}/withdraw`, { reason }, admin).expect(201)
    await post(`${P}/calculate`, input).expect(404)
    const existing = (await get(`${B}/${doc.id}`, editor).expect(200)).body
    expect(existing.result.totals.total).toBe('5380.31')
    const preview = (await post(`${B}/${doc.id}/preview`, { expectedRevision: doc.revision, reason, input: doc.input }, editor).expect(201)).body
    expect(preview.result.totals.total).toBe('5380.31')
    const [release] = await db.db.select().from(budgetCatalogReleases).where(eq(budgetCatalogReleases.id, releaseId))
    const active = (await post(`${A}/releases/${releaseId}/activate`, { expectedHash: release.contentHash, label: release.name, reason }, admin).expect(201)).body
    expect(active.demo).toBe(true)
  })
  it('publishes a new catalog revision through Admin without changing the stored plant budget', async () => {
    const resourceId = doc.catalog.apus[0].components[0].resource.id; const apuId = doc.catalog.apus[0].id
    const review = (await get(`${A}/entries/${resourceId}/review`, admin).expect(200)).body
    await request(app.getHttpServer()).patch(`${A}/entries/${resourceId}/review`).set('Authorization', bearer(admin)).send({ expectedRevision: review.revision, reason, draft: { ...review.draft, price: { ...review.draft.price, amount: '50' } } }).expect(200)
    await post(`${A}/entries/${resourceId}/approve`, { expectedRevision: review.revision + 1, reason }, admin).expect(201)
    const apu = (await get(`${A}/entries/${apuId}/review`, admin).expect(200)).body
    await post(`${A}/entries/${apuId}/approve`, { expectedRevision: apu.revision, reason }, admin).expect(201)
    const prepared = (await post(`${A}/batches/${batchId}/releases`, { name: 'DEMO prueba v2', reason, entryIds: [apuId] }, admin).expect(201)).body
    await post(`${A}/releases/${prepared.id}/publish`, { expectedHash: prepared.contentHash, reason }, admin).expect(201)
    const active = (await post(`${A}/releases/${prepared.id}/activate`, { expectedHash: prepared.contentHash, label: prepared.name, reason }, admin).expect(201)).body
    secondPublicationId = active.id; expect(active.demo).toBe(true)
    expect((await get(`${B}/${doc.id}`, editor).expect(200)).body.result.totals.total).toBe('5380.31')
    expect((await post(`${P}/calculate`, { ...input, publicationId: secondPublicationId }).expect(201)).body.result.totals.total).toBe('6264.58')
  })
  it('previews and confirms selective recalculation, requiring the expected revision and preview hash', async () => {
    const data = { expectedRevision: doc.revision, reason, publicationId: secondPublicationId, apuIds: [doc.catalog.apus[0].id] }
    await post(`${B}/${doc.id}/recalculate`, data, editor).expect(409)
    const preview = (await post(`${B}/${doc.id}/recalculate-preview`, data, editor).expect(201)).body
    expect(preview.previousTotal).toBe('5380.31'); expect(preview.result.totals.total).toBe('6264.58')
    doc = (await post(`${B}/${doc.id}/recalculate`, { ...data, previewHash: preview.previewHash }, editor).expect(201)).body
    expect(doc.result.totals.total).toBe('6264.58')
  })
  it('keeps private prices private and never changes a shared resource or legacy budget', async () => {
    const input = { ...doc.input, overrides: [{ resourceId: doc.catalog.apus[0].components[0].resource.id, amount: '55', baseDate: '2026-01-01', validUntil: '2099-12-31', reason: 'Precio privado confidencial de la planta' }] }
    doc = (await patch({ expectedRevision: doc.revision, reason, input }).expect(200)).body
    expect(doc.result.totals.total).toBe('6706.89')
    const publicResult = (await post(`${P}/calculate`, { ...input, overrides: [] }).expect(201)).body
    expect(publicResult.result.totals.total).toBe('6264.58'); expect(JSON.stringify(publicResult)).not.toContain('confidencial')
    const source = (await get(`${A}/entries/${input.overrides[0].resourceId}/review`, admin).expect(200)).body
    expect(source.draft.price.amount).toBe('50'); expect(await counts()).toEqual(initial)
  })
  it('supports return, resubmission and immutable issuance with the right permissions', async () => {
    doc = (await post(`${B}/${doc.id}/submit`, { expectedRevision: doc.revision, reason }, editor).expect(201)).body
    await patch({ expectedRevision: doc.revision, reason, input: doc.input }).expect(409)
    doc = (await post(`${B}/${doc.id}/return`, { expectedRevision: doc.revision, reason }, manager).expect(201)).body
    expect(doc.status).toBe('DRAFT')
    doc = (await post(`${B}/${doc.id}/submit`, { expectedRevision: doc.revision, reason }, editor).expect(201)).body
    doc = (await post(`${B}/${doc.id}/issue`, { expectedRevision: doc.revision, reason }, manager).expect(201)).body
    expect(doc.status).toBe('ISSUED'); expect(doc.issuedAt).not.toBeNull(); oldHash = doc.contentHash
    await patch({ expectedRevision: doc.revision, reason, input: doc.input }).expect(409)
    await post(`${B}/${doc.id}/recalculate-preview`, { expectedRevision: doc.revision, reason, publicationId: publicationId, apuIds: [doc.catalog.apus[0].id] }, editor).expect(409)
  })
  it('exports all four private reports and keeps exact issued totals in Excel', async () => {
    for (const kind of ['budget', 'chapters', 'apus', 'resources']) {
      await get(`${B}/${doc.id}/report?kind=${kind}&format=pdf`, reader).expect(200).expect('Content-Type', /application\/pdf/)
    }
    const exported = await get(`${B}/${doc.id}/report?kind=budget&format=xlsx`, reader).buffer(true).parse((response, done) => {
      const chunks: Buffer[] = []; response.on('data', (c: Buffer) => chunks.push(c)); response.on('end', () => done(null, Buffer.concat(chunks)))
    }).expect(200)
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(exported.body as never)
    const totals: string[] = []; workbook.worksheets[0].eachRow(r => { if (r.getCell(1).value === 'TOTAL') totals.push(String(r.getCell(2).value)) })
    expect(totals).toEqual(['6706.89'])
    await get(`${B}/${doc.id}/report?format=exe`, reader).expect(400)
  })
  it('creates a successor once and leaves the issued document unchanged', async () => {
    const payload = { expectedRevision: doc.revision, reason, requestId: randomUUID() }
    const next = (await post(`${B}/${doc.id}/revisions`, payload, editor).expect(201)).body
    const retry = (await post(`${B}/${doc.id}/revisions`, payload, editor).expect(201)).body
    expect(next.id).toBe(retry.id); expect(next).toMatchObject({ version: 2, status: 'DRAFT', groupId: doc.groupId, predecessorId: doc.id })
    const old = (await get(`${B}/${doc.id}`, reader).expect(200)).body
    expect(old.contentHash).toBe(oldHash); expect(old.result.totals.total).toBe('6706.89')
    expect(old.history.some((e: { action: string }) => e.action === 'ISSUE')).toBe(true)
  })
})
