import type { INestApplication } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { assets, plantStages, plantSettings } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Item = { id: string; tag: string; mapPosition: { x: number; y: number } | null }
type Stage = { id: string; code: string; mapPosition: { x: number; y: number } | null }

describe('Posición de etapas y activos en el mapa de la planta (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())
  let pa: Session
  let operator: Session
  let assetId: string
  let stageId: string

  const patchAsset = (s: Session, body: object) => http().patch(`/api/v1/plants/e2e-mapa/assets/${assetId}`).set('Authorization', bearer(s)).send(body)
  const patchStage = (s: Session, body: object) => http().patch(`/api/v1/plants/e2e-mapa/stages/${stageId}`).set('Authorization', bearer(s)).send(body)
  const item = async (s?: Session) => {
    const r = http().get('/api/v1/plants/e2e-mapa/assets?search=MAP-1')
    return ((await (s ? r.set('Authorization', bearer(s)) : r).expect(200)).body.items as Item[])[0]
  }
  const stage = async (s?: Session) => {
    const r = http().get('/api/v1/plants/e2e-mapa/stages')
    return ((await (s ? r.set('Authorization', bearer(s)) : r).expect(200)).body as Stage[]).find((x) => x.code === 'D06')!
  }

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const plant = await t.plant('mapa', 'PUBLIC')
    const ps = await t.enableStage(plant.id, 'D06')
    stageId = ps.id
    await t.db.update(plantSettings).set({ publicAssets: true, publicProcesses: true }).where(eq(plantSettings.plantId, plant.id))
    await t.db.update(plantStages).set({ isPublic: true }).where(eq(plantStages.id, ps.id))
    const [paU, opU] = await Promise.all([t.user('pa'), t.user('operator')])
    await t.assign(paU.id, plant.id, 'PLANT_ADMIN')
    await t.assign(opU.id, plant.id, 'OPERATOR')
    const model = await t.model('MOLINO_BOLAS', 'E2E Modelo mapa')
    ;[pa, operator] = await Promise.all(['pa', 'operator'].map((n) => login(app, n)))
    const res = await http()
      .post('/api/v1/plants/e2e-mapa/assets')
      .set('Authorization', bearer(pa))
      .send({ tag: 'MAP-1', name: 'Molino del mapa', assetModelId: model.id, stageCode: 'D06', isPublic: true, metadata: { nota: 'conservar' } })
      .expect(201)
    assetId = res.body.id
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('activos', () => {
    it('sin posición el activo trae null', async () => {
      expect((await item(pa)).mapPosition).toBeNull()
    })

    it('guarda la posición (redondeada a 2 decimales) y la ve cualquiera que vea el activo', async () => {
      await patchAsset(pa, { mapPosition: { x: 41.236, y: 62.5 } }).expect(200)
      expect((await item(pa)).mapPosition).toEqual({ x: 41.24, y: 62.5 })
      expect((await item()).mapPosition).toEqual({ x: 41.24, y: 62.5 }) // visitante sin sesión
      const [row] = await t.db.select().from(assets).where(eq(assets.id, assetId))
      expect(row.metadata).toEqual({ nota: 'conservar', map: { x: 41.24, y: 62.5 } }) // el resto de los metadatos sigue ahí
    })

    it('reemplazar los metadatos no borra la posición; moverla no borra los metadatos', async () => {
      await patchAsset(pa, { metadata: { nota: 'nueva' } }).expect(200)
      expect((await item(pa)).mapPosition).toEqual({ x: 41.24, y: 62.5 })
      await patchAsset(pa, { mapPosition: { x: 10, y: 20 } }).expect(200)
      const [row] = await t.db.select().from(assets).where(eq(assets.id, assetId))
      expect(row.metadata).toEqual({ nota: 'nueva', map: { x: 10, y: 20 } })
    })

    it('rechaza posiciones fuera del mapa o incompletas', async () => {
      for (const mapPosition of [{ x: 101, y: 5 }, { x: -1, y: 5 }, { x: 5 }, { x: 'a', y: 5 }, []]) {
        await patchAsset(pa, { mapPosition }).expect(400)
      }
      expect((await item(pa)).mapPosition).toEqual({ x: 10, y: 20 })
    })

    it('null quita la posición y deja el resto', async () => {
      await patchAsset(pa, { mapPosition: null }).expect(200)
      expect((await item(pa)).mapPosition).toBeNull()
      const [row] = await t.db.select().from(assets).where(eq(assets.id, assetId))
      expect(row.metadata).toEqual({ nota: 'nueva' })
    })

    it('solo quien puede editar activos la cambia', async () => {
      await patchAsset(operator, { mapPosition: { x: 1, y: 1 } }).expect(403)
      await http().patch(`/api/v1/plants/e2e-mapa/assets/${assetId}`).send({ mapPosition: { x: 1, y: 1 } }).expect(401)
    })
  })

  describe('etapas', () => {
    it('sin posición la etapa trae null y no expone la configuración cruda', async () => {
      const s = await stage(pa)
      expect(s.mapPosition).toBeNull()
      expect(s).not.toHaveProperty('configuration')
    })

    it('guarda y devuelve la posición de la etapa, también para visitantes', async () => {
      const res = await patchStage(pa, { mapPosition: { x: 33.333, y: 70 } }).expect(200)
      expect(res.body.mapPosition).toEqual({ x: 33.33, y: 70 })
      expect(res.body.displayName).toBe('Molienda secundaria')
      expect((await stage(pa)).mapPosition).toEqual({ x: 33.33, y: 70 })
      expect((await stage()).mapPosition).toEqual({ x: 33.33, y: 70 })
    })

    it('cambiar otros campos de la etapa no pierde la posición; null la quita', async () => {
      await patchStage(pa, { nameOverride: 'Molienda 1' }).expect(200)
      expect((await stage(pa)).mapPosition).toEqual({ x: 33.33, y: 70 })
      await patchStage(pa, { mapPosition: null }).expect(200)
      expect((await stage(pa)).mapPosition).toBeNull()
    })

    it('valida la posición y exige permiso de configurar la planta', async () => {
      await patchStage(pa, { mapPosition: { x: 120, y: 1 } }).expect(400)
      await patchStage(operator, { mapPosition: { x: 1, y: 1 } }).expect(403)
    })
  })
})
