import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import ExcelJS from 'exceljs'
import { eq } from 'drizzle-orm'
import { assetFamilies, assetModels, familySpecifications } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Maestro de especificaciones por familia', () => {
  let app: INestApplication, t: TestDb, admin: Session, user: Session
  let familyId: string, otherFamily: string, powerId: string, modelId: string
  const http = () => request(app.getHttpServer())
  const post = (url: string, body: object) => http().post('/api/v1' + url).set('Authorization', bearer(admin)).send(body)
  const patch = (url: string, body: object) => http().patch('/api/v1' + url).set('Authorization', bearer(admin)).send(body)
  const values = { 'Potencia (kW)': 0, 'Requiere lubricación': false }
  beforeAll(async () => {
    app = await createApp(); t = new TestDb(); await t.cleanup()
    await t.user('spec-admin', { isGlobalAdmin: true }); await t.user('spec-user')
    admin = await login(app, 'spec-admin'); user = await login(app, 'spec-user')
    familyId = (await post('/catalog/families', { code: 'E2E_SPEC_FAMILY', tagCode: 'TSP', name: 'E2E Especificaciones' }).expect(201)).body.id
    otherFamily = (await post('/catalog/families', { code: 'E2E_SPEC_OTHER', tagCode: 'TSO', name: 'E2E Otra familia' }).expect(201)).body.id
    await post('/catalog/types', { code: 'E2E_SPEC_TYPE', name: 'E2E Tipo', familyCode: 'E2E_SPEC_FAMILY', stageCodes: ['D01'] }).expect(201)
    const plant = await t.plant('specs', 'PRIVATE'); await t.enableStage(plant.id, 'D01'); await t.enableNetwork(plant.id, 'FUR-PROC')
  })
  afterAll(async () => { await t.cleanup(); await t.close(); await app.close() })

  it('carga las 719 definiciones del Excel definitivo y 81 familias; lectura pública y escritura solo administrativa', async () => {
    const all = (await http().get('/api/v1/catalog/specifications').expect(200)).body
    expect(all).toHaveLength(719)
    expect(new Set(all.map((d: { familyId: string }) => d.familyId)).size).toBe(81)
    const body = { familyId, label: 'Potencia', unit: 'kW', valueType: 'NUMBER', required: true }
    await http().post('/api/v1/catalog/specifications').send(body).expect(401)
    await http().post('/api/v1/catalog/specifications').set('Authorization', bearer(user)).send(body).expect(403)
    powerId = (await post('/catalog/specifications', body).expect(201)).body.id
    await post('/catalog/specifications', { ...body, label: 'potencia' }).expect(409)
    await post('/catalog/specifications', { ...body, familyId: otherFamily }).expect(201)
    await post('/catalog/specifications', { familyId, label: 'Requiere lubricación', valueType: 'BOOLEAN', required: true }).expect(201)
    await post('/catalog/specifications', { familyId, label: 'Temperatura', unit: '°C', valueType: 'RANGE' }).expect(201)
    await post('/catalog/specifications', { familyId, label: 'Certificaciones', valueType: 'LIST' }).expect(201)
    const own = (await http().get('/api/v1/catalog/specifications').query({ familyId }).expect(200)).body
    expect(own).toHaveLength(4); expect(own.every((d: { familyId: string }) => d.familyId === familyId)).toBe(true)
  })
  it('el catálogo rechaza nombres libres, tipos incorrectos y obligatorias vacías; acepta cero, false, listas y rangos', async () => {
    const create = (specifications: object) => post('/catalog/models', { typeCode: 'E2E_SPEC_TYPE', modelName: 'E2E Modelo especificado', specifications })
    await create({}).expect(400)
    await create({ ...values, ptencia: 1 }).expect(400)
    await create({ ...values, 'Potencia (kW)': '5' }).expect(400)
    await create({ ...values, 'Temperatura (°C)': { min: 5, max: 1 } }).expect(400)
    const model = await create({ ...values, 'Temperatura (°C)': { min: 1, max: 5 }, Certificaciones: ['ISO'] }).expect(201)
    modelId = model.body.id
    expect(model.body.specifications).toMatchObject(values)
  })
  it('los activos de planta usan el mismo maestro y sus valores no modifican al catálogo', async () => {
    const create = (specifications: object) => post('/plants/e2e-specs/assets', { familyId, name: 'Equipo propio', stageCode: 'D01', networkCodes: ['FUR-PROC'], specifications })
    await create({}).expect(400)
    await create({ ...values, typo: 'x' }).expect(400)
    const result = await create({ ...values, 'Potencia (kW)': 10 }).expect(201)
    expect(result.body.specifications['Potencia (kW)']).toBe(10)
    expect((await t.db.select().from(assetModels).where(eq(assetModels.id, modelId)))[0].specifications).toMatchObject(values)
    await patch(`/plants/e2e-specs/assets/${result.body.id}`, { specifications: { ...values, 'Requiere lubricación': null } }).expect(400)
  })
  it('el importador valida el mismo maestro y ninguna opción permite saltarse un nombre desconocido', async () => {
    await t.db.update(assetFamilies).set({ categoryCode: '96' }).where(eq(assetFamilies.id, familyId))
    const workbook = async (parameter: string, value = '12,5') => {
      const book = new ExcelJS.Workbook()
      book.addWorksheet('Listado maestro').addRows([
        ['TAG ACTIVO', 'Nombre', 'Código CA', 'Categoría N4', 'Tipo', 'Fabricante / modelo', 'Denominación de etapa'],
        ['E2E-SPEC-IMPORT', 'E2E Modelo importado', '96', 'E2E Especificaciones', 'E2E Tipo', '', 'Recepción, chancado y cribado'],
      ])
      book.addWorksheet('Categorías N4').addRows([['Código CA', 'Categoría N4'], ['96', 'E2E Especificaciones']])
      book.addWorksheet('Características').addRows([['TAG ACTIVO', 'Componentes principales']])
      book.addWorksheet('Especificaciones').addRows([
        ['TAG ACTIVO', 'Parámetro técnico', 'Unidad', 'Valor / estado'],
        ['E2E-SPEC-IMPORT', parameter, 'kW', value], ['E2E-SPEC-IMPORT', 'Requiere lubricación', '', 'No'],
      ])
      return Buffer.from(await book.xlsx.writeBuffer())
    }
    const preview = (file: Buffer) => http().post('/api/v1/catalog/imports/preview').set('Authorization', bearer(admin)).field('networkCodes', '["FUR-PROC"]').attach('file', file, 'specs.xlsx')
    const bad = await workbook('ptencia')
    const rejected = (await preview(bad).expect(201)).body
    expect(rejected.issues.some((i: { message: string }) => i.message.includes('ptencia'))).toBe(true)
    await http().post('/api/v1/catalog/imports').set('Authorization', bearer(admin)).field('networkCodes', '["FUR-PROC"]').field('fingerprint', rejected.fingerprint).field('allowMissingSpecifications', 'true').field('allowDuplicateModels', 'true').attach('file', bad, 'specs.xlsx').expect(400)
    const invalidNumber = await workbook('Potencia', '≈ 16')
    const invalidPreview = (await preview(invalidNumber).expect(201)).body
    expect(invalidPreview.issues).toEqual([expect.objectContaining({
      sheet: 'Listado maestro', row: 2,
      message: expect.stringContaining('Especificación «Potencia (kW)»: se esperaba un número'),
    })])
    expect(invalidPreview.issues[0].message).toContain('Valor recibido: «≈ 16»')
    expect(invalidPreview.issues[0].message).not.toContain('NaN')
    const good = await workbook('Potencia')
    const accepted = (await preview(good).expect(201)).body
    expect(accepted.issues).toEqual([])
    expect(accepted.rows[0].specifications).toEqual({ 'Potencia (kW)': 12.5, 'Requiere lubricación': false })
    await http().post('/api/v1/catalog/imports').set('Authorization', bearer(admin)).field('networkCodes', '["FUR-PROC"]').field('fingerprint', accepted.fingerprint).attach('file', good, 'specs.xlsx').expect(201)
  })
  it('conserva datos anteriores sin admitir nombres nuevos o cambios libres y protege las definiciones en uso', async () => {
    const legacy = await t.model('E2E_SPEC_TYPE', 'E2E Modelo anterior')
    await t.db.update(assetModels).set({ specifications: { ptencia: 'dato anterior' } }).where(eq(assetModels.id, legacy.id))
    await patch(`/catalog/models/${legacy.id}`, { specifications: { ptencia: 'dato anterior' } }).expect(200)
    await patch(`/catalog/models/${legacy.id}`, { specifications: { ptencia: 'otro valor' } }).expect(400)
    await patch(`/catalog/specifications/${powerId}`, { label: 'Nombre diferente' }).expect(409)
    await http().delete(`/api/v1/catalog/specifications/${powerId}`).set('Authorization', bearer(admin)).expect(409)
    await patch(`/catalog/specifications/${powerId}`, { required: false, sortOrder: 25 }).expect(200)
    const unused = (await post('/catalog/specifications', { familyId, label: 'Sin uso', valueType: 'TEXT' }).expect(201)).body
    await http().delete(`/api/v1/catalog/specifications/${unused.id}`).set('Authorization', bearer(admin)).expect(204)
    expect(await t.db.select().from(familySpecifications).where(eq(familySpecifications.id, unused.id))).toHaveLength(0)
  })
})
