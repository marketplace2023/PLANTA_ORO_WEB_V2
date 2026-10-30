import type { INestApplication } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import ExcelJS from 'exceljs'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { assetFamilies, assetModels, assetModelNetworks, assetModelStages, assetTypes, assets, auditEvents, items, listings, manufacturers, modelVariableValues, networkMaster, providers, stageMaster, variableDefinitions } from '../src/database/schema'
import { StorageService } from '../src/modules/documents/storage.service'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

async function workbook(tags = ['E2E-BULK-01', 'E2E-BULK-02', 'E2E-NOT-FOUND'], header = 'TAG ACTIVO', sheet = 'Listado maestro') {
  const book = new ExcelJS.Workbook()
  book.addWorksheet(sheet).addRows([[header, 'Nombre'], ...tags.map(tag => [tag, 'Texto del Excel que no determina la coincidencia'])])
  return Buffer.from(await book.xlsx.writeBuffer())
}

describe('Eliminación masiva del catálogo por Excel (e2e)', () => {
  let app: INestApplication, t: TestDb, admin: Session, ordinary: Session
  let first: typeof assetModels.$inferSelect, second: typeof assetModels.$inferSelect, outside: typeof assetModels.$inferSelect
  const http = () => request(app.getHttpServer())
  const preview = (file: Buffer) => http().post('/api/v1/catalog/deletions/preview').set('Authorization', bearer(admin)).attach('file', file, 'maestro.xlsx')
  const apply = (file: Buffer, fingerprint: string, confirm = 'ELIMINAR') => http().post('/api/v1/catalog/deletions').set('Authorization', bearer(admin)).field('fingerprint', fingerprint).field('confirm', confirm).attach('file', file, 'maestro.xlsx')
  const exists = async (id: string) => (await t.db.select().from(assetModels).where(eq(assetModels.id, id))).length === 1

  beforeAll(async () => { app = await createApp(); t = new TestDb() })
  beforeEach(async () => {
    await t.cleanup()
    await t.user('bulk-admin', { isGlobalAdmin: true }); await t.user('bulk-user')
    admin = await login(app, 'bulk-admin'); ordinary = await login(app, 'bulk-user')
    first = await t.model('MOLINO_BOLAS', 'E2E Bulk A')
    second = await t.model('MOLINO_BOLAS', 'E2E Bulk B')
    outside = (await t.db.insert(assetModels).values({ assetTypeId: first.assetTypeId, modelName: first.modelName, catalogTag: 'E2E-BULK-OUTSIDE', duplicateIdentityAllowed: true }).returning())[0] // mismo nombre, TAG ajeno al Excel
    for (const [model, tag] of [[first, 'E2E-BULK-01'], [second, 'E2E-BULK-02'], [outside, 'E2E-BULK-OUTSIDE']] as const) {
      await t.db.update(assetModels).set({ catalogTag: tag }).where(eq(assetModels.id, model.id))
    }
  })
  afterAll(async () => { await t.cleanup(); await t.close(); await app.close() })

  it('exige administrador global antes de procesar el archivo', async () => {
    for (const endpoint of ['/catalog/deletions/preview', '/catalog/deletions']) {
      await http().post(`/api/v1${endpoint}`).attach('file', Buffer.from('bad'), 'bad.xlsx').expect(401)
      await http().post(`/api/v1${endpoint}`).set('Authorization', bearer(ordinary)).attach('file', Buffer.from('bad'), 'bad.xlsx').expect(403)
    }
  })

  it('solo lee TAG ACTIVO: muestra coincidencias exactas y ausencias sin borrar nada', async () => {
    const p = await preview(await workbook([' e2e-bulk-01 ', 'E2E-BULK-02', 'E2E-NOT-FOUND'])).expect(201)
    expect(p.body.issues).toEqual([])
    expect(p.body.summary).toEqual({ listed: 3, found: 2, missing: 1, blocked: 0, deletable: 2, unlinkedListings: 0 })
    expect(p.body.rows[0]).toMatchObject({ modelId: first.id, tag: 'E2E-BULK-01', state: 'DELETE', modelName: 'E2E Bulk A' })
    expect(p.body.rows[2]).toMatchObject({ modelId: null, state: 'NOT_FOUND' })
    expect(await exists(first.id)).toBe(true); expect(await exists(outside.id)).toBe(true)
  })

  it('valida formato, hoja, encabezados, TAG duplicados y filas sin TAG', async () => {
    await preview(Buffer.from('no es Excel')).expect(400)
    await preview(await workbook([], 'Otra')).expect(400)
    await preview(await workbook(['E2E-BULK-01'], 'TAG ACTIVO', 'Otra hoja')).expect(400)
    for (const tags of [['E2E-BULK-01', 'e2e-bulk-01'], ['E2E-BULK-01', ''], ['E2E-BULK-01', '#REF!']]) {
      const file = await workbook(tags), p = await preview(file).expect(201)
      expect(p.body.issues.length).toBeGreaterThan(0)
      await apply(file, p.body.fingerprint).expect(400)
    }
    expect(await exists(first.id)).toBe(true)
  })

  it('exige vista previa y confirmación explícita', async () => {
    const file = await workbook(), p = await preview(file).expect(201)
    await apply(file, 'incorrecto').expect(400)
    await apply(file, p.body.fingerprint, 'NO').expect(400)
    expect(await exists(first.id)).toBe(true)
  })

  it('un modelo usado por planta o inventario bloquea todo el lote', async () => {
    const plant = await t.plant('bulk-delete', 'PRIVATE')
    await t.db.insert(assets).values({ plantId: plant.id, assetModelId: first.id, name: 'E2E físico', tag: 'BULK-01', furCode: 'E2E-BULK-001' })
    await t.db.insert(items).values({ plantId: plant.id, assetModelId: second.id, name: 'E2E repuesto', sku: 'BULK-02' })
    const file = await workbook(), p = await preview(file).expect(201)
    expect(p.body.summary.blocked).toBe(2)
    expect(p.body.rows[0]).toMatchObject({ state: 'BLOCKED', assets: 1 })
    expect(p.body.rows[1]).toMatchObject({ state: 'BLOCKED', inventoryItems: 1 })
    await apply(file, p.body.fingerprint).expect(409)
    expect(await exists(first.id)).toBe(true); expect(await exists(second.id)).toBe(true)
  })

  it('no borra el modelo libre si otro del lote está bloqueado', async () => {
    const plant = await t.plant('bulk-partial', 'PRIVATE')
    await t.db.insert(items).values({ plantId: plant.id, assetModelId: second.id, name: 'E2E repuesto', sku: 'BULK-02' })
    const file = await workbook(), p = await preview(file).expect(201)
    expect(p.body.summary).toMatchObject({ blocked: 1, deletable: 1 })
    await apply(file, p.body.fingerprint).expect(409)
    expect(await exists(first.id)).toBe(true)
  })

  it.each(['modelo', 'red', 'activo nuevo', 'TAG antes ausente'])('invalida la vista previa si cambia %s', async change => {
    const file = await workbook(), p = await preview(file).expect(201)
    if (change === 'modelo') await t.db.update(assetModels).set({ specifications: { changed: true } }).where(eq(assetModels.id, first.id))
    if (change === 'red') {
      const [network] = await t.db.select().from(networkMaster).where(eq(networkMaster.code, 'FUR-PROC'))
      await t.db.insert(assetModelNetworks).values({ assetModelId: first.id, networkMasterId: network.id })
    }
    if (change === 'activo nuevo') {
      const plant = await t.plant('bulk-race', 'PRIVATE')
      await t.db.insert(assets).values({ plantId: plant.id, assetModelId: first.id, name: 'E2E físico', tag: 'BULK-01', furCode: 'E2E-BULK-001' })
    }
    if (change === 'TAG antes ausente') await t.db.update(assetModels).set({ catalogTag: 'E2E-NOT-FOUND' }).where(eq(assetModels.id, outside.id))
    await apply(file, p.body.fingerprint).expect(409)
    expect(await exists(first.id)).toBe(true); expect(await exists(second.id)).toBe(true)
  })

  it('rechaza otro archivo o un listado sin coincidencias', async () => {
    const file = await workbook(), p = await preview(file).expect(201)
    await apply(await workbook(['E2E-BULK-02']), p.body.fingerprint).expect(409)
    const absent = await workbook(['E2E-NOT-FOUND']), p2 = await preview(absent).expect(201)
    await apply(absent, p2.body.fingerprint).expect(400)
    expect(await exists(first.id)).toBe(true)
  })

  it('elimina solo los TAG revisados con sus vínculos y fotos, conserva maestros y audita todo el lote', async () => {
    const [type] = await t.db.select().from(assetTypes).where(eq(assetTypes.id, first.assetTypeId))
    const [stage] = await t.db.select().from(stageMaster).where(eq(stageMaster.code, 'D05'))
    const [network] = await t.db.select().from(networkMaster).where(eq(networkMaster.code, 'FUR-PROC'))
    const [variable] = await t.db.select().from(variableDefinitions).limit(1)
    await t.db.insert(assetModelStages).values({ assetModelId: first.id, stageMasterId: stage.id })
    await t.db.insert(assetModelNetworks).values({ assetModelId: first.id, networkMasterId: network.id })
    await t.db.insert(modelVariableValues).values({ assetModelId: first.id, variableId: variable.id, value: 1 })
    const [maker] = await t.db.insert(manufacturers).values({ name: 'E2E Bulk maker' }).returning()
    await t.db.update(assetModels).set({ technicalData: { fabricantesReferencia: [{ nombre: maker.name }] } }).where(eq(assetModels.id, first.id))
    const [provider] = await t.db.insert(providers).values({ organizationName: 'E2E Bulk provider', countryCode: 'VE' }).returning()
    const [listing] = await t.db.insert(listings).values({ providerId: provider.id, assetFamilyId: type.familyId, assetModelId: first.id, title: 'E2E Publicación' }).returning()
    const storage = app.get(StorageService), key = `catalog/models/e2e-bulk-${randomUUID()}.png`
    await storage.put(key, Buffer.from('test image'))
    try {
      await t.db.update(assetModels).set({ imageKey: key, imageMime: 'image/png' }).where(eq(assetModels.id, first.id))
      const file = await workbook(), p = await preview(file).expect(201)
      expect(p.body.summary.unlinkedListings).toBe(1)
      const result = await apply(file, p.body.fingerprint).expect(201)
      expect(result.body.deleted).toBe(2)
      expect(await exists(first.id)).toBe(false); expect(await exists(second.id)).toBe(false); expect(await exists(outside.id)).toBe(true)
      for (const table of [assetModelStages, assetModelNetworks, modelVariableValues]) expect(await t.db.select().from(table).where(eq(table.assetModelId, first.id))).toHaveLength(0)
      expect((await t.db.select().from(listings).where(eq(listings.id, listing.id)))[0].assetModelId).toBeNull()
      expect(await t.db.select().from(assetTypes).where(eq(assetTypes.id, type.id))).toHaveLength(1)
      expect(await t.db.select().from(assetFamilies).where(eq(assetFamilies.id, type.familyId))).toHaveLength(1)
      expect(await t.db.select().from(manufacturers).where(eq(manufacturers.id, maker.id))).toHaveLength(1)
      const audit = await t.db.select().from(auditEvents).where(eq(auditEvents.entityType, 'master_delete'))
      expect(audit).toHaveLength(1)
      expect(audit[0].newData).toMatchObject({ deleted: 2, tags: ['E2E-BULK-01', 'E2E-BULK-02'] })
      expect(audit[0].oldData).toMatchObject({ models: expect.arrayContaining([expect.objectContaining({ model: expect.objectContaining({ id: first.id }) })]) })
      await expect(storage.open(key)).rejects.toThrow()
      await apply(file, p.body.fingerprint).expect(409)
    } finally { await storage.delete(key) }
  })
})
