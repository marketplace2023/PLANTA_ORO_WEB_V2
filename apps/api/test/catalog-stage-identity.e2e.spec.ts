import type { INestApplication } from '@nestjs/common'
import ExcelJS from 'exceljs'
import { eq, like } from 'drizzle-orm'
import request from 'supertest'
import { isUniqueViolation } from '../src/common/db-errors'
import { assetFamilies, assetModels, assetModelStages, assetTypes, assetTypeStages, auditEvents, manufacturers, stageMaster } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Input = { tag: string; stage: string; material?: string; missingSpecifications?: boolean }
const ROWS: Input[] = [{ tag: 'E2E-STAGE-01', stage: 'Molienda primaria' }, { tag: 'E2E-STAGE-02', stage: 'Molienda secundaria' }]
async function workbook(rows = ROWS) {
  const book = new ExcelJS.Workbook()
  book.addWorksheet('Listado maestro').addRows([
    ['TAG ACTIVO', 'Nombre', 'Código CA', 'Categoría N4', 'Tipo', 'Fabricante / modelo', 'Denominación de etapa'],
    ...rows.map(r => [r.tag, 'E2E Stage cámara', '96', 'E2E Stage familia', 'E2E Stage tipo', 'E2E Stage fabricante', r.stage]),
  ])
  book.addWorksheet('Categorías N4').addRows([['Código CA', 'Categoría N4'], ['96', 'E2E Stage familia']])
  book.addWorksheet('Características').addRow(['TAG ACTIVO', 'Componentes principales'])
  book.addWorksheet('Especificaciones').addRows([['TAG ACTIVO', 'Parámetro técnico', 'Unidad', 'Valor / estado'], ...rows.filter(r => !r.missingSpecifications).map(r => [r.tag, 'Material', '', r.material ?? 'Acero'])])
  return Buffer.from(await book.xlsx.writeBuffer())
}

