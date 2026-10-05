import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, plantSettings, plantStages, plants } from '../src/database/schema'
import { bearer, createApp, login, SLUG_PREFIX, type Session, TestDb } from './helpers'

type Plant = typeof plants.$inferSelect

describe('Plantas y autorización por planta (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let pub: Plant
  let auth: Plant
  let priv: Plant
  let priv2: Plant
  let admin: Session
  let pa: Session // administrador de planta en `priv`
  let maint: Session // jefe de mantenimiento en `priv`
  let consumer: Session // sin asignaciones
  let paUserId: string
  let maintUserId: string

  const mine = (list: Array<{ slug: string }>) => list.map((p) => p.slug).filter((s) => s.startsWith(SLUG_PREFIX)).sort()

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()

    pub = await t.plant('pub', 'PUBLIC')
    auth = await t.plant('auth', 'AUTHENTICATED')
    priv = await t.plant('priv', 'PRIVATE')
    priv2 = await t.plant('priv2', 'PRIVATE')

    await t.user('admin', { isGlobalAdmin: true })
    const paUser = await t.user('pa')
    const maintUser = await t.user('maint')
    await t.user('consumer')
    paUserId = paUser.id
    maintUserId = maintUser.id
    await t.assign(paUser.id, priv.id, 'PLANT_ADMIN')
    await t.assign(maintUser.id, priv.id, 'MAINTENANCE_LEAD')

    ;[admin, pa, maint, consumer] = await Promise.all(['admin', 'pa', 'maint', 'consumer'].map((n) => login(app, n)))
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('visibilidad', () => {
    it('anónimo: solo plantas PUBLIC', async () => {
      const res = await http().get('/api/v1/plants').expect(200)
      expect(mine(res.body)).toEqual(['e2e-pub'])
    })

    it('usuario autenticado sin asignaciones: PUBLIC + AUTHENTICATED, nunca PRIVATE', async () => {
      const res = await http().get('/api/v1/plants').set('Authorization', bearer(consumer)).expect(200)
      expect(mine(res.body)).toEqual(['e2e-auth', 'e2e-pub'])
    })

    it('miembro: además ve las privadas donde tiene rol, y no las demás', async () => {
      const res = await http().get('/api/v1/plants').set('Authorization', bearer(pa)).expect(200)
      expect(mine(res.body)).toEqual(['e2e-auth', 'e2e-priv', 'e2e-pub'])
    })

    it('administrador del ecosistema: todas', async () => {
      const res = await http().get('/api/v1/plants').set('Authorization', bearer(admin)).expect(200)
      expect(mine(res.body)).toEqual(['e2e-auth', 'e2e-priv', 'e2e-priv2', 'e2e-pub'])
    })

    it('el detalle de una planta privada no revela su existencia: 404, no 403', async () => {
      await http().get('/api/v1/plants/e2e-priv').expect(404)
      await http().get('/api/v1/plants/e2e-priv').set('Authorization', bearer(consumer)).expect(404)
      await http().get('/api/v1/plants/e2e-inexistente').set('Authorization', bearer(consumer)).expect(404)
    })

    it('el detalle se resuelve por slug o por UUID e incluye el rol y los permisos del solicitante', async () => {
      const bySlug = await http().get('/api/v1/plants/e2e-priv').set('Authorization', bearer(pa)).expect(200)
      const byId = await http().get(`/api/v1/plants/${priv.id}`).set('Authorization', bearer(pa)).expect(200)
      expect(byId.body.id).toBe(bySlug.body.id)
      expect(bySlug.body.access.roles).toEqual(['PLANT_ADMIN'])
      expect(bySlug.body.access.permissions).toEqual(expect.arrayContaining(['plant.update', 'user.assign']))
    })

    it('una visita anónima a una planta pública no obtiene permisos', async () => {
      const res = await http().get('/api/v1/plants/e2e-pub').expect(200)
      expect(res.body.access).toEqual({ roles: [], permissions: [] })
    })

    it('una asignación vencida o inactiva no da acceso', async () => {
      const u = await t.user('vencido')
      await t.assign(u.id, priv2.id, 'PLANT_ADMIN', { endsAt: new Date(Date.now() - 60_000) })
      const s = await login(app, 'vencido')
      await http().get('/api/v1/plants/e2e-priv2').set('Authorization', bearer(s)).expect(404)

      const u2 = await t.user('suspendido')
      await t.assign(u2.id, priv2.id, 'PLANT_ADMIN', { status: 'SUSPENDED' })
      const s2 = await login(app, 'suspendido')
      await http().get('/api/v1/plants/e2e-priv2').set('Authorization', bearer(s2)).expect(404)
    })
  })

  describe('crear plantas (solo administrador del ecosistema)', () => {
    it('anónimo → 401; administrador de planta → 403', async () => {
      const body = { code: 'N1', name: 'E2E Norte' }
      await http().post('/api/v1/plants').send(body).expect(401)
      await http().post('/api/v1/plants').set('Authorization', bearer(pa)).send(body).expect(403)
      await http().post('/api/v1/plants').set('Authorization', bearer(consumer)).send(body).expect(403)
    })

    it('crea la planta: slug derivado, privada por defecto, con configuración inicial', async () => {
      const res = await http()
        .post('/api/v1/plants')
        .set('Authorization', bearer(admin))
        .send({ code: 'N1', name: 'E2E Planta Ñandú Norte', countryCode: 'pe', timezone: 'America/Lima' })
        .expect(201)
      expect(res.body).toMatchObject({
        slug: 'e2e-planta-nandu-norte',
        visibility: 'PRIVATE',
        countryCode: 'PE',
        timezone: 'America/Lima',
        status: 'ACTIVE',
      })
      const [settings] = await t.db.select().from(plantSettings).where(eq(plantSettings.plantId, res.body.id))
      expect(settings).toMatchObject({ currencyCode: 'USD', publicDashboard: false })
    })

    it('slug repetido → 409; datos inválidos → 400', async () => {
      const dto = { code: 'N2', name: 'E2E Dup', slug: 'e2e-dup' }
      await http().post('/api/v1/plants').set('Authorization', bearer(admin)).send(dto).expect(201)
      await http().post('/api/v1/plants').set('Authorization', bearer(admin)).send(dto).expect(409)

      const bad = await http()
        .post('/api/v1/plants')
        .set('Authorization', bearer(admin))
        .send({ code: 'X', name: '', slug: 'Slug Inválido', timezone: 'Marte/Olympus', visibility: 'SECRETA' })
        .expect(400)
      expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['code', 'name', 'slug', 'timezone', 'visibility'])
    })

    it('audita la creación con el estado nuevo', async () => {
      const [created] = await t.db.select().from(plants).where(eq(plants.slug, 'e2e-dup'))
      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.plantId, created.id), eq(auditEvents.action, 'created')))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ module: 'plants', entityType: 'plant', newData: expect.objectContaining({ slug: 'e2e-dup' }) })
    })
  })

  describe('editar plantas: usuario + planta + rol + permiso', () => {
    const patch = (slug: string, s: Session, body: object) =>
      http().patch(`/api/v1/plants/${slug}`).set('Authorization', bearer(s)).send(body)

    it('permitido: administrador de ESA planta', async () => {
      const res = await patch('e2e-priv', pa, { description: 'Planta de pruebas', visibility: 'AUTHENTICATED' }).expect(200)
      expect(res.body).toMatchObject({ description: 'Planta de pruebas', visibility: 'AUTHENTICATED' })
      await patch('e2e-priv', pa, { visibility: 'PRIVATE' }).expect(200)
    })

    it('denegado: mismo usuario en OTRA planta donde no tiene rol (privada → 404, pública → 403)', async () => {
      await patch('e2e-priv2', pa, { description: 'x' }).expect(404)
      await patch('e2e-pub', pa, { description: 'x' }).expect(403)
    })

    it('denegado: rol sin permiso de edición en la misma planta (403)', async () => {
      const res = await patch('e2e-priv', maint, { description: 'x' }).expect(403)
      expect(res.body.message).toContain('plant.update')
    })

    it('denegado: sin sesión (401) y usuario común (404 en privada)', async () => {
      await http().patch('/api/v1/plants/e2e-priv').send({ description: 'x' }).expect(401)
      await patch('e2e-priv', consumer, { description: 'x' }).expect(404)
    })

    it('el administrador del ecosistema puede editar cualquier planta', async () => {
      await patch('e2e-priv2', admin, { description: 'editada por admin' }).expect(200)
    })

    it('valida el cuerpo: vacío, tipos y URLs', async () => {
      await patch('e2e-priv', pa, {}).expect(400)
      await patch('e2e-priv', pa, { logoUrl: 'javascript:alert(1)' }).expect(400)
      await patch('e2e-priv', pa, { visibility: 'X' }).expect(400)
      await patch('e2e-priv', pa, { slug: 'otro' }).expect(400) // el slug no es editable: queda un cuerpo vacío
      await patch('e2e-priv', pa, { description: 'ok', slug: 'otro' }).expect(200) // el campo extra se ignora
      const [row] = await t.db.select().from(plants).where(eq(plants.id, priv.id))
      expect(row.slug).toBe('e2e-priv')
    })

    it('audita cambios con valor anterior y nuevo', async () => {
      await patch('e2e-priv', pa, { name: 'E2E priv renombrada' }).expect(200)
      const events = await t.db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.plantId, priv.id), eq(auditEvents.action, 'updated')))
        .orderBy(auditEvents.occurredAt)
      const last = events.at(-1)!
      expect(last.userId).toBe(paUserId)
      expect(last.newData).toMatchObject({ name: 'E2E priv renombrada' })
      expect(last.oldData).toMatchObject({ slug: 'e2e-priv' })
      await patch('e2e-priv', pa, { name: 'E2E priv' }).expect(200)
    })

    it('un permiso excepcional DENY quita un permiso del rol; ALLOW concede uno que el rol no tiene', async () => {
      await t.override(paUserId, priv.id, 'plant.update', 'DENY')
      await patch('e2e-priv', pa, { description: 'x' }).expect(403)
      // DENY solo afecta a esa planta y a ese permiso.
      await http().get('/api/v1/plants/e2e-priv').set('Authorization', bearer(pa)).expect(200)

      await t.override(maintUserId, priv.id, 'plant.update', 'ALLOW')
      await patch('e2e-priv', maint, { description: 'permitido por excepción' }).expect(200)
    })
  })

  describe('etapas habilitadas por planta', () => {
    it('solo quien tiene plant.configure puede habilitar etapas', async () => {
      await http().post('/api/v1/plants/e2e-priv2/stages').set('Authorization', bearer(admin)).send({ stageCode: 'D06' }).expect(201)
      await http().post('/api/v1/plants/e2e-priv/stages').set('Authorization', bearer(maint)).send({ stageCode: 'D06' }).expect(403)
      await http().post('/api/v1/plants/e2e-priv/stages').send({ stageCode: 'D06' }).expect(401)
    })

    it('habilita desde el catálogo, es idempotente y lista en orden', async () => {
      const post = (stageCode: string, extra: object = {}) =>
        http().post('/api/v1/plants/e2e-pub/stages').set('Authorization', bearer(admin)).send({ stageCode, ...extra })

      const d06 = await post('D06').expect(201)
      expect(d06.body).toMatchObject({ code: 'D06', name: 'Molienda Primaria', sequence: 6, isEnabled: true, isPublic: false })
      const again = await post('D06', { nameOverride: 'Molino SAG' }).expect(201)
      expect(again.body.id).toBe(d06.body.id)
      expect(again.body.nameOverride).toBe('Molino SAG')

      await post('D01').expect(201)
      const list = await http().get('/api/v1/plants/e2e-pub/stages').set('Authorization', bearer(admin)).expect(200)
      expect(list.body.map((s: { code: string }) => s.code)).toEqual(['D01', 'D06'])
      expect(list.body[1].displayName).toBe('Molino SAG')

      await post('X1').expect(400)
      await post('D99').expect(404)
      await http().post('/api/v1/plants/e2e-pub/stages').set('Authorization', bearer(admin)).send({ stageCode: 'D21' }).expect(404)
    })

    it('los visitantes solo ven etapas habilitadas Y públicas, y solo si la planta publica sus procesos', async () => {
      const stages = await t.db.select().from(plantStages).where(eq(plantStages.plantId, pub.id))
      const d06 = stages.find((s) => s.nameOverride === 'Molino SAG')!

      // Procesos no públicos: nada.
      expect((await http().get('/api/v1/plants/e2e-pub/stages').expect(200)).body).toEqual([])

      await t.db.update(plantSettings).set({ publicProcesses: true }).where(eq(plantSettings.plantId, pub.id))
      expect((await http().get('/api/v1/plants/e2e-pub/stages').expect(200)).body).toEqual([])

      await http().patch(`/api/v1/plants/e2e-pub/stages/${d06.id}`).set('Authorization', bearer(admin)).send({ isPublic: true }).expect(200)
      const visible = await http().get('/api/v1/plants/e2e-pub/stages').expect(200)
      expect(visible.body.map((s: { code: string }) => s.code)).toEqual(['D06'])

      await http().patch(`/api/v1/plants/e2e-pub/stages/${d06.id}`).set('Authorization', bearer(admin)).send({ isEnabled: false }).expect(200)
      expect((await http().get('/api/v1/plants/e2e-pub/stages').expect(200)).body).toEqual([])
    })

    it('no se puede modificar una etapa de otra planta ni con ids inválidos', async () => {
      const [other] = await t.db.select().from(plantStages).where(eq(plantStages.plantId, pub.id))
      await http().patch(`/api/v1/plants/e2e-priv2/stages/${other.id}`).set('Authorization', bearer(admin)).send({ isPublic: true }).expect(404)
      await http().patch('/api/v1/plants/e2e-pub/stages/no-es-uuid').set('Authorization', bearer(admin)).send({ isPublic: true }).expect(400)
      await http().patch(`/api/v1/plants/e2e-pub/stages/${other.id}`).set('Authorization', bearer(admin)).send({}).expect(400)
    })
  })

  describe('redes transversales habilitadas por planta', () => {
    it('habilita, lista y deshabilita; los visitantes solo ven las habilitadas y públicas', async () => {
      const post = (networkCode: string, extra: object = {}) =>
        http().post('/api/v1/plants/e2e-pub/networks').set('Authorization', bearer(admin)).send({ networkCode, ...extra })

      const iot = await post('FUR-IOT', { isPublic: true }).expect(201)
      expect(iot.body).toMatchObject({ code: 'FUR-IOT', name: 'IoT / Instrumentación', isEnabled: true, isPublic: true })
      await post('FUR-PTE').expect(201) // habilitada pero no pública
      await post('FUR-NOPE').expect(404)
      await post('iot').expect(400)

      const anon = await http().get('/api/v1/plants/e2e-pub/networks').expect(200)
      expect(anon.body.map((n: { code: string }) => n.code)).toEqual(['FUR-IOT'])
      const internal = await http().get('/api/v1/plants/e2e-pub/networks').set('Authorization', bearer(admin)).expect(200)
      expect(internal.body.map((n: { code: string }) => n.code)).toEqual(['FUR-IOT', 'FUR-PTE'])

      await http().patch(`/api/v1/plants/e2e-pub/networks/${iot.body.id}`).set('Authorization', bearer(admin)).send({ isEnabled: false }).expect(200)
      expect((await http().get('/api/v1/plants/e2e-pub/networks').expect(200)).body).toEqual([])
    })

    it('exige plant.configure', async () => {
      await http().post('/api/v1/plants/e2e-priv/networks').set('Authorization', bearer(maint)).send({ networkCode: 'FUR-IOT' }).expect(403)
    })
  })

  describe('miembros de la planta (asignación usuario ↔ planta ↔ rol)', () => {
    let assignmentId: string

    it('solo user.assign puede asignar; user.read para consultar', async () => {
      const body = { email: 'consumer@e2e.fur.local', roleCode: 'WAREHOUSE' }
      await http().post('/api/v1/plants/e2e-priv/members').set('Authorization', bearer(maint)).send(body).expect(403)
      await http().get('/api/v1/plants/e2e-priv/members').set('Authorization', bearer(maint)).expect(403)
      await http().get('/api/v1/plants/e2e-priv/members').set('Authorization', bearer(consumer)).expect(404)
    })

    it('asigna un rol y el usuario obtiene acceso de inmediato', async () => {
      await http().get('/api/v1/plants/e2e-priv').set('Authorization', bearer(consumer)).expect(404)

      const res = await http()
        .post('/api/v1/plants/e2e-priv/members')
        .set('Authorization', bearer(pa))
        .send({ email: 'Consumer@E2E.fur.local', roleCode: 'WAREHOUSE' })
        .expect(201)
      expect(res.body).toMatchObject({ email: 'consumer@e2e.fur.local', roleCode: 'WAREHOUSE', status: 'ACTIVE' })
      assignmentId = res.body.id

      const detail = await http().get('/api/v1/plants/e2e-priv').set('Authorization', bearer(consumer)).expect(200)
      expect(detail.body.access.roles).toEqual(['WAREHOUSE'])
      expect(detail.body.access.permissions).toEqual(expect.arrayContaining(['inventory.move']))
      expect(detail.body.access.permissions).not.toContain('plant.update')

      const me = await http().get('/api/v1/auth/me').set('Authorization', bearer(consumer)).expect(200)
      expect(me.body.plants.map((p: { slug: string }) => p.slug)).toContain('e2e-priv')
    })

    it('no duplica asignaciones y rechaza roles no asignables o usuarios inexistentes', async () => {
      const post = (body: object) => http().post('/api/v1/plants/e2e-priv/members').set('Authorization', bearer(pa)).send(body)
      await post({ email: 'consumer@e2e.fur.local', roleCode: 'WAREHOUSE' }).expect(409)
      await post({ email: 'consumer@e2e.fur.local', roleCode: 'PROVIDER' }).expect(400)
      await post({ email: 'consumer@e2e.fur.local', roleCode: 'ECOSYSTEM_ADMIN' }).expect(400)
      await post({ email: 'consumer@e2e.fur.local', roleCode: 'NO_EXISTE' }).expect(404)
      await post({ email: 'nadie@e2e.fur.local', roleCode: 'WAREHOUSE' }).expect(404)
      await post({ email: 'mal', roleCode: 'WAREHOUSE' }).expect(400)
    })

    it('un usuario puede tener varios roles en la misma planta y sus permisos se acumulan', async () => {
      await http().post('/api/v1/plants/e2e-priv/members').set('Authorization', bearer(pa)).send({ email: 'consumer@e2e.fur.local', roleCode: 'PROCUREMENT' }).expect(201)
      const list = await http().get('/api/v1/plants/e2e-priv/members').set('Authorization', bearer(pa)).expect(200)
      const roles = list.body.filter((m: { email: string }) => m.email === 'consumer@e2e.fur.local').map((m: { roleCode: string }) => m.roleCode).sort()
      expect(roles).toEqual(['PROCUREMENT', 'WAREHOUSE'])

      const detail = await http().get('/api/v1/plants/e2e-priv').set('Authorization', bearer(consumer)).expect(200)
      expect(detail.body.access.permissions).toEqual(expect.arrayContaining(['inventory.move', 'procurement.approve']))
    })

    it('retirar la asignación revoca el acceso; no se puede retirar la de otra planta', async () => {
      await http().delete(`/api/v1/plants/e2e-priv2/members/${assignmentId}`).set('Authorization', bearer(admin)).expect(404)
      await http().delete('/api/v1/plants/e2e-priv/members/no-es-uuid').set('Authorization', bearer(pa)).expect(400)

      const list = await http().get('/api/v1/plants/e2e-priv/members').set('Authorization', bearer(pa)).expect(200)
      for (const m of list.body.filter((m: { email: string }) => m.email === 'consumer@e2e.fur.local')) {
        await http().delete(`/api/v1/plants/e2e-priv/members/${m.id}`).set('Authorization', bearer(pa)).expect(204)
      }
      await http().get('/api/v1/plants/e2e-priv').set('Authorization', bearer(consumer)).expect(404)
    })

    it('audita asignaciones y retiros', async () => {
      const events = await t.db.select().from(auditEvents).where(eq(auditEvents.plantId, priv.id))
      const actions = events.map((e) => e.action)
      expect(actions).toEqual(expect.arrayContaining(['member.assigned', 'member.removed']))
    })
  })
})
