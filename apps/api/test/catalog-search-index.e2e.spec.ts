import type { INestApplication } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { assetFamilies, assetModels, assetTypes, familySpecifications, modelSearchDocuments, modelSearchQuantities } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Índice transaccional de búsqueda del catálogo', () => {
  let app: INestApplication, t: TestDb, admin: Session, modelId: string, typeId: string, familyId: string
  const search = async (text: string) => (await request(app.getHttpServer()).get('/api/v1/catalog/assets').query({ search: text }).expect(200)).body
  beforeAll(async () => {
    t = new TestDb(); await t.cleanup(); app = await createApp()
    await t.user('search-index-admin', { isGlobalAdmin: true }); admin = await login(app, 'search-index-admin')
    const [family] = await t.db.insert(assetFamilies).values({ code: 'E2E_SEARCH_INDEX', tagCode: 'ZSI', name: 'E2E Unicafamiliaoriginalz' }).returning()
    familyId = family.id
    const [type] = await t.db.insert(assetTypes).values({ code: 'E2E_SEARCH_INDEX', name: 'E2E Unicotipooriginalz', familyId }).returning()
    typeId = type.id
    await t.db.insert(familySpecifications).values({ familyId, label: 'Potencia', unit: 'hp', valueType: 'TEXT' })
  })
  afterAll(async () => { await t.cleanup(); await t.close(); await app.close() })

  it('el registro normal publica la búsqueda y cantidades antes de responder', async () => {
    const created = await request(app.getHttpServer()).post('/api/v1/catalog/models').set('Authorization', bearer(admin))
      .send({ typeCode: 'E2E_SEARCH_INDEX', modelName: 'E2E Origenindexz', specifications: { 'Potencia (hp)': '5' }, technicalData: { fabricantesReferencia: [{ nombre: 'Fábricaindexz' }] } }).expect(201)
    modelId = created.body.id
    expect((await search('origenindexz 5hp fabricaindexz')).items.map((m: { id: string }) => m.id)).toEqual([modelId])
  })

  it('editar la ficha quita términos y cantidades anteriores inmediatamente', async () => {
    await request(app.getHttpServer()).patch(`/api/v1/catalog/models/${modelId}`).set('Authorization', bearer(admin))
      .send({ modelName: 'E2E Nuevoindexz', specifications: { 'Potencia (hp)': '7,5' }, technicalData: { fabricantesReferencia: [] } }).expect(200)
    expect((await search('origenindexz')).total).toBe(0)
    expect((await search('fabricaindexz')).total).toBe(0)
    expect((await search('nuevoindexz 5hp')).total).toBe(0)
    expect((await search('nuevoindexz 7.50 hp')).total).toBe(1)
  })

  it('renombrar familia y tipo actualiza los documentos de sus modelos', async () => {
    await t.db.update(assetTypes).set({ name: 'E2E Unicotiponuevoz' }).where(eq(assetTypes.id, typeId))
    await t.db.update(assetFamilies).set({ name: 'E2E Unicafamilianuevaz' }).where(eq(assetFamilies.id, familyId))
    expect((await search('unicotipooriginalz')).total).toBe(0)
    expect((await search('unicafamiliaoriginalz')).total).toBe(0)
    expect((await search('unicotiponuevoz unicafamilianuevaz 7.5hp')).total).toBe(1)
  })

  it('un rollback revierte tanto la ficha como sus proyecciones', async () => {
    const before = await t.db.select().from(modelSearchDocuments).where(eq(modelSearchDocuments.modelId, modelId))
    await expect(t.db.transaction(async tx => {
      await tx.update(assetModels).set({ modelName: 'E2E Nuncaindexz', specifications: { 'Potencia (hp)': '99' } }).where(eq(assetModels.id, modelId))
      throw new Error('rollback de prueba')
    })).rejects.toThrow('rollback de prueba')
    expect(await t.db.select().from(modelSearchDocuments).where(eq(modelSearchDocuments.modelId, modelId))).toEqual(before)
    expect((await search('nuncaindexz')).total).toBe(0)
    expect((await search('nuevoindexz 7.5hp')).total).toBe(1)
  })

  it('las inserciones en lote quedan buscables sin un trabajo posterior', async () => {
    const rows = await t.db.insert(assetModels).values(Array.from({ length: 100 }, (_, i) => ({
      assetTypeId: typeId, modelName: `E2E Loteindexz ${i}`, specifications: { 'Potencia (hp)': '12.5' },
    }))).returning()
    expect((await search('loteindexz 12,50hp')).total).toBe(rows.length)
  })

  it('una edición de familia concurrente no sobrescribe la ficha actualizada de un modelo', async () => {
    const first = await t.pool.connect(), second = await t.pool.connect()
    try {
      await first.query('begin'); await second.query('begin')
      await first.query('update catalog.asset_models set model_name=$1 where id=$2', ['E2E Nuevoindexz concurrente', modelId])
      const pending = second.query('update catalog.asset_families set name=$1 where id=$2', ['E2E Familiaconcurrentez', familyId])
      await t.pool.query('select pg_sleep(0.05)')
      await first.query('commit'); await pending; await second.query('commit')
      expect((await search('nuevoindexz concurrente familiaconcurrentez 7.5hp')).total).toBe(1)
    } finally {
      await first.query('rollback'); await second.query('rollback'); first.release(); second.release()
    }
  })

  it('borrar un modelo elimina documentos y cantidades por cascada', async () => {
    await t.db.delete(assetModels).where(eq(assetModels.id, modelId))
    expect(await t.db.select().from(modelSearchDocuments).where(eq(modelSearchDocuments.modelId, modelId))).toEqual([])
    expect(await t.db.select().from(modelSearchQuantities).where(eq(modelSearchQuantities.modelId, modelId))).toEqual([])
    expect((await search('nuevoindexz')).total).toBe(0)
  })
})
