import type { INestApplication } from '@nestjs/common'
import ExcelJS from 'exceljs'
import { eq, like } from 'drizzle-orm'
import request from 'supertest'
import { assetFamilies, assetModels, assetModelNetworks, assetModelStages, assetTypes, assetTypeStages, assets, auditEvents, manufacturers } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

async function workbook(options: { tags?: [string, string]; duplicate?: boolean; orphan?: boolean; rename?: boolean; splitFamily?: boolean; makers?: [string, string]; missingSpecifications?: boolean; invalidSpecification?: boolean; omitSpecificationsSheet?: boolean; components?: unknown[][]; references?: unknown[][] } = {}) {
  const tags = options.tags ?? ['E2E-IMPORT-01', 'E2E-IMPORT-02']
  const book = new ExcelJS.Workbook()
  const master = book.addWorksheet('Listado maestro')
  master.addRows([
    ['TAG ACTIVO', 'Nombre', 'Código CA', 'Categoría N4', 'Tipo', 'Fabricante / modelo', 'Denominación de etapa'],
    [tags[0], options.rename ? 'E2E Modelo renombrado' : 'E2E Modelo uno', '97', '97 — E2E familia (por verificar)', 'E2E Tipo maestro', options.makers?.[0] ?? 'E2E Fabricante', 'Molienda primaria'],
    [options.duplicate ? tags[0] : tags[1], options.rename ? 'E2E Modelo dos renombrado' : 'E2E Modelo dos', options.splitFamily ? '98' : '97', '97 — E2E familia', 'E2E Tipo maestro', options.makers?.[1] ?? 'E2E Fabricante', 'Molienda secundaria'],
  ])
  book.addWorksheet('Categorías N4').addRows([['Código CA', 'Categoría N4'], ['97', options.rename ? 'E2E Familia renombrada' : 'E2E Familia canónica'], ['98', 'E2E Otra familia']])
  book.addWorksheet('Características').addRows([
    ['TAG ACTIVO', 'Componentes principales'], ...(options.components ?? [[tags[1], 'Motor, tambor, corona. Un solo componente.'], [tags[0], 'Motor, reductor, eje.']]),
  ])
  if (!options.omitSpecificationsSheet) book.addWorksheet('Especificaciones').addRows([
    ['TAG ACTIVO', 'Parámetro técnico', 'Unidad', 'Valor / estado'],
    ...(options.missingSpecifications ? [] : [[options.orphan ? 'E2E-NO-EXISTE' : tags[1], 'Potencia del motor', 'kW', options.rename ? '80–100' : '7,5–75']]),
    [tags[0], 'Material', '—', options.invalidSpecification ? '' : 'Acero'],
    [null, null, null, null],
  ])
  if (options.references !== undefined) book.addWorksheet('Fabricantes de referencia').addRows([
    ['TAG ACTIVO', 'Fabricante', 'Descripción', 'Sitio web'], ...options.references,
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
  beforeEach(async () => {
    await t.db.delete(assets).where(like(assets.name, 'E2E Activo%'))
    await t.db.delete(assetModels).where(like(assetModels.modelName, 'E2E Modelo%'))
    await t.db.delete(assetTypes).where(eq(assetTypes.name, 'E2E Tipo maestro'))
    await t.db.delete(assetFamilies).where(eq(assetFamilies.categoryCode, '97'))
    await t.db.delete(assetFamilies).where(eq(assetFamilies.categoryCode, '98'))
    await t.db.delete(manufacturers).where(like(manufacturers.name, 'E2E %'))
  })
  const importInitial = async (networks = ['FUR-PROC']) => {
    const file = await workbook(), p = await preview(file, networks).expect(201)
    await apply(file, p.body.fingerprint, networks).expect(201)
    return models()
  }
  const dataSnapshot = async () => ({
    models: await t.db.select().from(assetModels), families: await t.db.select().from(assetFamilies),
    types: await t.db.select().from(assetTypes), makers: await t.db.select().from(manufacturers),
    stages: await t.db.select().from(assetModelStages), typeStages: await t.db.select().from(assetTypeStages),
    networks: await t.db.select().from(assetModelNetworks), audit: await t.db.select().from(auditEvents),
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
    await t.db.insert(assetFamilies).values({ code: 'E2E_CAMBIO', name: 'E2E Cambio concurrente' })
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
    await apply(file, p.body.fingerprint).expect(400)
  })
  it('bloquea toda la carga ante TAG existentes e informa todas sus redes sin sobrescribir datos', async () => {
    const initial = await importInitial(['FUR-PTE', 'FUR-IOT'])
    await t.db.update(assetModels).set({ imageKey: 'catalog/e2e.png', technicalData: { componentes: ['Original'], fabricantesReferencia: [{ nombre: 'Original' }] } }).where(eq(assetModels.id, initial[0].id))
    const before = await dataSnapshot()
    // Incluye un TAG nuevo: tampoco debe crearse si otro TAG del archivo ya existe.
    const file = await workbook({ rename: true, tags: ['E2E-IMPORT-01', 'E2E-IMPORT-03'], missingSpecifications: true }), p = await preview(file).expect(201)
    expect(p.body.issues).toContainEqual({ sheet: 'Listado maestro', row: 2, code: 'TAG_ALREADY_EXISTS',
      message: 'El TAG E2E-IMPORT-01 ya existe en el catálogo. Redes actuales: IoT / Instrumentación (FUR-IOT), Potencia Eléctrica (FUR-PTE). No se permite importarlo ni sobrescribirlo.' })
    expect(p.body.summary.models).toEqual({ create: 1, update: 0 })
    expect(await dataSnapshot()).toEqual(before)
    const result = await apply(file, p.body.fingerprint, ['FUR-PROC'], true).expect(400)
    expect(result.body.errors).toContainEqual(expect.objectContaining({ path: 'Listado maestro:2', message: expect.stringContaining('FUR-PTE') }))
    expect(await dataSnapshot()).toEqual(before)
  })
  it('detecta todos los TAG existentes aunque cambien sus nombres y redes de destino', async () => {
    const initial = await importInitial()
    await t.db.delete(assetModelNetworks).where(eq(assetModelNetworks.assetModelId, initial[0].id))
    const file = await workbook({ rename: true }), p = await preview(file, ['FUR-PTE']).expect(201)
    const issues = p.body.issues.filter((i: { code?: string }) => i.code === 'TAG_ALREADY_EXISTS')
    expect(issues).toHaveLength(2)
    expect(issues.find((i: { row: number }) => i.row === 2).message).toContain('sin redes asignadas')
    expect(issues.find((i: { row: number }) => i.row === 3).message).toContain('Procesos (FUR-PROC)')
    expect(p.body.summary.models).toEqual({ create: 0, update: 0 })
    await apply(file, p.body.fingerprint, ['FUR-PTE']).expect(400)
    expect(await models()).toEqual(initial)
  })
  it('revalida los TAG al confirmar si uno fue creado después del análisis', async () => {
    const initial = await importInitial()
    const file = await workbook({ rename: true, tags: ['E2E-IMPORT-03', 'E2E-IMPORT-04'] }), p = await preview(file).expect(201)
    expect(p.body.issues).toEqual([])
    await t.db.insert(assetModels).values({ assetTypeId: initial[0].assetTypeId, catalogTag: 'e2e-import-03', modelName: 'E2E Modelo concurrente' })
    const before = await dataSnapshot()
    const rejected = await apply(file, p.body.fingerprint).expect(400)
    expect(rejected.body.errors).toContainEqual(expect.objectContaining({ message: expect.stringContaining('El TAG E2E-IMPORT-03 ya existe') }))
    expect(await dataSnapshot()).toEqual(before)
  })
  it('ignora el fabricante de la columna antigua, aunque esté vacío o mal formado', async () => {
    const file = await workbook({ makers: ['(Solo una nota)', 'E2E Fabricante (sin cierre'] }), p = await preview(file).expect(201)
    expect(p.body.issues).toEqual([])
    expect(p.body.rows.map((r: { manufacturer: string }) => r.manufacturer)).toEqual(['', ''])
    expect(p.body.summary.manufacturers).toEqual({ create: 0, update: 0, merged: 0 })
    await apply(file, p.body.fingerprint).expect(201)
    expect(await t.db.select().from(manufacturers).where(like(manufacturers.name, 'E2E Fabricante%'))).toHaveLength(0)
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
  it('asigna varias redes a los TAG nuevos y conserva las de los modelos existentes', async () => {
    const before = await importInitial()
    const file = await workbook({ rename: true, tags: ['E2E-IMPORT-03', 'E2E-IMPORT-04'] })
    const p = await preview(file, ['FUR-PTE', 'FUR-IOT']).expect(201)
    await apply(file, p.body.fingerprint, ['fur-iot', 'FUR-PTE', 'FUR-IOT']).expect(201)
    for (const model of before) expect((await http().get(`/api/v1/catalog/assets/${model.id}`).expect(200)).body.networkCodes).toEqual(['FUR-PROC'])
    for (const model of (await models()).filter(m => !before.some(b => b.id === m.id))) {
      expect((await http().get(`/api/v1/catalog/assets/${model.id}`).expect(200)).body.networkCodes).toEqual(['FUR-IOT', 'FUR-PTE'])
    }
  })
  it('publica varios componentes y fabricantes por TAG, conserva el texto y valida antes de guardar', async () => {
    const references = [
      { nombre: 'Metso', alcance: 'Bombas de pulpa', sitioWeb: 'https://www.metso.com/' },
      { nombre: 'ABB', alcance: null, sitioWeb: null },
    ]
    const file = await workbook({
      components: [['e2e-import-01', 'Motor, eje. Un solo componente.'], [' E2E-IMPORT-01 ', 'Reductor']],
      references: [['E2E-IMPORT-02', 'WEG', 'Motores', 'https://www.weg.net/'], ['E2E-IMPORT-01', 'Metso', 'Bombas de pulpa', 'https://www.metso.com/'], ['E2E-IMPORT-01', 'ABB', '', '']],
    })
    const p = await preview(file).expect(201)
    expect(p.body.issues).toEqual([])
    expect(p.body.rows[0]).toMatchObject({ components: ['Motor, eje. Un solo componente.', 'Reductor'], referenceManufacturers: references })
    expect(p.body.rows[1].components).toEqual([])
    const before = await models()
    const badFile = await workbook({ references: [['E2E-IMPORT-01', 'Metso', '', 'javascript:alert(1)']] })
    const bad = await preview(badFile).expect(201)
    expect(bad.body.issues).toContainEqual(expect.objectContaining({ sheet: 'Fabricantes de referencia', row: 2 }))
    await apply(badFile, bad.body.fingerprint).expect(400)
    expect(await models()).toEqual(before)
    await apply(file, p.body.fingerprint).expect(201)
    const one = (await models()).find(m => m.catalogTag === 'E2E-IMPORT-01')!
    const two = (await models()).find(m => m.catalogTag === 'E2E-IMPORT-02')!
    expect((await http().get(`/api/v1/catalog/assets/${one.id}`).expect(200)).body.technicalData).toMatchObject({
      componentes: ['Motor, eje. Un solo componente.', 'Reductor'], fabricantesReferencia: references,
    })
    expect((await http().get(`/api/v1/catalog/assets/${two.id}`).expect(200)).body.technicalData).toMatchObject({
      componentes: [], fabricantesReferencia: [{ nombre: 'WEG', alcance: 'Motores', sitioWeb: 'https://www.weg.net/' }],
    })
    const list = (await http().get('/api/v1/catalog/assets?search=E2E-IMPORT').expect(200)).body.items
    expect(list.find((m: { id: string }) => m.id === one.id).technicalData.fabricantesReferencia).toEqual(references)
  })
  it('bloquea reimportaciones con referencias cambiadas, vacías o sin hoja de referencias', async () => {
    const file = await workbook({ references: [['E2E-IMPORT-01', 'Siemens', 'Motor', 'https://www.siemens.com/']] })
    const p = await preview(file).expect(201)
    await apply(file, p.body.fingerprint).expect(201)
    const before = await dataSnapshot()
    for (const options of [{ references: [['E2E-IMPORT-01', 'ABB', '', '']] }, { components: [], references: [] }, {}]) {
      const changed = await workbook(options), analysis = await preview(changed).expect(201)
      expect(analysis.body.issues.filter((i: { code?: string }) => i.code === 'TAG_ALREADY_EXISTS')).toHaveLength(2)
      await apply(changed, analysis.body.fingerprint).expect(400)
      expect(await dataSnapshot()).toEqual(before)
    }
  })
  it('no modifica fabricantes anteriores ni los de activos físicos al importar', async () => {
    const before = await importInitial()
    const [maker] = await t.db.insert(manufacturers).values({ name: 'E2E Fabricante (INV-060)' }).returning()
    const plant = await t.plant('import-makers', 'PUBLIC')
    const [physical] = await t.db.insert(assets).values({ plantId: plant.id, assetModelId: before[0].id, manufacturerId: maker.id, furCode: 'E2E-IMPORT-MAKER-001', tag: 'E2E-MAKER', name: 'E2E Activo con fabricante' }).returning()
    const file = await workbook({ rename: true, tags: ['E2E-IMPORT-03', 'E2E-IMPORT-04'] }), p = await preview(file).expect(201)
    await apply(file, p.body.fingerprint).expect(201)
    expect((await t.db.select().from(assets).where(eq(assets.id, physical.id)))[0].manufacturerId).toBe(maker.id)
    expect(await t.db.select().from(manufacturers).where(eq(manufacturers.id, maker.id))).toHaveLength(1)
  })
  it('mantiene la vinculación de modelos anteriores sin TAG sin permitir repetir los TAG asignados', async () => {
    const initial = await importInitial()
    await t.db.update(assetModels).set({ catalogTag: null, imageKey: 'catalog/legacy.png', technicalData: { fabricantesReferencia: [{ nombre: 'Referencia anterior' }] } }).where(like(assetModels.catalogTag, 'E2E-IMPORT-%'))
    const file = await workbook(), p = await preview(file).expect(201)
    expect(p.body.issues).toEqual([])
    expect(p.body.summary.models).toEqual({ create: 0, update: 2 })
    await apply(file, p.body.fingerprint).expect(201)
    const after = await models()
    expect(after.map(m => m.id).sort()).toEqual(initial.map(m => m.id).sort())
    for (const model of after) expect(model).toMatchObject({ imageKey: 'catalog/legacy.png', technicalData: { fabricantesReferencia: [{ nombre: 'Referencia anterior' }] } })
    const again = await preview(file).expect(201)
    expect(again.body.issues.filter((i: { code?: string }) => i.code === 'TAG_ALREADY_EXISTS')).toHaveLength(2)
    await apply(file, again.body.fingerprint).expect(400)
    expect(await models()).toEqual(after)
  })
})
