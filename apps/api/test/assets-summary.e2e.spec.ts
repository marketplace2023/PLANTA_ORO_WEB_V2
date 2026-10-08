import type { INestApplication } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { plantSettings } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Resumen de activos de la planta (geoportal) (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())
  let pa: Session
  let consumer: Session
  let modelId: string
  let plantId: string

  const create = (s: Session, body: object) => http().post('/api/v1/plants/e2e-geo/assets').set('Authorization', bearer(s)).send(body)
  const summary = (s?: Session) => {
    const r = http().get('/api/v1/plants/e2e-geo/assets/summary')
    return (s ? r.set('Authorization', bearer(s)) : r).expect(200)
  }

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const plant = await t.plant('geo', 'PUBLIC')
    plantId = plant.id
    await t.enableStage(plant.id, 'D06')
    await t.enableStage(plant.id, 'D07')
    await t.enableNetwork(plant.id, 'FUR-PROC')
    await t.enableNetwork(plant.id, 'FUR-PTE')
    const paU = await t.user('pa')
    await t.user('consumer')
    await t.assign(paU.id, plant.id, 'PLANT_ADMIN')
    modelId = (await t.model('MOLINO_BOLAS', 'E2E Modelo geoportal')).id
    ;[pa, consumer] = await Promise.all(['pa', 'consumer'].map((n) => login(app, n)))

    const base = { assetModelId: modelId }
    await create(pa, { ...base, tag: 'G-1', name: 'Molino 1', stageCode: 'D06', networkCodes: ['FUR-PROC', 'FUR-PTE'], status: 'OPERATIVE', criticality: 'CRITICAL', isPublic: true }).expect(201)
    await create(pa, { ...base, tag: 'G-2', name: 'Molino 2', stageCode: 'D06', networkCodes: ['FUR-PROC'], status: 'OPERATIVE', criticality: 'HIGH', isPublic: false }).expect(201)
    await create(pa, { ...base, tag: 'G-3', name: 'Molino 3', stageCode: 'D07', status: 'REPAIR', criticality: 'LOW', isPublic: true }).expect(201)
    await create(pa, { ...base, tag: 'G-4', name: 'Sin etapa', status: 'MAINTENANCE', criticality: 'LOW', isPublic: true }).expect(201)
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  it('quien ve el interior de la planta recibe todos los conteos', async () => {
    const { body } = await summary(pa)
    expect(body.total).toBe(4)
    expect(body.byStatus).toEqual({ OPERATIVE: 2, REPAIR: 1, MAINTENANCE: 1 })
    expect(body.byCriticality).toEqual({ CRITICAL: 1, HIGH: 1, LOW: 2 })
    expect(body.byStage).toEqual({ D06: 2, D07: 1 }) // el activo sin etapa solo cuenta en el total
    expect(body.byNetwork).toEqual({ 'FUR-PROC': 2, 'FUR-PTE': 1 })
  })

  it('los dados de baja no cuentan', async () => {
    const list = await http().get('/api/v1/plants/e2e-geo/assets?search=G-3').set('Authorization', bearer(pa)).expect(200)
    await http().delete(`/api/v1/plants/e2e-geo/assets/${list.body.items[0].id}`).set('Authorization', bearer(pa)).expect((r) => expect([200, 204]).toContain(r.status))
    const { body } = await summary(pa)
    expect(body.total).toBe(3)
    expect(body.byStatus.REPAIR).toBeUndefined()
    expect(body.byStage).toEqual({ D06: 2 })
  })

  it('un visitante solo cuenta lo público y solo si la planta publica sus activos', async () => {
    // por defecto la planta no publica sus activos
    expect((await summary(consumer)).body).toEqual({ total: 0, byStatus: {}, byCriticality: {}, byStage: {}, byNetwork: {} })

    await t.db.update(plantSettings).set({ publicAssets: true }).where(eq(plantSettings.plantId, plantId))
    const { body } = await summary(consumer)
    expect(body.total).toBe(2) // G-1 y G-4; G-2 es interno y G-3 está dado de baja
    expect(body.byStage).toEqual({ D06: 1 })
    expect(body.byNetwork).toEqual({ 'FUR-PROC': 1, 'FUR-PTE': 1 })
    // sin sesión es igual que un visitante
    expect((await summary()).body.total).toBe(2)
  })

  it('una planta que no existe responde 404', async () => {
    await http().get('/api/v1/plants/e2e-no-existe/assets/summary').expect(404)
  })

  it('el listado trae la foto del modelo (null si no tiene) para las tarjetas', async () => {
    const list = await http().get('/api/v1/plants/e2e-geo/assets?search=G-1').set('Authorization', bearer(pa)).expect(200)
    expect(list.body.items[0].model).toEqual({ id: modelId, name: 'E2E Modelo geoportal', imageUrl: null })
  })
})
