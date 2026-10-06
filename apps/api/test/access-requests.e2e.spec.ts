import type { INestApplication } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, plants } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Plant = typeof plants.$inferSelect

describe('Solicitudes de acceso a plantas (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let pub: Plant
  let priv: Plant
  let admin: Session
  let ana: Session
  let beto: Session
  let member: Session

  const post = (url: string, s: Session, body: object = {}) => http().post(url).set('Authorization', bearer(s)).send(body)
  const get = (url: string, s: Session) => http().get(url).set('Authorization', bearer(s))
  const ask = (s: Session, plant = 'e2e-pub', message?: string) => post('/api/v1/plant-access-requests', s, { plant, message })

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()

    pub = await t.plant('pub', 'PUBLIC')
    priv = await t.plant('priv', 'PRIVATE')
    await t.user('admin', { isGlobalAdmin: true })
    await t.user('ana')
    await t.user('beto')
    const m = await t.user('member')
    await t.assign(m.id, pub.id, 'CONSUMER')
    ;[admin, ana, beto, member] = await Promise.all(['admin', 'ana', 'beto', 'member'].map((n) => login(app, n)))
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  it('exige sesión para pedir acceso', async () => {
    await http().post('/api/v1/plant-access-requests').send({ plant: 'e2e-pub' }).expect(401)
  })

  it('una planta privada no se puede pedir ni revela que existe', async () => {
    await ask(ana, priv.slug).expect(404)
    await ask(ana, 'no-existe').expect(404)
  })

  it('quien ya tiene acceso no puede volver a pedirlo', async () => {
    await ask(member).expect(409)
  })

  it('el administrador del ecosistema no necesita pedir acceso', async () => {
    await ask(admin).expect(400)
  })

  describe('ciclo de la solicitud', () => {
    let requestId: string

    it('crea una solicitud pendiente por slug y la ve en «mis solicitudes»', async () => {
      const res = await ask(ana, pub.slug, 'Soy jefe de mantenimiento').expect(201)
      requestId = res.body.id
      expect(res.body).toMatchObject({ status: 'PENDING', plantSlug: pub.slug, message: 'Soy jefe de mantenimiento', email: 'ana@e2e.fur.local' })
      const mine = await get('/api/v1/plant-access-requests/mine', ana).expect(200)
      expect(mine.body.map((r: { id: string }) => r.id)).toEqual([requestId])
      expect((await get('/api/v1/plant-access-requests/mine', beto).expect(200)).body).toEqual([])
    })

    it('no admite una segunda solicitud pendiente para la misma planta', async () => {
      await ask(ana).expect(409)
    })

    it('mientras está pendiente no concede ningún permiso en la planta', async () => {
      const res = await get(`/api/v1/plants/${pub.slug}`, ana).expect(200)
      expect(res.body.access.roles).toEqual([])
    })

    it('solo el administrador del ecosistema la lista y decide', async () => {
      await get('/api/v1/admin/plant-access-requests', ana).expect(403)
      await post(`/api/v1/admin/plant-access-requests/${requestId}/approve`, ana, { roleCode: 'PLANT_ADMIN' }).expect(403)
      await post(`/api/v1/admin/plant-access-requests/${requestId}/approve`, beto, { roleCode: 'PLANT_ADMIN' }).expect(403)
      const list = await get('/api/v1/admin/plant-access-requests', admin).expect(200)
      expect(list.body.map((r: { id: string }) => r.id)).toContain(requestId)
    })

    it('otra persona no puede retirarla', async () => {
      await post(`/api/v1/plant-access-requests/${requestId}/cancel`, beto).expect(404)
    })

    it('rechaza roles que no se asignan a una planta o que no existen', async () => {
      await post(`/api/v1/admin/plant-access-requests/${requestId}/approve`, admin, { roleCode: 'ECOSYSTEM_ADMIN' }).expect(400)
      await post(`/api/v1/admin/plant-access-requests/${requestId}/approve`, admin, { roleCode: 'NO_EXISTE' }).expect(404)
      await post(`/api/v1/admin/plant-access-requests/${requestId}/approve`, admin, {}).expect(400)
    })

    it('al aprobar crea la asignación con el rol elegido y la persona entra', async () => {
      const res = await post(`/api/v1/admin/plant-access-requests/${requestId}/approve`, admin, { roleCode: 'OPERATOR', note: 'Bienvenida' }).expect(201)
      expect(res.body).toMatchObject({ status: 'APPROVED', roleCode: 'OPERATOR', decisionNote: 'Bienvenida', decidedByEmail: 'admin@e2e.fur.local' })
      const members = await get(`/api/v1/plants/${pub.slug}/members`, admin).expect(200)
      expect(members.body.some((m: { email: string; roleCode: string }) => m.email === 'ana@e2e.fur.local' && m.roleCode === 'OPERATOR')).toBe(true)
      const session = await login(app, 'ana')
      expect(session.body.user.email).toBe('ana@e2e.fur.local')
    })

    it('una solicitud resuelta no se puede volver a decidir ni retirar', async () => {
      await post(`/api/v1/admin/plant-access-requests/${requestId}/approve`, admin, { roleCode: 'OPERATOR' }).expect(409)
      await post(`/api/v1/admin/plant-access-requests/${requestId}/reject`, admin).expect(409)
      await post(`/api/v1/plant-access-requests/${requestId}/cancel`, ana).expect(409)
    })

    it('quien ya fue aprobado no puede pedir de nuevo', async () => {
      await ask(ana).expect(409)
    })

    it('audita la creación y la aprobación', async () => {
      const actions = (await t.db.select().from(auditEvents).where(eq(auditEvents.plantId, pub.id))).map((e) => e.action)
      expect(actions).toEqual(expect.arrayContaining(['access_request.created', 'access_request.approved']))
    })
  })

  describe('rechazo y retiro', () => {
    it('rechazar deja constancia y no concede acceso; después se puede volver a pedir', async () => {
      const r = (await ask(beto, pub.slug, 'Quiero entrar').expect(201)).body
      const res = await post(`/api/v1/admin/plant-access-requests/${r.id}/reject`, admin, { note: 'Sin justificación' }).expect(201)
      expect(res.body).toMatchObject({ status: 'REJECTED', decisionNote: 'Sin justificación' })
      const members = await get(`/api/v1/plants/${pub.slug}/members`, admin).expect(200)
      expect(members.body.some((m: { email: string }) => m.email === 'beto@e2e.fur.local')).toBe(false)
      const again = await ask(beto).expect(201)
      expect(again.body.status).toBe('PENDING')
    })

    it('la persona puede retirar su solicitud pendiente', async () => {
      const pending = (await get('/api/v1/plant-access-requests/mine', beto).expect(200)).body.find((r: { status: string }) => r.status === 'PENDING')
      const res = await post(`/api/v1/plant-access-requests/${pending.id}/cancel`, beto).expect(201)
      expect(res.body.status).toBe('CANCELLED')
      const list = await get('/api/v1/admin/plant-access-requests', admin).expect(200)
      expect(list.body.map((r: { id: string }) => r.id)).not.toContain(pending.id)
    })

    it('el listado del administrador filtra por estado', async () => {
      const all = await get('/api/v1/admin/plant-access-requests?status=ALL', admin).expect(200)
      expect(new Set(all.body.map((r: { status: string }) => r.status))).toEqual(new Set(['APPROVED', 'REJECTED', 'CANCELLED']))
      const rejected = await get('/api/v1/admin/plant-access-requests?status=REJECTED', admin).expect(200)
      expect(rejected.body.every((r: { status: string }) => r.status === 'REJECTED')).toBe(true)
    })
  })
})
