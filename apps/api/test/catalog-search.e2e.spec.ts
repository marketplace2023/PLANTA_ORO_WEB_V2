import type { INestApplication } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { assetModels, assetTypes } from '../src/database/schema'
import { createApp, TestDb } from './helpers'

describe('Búsqueda del catálogo sin acentos ni distinción de mayúsculas', () => {
  let app: INestApplication, t: TestDb
  let camera: string, plainCamera: string, tagged: string, typed: string, maker: string, literal: string
  const search = (text: string, filters: Record<string, string | number> = {}) =>
    request(app.getHttpServer()).get('/api/v1/catalog/assets').query({ search: text, ...filters }).expect(200)
  const ids = (body: { items: Array<{ id: string }> }) => body.items.map(m => m.id)

  beforeAll(async () => {
    t = new TestDb()
    await t.cleanup()
    app = await createApp()
    camera = (await t.model('MOLINO_BOLAS', 'E2E Cámara de prueba')).id
    plainCamera = (await t.model('MOLINO_BOLAS', 'E2E Camara sin acento')).id
    tagged = (await t.model('MOLINO_BOLAS', 'E2E Modelo con TAG')).id
    await t.db.update(assetModels).set({ catalogTag: 'E2E-ÓPTICO-001' }).where(eq(assetModels.id, tagged))
    const [baseType] = await t.db.select().from(assetTypes).where(eq(assetTypes.code, 'MOLINO_BOLAS'))
    await t.db.insert(assetTypes).values({ code: 'E2E_BUSQUEDA', name: 'E2E Transmisión', familyId: baseType.familyId })
    typed = (await t.model('E2E_BUSQUEDA', 'E2E Modelo por tipo')).id
    maker = (await t.model('MOLINO_BOLAS', 'E2E Modelo por fabricante', 'E2E Fábrica Álvarez')).id
    literal = (await t.model('MOLINO_BOLAS', 'E2E Cámara 100%_\\')).id
    await t.originLinks(camera, ['D01'], ['FUR-PROC'])
    await t.originLinks(plainCamera, ['D02'], ['FUR-PTE'])
    await t.originLinks(literal, ['D01'], ['FUR-PROC'])
    const inactive = await t.model('MOLINO_BOLAS', 'E2E Cámara inactiva')
    await t.db.update(assetModels).set({ status: 'INACTIVE' }).where(eq(assetModels.id, inactive.id))
  })

  afterAll(async () => { await t.cleanup(); await t.close(); await app.close() })

  it.each(['E2E camara', 'E2E cámara', 'E2E Camara', 'E2E CÁMARA', 'E2E ca\u0301mara'])(
    'encuentra los mismos modelos activos con %s', async text => {
      const { body } = await search(text)
      expect(body.total).toBe(3)
      expect(new Set(ids(body))).toEqual(new Set([camera, plainCamera, literal]))
    },
  )

  it('también normaliza el TAG, el tipo y los fabricantes de referencia', async () => {
    expect(ids((await search('e2e-optico')).body)).toEqual([tagged])
    expect(ids((await search('E2E TRANSMISION')).body)).toEqual([typed])
    expect(ids((await search('e2e fabrica alvarez')).body)).toEqual([maker])
  })

  it('conserva los filtros y el total al paginar los resultados normalizados', async () => {
    const filters = { family: 'MOLINOS', stage: 'D01', network: 'FUR-PROC', pageSize: 1 }
    const first = (await search('E2E CAMARA', filters)).body
    const second = (await search('E2E CÁMARA', { ...filters, page: 2 })).body
    expect(first).toMatchObject({ total: 2, page: 1, pageSize: 1 })
    expect(second).toMatchObject({ total: 2, page: 2, pageSize: 1 })
    expect(new Set([...ids(first), ...ids(second)])).toEqual(new Set([camera, literal]))
    expect((await search('E2E camara', { ...filters, network: 'FUR-PTE' })).body.total).toBe(0)
  })

  it('sigue tratando los caracteres de LIKE como texto literal', async () => {
    expect(ids((await search('E2E CAMARA 100%_\\')).body)).toEqual([literal])
    expect((await search('E2E CAMARA 100%_\\otro')).body.total).toBe(0)
  })
})
