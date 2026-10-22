import type { INestApplication } from '@nestjs/common'
import ExcelJS from 'exceljs'
import { eq, like } from 'drizzle-orm'
import request from 'supertest'
import { assetFamilies, assetModels, assetTypes, assets, manufacturers } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

async function workbook(options: { duplicate?: boolean; orphan?: boolean; rename?: boolean; splitFamily?: boolean; makers?: [string, string]; missingSpecifications?: boolean; invalidSpecification?: boolean; omitSpecificationsSheet?: boolean } = {}) {
  const book = new ExcelJS.Workbook()
  const master = book.addWorksheet('Listado maestro')
  master.addRows([
    ['TAG ACTIVO', 'Nombre', 'Código CA', 'Categoría N4', 'Tipo', 'Fabricante / modelo', 'Denominación de etapa'],
    ['E2E-IMPORT-01', options.rename ? 'E2E Modelo renombrado' : 'E2E Modelo uno', '97', '97 — E2E familia (por verificar)', 'E2E Tipo maestro', options.makers?.[0] ?? 'E2E Fabricante', 'Molienda primaria'],
    [options.duplicate ? 'E2E-IMPORT-01' : 'E2E-IMPORT-02', 'E2E Modelo dos', options.splitFamily ? '98' : '97', '97 — E2E familia', 'E2E Tipo maestro', options.makers?.[1] ?? 'E2E Fabricante', 'Molienda secundaria'],
  ])
  book.addWorksheet('Categorías N4').addRows([['Código CA', 'Categoría N4'], ['97', options.rename ? 'E2E Familia renombrada' : 'E2E Familia canónica'], ['98', 'E2E Otra familia']])
  book.addWorksheet('Características').addRows([
    ['TAG ACTIVO', 'Componentes principales'], ['E2E-IMPORT-02', 'Motor, tambor, corona. Un solo componente.'], ['E2E-IMPORT-01', 'Motor, reductor, eje.'],
  ])
  if (!options.omitSpecificationsSheet) book.addWorksheet('Especificaciones').addRows([
    ['TAG ACTIVO', 'Parámetro técnico', 'Unidad', 'Valor / estado'],
    ...(options.missingSpecifications ? [] : [[options.orphan ? 'E2E-NO-EXISTE' : 'E2E-IMPORT-02', 'Potencia del motor', 'kW', options.rename ? '80–100' : '7,5–75']]),
    ['E2E-IMPORT-01', 'Material', '—', options.invalidSpecification ? '' : 'Acero'],
    [null, null, null, null],
  ])
  return Buffer.from(await book.xlsx.writeBuffer())
}

