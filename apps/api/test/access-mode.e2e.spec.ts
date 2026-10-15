import './members-mode-env'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { plants } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Plant = typeof plants.$inferSelect

/** Modo de acceso normal (producción): sin sesión solo se ve el catálogo; los datos de una planta, solo sus miembros. */
describe('Acceso por membresía (ACCESS_MODE=members) (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let plant: Plant
  let admin: Session
  let member: Session
  let outsider: Session

  const get = (url: string, s?: Session) => {
    const r = http().get(url)
    return s ? r.set('Authorization', bearer(s)) : r
  }
  const P = '/api/v1/plants/e2e-mem'
  const PLANT_DATA = ['process', 'network-overview', 'assets', 'assets/summary', 'documents', 'stages', 'networks']

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    plant = await t.plant('mem', 'PUBLIC')
    await t.user('admin', { isGlobalAdmin: true })
    const m = await t.user('member')
    await t.user('outsider')
    await t.assign(m.id, plant.id, 'CONSUMER')
    ;[admin, member, outsider] = await Promise.all(['admin', 'member', 'outsider'].map((n) => login(app, n)))
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('sin sesión', () => {
    it('no ve ninguna planta ni sus datos (401 / 404)', async () => {
      expect((await get('/api/v1/plants').expect(200)).body).toEqual([])
      await get(P).expect(404)
      for (const path of PLANT_DATA) await get(`${P}/${path}`).expect(401)
    })

    it('Marketplace, Proveedores, Servicios Profesionales y Cursos piden sesión', async () => {
      for (const url of ['/api/v1/marketplace/listings', '/api/v1/providers', '/api/v1/contractors', '/api/v1/professional-services', '/api/v1/courses']) {
        await get(url).expect(401)
      }
    })

    it('el catálogo y los maestros siguen públicos (página principal y catálogo)', async () => {
      await get('/api/v1/catalog/families').expect(200)
      await get('/api/v1/stages/catalog').expect(200)
      await get('/api/v1/networks/catalog').expect(200)
      await get('/api/v1/health').expect(200)
    })
  })

  describe('con sesión pero sin pertenecer a la planta', () => {
    it('descubre la planta (para pedir acceso) pero no ve ninguno de sus datos: 403', async () => {
      const list = (await get('/api/v1/plants', outsider).expect(200)).body as Array<{ slug: string }>
      expect(list.map((p) => p.slug)).toContain('e2e-mem')
      const detail = (await get(P, outsider).expect(200)).body
      expect(detail.access).toEqual({ roles: [], permissions: [] })
      for (const path of PLANT_DATA) {
        const res = await get(`${P}/${path}`, outsider).expect(403)
        expect(res.body.message).toMatch(/Solicita acceso/)
      }
    })

    it('sí ve Marketplace, Proveedores, Servicios y Cursos', async () => {
      for (const url of ['/api/v1/marketplace/listings', '/api/v1/providers', '/api/v1/professional-services', '/api/v1/courses']) {
        await get(url, outsider).expect(200)
      }
    })
  })

  describe('miembros y administrador', () => {
    it('un miembro ve los datos de su planta', async () => {
      for (const path of ['process', 'assets', 'documents', 'networks']) await get(`${P}/${path}`, member).expect(200)
    })

    it('el administrador del ecosistema ve todo', async () => {
      for (const path of PLANT_DATA) await get(`${P}/${path}`, admin).expect(200)
    })
  })
})
