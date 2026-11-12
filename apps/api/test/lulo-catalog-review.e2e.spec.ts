import type { INestApplication } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import request from 'supertest'
import { bearer, createApp, login, type Session, TestDb } from './helpers'
import { recoveryFixture } from './fixtures/lulo-masters'
import { recoverLegacyMasters } from '../src/modules/budget/legacy-masters'
import { storeRecoveredMasters } from '../src/modules/budget/master-recovery-store'
import { auditEvents, budgetMasterBatches, budgetMasterEntries, resources, assetModels } from '../src/database/schema'
import type { CatalogDraft } from '../src/modules/budget/catalog-review.rules'

describe('LULO corrections, approvals and immutable catalog releases', () => {
  let app: INestApplication, db: TestDb, admin: Session, user: Session, batchId: string, otherBatchId: string
  let familyId: string, resourceId: string, itemId: string, apuId: string
  let preparedId: string, publishedId: string, hash: string
  let initialCounts: { technical: number; plant: number }
  const reason = 'Verificación documentada del maestro de prueba'
  const endpoint = '/api/v1/admin/budget-catalog'
  const get = (path: string, session = admin) => request(app.getHttpServer()).get(`${endpoint}${path}`).set('Authorization', bearer(session))
  const post = (path: string, data: object, session = admin) => request(app.getHttpServer()).post(`${endpoint}${path}`).set('Authorization', bearer(session)).send(data)
  const patch = (id: string, data: object, session = admin) => request(app.getHttpServer()).patch(`${endpoint}/entries/${id}/review`).set('Authorization', bearer(session)).send(data)
  const read = async (id: string) => (await get(`/entries/${id}/review`).expect(200)).body as { revision: number; state: string; draft: CatalogDraft; blockers: string[] }
  const counts = async () => ({ technical: Number((await db.db.select({ n: sql<number>`count(*)::int` }).from(assetModels))[0].n), plant: Number((await db.db.select({ n: sql<number>`count(*)::int` }).from(resources))[0].n) })
  const approve = async (id: string) => { const v = await read(id); return post(`/entries/${id}/approve`, { expectedRevision: v.revision, reason }) }
  const edit = async (id: string, change: (draft: CatalogDraft) => CatalogDraft) => { const v = await read(id); return patch(id, { expectedRevision: v.revision, reason, draft: change(v.draft) }) }
  beforeAll(async () => {
    app = await createApp(); db = new TestDb(); await db.cleanup()
    await db.user('lulo-review-admin', { isGlobalAdmin: true }); await db.user('lulo-review-user')
    admin = await login(app, 'lulo-review-admin'); user = await login(app, 'lulo-review-user')
    const recovered = recoverLegacyMasters(recoveryFixture())
    const saved = await storeRecoveredMasters(db.db, recovered, 'E2E catalog review'); batchId = saved.batch.id
    const entries = await db.db.select().from(budgetMasterEntries).where(eq(budgetMasterEntries.batchId, batchId))
    familyId = entries.find(e => e.kind === 'FAMILY' && e.resourceType === 'MATERIAL')!.id
    resourceId = entries.find(e => e.kind === 'RESOURCE')!.id
    itemId = entries.find(e => e.kind === 'ITEM')!.id; apuId = entries.find(e => e.kind === 'APU')!.id
    initialCounts = await counts()
  })
  afterAll(async () => { try { for (const id of [batchId, otherBatchId].filter(Boolean)) await db.db.delete(budgetMasterBatches).where(eq(budgetMasterBatches.id, id)); await db.cleanup() } finally { await db.close(); await app.close() } })

  it('restricts every review and release operation to global administration', async () => {
    for (const path of [`/entries/${resourceId}/review`, `/entries/${resourceId}/history`, `/batches/${batchId}/review-summary`, `/batches/${batchId}/releases`]) {
      await request(app.getHttpServer()).get(`${endpoint}${path}`).expect(401)
      await get(path, user).expect(403)
    }
    await patch(resourceId, {}, user).expect(403)
    await post(`/entries/${resourceId}/approve`, {}, user).expect(403)
    await post(`/batches/${batchId}/releases`, {}, user).expect(403)
    await post(`/releases/${resourceId}/publish`, {}, user).expect(403)
  })

  it('cannot approve historical prices without verification and records an edit only once under a race', async () => {
    expect((await approve(resourceId)).status).toBe(422)
    const v = await read(resourceId)
    const draft: CatalogDraft = { ...v.draft, name: 'Acero corregido y verificado', price: { amount: '15.00000001', currency: 'USD', denomination: 'Dólar estadounidense', baseDate: '2026-01-01', validUntil: '2099-12-31', costBasis: 'UNIT', evidence: 'Cotización verificada para prueba de integración' } }
    const responses = await Promise.all([patch(resourceId, { expectedRevision: 0, reason, draft }), patch(resourceId, { expectedRevision: 0, reason, draft })])
    expect(responses.map(r => r.status).sort()).toEqual([200, 409])
    const [original] = await db.db.select().from(budgetMasterEntries).where(eq(budgetMasterEntries.id, resourceId))
    expect(original.name).toBe('Acero'); expect(original.data.historicalPrice).toBe('12.5000')
    const history = (await get(`/entries/${resourceId}/history`).expect(200)).body
    expect(history).toHaveLength(1); expect(history[0].newData).toMatchObject({ reason, actorName: 'lulo-review-admin E2E' })
    await patch(resourceId, { expectedRevision: 1, reason, draft, ignored: 'not permitted' }).expect(400)
    const rows = (await get(`/batches/${batchId}/entries?search=corregido`).expect(200)).body
    expect(rows.items[0]).toMatchObject({ name: draft.name, revision: 1, reviewState: 'DRAFT' }); expect(rows.items[0]).not.toHaveProperty('data')
  })

  it('requires approved families, resources, master items and explicit composition criteria', async () => {
    expect((await approve(resourceId)).status).toBe(422)
    expect((await approve(familyId)).status).toBe(201)
    expect((await approve(resourceId)).status).toBe(201)
    expect((await approve(itemId)).status).toBe(201)
    expect((await approve(apuId)).status).toBe(422)
    expect((await edit(apuId, draft => ({ ...draft, yieldBasis: 'ITEM', methodNote: 'Consumo por unidad de partida, validado en prueba' }))).status).toBe(200)
    expect((await approve(apuId)).status).toBe(201)
    expect((await read(apuId)).blockers).toEqual([])
    const summary = (await get(`/batches/${batchId}/review-summary`).expect(200)).body
    expect(summary).toContainEqual({ state: 'APPROVED', count: 4 })
  })

  it('does not include masters from another source batch even when their original codes coincide', async () => {
    const files = recoveryFixture()
    const rows = JSON.parse(files['lulo_seed_familias.json'].toString())
    rows[0].descripcion = 'E2E another original source'
    files['lulo_seed_familias.json'] = Buffer.from(JSON.stringify(rows))
    const result = await storeRecoveredMasters(db.db, recoverLegacyMasters(files), 'E2E other source')
    otherBatchId = result.batch.id
    const [foreign] = await db.db.select().from(budgetMasterEntries).where(and(eq(budgetMasterEntries.batchId, otherBatchId), eq(budgetMasterEntries.kind, 'APU')))
    await post(`/batches/${batchId}/releases`, { name: 'E2E cannot mix batches', reason, entryIds: [apuId, foreign.id] }).expect(404)
    expect((await read(apuId)).blockers).toEqual([])
  })

  it('prepares one complete dependency snapshot and deduplicates retries without publishing', async () => {
    const data = { name: 'E2E selección piloto', reason, entryIds: [apuId] }
    const first = (await post(`/batches/${batchId}/releases`, data).expect(201)).body
    const retry = (await post(`/batches/${batchId}/releases`, data).expect(201)).body
    preparedId = first.id; expect(retry.id).toBe(first.id); expect(first).toMatchObject({ state: 'DRAFT', entryCount: 4, usage: 'REFERENCE_ONLY', publishedAt: null })
    const preview = (await get(`/releases/${first.id}`).expect(200)).body
    expect(preview.items).toHaveLength(4)
    const snapshot = preview.items.find((e: { entryId: string }) => e.entryId === resourceId)
    expect(snapshot.snapshot.draft.price.amount).toBe('15.00000001'); expect(snapshot.snapshot).not.toHaveProperty('historicalPrice')
    await get(`/releases/${first.id}`, user).expect(403)
    await post(`/releases/${first.id}/publish`, { expectedHash: 'a'.repeat(64), reason }).expect(409)
  })

  it('blocks a stale prepared version and requires renewing the APU approval after changing an input', async () => {
    expect((await edit(resourceId, draft => ({ ...draft, price: { ...draft.price!, amount: '18.25' } }))).status).toBe(200)
    const old = (await get(`/releases/${preparedId}`).expect(200)).body
    await post(`/releases/${preparedId}/publish`, { expectedHash: old.contentHash, reason }).expect(409)
    expect((await approve(resourceId)).status).toBe(201)
    expect((await read(apuId)).blockers).toContain('Cambió 001 después de la aprobación')
    await post(`/batches/${batchId}/releases`, { name: 'E2E todavía obsoleta', reason, entryIds: [apuId] }).expect(422)
    expect((await approve(apuId)).status).toBe(201)
    const next = (await post(`/batches/${batchId}/releases`, { name: 'E2E versión revisada', reason, entryIds: [apuId] }).expect(201)).body
    expect(next.version).toBe(2); publishedId = next.id; hash = next.contentHash
  })

  it('publishes idempotently, preserves the snapshot after subsequent edits, and never modifies plant or technical catalogs', async () => {
    const payload = { expectedHash: hash, reason }
    const a = (await post(`/releases/${publishedId}/publish`, payload).expect(201)).body
    const b = (await post(`/releases/${publishedId}/publish`, payload).expect(201)).body
    expect(a.state).toBe('PUBLISHED'); expect(b.publishedAt).toBe(a.publishedAt)
    expect((await edit(resourceId, draft => ({ ...draft, price: { ...draft.price!, amount: '23.50' } }))).status).toBe(200)
    const frozen = (await get(`/releases/${publishedId}`).expect(200)).body
    expect(frozen.items.find((e: { entryId: string }) => e.entryId === resourceId).snapshot.draft.price.amount).toBe('18.25')
    expect(frozen.events.map((e: { action: string }) => e.action)).toEqual(['PREPARE_RELEASE', 'PUBLISH_RELEASE'])
    expect(frozen.events[1].data).toMatchObject({ reason, actorName: 'lulo-review-admin E2E' })
    const events = await db.db.select().from(auditEvents).where(and(eq(auditEvents.module, 'budget-catalog'), eq(auditEvents.entityId, publishedId), eq(auditEvents.action, 'PUBLISH_RELEASE')))
    expect(events).toHaveLength(1); expect(await counts()).toEqual(initialCounts)
  })
})
