import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type ModelRow = { id: string; modelName: string; stageCodes: string[]; stageInherited: boolean; type: { code: string; stageCodes: string[] } }

/** Las etapas del tipo son las posibles; cada modelo declara las etapas donde realmente participa. */
describe('Etapas por modelo del catálogo (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())
  let admin: Session
  let pa: Session
  let idPartial: string
  let idInherit: string
  let typeId: string

  const send = (method: 'post' | 'patch', url: string, s: Session, body: object) => http()[method](url).set('Authorization', bearer(s)).send(body)
  const catalog = async (query: string) =>
    ((await http().get(`/api/v1/catalog/assets?pageSize=100&search=${encodeURIComponent('E2E MS')}${query}`).expect(200)).body.items as ModelRow[]).filter((m) => m.modelName.startsWith('E2E MS'))
  const names = (rows: ModelRow[]) => rows.map((r) => r.modelName).sort()

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    await Promise.all([t.user('admin', { isGlobalAdmin: true }), t.user('pa')])
    ;[admin, pa] = await Promise.all(['admin', 'pa'].map((n) => login(app, n)))
    // Tipo con tres etapas posibles; un modelo participa solo en algunas y otro hereda todas.
    const type = await send('post', '/api/v1/catalog/types', admin, { familyCode: 'MOLINOS', code: 'E2E_MS_TIPO', name: 'E2E MS Tipo', stageCodes: ['D05', 'D06', 'D07'], networkCodes: ['FUR-PROC'] }).expect(201)
    typeId = type.body.id
    idInherit = (await send('post', '/api/v1/catalog/models', admin, { typeCode: 'E2E_MS_TIPO', modelName: 'E2E MS Hereda' }).expect(201)).body.id
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  it('un modelo sin etapas propias hereda todas las del tipo', async () => {
    const [m] = await catalog('')
    expect(m).toMatchObject({ modelName: 'E2E MS Hereda', stageCodes: ['D05', 'D06', 'D07'], stageInherited: true })
    expect(m.type.stageCodes).toEqual(['D05', 'D06', 'D07'])
  })

  it('al crear un modelo se declaran las etapas donde participa (subconjunto de las posibles del tipo)', async () => {
    const res = await send('post', '/api/v1/catalog/models', admin, { typeCode: 'E2E_MS_TIPO', modelName: 'E2E MS Parcial', stageCodes: ['d06', 'D05'] }).expect(201)
    idPartial = res.body.id
    expect(res.body).toMatchObject({ stageCodes: ['D05', 'D06'], stageInherited: false })
    const rows = await catalog('')
    expect(rows.find((m) => m.id === idPartial)).toMatchObject({ stageCodes: ['D05', 'D06'], stageInherited: false })
    // Las del tipo siguen siendo las posibles.
    expect(rows.find((m) => m.id === idPartial)!.type.stageCodes).toEqual(['D05', 'D06', 'D07'])
  })

  it('rechaza etapas que el tipo no admite, y no crea el modelo a medias', async () => {
    const bad = await send('post', '/api/v1/catalog/models', admin, { typeCode: 'E2E_MS_TIPO', modelName: 'E2E MS Fuera', stageCodes: ['D06', 'D12'] }).expect(400)
    expect(JSON.stringify(bad.body)).toMatch(/D12/)
    expect(names(await catalog(''))).not.toContain('E2E MS Fuera')
    await send('patch', `/api/v1/catalog/models/${idPartial}`, admin, { stageCodes: ['D12'] }).expect(400)
    await send('post', '/api/v1/catalog/models', admin, { typeCode: 'E2E_MS_TIPO', modelName: 'E2E MS Inexistente', stageCodes: ['D99'] }).expect(400)
  })

  it('el filtro por etapa usa las del modelo: el parcial no aparece en D07 aunque su tipo la admita', async () => {
    expect(names(await catalog('&stage=D06'))).toEqual(['E2E MS Hereda', 'E2E MS Parcial'])
    expect(names(await catalog('&stage=D07'))).toEqual(['E2E MS Hereda'])
    expect(names(await catalog('&stage=D12'))).toEqual([])
  })

  it('se editan las etapas del modelo; marcar todas (o ninguna) vuelve a heredar', async () => {
    const one = await send('patch', `/api/v1/catalog/models/${idPartial}`, admin, { stageCodes: ['D07'] }).expect(200)
    expect(one.body).toMatchObject({ stageCodes: ['D07'], stageInherited: false })
    expect(names(await catalog('&stage=D07'))).toEqual(['E2E MS Hereda', 'E2E MS Parcial'])

    const all = await send('patch', `/api/v1/catalog/models/${idPartial}`, admin, { stageCodes: ['D05', 'D06', 'D07'] }).expect(200)
    expect(all.body).toMatchObject({ stageCodes: ['D05', 'D06', 'D07'], stageInherited: true })
    await send('patch', `/api/v1/catalog/models/${idPartial}`, admin, { stageCodes: ['D06'] }).expect(200)
    const none = await send('patch', `/api/v1/catalog/models/${idPartial}`, admin, { stageCodes: [] }).expect(200)
    expect(none.body).toMatchObject({ stageCodes: ['D05', 'D06', 'D07'], stageInherited: true })
    // Editar otro campo no toca las etapas.
    await send('patch', `/api/v1/catalog/models/${idPartial}`, admin, { stageCodes: ['D06'] }).expect(200)
    const renamed = await send('patch', `/api/v1/catalog/models/${idPartial}`, admin, { modelName: 'E2E MS Parcial 2' }).expect(200)
    expect(renamed.body).toMatchObject({ modelName: 'E2E MS Parcial 2', stageCodes: ['D06'], stageInherited: false })
  })

  it('si el tipo deja de admitir una etapa, los modelos que la tenían la pierden', async () => {
    await send('patch', `/api/v1/catalog/models/${idPartial}`, admin, { stageCodes: ['D06', 'D07'] }).expect(200)
    await send('patch', `/api/v1/catalog/types/${typeId}`, admin, { stageCodes: ['D05', 'D06'] }).expect(200)
    const rows = await catalog('')
    expect(rows.find((m) => m.id === idPartial)).toMatchObject({ stageCodes: ['D06'], stageInherited: false })
    expect(rows.find((m) => m.id === idInherit)).toMatchObject({ stageCodes: ['D05', 'D06'], stageInherited: true })
  })

  it('las variables con alcance por etapa siguen las etapas del modelo, no las del tipo', async () => {
    // Variable que solo aplica a la etapa D05 (el tipo la admite; el modelo parcial, ahora solo D06, no participa en ella).
    const v = await send('post', '/api/v1/catalog/variables', admin, { code: 'E2E_MS_VAR_D05', label: 'E2E MS solo D05', valueType: 'TEXT', stageCodes: ['D05'] }).expect(201)
    expect(v.body.code).toBe('E2E_MS_VAR_D05')
    const codes = async (id: string) => ((await http().get(`/api/v1/catalog/models/${id}/variables`).expect(200)).body as Array<{ code: string }>).map((x) => x.code)
    expect(await codes(idInherit)).toContain('E2E_MS_VAR_D05') // hereda D05
    expect(await codes(idPartial)).not.toContain('E2E_MS_VAR_D05') // solo participa en D06
  })

  it('solo el administrador del ecosistema las edita', async () => {
    await http().patch(`/api/v1/catalog/models/${idPartial}`).send({ stageCodes: ['D05'] }).expect(401)
    await send('patch', `/api/v1/catalog/models/${idPartial}`, pa, { stageCodes: ['D05'] }).expect(403)
  })
})