describe('Importación del listado maestro del catálogo (e2e)', () => {
  let app: INestApplication, t: TestDb, admin: Session, ordinary: Session
  const http = () => request(app.getHttpServer())
  const preview = (file: Buffer, networkCodes = ['FUR-PROC']) => http().post('/api/v1/catalog/imports/preview').set('Authorization', bearer(admin)).field('networkCodes', JSON.stringify(networkCodes)).attach('file', file, 'maestro.xlsx')
  const apply = (file: Buffer, fingerprint: string, networkCodes = ['FUR-PROC'], allowMissingSpecifications?: boolean) => {
    const req = http().post('/api/v1/catalog/imports').set('Authorization', bearer(admin)).field('fingerprint', fingerprint).field('networkCodes', JSON.stringify(networkCodes))
    if (allowMissingSpecifications !== undefined) req.field('allowMissingSpecifications', String(allowMissingSpecifications))
    return req.attach('file', file, 'maestro.xlsx')
  }
  const models = async () => (await t.db.select().from(assetModels).where(like(assetModels.catalogTag, 'E2E-IMPORT-%')))
  const cleanup = async () => {
    await t.cleanup()
    await t.db.delete(assetTypes).where(eq(assetTypes.name, 'E2E Tipo maestro'))
    await t.db.delete(assetFamilies).where(eq(assetFamilies.categoryCode, '97'))
  }
  beforeAll(async () => {
    t = new TestDb()
    await cleanup()
    app = await createApp()
    await t.user('import-admin', { isGlobalAdmin: true })
    await t.user('import-user')
    admin = await login(app, 'import-admin')
    ordinary = await login(app, 'import-user')
  })
  afterAll(async () => { await cleanup(); await t.close(); await app.close() })

  it('exige administrador global antes de procesar archivos', async () => {
    for (const endpoint of ['/catalog/imports/preview', '/catalog/imports']) {
      await http().post(`/api/v1${endpoint}`).attach('file', Buffer.from('no es Excel'), 'bad.xlsx').expect(401)
      await http().post(`/api/v1${endpoint}`).set('Authorization', bearer(ordinary)).attach('file', Buffer.from('no es Excel'), 'bad.xlsx').expect(403)
    }
  })
  it('valida hojas, TAG duplicados y referencias huérfanas sin guardar cambios', async () => {
    for (const options of [{ duplicate: true }, { orphan: true }]) {
      const file = await workbook(options)
      const p = await preview(file).expect(201)
      expect(p.body.issues.length).toBeGreaterThan(0)
      await apply(file, p.body.fingerprint).expect(400)
    }
    const empty = new ExcelJS.Workbook()
    empty.addWorksheet('Otra hoja')
    const p = await preview(Buffer.from(await empty.xlsx.writeBuffer())).expect(201)
    expect(p.body.issues.some((i: { message: string }) => i.message.includes('Listado maestro'))).toBe(true)
    expect(await models()).toHaveLength(0)
  })
  it('exige una selección de redes válida y existente antes de escribir', async () => {
    const file = await workbook()
    for (const raw of [undefined, 'no es JSON', '{}', '[]', '[7]', '["FUR-NO"]', '["incorrecta"]']) {
      for (const endpoint of ['/catalog/imports/preview', '/catalog/imports']) {
        const req = http().post(`/api/v1${endpoint}`).set('Authorization', bearer(admin))
        if (raw !== undefined) req.field('networkCodes', raw)
        if (endpoint === '/catalog/imports') req.field('fingerprint', 'a'.repeat(64))
        await req.attach('file', file, 'maestro.xlsx').expect(400)
      }
    }
    expect(await models()).toHaveLength(0)
  })
  it('la vista previa unifica por Código CA y cruza las hojas por TAG, sin escribir', async () => {
    const p = await preview(await workbook()).expect(201)
    expect(p.body.issues).toEqual([])
    expect(p.body.summary).toMatchObject({ models: { create: 2, update: 0 }, families: { create: 1, update: 0 }, types: { create: 1, update: 0 }, specifications: 2 })
    expect(p.body.rows[1]).toMatchObject({ tag: 'E2E-IMPORT-02', family: 'E2E Familia canónica', stages: ['D06'], components: ['Motor, tambor, corona. Un solo componente.'], specifications: { 'Potencia del motor (kW)': '7,5–75' } })
    expect(await models()).toHaveLength(0)
  })
  it('identifica los modelos sin especificaciones y exige aceptación explícita sin saltarse otros errores', async () => {
    const file = await workbook({ missingSpecifications: true }), p = await preview(file).expect(201)
    expect(p.body.issues).toEqual([{ sheet: 'Listado maestro', row: 3, message: 'E2E-IMPORT-02 no tiene especificaciones', code: 'MISSING_SPECIFICATIONS' }])
    await apply(file, p.body.fingerprint).expect(400)
    await apply(file, p.body.fingerprint, ['FUR-PROC'], false).expect(400)
    for (const options of [{ missingSpecifications: true, duplicate: true }, { missingSpecifications: true, invalidSpecification: true }, { omitSpecificationsSheet: true }]) {
      const badFile = await workbook(options), badPreview = await preview(badFile).expect(201)
      await apply(badFile, badPreview.body.fingerprint, ['FUR-PROC'], true).expect(400)
    }
    await http().post('/api/v1/catalog/imports').set('Authorization', bearer(admin)).field('fingerprint', p.body.fingerprint)
      .field('networkCodes', '["FUR-PROC"]').field('allowMissingSpecifications', 'yes').attach('file', file, 'maestro.xlsx').expect(400)
    expect(await models()).toHaveLength(0)
  })
  it('la vista previa muestra las redes seleccionadas y normaliza orden, mayúsculas y duplicados', async () => {
    const file = await workbook()
    const first = await preview(file, ['fur-pte', 'FUR-IOT', 'FUR-PTE']).expect(201)
    const reordered = await preview(file, ['FUR-IOT', 'FUR-PTE']).expect(201)
    expect(first.body.networks).toEqual([{ code: 'FUR-IOT', name: 'IoT / Instrumentación' }, { code: 'FUR-PTE', name: 'Potencia Eléctrica' }])
    expect(first.body.fingerprint).toBe(reordered.body.fingerprint)
    await apply(file, first.body.fingerprint, ['FUR-PROC']).expect(409)
    expect(await models()).toHaveLength(0)
  })
  it('rechaza confirmaciones si el catálogo cambió después de la vista previa', async () => {
    const file = await workbook(), p = await preview(file).expect(201)
    await t.db.insert(manufacturers).values({ name: 'E2E Cambio concurrente' })
    await apply(file, p.body.fingerprint).expect(409)
    expect(await models()).toHaveLength(0)
  })
  it('permite el mismo nombre de tipo en familias distintas sin mezclar sus modelos', async () => {
    const p = await preview(await workbook({ splitFamily: true })).expect(201)
    expect(p.body.issues).toEqual([])
    expect(p.body.summary.types).toEqual({ create: 2, update: 0 })
    expect(p.body.summary.families).toEqual({ create: 2, update: 0 })
  })
  it('aplica todo y publica cada modelo con sus especificaciones, componente y etapa', async () => {
    const file = await workbook(), p = await preview(file).expect(201)
    const result = await apply(file, p.body.fingerprint).expect(201)
    expect(result.body.imported).toBe(2)
    const res = await http().get('/api/v1/catalog/assets?search=E2E-IMPORT&pageSize=100').expect(200)
    expect(res.body.total).toBe(2)
    const m = res.body.items.find((m: { catalogTag: string }) => m.catalogTag === 'E2E-IMPORT-02')
    expect(m).toMatchObject({ specifications: { 'Potencia del motor (kW)': '7,5–75' }, technicalData: { componentes: ['Motor, tambor, corona. Un solo componente.'] }, stageCodes: ['D06'], imageUrl: null, networkCodes: ['FUR-PROC'] })
    // La misma vista previa ya no autoriza volver a aplicar sobre un catálogo diferente.
    await apply(file, p.body.fingerprint).expect(409)
  })
  it('actualiza por TAG y Código CA aunque cambien nombres, manteniendo los IDs', async () => {
    const before = await models()
    const sibling = (await http().post('/api/v1/catalog/models').set('Authorization', bearer(admin)).send({
      typeCode: (await t.db.select().from(assetTypes).where(eq(assetTypes.id, before[0].assetTypeId)))[0].code,
      modelName: 'E2E Modelo fuera del Excel', networkCodes: ['FUR-PTE'],
    }).expect(201)).body
    await http().patch(`/api/v1/catalog/models/${before[0].id}`).set('Authorization', bearer(admin)).send({ networkCodes: ['FUR-IOT'] }).expect(200)
    await t.db.update(assetModels).set({ imageKey: 'catalog/e2e.png', technicalData: { identificacion: { Proyecto: 'E2E' }, fuente: 'Referencia previa' } }).where(eq(assetModels.id, before[0].id))
    const family = (await t.db.select().from(assetFamilies).where(eq(assetFamilies.categoryCode, '97')))[0]
    const file = await workbook({ rename: true }), p = await preview(file).expect(201)
    expect(p.body.summary.models).toEqual({ create: 0, update: 2 })
    expect(p.body.summary.families).toEqual({ create: 0, update: 1 })
    await apply(file, p.body.fingerprint).expect(201)
    expect((await http().get(`/api/v1/catalog/assets/${sibling.id}`).expect(200)).body.networkCodes).toEqual(['FUR-PTE'])
    expect((await http().get(`/api/v1/catalog/assets/${before[0].id}`).expect(200)).body.networkCodes).toEqual(['FUR-PROC'])
    const after = await models()
    expect(after.map(m => m.id).sort()).toEqual(before.map(m => m.id).sort())
    expect(after.find(m => m.id === before[0].id)).toMatchObject({ imageKey: 'catalog/e2e.png', technicalData: { identificacion: { Proyecto: 'E2E' }, fuente: 'Referencia previa' } })
    expect(after.find(m => m.catalogTag === 'E2E-IMPORT-01')?.modelName).toBe('E2E Modelo renombrado')
    expect(after.find(m => m.catalogTag === 'E2E-IMPORT-02')?.specifications).toEqual({ 'Potencia del motor (kW)': '80–100' })
    expect((await t.db.select().from(assetFamilies).where(eq(assetFamilies.id, family.id)))[0].name).toBe('E2E Familia renombrada')
  })
  it('la vista previa agrupa notas distintas y rechaza nombres vacíos después de quitar paréntesis', async () => {
    const p = await preview(await workbook({ makers: ['E2E Fabricante (INV-060)', 'E2E Fabricante (motor) (INV-062)'] })).expect(201)
    expect(p.body.issues).toEqual([])
    expect(p.body.rows.map((r: { manufacturer: string }) => r.manufacturer)).toEqual(['E2E Fabricante', 'E2E Fabricante'])
    expect(p.body.summary.manufacturers).toEqual({ create: 0, update: 1, merged: 0 })
    const bad = await preview(await workbook({ makers: ['(Solo una nota)', 'E2E Fabricante (sin cierre'] })).expect(201)
    expect(bad.body.issues.filter((i: { message: string }) => i.message.includes('fabricante'))).toHaveLength(2)
  })
  it('importa los modelos completos y los que no tienen especificaciones al aceptar la opción', async () => {
    const file = await workbook({ rename: true, missingSpecifications: true }), p = await preview(file).expect(201)
    // El archivo y las redes siguen vinculados a la vista previa aunque se permita la ausencia de especificaciones.
    await apply(file, p.body.fingerprint, ['FUR-IOT'], true).expect(409)
    const changed = await workbook({ missingSpecifications: true })
    await apply(changed, p.body.fingerprint, ['FUR-PROC'], true).expect(409)
    const result = await apply(file, p.body.fingerprint, ['FUR-PROC'], true).expect(201)
    expect(result.body.imported).toBe(2)
    const imported = await models()
    expect(imported.find(m => m.catalogTag === 'E2E-IMPORT-02')?.specifications).toEqual({})
    expect(imported.find(m => m.catalogTag === 'E2E-IMPORT-01')?.specifications).toEqual({ Material: 'Acero' })
  })
  it('asigna varias redes elegidas y al reimportar las reemplaza sin afectar modelos fuera del archivo', async () => {
    const before = await models()
    const outside = (await http().get('/api/v1/catalog/assets?search=E2E%20Modelo%20fuera%20del%20Excel').expect(200)).body.items[0]
    const file = await workbook({ rename: true })
    const p = await preview(file, ['FUR-PTE', 'FUR-IOT']).expect(201)
    await apply(file, p.body.fingerprint, ['fur-iot', 'FUR-PTE', 'FUR-IOT']).expect(201)
    for (const model of before) expect((await http().get(`/api/v1/catalog/assets/${model.id}`).expect(200)).body.networkCodes).toEqual(['FUR-IOT', 'FUR-PTE'])
    const second = await preview(file, ['FUR-IOT']).expect(201)
    await apply(file, second.body.fingerprint, ['FUR-IOT']).expect(201)
    for (const model of before) expect((await http().get(`/api/v1/catalog/assets/${model.id}`).expect(200)).body.networkCodes).toEqual(['FUR-IOT'])
    expect((await http().get(`/api/v1/catalog/assets/${outside.id}`).expect(200)).body.networkCodes).toEqual(['FUR-PTE'])
  })
  it('consolida fabricantes anteriores y reasigna modelos y activos físicos sin cambiar sus IDs', async () => {
    const before = await models()
    const variants = await t.db.insert(manufacturers).values([{ name: 'E2E Fabricante (INV-060)', website: 'https://example.com/' }, { name: 'E2E Fabricante (INV-062)' }]).returning()
    for (let i = 0; i < 2; i++) await t.db.update(assetModels).set({ manufacturerId: variants[i].id }).where(eq(assetModels.id, before[i].id))
    const plant = await t.plant('import-makers', 'PUBLIC')
    const [physical] = await t.db.insert(assets).values({ plantId: plant.id, assetModelId: before[0].id, manufacturerId: variants[1].id, furCode: 'E2E-IMPORT-MAKER-001', tag: 'E2E-MAKER', name: 'E2E Activo con fabricante' }).returning()
    const file = await workbook({ makers: ['E2E Fabricante (INV-060)', 'E2E Fabricante (INV-062)'] })
    const p = await preview(file).expect(201)
    expect(p.body.issues).toEqual([])
    expect(p.body.summary.manufacturers).toEqual({ create: 0, update: 1, merged: 2 })
    // La vista previa no borra variantes ni cambia asociaciones.
    expect((await t.db.select().from(assets).where(eq(assets.id, physical.id)))[0].manufacturerId).toBe(variants[1].id)
    await apply(file, p.body.fingerprint).expect(201)
    const makers = await t.db.select().from(manufacturers).where(like(manufacturers.name, 'E2E Fabricante%'))
    expect(makers).toHaveLength(1)
    expect(makers[0]).toMatchObject({ name: 'E2E Fabricante', website: 'https://example.com/' })
    expect((await models()).map(m => m.id).sort()).toEqual(before.map(m => m.id).sort())
    expect((await models()).every(m => m.manufacturerId === makers[0].id)).toBe(true)
    expect((await t.db.select().from(assets).where(eq(assets.id, physical.id)))[0].manufacturerId).toBe(makers[0].id)
    expect((await preview(file).expect(201)).body.summary.manufacturers).toEqual({ create: 0, update: 1, merged: 0 })
  })
  it('bloquea una unificación que causaría colisión entre dos modelos distintos', async () => {
    const [variant] = await t.db.insert(manufacturers).values({ name: 'E2E Fabricante (otra nota)' }).returning()
    const [model] = await models()
    await t.db.insert(assetModels).values({ assetTypeId: model.assetTypeId, manufacturerId: variant.id, modelName: model.modelName })
    const file = await workbook(), p = await preview(file).expect(201)
    expect(p.body.issues.some((i: { message: string }) => i.message.includes('dos modelos distintos') || i.message.includes('Coincidencia ambigua'))).toBe(true)
    await apply(file, p.body.fingerprint).expect(400)
    expect(await t.db.select().from(manufacturers).where(eq(manufacturers.id, variant.id))).toHaveLength(1)
  })
})
