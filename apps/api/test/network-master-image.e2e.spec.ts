import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, networkMaster } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Maestro de redes: imagen (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())
  let admin: Session
  let pa: Session
  let netId: string

  const N = '/api/v1/networks/catalog'
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('red-png-de-prueba')])
  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('red-jpg-de-prueba')])

  const upload = (id: string, s: Session | null, file: Buffer, filename = 'red.png') => {
    const r = http().post(`${N}/${id}/layout`)
    return (s ? r.set('Authorization', bearer(s)) : r).attach('file', file, { filename })
  }
  const network = async () => (await http().get(N).expect(200)).body.find((x: { id: string }) => x.id === netId)

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const plant = await t.plant('net1', 'PUBLIC')
    const [, paU] = await Promise.all([t.user('admin', { isGlobalAdmin: true }), t.user('pa')])
    await t.assign(paU.id, plant.id, 'PLANT_ADMIN')
    ;[admin, pa] = await Promise.all(['admin', 'pa'].map((n) => login(app, n)))
    const [row] = await t.db.select().from(networkMaster).where(eq(networkMaster.code, 'FUR-CAM'))
    netId = row.id
  })

  afterAll(async () => {
    // El maestro de redes es global: se deja como estaba.
    await t.db.update(networkMaster).set({ layoutImageKey: null, layoutImageMime: null, layoutImageUpdatedAt: null }).where(eq(networkMaster.id, netId))
    await t.cleanup()
    await t.close()
    await app.close()
  })

  it('la lectura es pública y no expone la clave interna del almacenamiento', async () => {
    const n = await network()
    expect(n).toMatchObject({ code: 'FUR-CAM', layoutImageUrl: null })
    expect(n).not.toHaveProperty('layoutImageKey')
    expect(n).not.toHaveProperty('layoutImageMime')
  })

  it('solo el administrador del ecosistema sube o quita la imagen', async () => {
    await upload(netId, null, PNG).expect(401)
    await upload(netId, pa, PNG).expect(403)
    await http().delete(`${N}/${netId}/layout`).set('Authorization', bearer(pa)).expect(403)
    await upload('018f0000-0000-7000-8000-000000000000', admin, PNG).expect(404)
  })

  it('rechaza un archivo vacío, un SVG y uno cuyo contenido no corresponde a la extensión', async () => {
    await upload(netId, admin, Buffer.alloc(0), 'vacia.png').expect(400)
    await upload(netId, admin, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg').expect(415)
    await upload(netId, admin, JPG, 'mentira.png').expect(415)
  })

  it('se sube, se sirve públicamente y se reemplaza con una URL nueva', async () => {
    const first = await upload(netId, admin, PNG).expect(201)
    expect(first.body.layoutImageUrl).toMatch(new RegExp(`^/networks/catalog/${netId}/layout\\?v=\\d+$`))
    expect((await network()).layoutImageUrl).toBe(first.body.layoutImageUrl)

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
    const second = await upload(netId, admin, JPG, 'nueva.jpg').expect(201)
    expect(second.body.layoutImageUrl).not.toBe(first.body.layoutImageUrl)
    expect((await http().get(`/api/v1${second.body.layoutImageUrl}`).expect(200)).headers['content-type']).toBe('image/jpeg')
  })

  it('la descripción editada se conserva con la imagen; al eliminar la imagen vuelve a dar 404', async () => {
    const original = (await network()).description
    const res = await http().patch(`${N}/${netId}`).set('Authorization', bearer(admin)).send({ description: 'Videovigilancia de la planta.' }).expect(200)
    expect(res.body).toMatchObject({ description: 'Videovigilancia de la planta.' })
    expect(res.body.layoutImageUrl).toMatch(/layout\?v=\d+$/)
    expect(res.body).not.toHaveProperty('layoutImageKey')

    await http().delete(`${N}/${netId}/layout`).set('Authorization', bearer(admin)).expect(204)
    expect((await network()).layoutImageUrl).toBeNull()
    await http().get(`${N}/${netId}/layout`).expect(404)
    await http().delete(`${N}/${netId}/layout`).set('Authorization', bearer(admin)).expect(204)
    const audit = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, netId), eq(auditEvents.action, 'layout.removed')))
    expect(audit).toHaveLength(1)

    // Se deja la descripción del maestro como estaba.
    await http().patch(`${N}/${netId}`).set('Authorization', bearer(admin)).send({ description: original }).expect(200)
  })
})
