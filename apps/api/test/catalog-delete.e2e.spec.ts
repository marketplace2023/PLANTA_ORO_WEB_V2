import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { assetFamilies, assetModels, assetTypes, auditEvents, manufacturers, modelVariableValues } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Eliminar del catálogo (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())
  let admin: Session
  let pa: Session

  const C = '/api/v1/catalog'
  const post = (url: string, body: object, s: Session = admin) => http().post(url).set('Authorization', bearer(s)).send(body)
  const del = (url: string, s: Session | null = admin) => {
    const r = http().delete(url)
    return s ? r.set('Authorization', bearer(s)) : r
  }

  let famId: string
  let typeId: string
  let makerId: string
  let usedModelId: string
  let freeModelId: string

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const plant = await t.plant('del1', 'PUBLIC')
    const [, paU] = await Promise.all([t.user('admin', { isGlobalAdmin: true }), t.user('pa')])
    await t.assign(paU.id, plant.id, 'PLANT_ADMIN')
    ;[admin, pa] = await Promise.all(['admin', 'pa'].map((n) => login(app, n)))

    famId = (await post(`${C}/families`, { code: 'E2E_DEL_F', name: 'E2E Familia a eliminar' }).expect(201)).body.id
    typeId = (await post(`${C}/types`, { familyCode: 'E2E_DEL_F', code: 'E2E_DEL_T', name: 'E2E Tipo a eliminar', stageCodes: ['D06'] }).expect(201)).body.id
    makerId = (await post(`${C}/manufacturers`, { name: 'E2E Fabricante a eliminar' }).expect(201)).body.id
    usedModelId = (await post(`${C}/models`, { typeCode: 'E2E_DEL_T', manufacturerId: makerId, modelName: 'E2E Modelo en uso', networkCodes: ['FUR-PROC'] }).expect(201)).body.id
    freeModelId = (await post(`${C}/models`, { typeCode: 'E2E_DEL_T', manufacturerId: makerId, modelName: 'E2E Modelo repetido', networkCodes: ['FUR-PROC'] }).expect(201)).body.id
    // Un activo de planta que usa el primer modelo.
    await http()
      .post('/api/v1/plants/e2e-del1/assets')
      .set('Authorization', bearer(pa))
      .send({ tag: 'E2E-DEL-1', name: 'Activo que usa el modelo', assetModelId: usedModelId })
      .expect(201)
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  it('solo el administrador del ecosistema: anónimo 401, administrador de planta 403', async () => {
    await del(`${C}/models/${freeModelId}`, null).expect(401)
    await del(`${C}/models/${freeModelId}`, pa).expect(403)
    await del(`${C}/types/${typeId}`, pa).expect(403)
    await del(`${C}/families/${famId}`, pa).expect(403)
    await del(`${C}/manufacturers/${makerId}`, pa).expect(403)
  })

  it('un id que no existe da 404', async () => {
    const ghost = '018f0000-0000-7000-8000-000000000000'
    for (const kind of ['models', 'types', 'families', 'manufacturers']) await del(`${C}/${kind}/${ghost}`).expect(404)
  })

  describe('lo que está en uso no se elimina y el mensaje dice por qué', () => {
    it('un modelo usado por un activo de planta', async () => {
      const res = await del(`${C}/models/${usedModelId}`).expect(409)
      expect(res.body.message).toMatch(/lo usan 1 activo\(s\) de planta/)
      expect(res.body.message).toMatch(/Desactívalo|cambia el modelo/)
      expect(await t.db.select().from(assetModels).where(eq(assetModels.id, usedModelId))).toHaveLength(1)
    })

    it('un tipo con modelos', async () => {
      const res = await del(`${C}/types/${typeId}`).expect(409)
      expect(res.body.message).toMatch(/tiene 2 modelo\(s\)/)
    })

    it('un fabricante usado por modelos', async () => {
      const res = await del(`${C}/manufacturers/${makerId}`).expect(409)
      expect(res.body.message).toMatch(/lo usan 2 modelo\(s\)/)
    })

    it('una familia con tipos', async () => {
      const res = await del(`${C}/families/${famId}`).expect(409)
      expect(res.body.message).toMatch(/tiene 1 tipo\(s\)/)
    })
  })

  describe('lo que no se usa se elimina', () => {
    it('un modelo repetido: se va con sus datos del fabricante y queda auditado', async () => {
      const variable = (await post(`${C}/variables`, { label: 'E2E Var del', valueType: 'NUMBER', assetTypeCodes: ['E2E_DEL_T'] }).expect(201)).body
      await http().put(`${C}/models/${freeModelId}/variables`).set('Authorization', bearer(admin)).send({ values: { [variable.code]: 5 } }).expect(200)
      expect(await t.db.select().from(modelVariableValues).where(eq(modelVariableValues.assetModelId, freeModelId))).toHaveLength(1)

      await del(`${C}/models/${freeModelId}`).expect(204)

      expect(await t.db.select().from(assetModels).where(eq(assetModels.id, freeModelId))).toHaveLength(0)
      expect(await t.db.select().from(modelVariableValues).where(eq(modelVariableValues.assetModelId, freeModelId))).toHaveLength(0)
      const audit = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, freeModelId), eq(auditEvents.action, 'deleted')))
      expect(audit).toHaveLength(1)
      const list = await http().get(`${C}/assets?pageSize=100&status=ALL`).expect(200)
      expect(list.body.items.some((m: { id: string }) => m.id === freeModelId)).toBe(false)
    })

    it('al quedar sin dependencias, se eliminan fabricante, tipo y familia (en ese orden de dependencia)', async () => {
      // El modelo en uso sigue protegido: primero se le quita el fabricante, lo único que bloqueaba al fabricante.
      await http().patch(`${C}/models/${usedModelId}`).set('Authorization', bearer(admin)).send({ manufacturerId: null }).expect(200)
      await del(`${C}/manufacturers/${makerId}`).expect(204)
      expect(await t.db.select().from(manufacturers).where(eq(manufacturers.id, makerId))).toHaveLength(0)

      // El tipo y la familia siguen bloqueados por el modelo en uso.
      await del(`${C}/types/${typeId}`).expect(409)
      await del(`${C}/families/${famId}`).expect(409)

      // Un tipo y una familia vacíos sí se van, con sus etapas y redes.
      await post(`${C}/families`, { code: 'E2E_DEL_F2', name: 'E2E Familia vacía' }).expect(201)
      const t2 = (await post(`${C}/types`, { familyCode: 'E2E_DEL_F2', code: 'E2E_DEL_T2', name: 'E2E Tipo vacío', stageCodes: ['D06', 'D07'] }).expect(201)).body
      await del(`${C}/types/${t2.id}`).expect(204)
      expect(await t.db.select().from(assetTypes).where(eq(assetTypes.code, 'E2E_DEL_T2'))).toHaveLength(0)
      const fam2 = (await t.db.select().from(assetFamilies).where(eq(assetFamilies.code, 'E2E_DEL_F2')))[0]
      await del(`${C}/families/${fam2.id}`).expect(204)
      expect(await t.db.select().from(assetFamilies).where(eq(assetFamilies.code, 'E2E_DEL_F2'))).toHaveLength(0)
    })
  })
})
