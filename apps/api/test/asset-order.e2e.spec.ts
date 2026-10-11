import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, plants } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Plant = typeof plants.$inferSelect

describe('Orden manual de los activos (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let plant: Plant
  let other: Plant
  let pa: Session // administrador de la planta: asset.create y asset.update
  let consumer: Session // sin rol en la planta
  let modelId: string
  const ids: Record<string, string> = {}

  const base = '/api/v1/plants/e2e-ord1/assets'
  const create = (tag: string, stageCode = 'D06', s: Session = pa) =>
    http().post(base).set('Authorization', bearer(s)).send({ tag, name: `Equipo ${tag}`, assetModelId: modelId, stageCode })
  const order = async (query = '') => {
    const res = await http().get(`${base}?sort=order&pageSize=100${query}`).set('Authorization', bearer(pa)).expect(200)
    return (res.body.items as Array<{ tag: string }>).map((a) => a.tag)
  }
  const reorder = (assetIds: string[], s: Session | null = pa, path = base) => {
    const r = http().put(`${path}/order`).send({ assetIds })
    return s ? r.set('Authorization', bearer(s)) : r
  }

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    plant = await t.plant('ord1', 'PUBLIC')
    other = await t.plant('ord2', 'PUBLIC')
    await t.enableStage(plant.id, 'D06')
    await t.enableStage(plant.id, 'D07')
    await t.enableStage(other.id, 'D06')
    modelId = (await t.model('MOLINO_BOLAS', 'E2E Orden 1', 'E2E Metso')).id
    const [paU, otherU] = await Promise.all([t.user('ordpa'), t.user('ordpb'), t.user('ordconsumer')])
    await t.assign(paU.id, plant.id, 'PLANT_ADMIN')
    await t.assign(otherU.id, other.id, 'PLANT_ADMIN')
    const [pb] = await Promise.all(['ordpb'].map((n) => login(app, n)))
    ;[pa, consumer] = await Promise.all(['ordpa', 'ordconsumer'].map((n) => login(app, n)))
    ids.foreign = (await http().post('/api/v1/plants/e2e-ord2/assets').set('Authorization', bearer(pb)).send({ tag: 'X-1', name: 'Ajeno', assetModelId: modelId, stageCode: 'D06' }).expect(201)).body.id

    // Se registran del tag «mayor» al «menor» para que el orden manual no coincida con el alfabético.
    for (const tag of ['ZZ-3', 'MM-2', 'AA-1']) ids[tag] = (await create(tag).expect(201)).body.id
    ids['D7-1'] = (await create('D7-1', 'D07').expect(201)).body.id
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  it('los activos nuevos van al final: el orden manual es el de registro, no el alfabético', async () => {
    expect(await order('&stage=D06')).toEqual(['ZZ-3', 'MM-2', 'AA-1'])
    const alphabetical = await http().get(`${base}?pageSize=100&stage=D06`).set('Authorization', bearer(pa)).expect(200)
    expect(alphabetical.body.items.map((a: { tag: string }) => a.tag)).toEqual(['AA-1', 'MM-2', 'ZZ-3'])
  })

  it('reordena los activos y el nuevo orden persiste', async () => {
    await reorder([ids['AA-1'], ids['ZZ-3'], ids['MM-2']]).expect(200)
    expect(await order('&stage=D06')).toEqual(['AA-1', 'ZZ-3', 'MM-2'])
    // Un activo nuevo sigue yendo al final.
    await create('BB-4').expect(201)
    expect(await order('&stage=D06')).toEqual(['AA-1', 'ZZ-3', 'MM-2', 'BB-4'])
  })

  it('reordenar un subconjunto no mueve a los demás', async () => {
    // Orden actual: AA-1, ZZ-3, MM-2, BB-4. Se intercambian solo ZZ-3 y BB-4 (p. ej. con un filtro por red).
    await reorder([await idOf('BB-4'), ids['ZZ-3']]).expect(200)
    expect(await order('&stage=D06')).toEqual(['AA-1', 'BB-4', 'MM-2', 'ZZ-3'])
  })

  it('deja constancia en la auditoría', async () => {
    const rows = await t.db.select().from(auditEvents).where(and(eq(auditEvents.plantId, plant.id), eq(auditEvents.action, 'reordered')))
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('exige sesión y el permiso asset.update en esa planta', async () => {
    await reorder([ids['AA-1']], null).expect(401)
    await reorder([ids['AA-1']], consumer).expect(403)
  })

  it('rechaza ids repetidos, mal formados o de otra planta', async () => {
    await reorder([ids['AA-1'], ids['AA-1']]).expect(400)
    await reorder(['no-es-un-uuid']).expect(400)
    await reorder([ids['AA-1'], ids.foreign]).expect(404)
    await reorder([crypto.randomUUID()]).expect(404)
  })

  async function idOf(tag: string) {
    const res = await http().get(`${base}?pageSize=100&search=${tag}`).set('Authorization', bearer(pa)).expect(200)
    return res.body.items[0].id as string
  }
})
