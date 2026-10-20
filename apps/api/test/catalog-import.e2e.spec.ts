import type { INestApplication } from '@nestjs/common'
import ExcelJS from 'exceljs'
import { eq, like } from 'drizzle-orm'
import request from 'supertest'
import { assetFamilies, assetModels, assetTypes, manufacturers } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

async function workbook(options: { duplicate?: boolean; orphan?: boolean; rename?: boolean; splitFamily?: boolean } = {}) {
  const book = new ExcelJS.Workbook()
  const master = book.addWorksheet('Listado maestro')
  master.addRows([
    ['TAG ACTIVO', 'Nombre', 'Código CA', 'Categoría N4', 'Tipo', 'Fabricante / modelo', 'Denominación de etapa'],
    ['E2E-IMPORT-01', options.rename ? 'E2E Modelo renombrado' : 'E2E Modelo uno', '97', '97 — E2E familia (por verificar)', 'E2E Tipo maestro', 'E2E Fabricante', 'Molienda primaria'],
    [options.duplicate ? 'E2E-IMPORT-01' : 'E2E-IMPORT-02', 'E2E Modelo dos', options.splitFamily ? '98' : '97', '97 — E2E familia', 'E2E Tipo maestro', 'E2E Fabricante', 'Molienda secundaria'],
  ])
  book.addWorksheet('Categorías N4').addRows([['Código CA', 'Categoría N4'], ['97', options.rename ? 'E2E Familia renombrada' : 'E2E Familia canónica'], ['98', 'E2E Otra familia']])
  book.addWorksheet('Características').addRows([
    ['TAG ACTIVO', 'Componentes principales'], ['E2E-IMPORT-02', 'Motor, tambor, corona. Un solo componente.'], ['E2E-IMPORT-01', 'Motor, reductor, eje.'],
  ])
  book.addWorksheet('Especificaciones').addRows([
    ['TAG ACTIVO', 'Parámetro técnico', 'Unidad', 'Valor / estado'],
    [options.orphan ? 'E2E-NO-EXISTE' : 'E2E-IMPORT-02', 'Potencia del motor', 'kW', options.rename ? '80–100' : '7,5–75'],
    ['E2E-IMPORT-01', 'Material', '—', 'Acero'],
    [null, null, null, null],
  ])
  return Buffer.from(await book.xlsx.writeBuffer())
}

describe('Importación del listado maestro del catálogo (e2e)', () => {
  let app: INestApplication, t: TestDb, admin: Session, ordinary: Session
  const http = () => request(app.getHttpServer())
  const preview = (file: Buffer) => http().post('/api/v1/catalog/imports/preview').set('Authorization', bearer(admin)).attach('file', file, 'maestro.xlsx')
  const apply = (file: Buffer, fingerprint: string) => http().post('/api/v1/catalog/imports').set('Authorization', bearer(admin)).field('fingerprint', fingerprint).attach('file', file, 'maestro.xlsx')
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
  it('la vista previa unifica por Código CA y cruza las hojas por TAG, sin escribir', async () => {
    const p = await preview(await workbook()).expect(201)
    expect(p.body.issues).toEqual([])
    expect(p.body.summary).toMatchObject({ models: { create: 2, update: 0 }, families: { create: 1, update: 0 }, types: { create: 1, update: 0 }, specifications: 2 })
    expect(p.body.rows[1]).toMatchObject({ tag: 'E2E-IMPORT-02', family: 'E2E Familia canónica', stages: ['D06'], components: ['Motor, tambor, corona. Un solo componente.'], specifications: { 'Potencia del motor (kW)': '7,5–75' } })
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
    expect(m).toMatchObject({ specifications: { 'Potencia del motor (kW)': '7,5–75' }, technicalData: { componentes: ['Motor, tambor, corona. Un solo componente.'] }, stageCodes: ['D06'], imageUrl: null, type: { networkCodes: ['FUR-PROC'] } })
    // La misma vista previa ya no autoriza volver a aplicar sobre un catálogo diferente.
    await apply(file, p.body.fingerprint).expect(409)
  })
  it('actualiza por TAG y Código CA aunque cambien nombres, manteniendo los IDs', async () => {
    const before = await models()
    await t.db.update(assetModels).set({ imageKey: 'catalog/e2e.png', technicalData: { identificacion: { Proyecto: 'E2E' }, fuente: 'Referencia previa' } }).where(eq(assetModels.id, before[0].id))
    const family = (await t.db.select().from(assetFamilies).where(eq(assetFamilies.categoryCode, '97')))[0]
    const file = await workbook({ rename: true }), p = await preview(file).expect(201)
    expect(p.body.summary.models).toEqual({ create: 0, update: 2 })
    expect(p.body.summary.families).toEqual({ create: 0, update: 1 })
    await apply(file, p.body.fingerprint).expect(201)
    const after = await models()
    expect(after.map(m => m.id).sort()).toEqual(before.map(m => m.id).sort())
    expect(after.find(m => m.id === before[0].id)).toMatchObject({ imageKey: 'catalog/e2e.png', technicalData: { identificacion: { Proyecto: 'E2E' }, fuente: 'Referencia previa' } })
    expect(after.find(m => m.catalogTag === 'E2E-IMPORT-01')?.modelName).toBe('E2E Modelo renombrado')
    expect(after.find(m => m.catalogTag === 'E2E-IMPORT-02')?.specifications).toEqual({ 'Potencia del motor (kW)': '80–100' })
    expect((await t.db.select().from(assetFamilies).where(eq(assetFamilies.id, family.id)))[0].name).toBe('E2E Familia renombrada')
  })
})
