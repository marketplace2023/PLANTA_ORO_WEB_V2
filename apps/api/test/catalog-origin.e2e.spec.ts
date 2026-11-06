import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { assetModels, assets, catalogRequests, plantSettings } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Modelo de origen y solicitudes de catálogo', () => {
  let app: INestApplication, t: TestDb, admin: Session, user: Session, outsider: Session, plantId: string, familyId: string, modelId: string
  const http = () => request(app.getHttpServer())
  const post = (url: string, data: object, session = admin) => http().post('/api/v1' + url).set('Authorization', bearer(session)).send(data)
  const draft = () => ({ familyId, name: 'Equipo propio', specifications: { Potencia: 12 }, components: ['Componente propio'], stageCode: 'D01', networkCodes: ['FUR-PROC'] })
  beforeAll(async () => {
    app = await createApp(); t = new TestDb(); await t.cleanup()
    await t.user('origin-admin', { isGlobalAdmin: true }); const u = await t.user('origin-user'); await t.user('origin-outsider')
    admin = await login(app, 'origin-admin'); user = await login(app, 'origin-user'); outsider = await login(app, 'origin-outsider')
    const plant = await t.plant('origin', 'PRIVATE'); plantId = plant.id
    await t.assign(u.id, plant.id, 'PLANT_ADMIN'); await t.enableStage(plant.id, 'D01'); await t.enableNetwork(plant.id, 'FUR-PROC')
    familyId = (await post('/catalog/families', { code: 'E2E_ORIGIN', tagCode: 'ORIG', name: 'E2E Familia origen' }).expect(201)).body.id
    await post('/catalog/specifications', { familyId, label: 'Potencia', valueType: 'NUMBER', required: true }).expect(201)
    await post('/catalog/types', { familyCode: 'E2E_ORIGIN', code: 'E2E_ORIGIN_TYPE', name: 'E2E Tipo origen', stageCodes: ['D01'] }).expect(201)
    modelId = (await post('/catalog/models', { typeCode: 'E2E_ORIGIN_TYPE', modelName: 'E2E Modelo origen', specifications: { Potencia: 10 }, stageCodes: ['D01'], networkCodes: ['FUR-PROC'] }).expect(201)).body.id
  })
  afterAll(async () => { await t.db.delete(catalogRequests).where(eq(catalogRequests.plantId, plantId)); await t.cleanup(); await t.close(); await app.close() })
  it('exige un único origen y conserva la ficha propia sin modificar el catálogo', async () => {
    await post('/plants/e2e-origin/assets', draft(), user).expect(400)
    await post('/plants/e2e-origin/assets', { ...draft(), referenceModelIds: [modelId], assetModelId: modelId }, user).expect(400)
    const created = (await post('/plants/e2e-origin/assets', { ...draft(), assetModelId: modelId }, user).expect(201)).body
    expect(created.model.id).toBe(modelId); expect(created.specifications.Potencia).toBe(12)
    expect((await t.db.select().from(assetModels).where(eq(assetModels.id, modelId)))[0].specifications).toEqual({ Potencia: 10 })
  })
  it('no crea ni reserva TAG antes de aprobar; protege permisos y evita dobles aprobaciones', async () => {
    await post('/plants/e2e-origin/catalog-requests', draft(), outsider).expect(404)
    const before = (await t.db.select().from(plantSettings).where(eq(plantSettings.plantId, plantId)))[0].assetSeq
    const pending = (await post('/plants/e2e-origin/catalog-requests', draft(), user).expect(201)).body
    expect(pending.status).toBe('PENDING'); expect(pending.assetId).toBeNull()
    expect((await t.db.select().from(plantSettings).where(eq(plantSettings.plantId, plantId)))[0].assetSeq).toBe(before)
    await post(`/catalog/requests/${pending.id}/approve`, {}, user).expect(403)
    await post(`/catalog/requests/${pending.id}/approve`, {}).expect(400)
    const reviewed = (await http().patch(`/api/v1/catalog/requests/${pending.id}`).set('Authorization', bearer(admin)).send({ typeCode: 'E2E_ORIGIN_TYPE', modelName: 'E2E Modelo aprobado', specifications: { Potencia: 20 }, components: ['Componente catálogo'] }).expect(200)).body
    expect((await t.db.select().from(assetModels).where(eq(assetModels.id, reviewed.modelId)))[0].status).toBe('INACTIVE')
    await http().delete(`/api/v1/catalog/models/${reviewed.modelId}`).set('Authorization', bearer(admin)).expect(409)
    const result = await Promise.all([post(`/catalog/requests/${pending.id}/approve`, {}), post(`/catalog/requests/${pending.id}/approve`, {})])
    expect(result.map(r => r.status).sort()).toEqual([201, 409])
    const approved = result.find(r => r.status === 201)!.body
    const [asset] = await t.db.select().from(assets).where(eq(assets.id, approved.assetId))
    expect(asset.assetModelId).toBe(reviewed.modelId); expect(asset.specifications).toEqual({ Potencia: 12 })
    expect(asset.technicalData).toMatchObject({ componentes: ['Componente propio'] })
    expect((await t.db.select().from(assetModels).where(eq(assetModels.id, reviewed.modelId)))[0].specifications).toEqual({ Potencia: 20 })
  })
  it('rechaza con motivo sin crear activos y permite consultar la decisión desde planta', async () => {
    const pending = (await post('/plants/e2e-origin/catalog-requests', draft(), user).expect(201)).body
    await post(`/catalog/requests/${pending.id}/reject`, {}).expect(400)
    const rejected = (await post(`/catalog/requests/${pending.id}/reject`, { note: 'Ficha incompleta' }).expect(201)).body
    expect(rejected.assetId).toBeNull(); expect(rejected.status).toBe('REJECTED')
    await post(`/catalog/requests/${pending.id}/approve`, {}).expect(409)
    const listed = (await http().get('/api/v1/plants/e2e-origin/catalog-requests').set('Authorization', bearer(user)).expect(200)).body
    expect(listed.find((r: { id: string }) => r.id === pending.id).decisionNote).toBe('Ficha incompleta')
  })
})