describe('Identidad del catálogo por tipo, fabricante, nombre y etapa', () => {
  let app: INestApplication, t: TestDb, admin: Session
  const http = () => request(app.getHttpServer())
  const preview = (file: Buffer) => http().post('/api/v1/catalog/imports/preview').set('Authorization', bearer(admin)).field('networkCodes', '["FUR-PROC"]').attach('file', file, 'etapas.xlsx')
  const apply = (file: Buffer, fingerprint: string, options: { allowDuplicateModels?: string; allowMissingSpecifications?: string } = {}) => {
    const req = http().post('/api/v1/catalog/imports').set('Authorization', bearer(admin)).field('networkCodes', '["FUR-PROC"]').field('fingerprint', fingerprint)
    for (const [name, value] of Object.entries(options)) req.field(name, value)
    return req.attach('file', file, 'etapas.xlsx')
  }
  const models = () => t.db.select().from(assetModels).where(like(assetModels.modelName, 'E2E Stage%'))
  const importRows = async (rows = ROWS) => {
    const file = await workbook(rows), p = await preview(file).expect(201)
    expect(p.body.issues).toEqual([])
    await apply(file, p.body.fingerprint).expect(201)
    return models()
  }
  const post = (path: string, body: object) => http().post(`/api/v1/catalog/${path}`).set('Authorization', bearer(admin)).send(body)
  const patch = (path: string, body: object) => http().patch(`/api/v1/catalog/${path}`).set('Authorization', bearer(admin)).send(body)
  beforeAll(async () => {
    t = new TestDb()
    await t.cleanup()
    app = await createApp()
    await t.user('stage-identity-admin', { isGlobalAdmin: true })
    admin = await login(app, 'stage-identity-admin')
  })
  beforeEach(async () => {
    await t.db.delete(assetModels).where(like(assetModels.modelName, 'E2E Stage%'))
    await t.db.delete(assetTypes).where(like(assetTypes.name, 'E2E Stage%'))
    await t.db.delete(assetFamilies).where(eq(assetFamilies.categoryCode, '96'))
    await t.db.delete(manufacturers).where(like(manufacturers.name, 'E2E Stage%'))
  })
  afterAll(async () => {
    await t.cleanup()
    await t.db.delete(assetTypes).where(like(assetTypes.name, 'E2E Stage%'))
    await t.db.delete(assetFamilies).where(eq(assetFamilies.categoryCode, '96'))
    await t.close()
    await app.close()
  })

  it('crea modelos distintos por etapa y rechaza reimportar sus TAG', async () => {
    const before = await importRows()
    expect(before).toHaveLength(2)
    expect(new Set(before.map(m => m.id)).size).toBe(2)
    const file = await workbook(), p = await preview(file).expect(201)
    expect(p.body.summary.models).toEqual({ create: 0, update: 0 })
    expect(p.body.issues.filter((i: { code?: string }) => i.code === 'TAG_ALREADY_EXISTS')).toHaveLength(2)
    await apply(file, p.body.fingerprint).expect(400)
    expect((await models()).map(m => m.id).sort()).toEqual(before.map(m => m.id).sort())
    const list = (await http().get('/api/v1/catalog/assets?search=E2E-STAGE').expect(200)).body.items
    expect(list.find((m: { catalogTag: string }) => m.catalogTag === ROWS[0].tag).stageCodes).toEqual(['D05'])
    expect(list.find((m: { catalogTag: string }) => m.catalogTag === ROWS[1].tag).stageCodes).toEqual(['D06'])
  })

  it('bloquea la misma combinación en la misma etapa e indica las filas y ambos TAG', async () => {
    const file = await workbook([ROWS[0], { ...ROWS[1], stage: ROWS[0].stage }]), p = await preview(file).expect(201)
    expect(p.body.issues).toEqual([expect.objectContaining({ row: 3, message: expect.stringMatching(/E2E-STAGE-01 \(fila 2\).*E2E-STAGE-02 \(fila 3\)/) })])
    expect(p.body.issues[0].message).toContain('D05 · Molienda primaria')
    await apply(file, p.body.fingerprint).expect(400)
    expect(await models()).toHaveLength(0)
  })

  it('admite otra etapa en una carga posterior y detecta choques con el catálogo existente', async () => {
    const first = await importRows([ROWS[0]])
    const second = await importRows([ROWS[1]])
    expect(second).toHaveLength(2)
    expect(second.find(m => m.id === first[0].id)?.catalogTag).toBe(ROWS[0].tag)
    const file = await workbook([{ tag: 'E2E-STAGE-03', stage: ROWS[0].stage }]), p = await preview(file).expect(201)
    expect(p.body.issues).toContainEqual(expect.objectContaining({ row: 2, message: expect.stringContaining('E2E-STAGE-01 (catálogo existente)') }))
    await apply(file, p.body.fingerprint).expect(400)
  })

  it('no permite sobrescribir TAG existentes aunque cambien o intercambien sus etapas', async () => {
    const before = await importRows()
    const swapped = [{ ...ROWS[0], stage: ROWS[1].stage }, { ...ROWS[1], stage: ROWS[0].stage }]
    const file = await workbook(swapped), p = await preview(file).expect(201)
    expect(p.body.issues.filter((i: { code?: string }) => i.code === 'TAG_ALREADY_EXISTS')).toHaveLength(2)
    await apply(file, p.body.fingerprint).expect(400)
    expect(await models()).toEqual(before)
  })

  it('unifica variantes de fabricante cuando sus modelos coinciden solo en etapas diferentes', async () => {
    const before = await importRows()
    const variants = await t.db.insert(manufacturers).values([{ name: 'E2E Stage fabricante (uno)' }, { name: 'E2E Stage fabricante (dos)' }]).returning()
    for (let i = 0; i < before.length; i++) await t.db.update(assetModels).set({ manufacturerId: variants[i].id }).where(eq(assetModels.id, before[i].id))
    const file = await workbook([{ tag: 'E2E-STAGE-03', stage: 'Clasificación (hidrociclones)' }]), p = await preview(file).expect(201)
    expect(p.body.issues).toEqual([])
    expect(p.body.summary.manufacturers.merged).toBe(2)
    await apply(file, p.body.fingerprint).expect(201)
    expect(new Set((await models()).map(m => m.manufacturerId)).size).toBe(1)
  })

  it('protege también las altas y ediciones manuales, incluidas etapas heredadas', async () => {
    const [model] = await importRows()
    const [type] = await t.db.select().from(assetTypes).where(eq(assetTypes.id, model.assetTypeId))
    const dto = { typeCode: type.code, manufacturerId: model.manufacturerId, modelName: model.modelName }
    await post('models', dto).expect(409) // hereda D05 y D06 y se solapa con los dos modelos
    await patch(`types/${type.id}`, { stageCodes: ['D05', 'D06', 'D07'] }).expect(200)
    const created = (await post('models', { ...dto, stageCodes: ['D07'] }).expect(201)).body
    const rejected = await patch(`models/${created.id}`, { stageCodes: ['D05'] }).expect(409)
    expect(rejected.body.message).toContain('etapa')
    expect((await http().get(`/api/v1/catalog/assets/${created.id}`).expect(200)).body.stageCodes).toEqual(['D07'])
  })

  it('rechaza cambios del tipo que causarían una colisión al volver a heredar etapas', async () => {
    const [model] = await importRows()
    const response = await patch(`types/${model.assetTypeId}`, { stageCodes: ['D05'] }).expect(409)
    expect(response.body.message).toContain('etapa')
    const links = await t.db.select().from(assetTypeStages).where(eq(assetTypeStages.assetTypeId, model.assetTypeId))
    expect(links).toHaveLength(2)
  })

  it('la base de datos impide duplicados concurrentes aun sin pasar por el importador', async () => {
    const [base] = await importRows()
    const [stage] = await t.db.select().from(stageMaster).where(eq(stageMaster.code, 'D05'))
    const insert = () => t.db.transaction(async tx => {
      const [model] = await tx.insert(assetModels).values({ assetTypeId: base.assetTypeId, manufacturerId: base.manufacturerId, modelName: 'E2E Stage concurrencia' }).returning()
      await tx.insert(assetModelStages).values({ assetModelId: model.id, stageMasterId: stage.id })
    })
    const results = await Promise.allSettled([insert(), insert()])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const error = results.find(r => r.status === 'rejected') as PromiseRejectedResult
    expect(isUniqueViolation(error.reason)).toBe(true)
  })

  it('solo importa varias coincidencias al aceptarlas y mantiene un modelo y especificaciones por TAG', async () => {
    const rows = [ROWS[0], { tag: 'E2E-STAGE-03', stage: ROWS[0].stage, material: 'Acero inoxidable' }, { tag: 'E2E-STAGE-04', stage: ROWS[0].stage, material: 'Aluminio' }]
    const file = await workbook(rows), p = await preview(file).expect(201)
    expect(p.body.issues).toHaveLength(2)
    expect(p.body.issues.every((i: { code?: string }) => i.code === 'DUPLICATE_MODEL_IDENTITY')).toBe(true)
    await apply(file, p.body.fingerprint).expect(400)
    await apply(file, p.body.fingerprint, { allowDuplicateModels: 'false' }).expect(400)
    expect(await models()).toHaveLength(0)
    await apply(file, p.body.fingerprint, { allowDuplicateModels: 'true' }).expect(201)
    const stored = await models()
    expect(stored).toHaveLength(3)
    expect(new Set(stored.map(m => m.id)).size).toBe(3)
    expect(new Set(stored.map(m => m.modelName))).toEqual(new Set(['E2E Stage cámara']))
    expect(stored.filter(m => m.duplicateIdentityAllowed)).toHaveLength(3)
    for (const row of rows) expect(stored.find(m => m.catalogTag === row.tag)?.specifications).toEqual({ Material: row.material ?? 'Acero' })
    const audit = await t.db.select().from(auditEvents).where(eq(auditEvents.entityType, 'master_import'))
    expect(audit.some(event => (event.newData as Record<string, unknown>)?.allowDuplicateModels === true)).toBe(true)
    const publicList = (await http().get('/api/v1/catalog/assets?search=E2E-STAGE').expect(200)).body
    expect(publicList.total).toBe(3)
    await apply(file, p.body.fingerprint, { allowDuplicateModels: 'true' }).expect(400)
    expect(await models()).toEqual(stored)
    // Las excepciones existentes no bloquean un archivo posterior sin coincidencias.
    const unrelated = await workbook([ROWS[1]]), other = await preview(unrelated).expect(201)
    expect(other.body.issues).toEqual([])
    await apply(unrelated, other.body.fingerprint).expect(201)
    // Un nuevo TAG coincidente vuelve a requerir aceptación explícita.
    const extra = await workbook([{ tag: 'E2E-STAGE-05', stage: ROWS[0].stage }]), conflict = await preview(extra).expect(201)
    expect(conflict.body.issues).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_MODEL_IDENTITY' }))
    await apply(extra, conflict.body.fingerprint).expect(400)
    await apply(extra, conflict.body.fingerprint, { allowDuplicateModels: 'true' }).expect(201)
  })

  it('exige aceptar por separado los duplicados y la ausencia de especificaciones', async () => {
    const file = await workbook([ROWS[0], { ...ROWS[1], stage: ROWS[0].stage, missingSpecifications: true }]), p = await preview(file).expect(201)
    expect(p.body.issues.map((i: { code?: string }) => i.code).sort()).toEqual(['DUPLICATE_MODEL_IDENTITY', 'MISSING_SPECIFICATIONS'])
    await apply(file, p.body.fingerprint, { allowDuplicateModels: 'true' }).expect(400)
    await apply(file, p.body.fingerprint, { allowMissingSpecifications: 'true' }).expect(400)
    await apply(file, p.body.fingerprint, { allowDuplicateModels: 'yes' }).expect(400)
    await apply(file, p.body.fingerprint, { allowDuplicateModels: 'true', allowMissingSpecifications: 'true' }).expect(201)
  })

  it('la aceptación no omite TAG repetidos, TAG existentes ni otras validaciones', async () => {
    for (const rows of [[ROWS[0], ROWS[0]], [ROWS[0], { ...ROWS[1], stage: ROWS[0].stage }, { tag: 'E2E-STAGE-BAD', stage: 'Etapa inexistente' }]]) {
      const file = await workbook(rows), p = await preview(file).expect(201)
      await apply(file, p.body.fingerprint, { allowDuplicateModels: 'true', allowMissingSpecifications: 'true' }).expect(400)
      expect(await models()).toHaveLength(0)
    }
    await importRows()
    const file = await workbook(), p = await preview(file).expect(201)
    expect(p.body.issues.every((i: { code?: string }) => i.code === 'TAG_ALREADY_EXISTS')).toBe(true)
    await apply(file, p.body.fingerprint, { allowDuplicateModels: 'true' }).expect(400)
    expect(await models()).toHaveLength(2)
  })

  it('mantiene la protección manual incluso si solo quedan modelos con excepción', async () => {
    await importRows([ROWS[0]])
    const file = await workbook([{ ...ROWS[1], stage: ROWS[0].stage }]), p = await preview(file).expect(201)
    await apply(file, p.body.fingerprint, { allowDuplicateModels: 'true' }).expect(201)
    const stored = await models(), standard = stored.find(m => !m.duplicateIdentityAllowed)!, exception = stored.find(m => m.duplicateIdentityAllowed)!
    await t.db.delete(assetModels).where(eq(assetModels.id, standard.id))
    const [type] = await t.db.select().from(assetTypes).where(eq(assetTypes.id, exception.assetTypeId))
    await post('models', { typeCode: type.code, manufacturerId: exception.manufacturerId, modelName: exception.modelName, stageCodes: ['D05'] }).expect(409)
    await patch(`models/${exception.id}`, { specifications: { Material: 'Otro material' } }).expect(200)
    expect(await models()).toHaveLength(1)
  })

  it('aceptar inserciones duplicadas no permite colisiones nuevas entre modelos anteriores al unificar fabricantes', async () => {
    const [base] = await importRows([ROWS[0]])
    const [variant] = await t.db.insert(manufacturers).values({ name: 'E2E Stage fabricante (otra)' }).returning()
    await t.db.insert(assetModels).values({ assetTypeId: base.assetTypeId, manufacturerId: variant.id, modelName: base.modelName, catalogTag: 'E2E-STAGE-OLD', duplicateIdentityAllowed: true })
    const file = await workbook([ROWS[1]]), p = await preview(file).expect(201)
    expect(p.body.issues).toContainEqual(expect.objectContaining({ message: expect.stringContaining('comparten tipo, fabricante, nombre') }))
    expect(p.body.issues.some((i: { code?: string }) => i.code === 'DUPLICATE_MODEL_IDENTITY')).toBe(false)
    await apply(file, p.body.fingerprint, { allowDuplicateModels: 'true' }).expect(400)
    expect(await t.db.select().from(manufacturers).where(eq(manufacturers.id, variant.id))).toHaveLength(1)
  })
})
