import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type ModelRow = { id: string; modelName: string; networkCodes: string[]; type: { code: string; stageCodes: string[] } }

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

    const a = await send('post', '/api/v1/catalog/types', admin, { familyCode: 'MOLINOS', code: 'E2E_TIPO_A', name: 'E2E Tipo A', stageCodes: ['D06'] }).expect(201)
    const b = await send('post', '/api/v1/catalog/types', admin, { familyCode: 'ESPESADORES', code: 'E2E_TIPO_B', name: 'E2E Tipo B', stageCodes: ['d10', 'D06'] }).expect(201)
    await send('post', '/api/v1/catalog/types', admin, { familyCode: 'MOLINOS', code: 'E2E_TIPO_C', name: 'E2E Tipo C' }).expect(201)
    typeA = a.body.id
    typeB = b.body.id
    for (const [type, name, networkCodes] of [['E2E_TIPO_A', 'E2E Modelo A', ['fur-pte', 'FUR-PTE']], ['E2E_TIPO_B', 'E2E Modelo B', ['FUR-PROC', 'FUR-IOT']], ['E2E_TIPO_C', 'E2E Modelo C', []]] as const) {
      await send('post', '/api/v1/catalog/models', admin, { typeCode: type, modelName: name, networkCodes }).expect(201)
    }
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  it('los tipos solo exponen sus etapas posibles, sin redes', async () => {
    const types = (await http().get('/api/v1/catalog/types').expect(200)).body as Array<{ code: string; stageCodes: string[] }>
    expect(types.find((x) => x.code === 'E2E_TIPO_A')).toMatchObject({ stageCodes: ['D06'] })
    expect(types.find((x) => x.code === 'E2E_TIPO_B')).toMatchObject({ stageCodes: ['D06', 'D10'] })
    expect(types.find((x) => x.code === 'E2E_TIPO_C')).toMatchObject({ stageCodes: [] })
    expect(types.every(type => !('networkCodes' in type))).toBe(true)
  })

  it('cada modelo trae sus propias redes normalizadas y las etapas posibles del tipo', async () => {
    const rows = await models('', 'E2E Modelo A')
    expect(rows[0].type).toMatchObject({ code: 'E2E_TIPO_A', stageCodes: ['D06'] })
    expect(rows[0].networkCodes).toEqual(['FUR-PTE'])
    expect(rows[0].type).not.toHaveProperty('networkCodes')
  })

  it('filtra por etapa (primer filtro)', async () => {
    expect(names(await models('&stage=D06'))).toEqual(['E2E Modelo A', 'E2E Modelo B'])
    expect(names(await models('&stage=D10'))).toEqual(['E2E Modelo B'])
    expect(names(await models('&stage=d10'))).toEqual(['E2E Modelo B'])
    expect(names(await models('&stage=D19'))).toEqual([])
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

  it('los tipos base conservan sus etapas posibles sin asignación de redes', async () => {
    const types = (await http().get('/api/v1/catalog/types').expect(200)).body as Array<{ code: string; stageCodes: string[] }>
    const byCode = new Map(types.map((x) => [x.code, x]))
    expect(byCode.get('MOLINO_BOLAS')?.stageCodes).toEqual(expect.arrayContaining(['D05', 'D06']))
    expect(byCode.get('HORNO_FUNDICION')?.stageCodes).toEqual(['D16'])
    expect(byCode.get('CCM')?.stageCodes).toHaveLength(19)
    // ningún tipo base queda sin etapa
    const base = types.filter((x) => !x.code.startsWith('E2E_'))
    expect(base.filter((x) => x.stageCodes.length === 0).map((x) => x.code)).toEqual([])
    expect(base.every(x => !('networkCodes' in x))).toBe(true)
  })

  describe('edición (solo el administrador del ecosistema)', () => {
    it('reemplaza las etapas y redes; lo que no se envía no se toca', async () => {
      await send('patch', `/api/v1/catalog/types/${typeA}`, admin, { stageCodes: ['D07', 'D08'] }).expect(200)
      expect(names(await models('&stage=D06')).includes('E2E Modelo A')).toBe(false)
      expect(names(await models('&stage=D08'))).toEqual(['E2E Modelo A'])
      // las redes no se enviaron: siguen igual
      expect(names(await models('&network=FUR-PTE'))).toEqual(['E2E Modelo A'])

      const [modelA] = await models('', 'E2E Modelo A')
      await send('patch', `/api/v1/catalog/models/${modelA.id}`, admin, { networkCodes: [] }).expect(200)
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
      await send('post', '/api/v1/catalog/types', admin, { familyCode: 'MOLINOS', code: 'E2E_TIPO_D', name: 'E2E Tipo D', networkCodes: ['FUR-PTE'] }).expect(400)
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

  it('dos modelos del mismo tipo tienen redes independientes; vacío no hereda de su hermano', async () => {
    const sibling = await send('post', '/api/v1/catalog/models', admin, { typeCode: 'E2E_TIPO_B', modelName: 'E2E Hermano B', networkCodes: ['FUR-PTE'] }).expect(201)
    const original = (await models('', 'E2E Modelo B'))[0]
    expect(original.networkCodes).toEqual(['FUR-IOT', 'FUR-PROC'])
    expect((await models('&network=FUR-PTE', 'E2E Hermano B')).map(m => m.id)).toEqual([sibling.body.id])
    const variableCodes = async (id: string) => (await http().get(`/api/v1/catalog/models/${id}/variables`).expect(200)).body.map((v: { code: string }) => v.code)
    expect(await variableCodes(sibling.body.id)).toContain('POTENCIA_INSTALADA_TOTAL_PTE')
    expect(await variableCodes(original.id)).not.toContain('POTENCIA_INSTALADA_TOTAL_PTE')
    await send('patch', `/api/v1/catalog/models/${sibling.body.id}`, admin, { networkCodes: [] }).expect(200)
    expect((await http().get(`/api/v1/catalog/assets/${sibling.body.id}`).expect(200)).body.networkCodes).toEqual([])
    expect(await variableCodes(sibling.body.id)).not.toContain('POTENCIA_INSTALADA_TOTAL_PTE')
    expect((await models('', 'E2E Modelo B'))[0].networkCodes).toEqual(original.networkCodes)
    await send('patch', `/api/v1/catalog/models/${sibling.body.id}`, admin, { modelName: 'E2E Hermano B renombrado', networkCodes: ['FUR-NO'] }).expect(400)
    expect((await http().get(`/api/v1/catalog/assets/${sibling.body.id}`).expect(200)).body.modelName).toBe('E2E Hermano B')
    await send('patch', `/api/v1/catalog/models/${sibling.body.id}`, pa, { networkCodes: ['FUR-PTE'] }).expect(403)
  })
})
