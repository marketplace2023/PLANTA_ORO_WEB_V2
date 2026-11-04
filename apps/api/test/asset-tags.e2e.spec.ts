import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { assetFamilies, assetTagSequences, plantSettings } from '../src/database/schema'
import { SEEDED_ASSET_FAMILIES } from '../src/database/seed-asset-families'
import { runSeed } from '../src/database/seed'
import { bearer, createApp, login, type Session, TestDb } from './helpers'
import { TEST_DATABASE_URL } from './test-url'

describe('TAG automático de activos por planta, red, etapa y familia', () => {
  let app: INestApplication
  let t: TestDb
  let admin: Session
  let reader: Session
  let plantId: string
  let motorId: string
  let bombId: string
  const http = () => request(app.getHttpServer())
  const create = (extra: object = {}, slug = 'e2e-tag-a') => http().post(`/api/v1/plants/${slug}/assets`)
    .set('Authorization', bearer(admin)).send({ name: 'Motor instalado', assetModelId: motorId, stageCode: 'D01', networkCodes: ['FUR-PROC'], ...extra })

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    await t.user('tag-admin', { isGlobalAdmin: true })
    admin = await login(app, 'tag-admin')
    for (const suffix of ['tag-a', 'tag-b']) {
      const plant = await t.plant(suffix, 'PRIVATE')
      if (suffix === 'tag-a') plantId = plant.id
      for (const stage of ['D01', 'D02', 'D20']) await t.enableStage(plant.id, stage)
      for (const network of ['FUR-PROC', 'FUR-PTE']) await t.enableNetwork(plant.id, network)
    }
    const user = await t.user('tag-reader')
    await t.assign(user.id, plantId, 'MAINTENANCE_LEAD')
    reader = await login(app, 'tag-reader')
    for (const [familyCode, typeCode, name] of [['N4_18', 'E2E_TAG_MOT', 'Motor'], ['N4_08', 'E2E_TAG_BOM', 'Bomba']]) {
      await http().post('/api/v1/catalog/types').set('Authorization', bearer(admin)).send({ familyCode, code: typeCode, name: `E2E Tipo ${name}` }).expect(201)
      const model = await t.model(typeCode, `E2E TAG ${name}`)
      if (familyCode === 'N4_18') motorId = model.id
      else bombId = model.id
    }
  })
  afterAll(async () => { await t.cleanup(); await t.close(); await app.close() })

  it('la vista previa exige permiso de alta y no reserva números ni modifica contadores', async () => {
    const url = '/api/v1/plants/e2e-tag-a/assets/tag-preview'
    const query = { assetModelId: motorId, stageCode: 'D01', networkCode: 'FUR-PROC' }
    await http().get(url).query(query).expect(401)
    await http().get(url).query(query).set('Authorization', bearer(reader)).expect(403)
    for (let i = 0; i < 2; i++) {
      const preview = await http().get(url).query(query).set('Authorization', bearer(admin)).expect(200)
      expect(preview.body.tag).toBe('FUR-PROC-D01-MOT-001')
      expect(preview.headers['cache-control']).toBe('no-store')
    }
    const other = await http().get(url).query({ ...query, stageCode: 'D02', networkCode: 'FUR-PTE' }).set('Authorization', bearer(admin)).expect(200)
    expect(other.body.tag).toBe('FUR-PTE-D02-MOT-001')
    await http().get(url).query({ ...query, stageCode: 'D19' }).set('Authorization', bearer(admin)).expect(400)
    expect(await t.db.select().from(assetTagSequences).where(eq(assetTagSequences.plantId, plantId))).toHaveLength(0)
    expect((await t.db.select().from(plantSettings).where(eq(plantSettings.plantId, plantId)))[0].assetSeq).toBe(0)
  })

  it('numera 001, 002 y reinicia por etapa, red, familia y planta; no usa el TAG del cliente', async () => {
    expect((await create({ tag: 'MANUAL-IGNORADO' }).expect(201)).body.tag).toBe('FUR-PROC-D01-MOT-001')
    expect((await create().expect(201)).body.tag).toBe('FUR-PROC-D01-MOT-002')
    const preview = await http().get('/api/v1/plants/e2e-tag-a/assets/tag-preview')
      .query({ assetModelId: motorId, stageCode: 'D01', networkCode: 'FUR-PROC' }).set('Authorization', bearer(admin)).expect(200)
    expect(preview.body.tag).toBe('FUR-PROC-D01-MOT-003')
    expect((await create({ stageCode: 'D02' }).expect(201)).body.tag).toBe('FUR-PROC-D02-MOT-001')
    expect((await create({ networkCodes: ['FUR-PTE'] }).expect(201)).body.tag).toBe('FUR-PTE-D01-MOT-001')
    expect((await create({ assetModelId: bombId }).expect(201)).body.tag).toBe('FUR-PROC-D01-BOM-001')
    expect((await create({}, 'e2e-tag-b').expect(201)).body.tag).toBe('FUR-PROC-D01-MOT-001')
  })

  it('las altas concurrentes reservan TAG y FUR distintos y consecutivos', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => create({ stageCode: 'D02', networkCodes: ['FUR-PTE'] })))
    expect(results.map(result => result.status)).toEqual(Array(8).fill(201))
    expect(results.map(result => result.body.tag).sort()).toEqual(Array.from({ length: 8 }, (_, i) => `FUR-PTE-D02-MOT-${String(i + 1).padStart(3, '0')}`))
    expect(new Set(results.map(result => result.body.furCode)).size).toBe(8)
  })

  it('exige una etapa y una sola red habilitada, sin crear activos incompletos', async () => {
    for (const extra of [{ stageCode: undefined }, { stageCode: 'D19' }, { networkCodes: undefined }, { networkCodes: [] }, { networkCodes: ['FUR-CAM'] }, { networkCodes: ['FUR-PROC', 'FUR-PTE'] }]) {
      await create(extra).expect(400)
    }
  })

  it('no reutiliza TAG de baja ni altera el TAG al editar clasificación o nombre', async () => {
    const created = (await create().expect(201)).body
    const changed = (await http().patch(`/api/v1/plants/e2e-tag-a/assets/${created.id}`).set('Authorization', bearer(admin))
      .send({ name: 'Bomba real', assetModelId: bombId, stageCode: 'D02', networkCodes: ['FUR-PTE'], tag: 'NO-PERMITIDO' }).expect(200)).body
    expect(changed.tag).toBe(created.tag)
    await http().delete(`/api/v1/plants/e2e-tag-a/assets/${created.id}`).set('Authorization', bearer(admin)).expect(204)
    const next = (await create().expect(201)).body
    expect(next.tag).toBe('FUR-PROC-D01-MOT-004')
  })

  it('revierte el correlativo si falla la inserción y continúa más allá de 999', async () => {
    const first = (await create({ stageCode: 'D20' }).expect(201)).body
    const [settings] = await t.db.select().from(plantSettings).where(eq(plantSettings.plantId, plantId))
    // Provoca un FUR repetido después de reservar TAG: toda la transacción debe revertirse.
    await t.db.update(plantSettings).set({ assetSeq: 0 }).where(eq(plantSettings.plantId, plantId))
    await create({ stageCode: 'D20' }).expect(409)
    await t.db.update(plantSettings).set({ assetSeq: settings.assetSeq }).where(eq(plantSettings.plantId, plantId))
    expect((await create({ stageCode: 'D20' }).expect(201)).body.tag).toBe('FUR-PROC-D20-MOT-002')
    // Obtiene inequívocamente el contador desde los datos de la unidad D20.
    const { rows } = await t.pool.query('select s.* from asset.tag_sequences s join process.stage_master sm on sm.id=s.stage_master_id join plant.network_master nm on nm.id=s.network_master_id where s.plant_id=$1 and sm.code=$2 and nm.code=$3', [plantId, 'D20', 'FUR-PROC'])
    expect(first.tag).toBe('FUR-PROC-D20-MOT-001')
    await t.db.update(assetTagSequences).set({ lastValue: 999 }).where(and(eq(assetTagSequences.plantId, plantId), eq(assetTagSequences.stageMasterId, rows[0].stage_master_id), eq(assetTagSequences.networkMasterId, rows[0].network_master_id), eq(assetTagSequences.familyId, rows[0].family_id)))
    expect((await create({ stageCode: 'D20' }).expect(201)).body.tag).toBe('FUR-PROC-D20-MOT-1000')
  })

  it('las familias actuales tienen códigos únicos y se restauran por seed sin modelos demo', async () => {
    const rows = await t.db.select().from(assetFamilies)
    expect(new Set(rows.map(row => row.tagCode)).size).toBe(rows.length)
    for (const family of SEEDED_ASSET_FAMILIES) expect(rows.find(row => row.categoryCode === family.categoryCode)).toMatchObject({ code: family.code, tagCode: family.tagCode, name: family.name })
    await t.db.delete(assetFamilies).where(eq(assetFamilies.code, 'N4_67'))
    await runSeed(TEST_DATABASE_URL)
    await runSeed(TEST_DATABASE_URL)
    expect((await t.db.select().from(assetFamilies).where(eq(assetFamilies.code, 'N4_67')))[0]).toMatchObject({ tagCode: 'EPP', name: 'EPP y consumibles de fundición' })
    const one = (await http().post('/api/v1/catalog/families').set('Authorization', bearer(admin)).send({ code: 'E2E_TAG_F1', tagCode: 'bes', name: 'Bombas especiales' }).expect(201)).body
    const two = (await http().post('/api/v1/catalog/families').set('Authorization', bearer(admin)).send({ code: 'E2E_TAG_F2', tagCode: 'BAL', name: 'Bombas alternativas' }).expect(201)).body
    expect(one.tagCode).toBe('BES')
    expect(two.tagCode).not.toBe(one.tagCode)
    await http().patch(`/api/v1/catalog/families/${one.id}`).set('Authorization', bearer(admin)).send({ name: 'Nombre cambiado' }).expect(200)
    expect((await t.db.select().from(assetFamilies).where(eq(assetFamilies.id, one.id)))[0].tagCode).toBe(one.tagCode)
    await expect(t.db.insert(assetFamilies).values({ code: 'E2E_TAG_DUP', name: 'E2E Duplicada', tagCode: one.tagCode })).rejects.toThrow()
    const [automatic] = await t.db.insert(assetFamilies).values({ code: 'E2E_TAG_AUTO', name: 'Bombas para importación' }).returning()
    expect(automatic.tagCode).toMatch(/^BOM\d+$/)
  })

  it('continúa desde TAG restaurados aunque no exista todavía el contador de su grupo', async () => {
    const old = await t.legacyAsset(plantId, motorId, 'FUR-PTE-D20-MOT-017', { stageCode: 'D20', networkCodes: ['FUR-PTE'] })
    expect((await create({ stageCode: 'D20', networkCodes: ['FUR-PTE'] }).expect(201)).body.tag).toBe('FUR-PTE-D20-MOT-018')
    expect((await http().get(`/api/v1/plants/e2e-tag-a/assets/${old.id}`).set('Authorization', bearer(admin)).expect(200)).body.tag).toBe('FUR-PTE-D20-MOT-017')
  })

  it('editar el código de familia afecta solo a nuevas altas y conserva TAG existentes y correlativos', async () => {
    await http().post('/api/v1/catalog/families').set('Authorization', bearer(admin)).send({ code: 'E2E_EDIT_FAMILY', tagCode: 'EFA', name: 'E2E Familia editable' }).expect(201)
    await http().post('/api/v1/catalog/types').set('Authorization', bearer(admin)).send({ familyCode: 'E2E_EDIT_FAMILY', code: 'E2E_EDIT_FAMILY_TYPE', name: 'E2E Tipo editable' }).expect(201)
    const model = await t.model('E2E_EDIT_FAMILY_TYPE', 'E2E Modelo de familia editable')
    const family = (await t.db.select().from(assetFamilies).where(eq(assetFamilies.code, 'E2E_EDIT_FAMILY')))[0]
    const old = (await create({ assetModelId: model.id }).expect(201)).body
    expect(old.tag).toBe('FUR-PROC-D01-EFA-001')
    await http().patch(`/api/v1/catalog/families/${family.id}`).set('Authorization', bearer(admin)).send({ tagCode: 'efb' }).expect(200)
    expect((await http().get(`/api/v1/plants/e2e-tag-a/assets/${old.id}`).set('Authorization', bearer(admin)).expect(200)).body.tag).toBe(old.tag)
    expect((await create({ assetModelId: model.id }).expect(201)).body.tag).toBe('FUR-PROC-D01-EFB-002')
  })

  it('crea una unidad por familia sin modelo ni datos heredados, con referencias opcionales de su familia', async () => {
    const emptyFamily = (await t.db.select().from(assetFamilies).where(eq(assetFamilies.code, 'N4_67')))[0]
    const standalone = (await create({ familyId: emptyFamily.id, assetModelId: undefined, name: 'Equipo sin catálogo' }).expect(201)).body
    expect(standalone.tag).toBe('FUR-PROC-D01-EPP-001')
    expect(standalone.referenceModels).toEqual([])
    await http().delete(`/api/v1/catalog/families/${emptyFamily.id}`).set('Authorization', bearer(admin)).expect(409)
    const family = (await t.db.select().from(assetFamilies).where(eq(assetFamilies.code, 'N4_18')))[0]
    const own = (await create({ familyId: family.id, assetModelId: undefined, name: 'Motor propio', referenceModelIds: [motorId] }).expect(201)).body
    expect(own.name).toBe('Motor propio')
    expect(own.model.id).toBe('')
    expect(own.family.id).toBe(family.id)
    expect(own.specifications).toEqual({})
    expect(own.technicalData).toEqual({ componentes: [] })
    expect(own.referenceModels.map((model: { id: string }) => model.id)).toEqual([motorId])
    const list = await http().get('/api/v1/plants/e2e-tag-a/assets').query({ family: family.code, search: 'Motor propio' }).set('Authorization', bearer(admin)).expect(200)
    expect(list.body.items.some((item: { id: string }) => item.id === own.id)).toBe(true)
    await http().get(`/api/v1/plants/e2e-tag-a/assets/${own.id}/fur`).set('Authorization', bearer(admin)).expect(200)
    await create({ familyId: family.id, assetModelId: undefined, referenceModelIds: [bombId] }).expect(400)
    const changed = (await http().patch(`/api/v1/plants/e2e-tag-a/assets/${own.id}`).set('Authorization', bearer(admin)).send({ referenceModelIds: [], specifications: { Potencia: '22 kW' }, components: ['Motor instalado'] }).expect(200)).body
    expect(changed.tag).toBe(own.tag)
    expect(changed.referenceModels).toEqual([])
    expect(changed.specifications).toEqual({ Potencia: '22 kW' })
  })
})
