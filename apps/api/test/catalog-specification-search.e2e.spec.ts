import type { INestApplication } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { assetModels } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Búsqueda por especificaciones del catálogo', () => {
  let app: INestApplication, t: TestDb, admin: Session
  let motor: string, numericMotor: string, inlineMotor: string, inactive: string, inName: string, inSpecs: string
  const search = (text: string, filters: Record<string, string | number> = {}, session?: Session) => {
    const req = request(app.getHttpServer()).get('/api/v1/catalog/assets').query({ search: text, ...filters })
    return (session ? req.set('Authorization', bearer(session)) : req).expect(200)
  }
  const ids = (body: { items: Array<{ id: string }> }) => body.items.map(m => m.id)
  const model = async (name: string, specs: Record<string, unknown>, type = 'MOLINO_BOLAS') => {
    const row = await t.model(type, `E2E ${name}`)
    await t.db.update(assetModels).set({ specifications: specs }).where(eq(assetModels.id, row.id))
    return row.id
  }

  beforeAll(async () => {
    t = new TestDb()
    await t.cleanup()
    app = await createApp()
    await t.user('specification-search-admin', { isGlobalAdmin: true })
    admin = await login(app, 'specification-search-admin')
    motor = await model('Motor principal', { 'Potencia nominal (hp)': '5', 'Tensión nominal (V)': '220', 'Protección': 'Acero inoxidable' })
    numericMotor = await model('Motor secundario', { 'Potencia nominal (HP)': 5, 'Tensión nominal (V)': '110' })
    inlineMotor = await model('Motor auxiliar', { 'Potencia': '≈ 5 hp', 'Caudal (m³/h)': '0,5' })
    await model('Motor de quince', { 'Potencia nominal (hp)': '15' })
    await model('Motor de cincuenta', { 'Potencia nominal (hp)': '50' })
    await model('Motor de cinco y medio', { 'Potencia nominal (hp)': '5.5' })
    await model('Motor con unidades distintas', { 'Potencia nominal (kW)': '5', 'Otra potencia (hp)': '15' })
    await model('Motor sin valores', { 'Potencia nominal (hp)': 'No aplica', 'Protección': null, 'Material': '', 'Campo fantasma': ' NO   APLICA ' })
    await model('Bomba de cinco', { 'Potencia nominal (hp)': '5' }, 'BOMBA_CENTRIFUGA_PULPA')
    inactive = await model('Motor inactivo', { 'Potencia nominal (hp)': '5' })
    await t.db.update(assetModels).set({ status: 'INACTIVE' }).where(eq(assetModels.id, inactive))
    inName = await model('Zafiro de prueba', {})
    inSpecs = await model('Aparato de prueba', { 'Acabado': 'Zafiro' })
    await t.originLinks(motor, ['D01'], ['FUR-PROC'])
    await t.originLinks(numericMotor, ['D02'], ['FUR-PTE'])
  })

  afterAll(async () => { await t.cleanup(); await t.close(); await app.close() })

  it.each(['motor 5hp', '5 HP motor', 'motor de 5 hp', 'motores 5,0hp', 'MÓTOR 5.00 HP'])(
    'busca cantidades sin confundir 5 hp con 15 hp, 50 hp, 5.5 hp ni 5 kW: %s', async query => {
      const { body } = await search(query)
      expect(body.total).toBe(3)
      expect(new Set(ids(body))).toEqual(new Set([motor, numericMotor, inlineMotor]))
    },
  )

  it('combina nombre, parámetro, valor y varias unidades entre campos y en cualquier orden', async () => {
    expect(ids((await search('220v 5hp nominal motor')).body)).toEqual([motor])
    expect(ids((await search('motor inoxidable acero')).body)).toEqual([motor])
    expect(ids((await search('motor 0.50m3/h')).body)).toEqual([inlineMotor])
    expect((await search('motor 5hp 999v')).body.total).toBe(0)
  })

  it('permite buscar solo la cantidad y la unidad sin conocer el nombre del equipo', async () => {
    expect((await search('5hp')).body.total).toBe(4)
  })

  it('mantiene familia, etapa, red y total de páginas, sin duplicados por especificaciones', async () => {
    const first = (await search('motor 5hp', { family: 'MOLINOS', pageSize: 1 })).body
    const second = (await search('motor 5hp', { family: 'MOLINOS', pageSize: 1, page: 2 })).body
    expect(first).toMatchObject({ total: 3, pageSize: 1, page: 1 })
    expect(second).toMatchObject({ total: 3, pageSize: 1, page: 2 })
    expect(ids(first)[0]).not.toBe(ids(second)[0])
    expect(ids((await search('motor 5hp', { family: 'MOLINOS', stage: 'D01', network: 'FUR-PROC' })).body)).toEqual([motor])
    expect((await search('motor 5hp', { stage: 'D01', network: 'FUR-PTE' })).body.total).toBe(0)
    expect((await search('motor 5hp', { family: 'BOMBAS' })).body.total).toBe(0)
  })

  it('respeta la visibilidad de modelos inactivos al buscar por especificaciones', async () => {
    expect(ids((await search('motor 5hp', { status: 'ALL' })).body)).not.toContain(inactive)
    expect(ids((await search('motor 5hp', { status: 'ALL' }, admin)).body)).toContain(inactive)
  })

  it('prioriza las coincidencias del nombre sobre las especificaciones', async () => {
    expect(ids((await search('zafiro')).body)).toEqual([inName, inSpecs])
  })

  it('omite los parámetros cuyo valor es No aplica, incluso con mayúsculas y espacios', async () => {
    expect((await search('campo fantasma')).body.total).toBe(0)
  })

  it('busca valores actuales inmediatamente después de editar o eliminar especificaciones', async () => {
    await t.db.update(assetModels).set({ specifications: { 'Potencia nominal (hp)': '7,5' } }).where(eq(assetModels.id, motor))
    expect(ids((await search('motor 5hp')).body)).not.toContain(motor)
    expect(ids((await search('motor 7.5hp')).body)).toEqual([motor])
    await t.db.update(assetModels).set({ specifications: {} }).where(eq(assetModels.id, motor))
    expect(ids((await search('motor 7.5hp')).body)).toEqual([])
  })
})
