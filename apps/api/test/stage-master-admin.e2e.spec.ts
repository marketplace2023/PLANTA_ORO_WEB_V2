import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, stageMaster } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Maestro de etapas: descripción e imagen del layout (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())
  let admin: Session
  let pa: Session
  let stageId: string

  const S = '/api/v1/stages/catalog'
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('layout-png-de-prueba')])
  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('layout-jpg-de-prueba')])

  const patch = (id: string, s: Session | null, body: object) => {
    const r = http().patch(`${S}/${id}`)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  const upload = (id: string, s: Session | null, file: Buffer, filename = 'layout.png') => {
    const r = http().post(`${S}/${id}/layout`)
    return (s ? r.set('Authorization', bearer(s)) : r).attach('file', file, { filename })
  }
  const stage = async () => (await http().get(S).expect(200)).body.find((x: { id: string }) => x.id === stageId)

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const plant = await t.plant('stg1', 'PUBLIC')
    const [, paU] = await Promise.all([t.user('admin', { isGlobalAdmin: true }), t.user('pa')])
    await t.assign(paU.id, plant.id, 'PLANT_ADMIN')
    ;[admin, pa] = await Promise.all(['admin', 'pa'].map((n) => login(app, n)))
    const [row] = await t.db.select().from(stageMaster).where(eq(stageMaster.code, 'D19'))
    stageId = row.id
  })

  afterAll(async () => {
    // El maestro de etapas es global: se deja como estaba.
    await t.db.update(stageMaster).set({ description: null, layoutImageKey: null, layoutImageMime: null, layoutImageUpdatedAt: null }).where(eq(stageMaster.id, stageId))
    await t.cleanup()
    await t.close()
    await app.close()
  })

  it('la lectura es pública y no expone la clave interna del almacenamiento', async () => {
    const s = await stage()
    expect(s).toMatchObject({ code: 'D19', layoutImageUrl: null })
    expect(s).not.toHaveProperty('layoutImageKey')
    expect(s).not.toHaveProperty('layoutImageMime')
  })

  describe('acceso', () => {
    it('solo el administrador del ecosistema: anónimo 401, administrador de planta 403', async () => {
      await patch(stageId, null, { description: 'x' }).expect(401)
      await patch(stageId, pa, { description: 'x' }).expect(403)
      await upload(stageId, null, PNG).expect(401)
      await upload(stageId, pa, PNG).expect(403)
      await http().delete(`${S}/${stageId}/layout`).set('Authorization', bearer(pa)).expect(403)
    })

    it('una etapa que no existe da 404', async () => {
      const ghost = '018f0000-0000-7000-8000-000000000000'
      await patch(ghost, admin, { description: 'x' }).expect(404)
      await upload(ghost, admin, PNG).expect(404)
    })
  })

  describe('descripción', () => {
    it('se guarda, se recorta y queda auditada', async () => {
      const res = await patch(stageId, admin, { description: '  Disposición general de la etapa 19.  ' }).expect(200)
      expect(res.body.description).toBe('Disposición general de la etapa 19.')
      expect((await stage()).description).toBe('Disposición general de la etapa 19.')
      const audit = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, stageId), eq(auditEvents.action, 'updated')))
      expect(audit.length).toBeGreaterThanOrEqual(1)
    })

    it('vacía o null la borra', async () => {
      await patch(stageId, admin, { description: '' }).expect(200)
      expect((await stage()).description).toBeNull()
    })

    it('rechaza un texto demasiado largo y el código no es editable', async () => {
      await patch(stageId, admin, { description: 'x'.repeat(2001) }).expect(400)
      await patch(stageId, admin, {}).expect(400)
      const before = await stage()
      await patch(stageId, admin, { description: 'ok', code: 'D99', name: 'Otra' }).expect(200)
      const after = await stage()
      expect(after.code).toBe(before.code)
      expect(after.name).toBe(before.name)
    })
  })

  describe('imagen del layout', () => {
    it('rechaza un archivo vacío, un SVG y uno cuyo contenido no corresponde a la extensión', async () => {
      await upload(stageId, admin, Buffer.alloc(0), 'vacia.png').expect(400)
      await upload(stageId, admin, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg').expect(415)
      await upload(stageId, admin, JPG, 'mentira.png').expect(415)
    })

    it('se sube, se sirve públicamente y se reemplaza con una URL nueva', async () => {
      const first = await upload(stageId, admin, PNG).expect(201)
      expect(first.body.layoutImageUrl).toMatch(new RegExp(`^/stages/catalog/${stageId}/layout\\?v=\\d+$`))
      expect((await stage()).layoutImageUrl).toBe(first.body.layoutImageUrl)

      const img = await http().get(`/api/v1${first.body.layoutImageUrl}`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = []
        r.on('data', (c: Buffer) => chunks.push(c))
        r.on('end', () => cb(null, Buffer.concat(chunks)))
      })
      expect(img.status).toBe(200)
      expect(img.headers['content-type']).toBe('image/png')
      expect(img.headers['x-content-type-options']).toBe('nosniff')
      expect((img.body as Buffer).equals(PNG)).toBe(true)

      await new Promise((r) => setTimeout(r, 5))
      const second = await upload(stageId, admin, JPG, 'nueva.jpg').expect(201)
      expect(second.body.layoutImageUrl).not.toBe(first.body.layoutImageUrl)
      const jpg = await http().get(`/api/v1${second.body.layoutImageUrl}`).expect(200)
      expect(jpg.headers['content-type']).toBe('image/jpeg')
    })

    it('se elimina y vuelve a dar 404', async () => {
      await http().delete(`${S}/${stageId}/layout`).set('Authorization', bearer(admin)).expect(204)
      expect((await stage()).layoutImageUrl).toBeNull()
      await http().get(`${S}/${stageId}/layout`).expect(404)
      // Eliminar de nuevo es inocuo.
      await http().delete(`${S}/${stageId}/layout`).set('Authorization', bearer(admin)).expect(204)
      const audit = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, stageId), eq(auditEvents.action, 'layout.removed')))
      expect(audit).toHaveLength(1)
    })
  })
})
