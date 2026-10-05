import type { INestApplication } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import request from 'supertest'
import { providers } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Dashboard del ecosistema (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())
  let admin: Session
  let pa: Session
  let consumer: Session
  const get = (s: Session | null) => (s ? http().get('/api/v1/admin/dashboard').set('Authorization', bearer(s)) : http().get('/api/v1/admin/dashboard'))
  const n = async (q: ReturnType<typeof sql>) => Number((await t.db.execute(q)).rows[0].n)

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const plant = await t.plant('dash1', 'PUBLIC')
    const [, paU] = await Promise.all([t.user('dadmin', { isGlobalAdmin: true }), t.user('dpa'), t.user('dconsumer')])
    await t.assign(paU.id, plant.id, 'PLANT_ADMIN')
    ;[admin, pa, consumer] = await Promise.all(['dadmin', 'dpa', 'dconsumer'].map((name) => login(app, name)))
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  it('solo el administrador del ecosistema: anónimo 401; administrador de planta y común 403', async () => {
    await get(null).expect(401)
    await get(pa).expect(403)
    await get(consumer).expect(403)
    await get(admin).expect(200)
  })

  it('los conteos coinciden con la base de datos', async () => {
    const { body } = await get(admin).expect(200)
    expect(body.plants.total).toBe(await n(sql`select count(*)::int as n from core.plants`))
    expect(Object.values<number>(body.plants.byVisibility).reduce((a, b) => a + b, 0)).toBe(body.plants.total)
    expect(body.users.total).toBe(await n(sql`select count(*)::int as n from iam.users`))
    expect(body.users.globalAdmins).toBe(await n(sql`select count(*)::int as n from iam.users where is_global_admin`))
    expect(body.access).toEqual({
      roles: await n(sql`select count(*)::int as n from iam.roles`),
      permissions: await n(sql`select count(*)::int as n from iam.permissions`),
      assignments: await n(sql`select count(*)::int as n from iam.user_plant_roles`),
    })
    expect(body.catalog).toEqual({
      families: await n(sql`select count(*)::int as n from catalog.asset_families`),
      types: await n(sql`select count(*)::int as n from catalog.asset_types`),
      manufacturers: await n(sql`select count(*)::int as n from catalog.manufacturers`),
      models: await n(sql`select count(*)::int as n from catalog.asset_models`),
    })
    expect(body.masters).toEqual({ stages: 20, networks: 10 })
  })

  it('las organizaciones pendientes de aprobar se cuentan aparte del total', async () => {
    const before = (await get(admin).expect(200)).body.organizations.providers
    await t.db.insert(providers).values([
      { organizationName: 'E2E Dash Pendiente', countryCode: 'PE', status: 'PENDING' },
      { organizationName: 'E2E Dash Activo', countryCode: 'PE', status: 'ACTIVE' },
    ])
    const after = (await get(admin).expect(200)).body.organizations.providers
    expect(after).toEqual({ total: before.total + 2, pending: before.pending + 1 })
  })

  it('auditoría: reciente ordenada de más nueva a más vieja, máximo 10, con el actor', async () => {
    const { body } = await get(admin).expect(200)
    expect(body.audit.recent.length).toBeLessThanOrEqual(10)
    expect(body.audit.recent.length).toBeGreaterThan(0) // los inicios de sesión de esta prueba quedaron auditados
    const times = body.audit.recent.map((e: { occurredAt: string }) => Date.parse(e.occurredAt))
    expect([...times].sort((a, b) => b - a)).toEqual(times)
    expect(body.audit.last7Days).toBeGreaterThanOrEqual(body.audit.last24Hours)
    expect(body.audit.last24Hours).toBeGreaterThanOrEqual(body.audit.recent.length)
  })

  it('salud y honestidad: base de datos arriba y las integraciones se informan como no disponibles (null, no 0)', async () => {
    const { body } = await get(admin).expect(200)
    expect(body.health.database).toBe('up')
    expect(body.health.latencyMs).toBeGreaterThanOrEqual(0)
    expect(body.integrations).toBeNull()
    expect(new Date(body.generatedAt).getTime()).toBeGreaterThan(Date.now() - 60_000)
  })
})
