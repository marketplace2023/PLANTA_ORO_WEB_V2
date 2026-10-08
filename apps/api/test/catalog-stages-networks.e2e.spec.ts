import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type ModelRow = { modelName: string; type: { code: string; stageCodes: string[]; networkCodes: string[] } }

describe('Catálogo filtrado por etapa y red transversal (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())
  let admin: Session
  let pa: Session
  let typeA: string
  let typeB: string

  const send = (method: 'post' | 'patch', url: string, s: Session, body: object) => http()[method](url).set('Authorization', bearer(s)).send(body)
  /** Por defecto solo los modelos de la prueba (el catálogo de desarrollo tiene muchos más). */
  const models = async (query: string, search: string | null = 'E2E Modelo') =>
    (await http().get(`/api/v1/catalog/assets?pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ''}${query}`).expect(200)).body.items as ModelRow[]
  const names = (rows: ModelRow[]) => rows.map((r) => r.modelName).filter((n) => n.startsWith('E2E ')).sort()

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const plant = await t.plant('catsn', 'PUBLIC')
    const [, paU] = await Promise.all([t.user('admin', { isGlobalAdmin: true }), t.user('pa')])
    await t.assign(paU.id, plant.id, 'PLANT_ADMIN')
    ;[admin, pa] = await Promise.all(['admin', 'pa'].map((n) => login(app, n)))

    // Tipo A: molienda (D06) en la red de potencia; tipo B: espesamiento (D10) en procesos e IoT; tipo C: sin asignar.
    const a = await send('post', '/api/v1/catalog/types', admin, { familyCode: 'MOLINOS', code: 'E2E_TIPO_A', name: 'E2E Tipo A', stageCodes: ['D06'], networkCodes: ['FUR-PTE'] }).expect(201)
    const b = await send('post', '/api/v1/catalog/types', admin, { familyCode: 'ESPESADORES', code: 'E2E_TIPO_B', name: 'E2E Tipo B', stageCodes: ['d10', 'D06'], networkCodes: ['FUR-PROC', 'FUR-IOT'] }).expect(201)
    await send('post', '/api/v1/catalog/types', admin, { familyCode: 'MOLINOS', code: 'E2E_TIPO_C', name: 'E2E Tipo C' }).expect(201)
    typeA = a.body.id
    typeB = b.body.id
    for (const [type, name] of [['E2E_TIPO_A', 'E2E Modelo A'], ['E2E_TIPO_B', 'E2E Modelo B'], ['E2E_TIPO_C', 'E2E Modelo C']]) {
      await send('post', '/api/v1/catalog/models', admin, { typeCode: type, modelName: name }).expect(201)
    }
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  it('el tipo guarda sus etapas y redes (códigos en mayúsculas, sin repetir) y se exponen en /catalog/types', async () => {
    const types = (await http().get('/api/v1/catalog/types').expect(200)).body as Array<{ code: string; stageCodes: string[]; networkCodes: string[] }>
    expect(types.find((x) => x.code === 'E2E_TIPO_A')).toMatchObject({ stageCodes: ['D06'], networkCodes: ['FUR-PTE'] })
    expect(types.find((x) => x.code === 'E2E_TIPO_B')).toMatchObject({ stageCodes: ['D06', 'D10'], networkCodes: ['FUR-IOT', 'FUR-PROC'] })
    expect(types.find((x) => x.code === 'E2E_TIPO_C')).toMatchObject({ stageCodes: [], networkCodes: [] })
  })

  it('cada modelo trae las etapas y redes de su tipo', async () => {
    const rows = await models('', 'E2E Modelo A')
    expect(rows[0].type).toMatchObject({ code: 'E2E_TIPO_A', stageCodes: ['D06'], networkCodes: ['FUR-PTE'] })
  })

  it('filtra por etapa (primer filtro)', async () => {
    expect(names(await models('&stage=D06'))).toEqual(['E2E Modelo A', 'E2E Modelo B'])
    expect(names(await models('&stage=D10'))).toEqual(['E2E Modelo B'])
    expect(names(await models('&stage=d10'))).toEqual(['E2E Modelo B'])
    expect(names(await models('&stage=D20'))).toEqual([])
  })

  it('filtra por red transversal (segundo filtro) y se combina con la etapa', async () => {
    expect(names(await models('&network=FUR-PTE'))).toEqual(['E2E Modelo A'])
    expect(names(await models('&network=FUR-IOT'))).toEqual(['E2E Modelo B'])
    expect(names(await models('&stage=D06&network=FUR-PROC'))).toEqual(['E2E Modelo B'])
    expect(names(await models('&stage=D10&network=FUR-PTE'))).toEqual([])
  })

  it('los tipos sin asignar solo aparecen cuando no se filtra por etapa ni red', async () => {
    expect(names(await models(''))).toEqual(['E2E Modelo A', 'E2E Modelo B', 'E2E Modelo C'])
    expect(names(await models('&stage=D06')).includes('E2E Modelo C')).toBe(false)
  })

  it('el total paginado respeta los filtros', async () => {
    const res = await http().get('/api/v1/catalog/assets?pageSize=1&stage=D10&network=FUR-PROC&search=E2E%20Modelo').expect(200)
    expect(res.body.total).toBe(1)
  })

  it('los tipos base ya vienen asignados por el seed: molino de bolas en molienda y potencia; el CCM en todas las etapas', async () => {
    const types = (await http().get('/api/v1/catalog/types').expect(200)).body as Array<{ code: string; stageCodes: string[]; networkCodes: string[] }>
    const byCode = new Map(types.map((x) => [x.code, x]))
    expect(byCode.get('MOLINO_BOLAS')?.stageCodes).toEqual(expect.arrayContaining(['D06', 'D07']))
    expect(byCode.get('MOLINO_BOLAS')?.networkCodes).toEqual(expect.arrayContaining(['FUR-PTE']))
    expect(byCode.get('HORNO_FUNDICION')?.stageCodes).toEqual(['D16', 'D17'])
    expect(byCode.get('CCM')?.stageCodes).toHaveLength(20)
    // ningún tipo base queda sin etapa ni red
    const base = types.filter((x) => !x.code.startsWith('E2E_'))
    expect(base.filter((x) => x.stageCodes.length === 0).map((x) => x.code)).toEqual([])
    expect(base.filter((x) => x.networkCodes.length === 0).map((x) => x.code)).toEqual([])
  })

  describe('edición (solo el administrador del ecosistema)', () => {
    it('reemplaza las etapas y redes; lo que no se envía no se toca', async () => {
      await send('patch', `/api/v1/catalog/types/${typeA}`, admin, { stageCodes: ['D07', 'D08'] }).expect(200)
      expect(names(await models('&stage=D06')).includes('E2E Modelo A')).toBe(false)
      expect(names(await models('&stage=D08'))).toEqual(['E2E Modelo A'])
      // las redes no se enviaron: siguen igual
      expect(names(await models('&network=FUR-PTE'))).toEqual(['E2E Modelo A'])

      await send('patch', `/api/v1/catalog/types/${typeA}`, admin, { networkCodes: [] }).expect(200)
      expect(names(await models('&network=FUR-PTE'))).toEqual([])
      expect(names(await models('&stage=D08'))).toEqual(['E2E Modelo A'])
    })

    it('se puede cambiar solo el nombre sin perder las asignaciones', async () => {
      await send('patch', `/api/v1/catalog/types/${typeB}`, admin, { name: 'E2E Tipo B renombrado' }).expect(200)
      expect(names(await models('&stage=D10'))).toEqual(['E2E Modelo B'])
    })

    it('rechaza etapas o redes que no existen y no deja el tipo a medias', async () => {
      const bad = await send('post', '/api/v1/catalog/types', admin, { familyCode: 'MOLINOS', code: 'E2E_TIPO_D', name: 'E2E Tipo D', stageCodes: ['D99'] }).expect(400)
      expect(JSON.stringify(bad.body)).toContain('D99')
      await send('post', '/api/v1/catalog/types', admin, { familyCode: 'MOLINOS', code: 'E2E_TIPO_D', name: 'E2E Tipo D', networkCodes: ['FUR-NO'] }).expect(400)
      const types = (await http().get('/api/v1/catalog/types').expect(200)).body as Array<{ code: string }>
      expect(types.some((x) => x.code === 'E2E_TIPO_D')).toBe(false)
      await send('patch', `/api/v1/catalog/types/${typeA}`, admin, { stageCodes: ['D99'] }).expect(400)
      expect(names(await models('&stage=D08'))).toEqual(['E2E Modelo A'])
    })

    it('un administrador de planta no puede cambiarlas', async () => {
      await send('patch', `/api/v1/catalog/types/${typeA}`, pa, { stageCodes: ['D01'] }).expect(403)
      await send('post', '/api/v1/catalog/types', pa, { familyCode: 'MOLINOS', code: 'E2E_TIPO_E', name: 'E2E Tipo E', stageCodes: ['D01'] }).expect(403)
    })
  })
})
