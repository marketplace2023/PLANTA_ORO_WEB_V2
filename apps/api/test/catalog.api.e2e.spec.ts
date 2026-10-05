import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createApp, TestDb } from './helpers'

describe('Catálogo global de activos (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    await t.model('MOLINO_BOLAS', 'E2E Bolas 10x14', 'E2E Fabricante Uno')
    await t.model('MOLINO_BOLAS', 'E2E Bolas 12x18', 'E2E Fabricante Dos')
    await t.model('BOMBA_CENTRIFUGA_PULPA', 'E2E Pulpa 6x4', 'E2E Fabricante Uno')
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  it('es de lectura pública (sin sesión)', async () => {
    await http().get('/api/v1/catalog/families').expect(200)
    await http().get('/api/v1/catalog/assets').expect(200)
  })

  it('familias y tipos base del seed', async () => {
    const families = await http().get('/api/v1/catalog/families').expect(200)
    const codes = families.body.map((f: { code: string }) => f.code)
    expect(codes).toEqual(expect.arrayContaining(['BOMBAS', 'MOLINOS', 'MOTORES', 'VALVULAS', 'TRANSFORMADORES', 'INSTRUMENTOS']))

    const types = await http().get('/api/v1/catalog/types?family=MOLINOS').expect(200)
    expect(types.body.map((x: { code: string }) => x.code).sort()).toEqual(['MOLINO_BOLAS', 'MOLINO_SAG'])
    expect(types.body.every((x: { familyCode: string }) => x.familyCode === 'MOLINOS')).toBe(true)
  })

  it('modelos: filtra por familia, tipo, fabricante y búsqueda', async () => {
    const byFamily = await http().get('/api/v1/catalog/assets?family=MOLINOS&search=E2E').expect(200)
    expect(byFamily.body.items.map((m: { modelName: string }) => m.modelName).sort()).toEqual(['E2E Bolas 10x14', 'E2E Bolas 12x18'])
    expect(byFamily.body.items[0]).toMatchObject({
      family: { code: 'MOLINOS' },
      type: { code: 'MOLINO_BOLAS', name: 'Molino de bolas' },
      manufacturer: { countryCode: 'PE' },
      specifications: { powerKw: 100 },
    })

    const byType = await http().get('/api/v1/catalog/assets?type=BOMBA_CENTRIFUGA_PULPA&search=E2E').expect(200)
    expect(byType.body.total).toBe(1)

    const makers = await http().get('/api/v1/catalog/manufacturers').expect(200)
    const uno = makers.body.find((m: { name: string }) => m.name === 'E2E Fabricante Uno')
    const byMaker = await http().get(`/api/v1/catalog/assets?manufacturerId=${uno.id}`).expect(200)
    expect(byMaker.body.items.map((m: { modelName: string }) => m.modelName).sort()).toEqual(['E2E Bolas 10x14', 'E2E Pulpa 6x4'])

    const bySearch = await http().get('/api/v1/catalog/assets?search=fabricante dos').expect(200)
    expect(bySearch.body.items.map((m: { modelName: string }) => m.modelName)).toEqual(['E2E Bolas 12x18'])
  })

  it('la búsqueda trata % y _ como texto literal (no como comodines)', async () => {
    const res = await http().get('/api/v1/catalog/assets?search=%25').expect(200)
    expect(res.body.total).toBe(0)
  })

  it('pagina y valida los parámetros', async () => {
    const p1 = await http().get('/api/v1/catalog/assets?search=E2E&pageSize=2&page=1').expect(200)
    const p2 = await http().get('/api/v1/catalog/assets?search=E2E&pageSize=2&page=2').expect(200)
    expect(p1.body).toMatchObject({ total: 3, page: 1, pageSize: 2 })
    expect(p1.body.items).toHaveLength(2)
    expect(p2.body.items).toHaveLength(1)

    await http().get('/api/v1/catalog/assets?pageSize=101').expect(400)
    await http().get('/api/v1/catalog/assets?page=0').expect(400)
    await http().get('/api/v1/catalog/assets?manufacturerId=no-uuid').expect(400)
  })

  it('detalle de un modelo: 200, 404 y 400', async () => {
    const list = await http().get('/api/v1/catalog/assets?search=E2E Pulpa').expect(200)
    const id = list.body.items[0].id
    const res = await http().get(`/api/v1/catalog/assets/${id}`).expect(200)
    expect(res.body.modelName).toBe('E2E Pulpa 6x4')
    await http().get('/api/v1/catalog/assets/018f0000-0000-7000-8000-000000000000').expect(404)
    await http().get('/api/v1/catalog/assets/no-es-uuid').expect(400)
  })
})
