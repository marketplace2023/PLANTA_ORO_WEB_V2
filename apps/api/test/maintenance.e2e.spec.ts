import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, maintenancePlans, plants, plantSettings, workOrderHistory, workOrders } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Plant = typeof plants.$inferSelect

const day = 86_400_000
const hour = 3_600_000
const at = (offsetMs: number) => new Date(Date.now() + offsetMs)
const iso = (offsetMs: number) => at(offsetMs).toISOString()
const YEAR = new Date().getUTCFullYear()

describe('Mantenimiento: órdenes de trabajo y planes (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let plantA: Plant
  let plantB: Plant
  let admin: Session
  let pa: Session // administrador de planta (todo)
  let lead: Session // jefe de mantenimiento: read, create, update, close
  let tech: Session // técnico: solo lectura de mantenimiento (ejecuta lo que le asignan)
  let tech2: Session // otro técnico
  let op: Session // operador: read + create (solicita)
  let mgr: Session // gerente: read + close (no planifica)
  let wh: Session // almacén: sin acceso a mantenimiento
  let consumer: Session
  let techId: string
  let whId: string
  let a1: string // activos de la planta A
  let a2: string
  let aDecommissioned: string
  let bAsset: string

  const M = '/api/v1/plants/e2e-m1/maintenance'
  const send = (method: 'post' | 'patch', url: string, s: Session | null, body: object = {}) => {
    const r = http()[method](url)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  const get = (url: string, s: Session | null = lead) => {
    const r = http().get(url)
    return s ? r.set('Authorization', bearer(s)) : r
  }
  const mkOrder = async (s: Session = lead, over: object = {}) =>
    (await send('post', `${M}/work-orders`, s, { assetId: a1, title: 'Falla en rodamiento', ...over }).expect(201)).body
  const go = (id: string, s: Session | null, body: object) => send('post', `${M}/work-orders/${id}/transition`, s, body)
  const codes = (res: request.Response) => res.body.items.map((o: { code: string }) => o.code)

  /** Lleva una OT hasta el estado pedido por el camino feliz, saltando los pasos que ya cumplió. */
  async function advance(id: string, to: 'PLANNED' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED') {
    const order = ['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED']
    const current = order.indexOf((await get(`${M}/work-orders/${id}`)).body.status)
    const steps: Array<[string, Session, object]> = [
      ['PLANNED', lead, {}],
      ['ASSIGNED', lead, { assignedTo: techId }],
      ['IN_PROGRESS', tech, {}],
      ['COMPLETED', tech, { completionNotes: 'Se cambió el rodamiento' }],
      ['CLOSED', mgr, {}],
    ]
    for (const [status, s, body] of steps) {
      if (order.indexOf(status) <= current) continue
      await go(id, s, { to: status, ...body }).expect(201)
      if (status === to) return
    }
  }

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()

    plantA = await t.plant('m1', 'PUBLIC')
    plantB = await t.plant('m3', 'PUBLIC')
    const model = (await t.model('MOLINO_BOLAS', 'E2E Bolas mant')).id

    const users = await Promise.all(
      ['admin', 'pa', 'lead', 'tech', 'tech2', 'op', 'mgr', 'wh', 'consumer'].map((n) => t.user(n, { isGlobalAdmin: n === 'admin' })),
    )
    const byName = Object.fromEntries(users.map((u) => [u.firstName, u]))
    const roles: Array<[string, string]> = [['pa', 'PLANT_ADMIN'], ['lead', 'MAINTENANCE_LEAD'], ['tech', 'TECHNICIAN'], ['tech2', 'TECHNICIAN'], ['op', 'OPERATOR'], ['mgr', 'PLANT_MANAGER'], ['wh', 'WAREHOUSE']]
    for (const [name, role] of roles) await t.assign(byName[name].id, plantA.id, role)
    techId = byName.tech.id
    whId = byName.wh.id
    ;[admin, pa, lead, tech, tech2, op, mgr, wh, consumer] = await Promise.all(['admin', 'pa', 'lead', 'tech', 'tech2', 'op', 'mgr', 'wh', 'consumer'].map((n) => login(app, n)))

    const mkAsset = async (slug: string, s: Session, tag: string) =>
      (await http().post(`/api/v1/plants/${slug}/assets`).set('Authorization', bearer(s)).send({ tag, name: tag, assetModelId: model }).expect(201)).body.id as string
    a1 = await mkAsset('e2e-m1', pa, 'MB-1')
    a2 = await mkAsset('e2e-m1', pa, 'MB-2')
    aDecommissioned = await mkAsset('e2e-m1', pa, 'OLD-1')
    await http().delete(`/api/v1/plants/e2e-m1/assets/${aDecommissioned}`).set('Authorization', bearer(pa)).expect(204)
    bAsset = await mkAsset('e2e-m3', admin, 'B-1')
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('acceso: mantenimiento es información interna', () => {
    it('sin sesión → 401 en todos los endpoints', async () => {
      await get(`${M}/work-orders`, null).expect(401)
      await get(`${M}/dashboard`, null).expect(401)
      await get(`${M}/plans`, null).expect(401)
      await get(`${M}/assignees`, null).expect(401)
      await send('post', `${M}/work-orders`, null, { assetId: a1, title: 'x' }).expect(401)
    })

    it('sin maintenance.read (almacén, usuario común) → 403, aunque la planta sea pública', async () => {
      for (const s of [wh, consumer]) {
        await get(`${M}/work-orders`, s).expect(403)
        await get(`${M}/dashboard`, s).expect(403)
        await get(`${M}/plans`, s).expect(403)
      }
    })

    it('un administrador de otra planta no tiene acceso aquí', async () => {
      await get('/api/v1/plants/e2e-m3/maintenance/work-orders', lead).expect(403)
    })

    it('planta privada: 404 para quien no es miembro', async () => {
      await t.plant('mpriv', 'PRIVATE')
      await get('/api/v1/plants/e2e-mpriv/maintenance/work-orders', lead).expect(404)
    })
  })

  describe('solicitud de órdenes', () => {
    it('un operador (maintenance.create) puede solicitar; almacén y común no', async () => {
      await send('post', `${M}/work-orders`, op, { assetId: a1, title: 'Ruido anormal' }).expect(201)
      await send('post', `${M}/work-orders`, wh, { assetId: a1, title: 'x' }).expect(403)
      await send('post', `${M}/work-orders`, consumer, { assetId: a1, title: 'x' }).expect(403)
    })

    it('el gerente (solo lectura + cierre) no puede crear', async () => {
      await send('post', `${M}/work-orders`, mgr, { assetId: a1, title: 'x' }).expect(403)
    })

    it('crea en estado REQUESTED con código OT-AAAA-NNNNN, solicitante e historial inicial', async () => {
      const wo = await mkOrder(lead, { title: 'Vibración alta', description: 'Se siente en el piso', type: 'CORRECTIVE', priority: 'HIGH' })
      expect(wo).toMatchObject({
        status: 'REQUESTED',
        type: 'CORRECTIVE',
        priority: 'HIGH',
        title: 'Vibración alta',
        description: 'Se siente en el piso',
        asset: { tag: 'MB-1' },
        requestedBy: expect.stringContaining('lead'),
        assignedTo: null,
        overdue: false,
        nextStatuses: ['PLANNED', 'CANCELLED'],
      })
      expect(wo.code).toMatch(new RegExp(`^OT-${YEAR}-\\d{5}$`))
      expect(wo.history).toHaveLength(1)
      expect(wo.history[0]).toMatchObject({ fromStatus: null, toStatus: 'REQUESTED', note: 'Solicitud creada' })

      const [audit] = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, wo.id), eq(auditEvents.action, 'created')))
      expect(audit).toMatchObject({ module: 'maintenance', plantId: plantA.id })
    })

    it('los códigos son consecutivos por planta y año, y las altas fallidas no consumen números', async () => {
      const first = await mkOrder()
      const n = Number(first.code.slice(-5))
      await send('post', `${M}/work-orders`, lead, { assetId: a1, title: '' }).expect(400) // falla: no debe quemar un número
      const next = await mkOrder()
      expect(Number(next.code.slice(-5))).toBe(n + 1)

      // Otra planta lleva su propia numeración desde 1.
      const other = await send('post', '/api/v1/plants/e2e-m3/maintenance/work-orders', admin, { assetId: bAsset, title: 'En B' }).expect(201)
      expect(other.body.code).toBe(`OT-${YEAR}-00001`)
    })

    it('altas simultáneas nunca repiten código', async () => {
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => send('post', `${M}/work-orders`, lead, { assetId: a2, title: `Paralela ${i}` })))
      expect(results.map((r) => r.status)).toEqual(Array(6).fill(201))
      expect(new Set(results.map((r) => r.body.code)).size).toBe(6)
    })

    it('valida el activo (de la planta y no dado de baja), fechas y enumerados', async () => {
      const post = (body: object) => send('post', `${M}/work-orders`, lead, body)
      const e1 = await post({ assetId: bAsset, title: 'x' }).expect(400)
      expect(e1.body.errors[0].path).toBe('assetId')
      await post({ assetId: aDecommissioned, title: 'x' }).expect(400)
      await post({ assetId: 'no-uuid', title: 'x' }).expect(400)
      await post({ assetId: a1, title: 'x', plannedStart: iso(2 * day), plannedEnd: iso(day) }).expect(400) // fin antes del inicio
      await post({ assetId: a1, title: 'x', plannedEnd: '15/10/2026' }).expect(400) // no es ISO
      const bad = await post({ assetId: a1, title: 'x', type: 'MAGICO', priority: 'YA' }).expect(400)
      expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['priority', 'type'])
    })
  })

  describe('flujo de trabajo', () => {
    it('camino feliz: solicitada → planificada → asignada → en ejecución → completada → cerrada', async () => {
      const wo = await mkOrder()
      const planned = await go(wo.id, lead, { to: 'PLANNED' }).expect(201)
      expect(planned.body.status).toBe('PLANNED')
      const assigned = await go(wo.id, lead, { to: 'ASSIGNED', assignedTo: techId }).expect(201)
      expect(assigned.body.assignedTo).toMatchObject({ id: techId, name: expect.stringContaining('tech') })

      // El técnico asignado ejecuta con solo lectura de mantenimiento.
      const started = await go(wo.id, tech, { to: 'IN_PROGRESS' }).expect(201)
      expect(started.body.actualStart).not.toBeNull()
      const done = await go(wo.id, tech, { to: 'COMPLETED', completionNotes: 'Se cambió el rodamiento lado motor' }).expect(201)
      expect(done.body).toMatchObject({ status: 'COMPLETED', completionNotes: 'Se cambió el rodamiento lado motor' })
      expect(done.body.actualEnd).not.toBeNull()

      // El gerente aprueba el cierre (maintenance.close) sin poder planificar.
      const closed = await go(wo.id, mgr, { to: 'CLOSED' }).expect(201)
      expect(closed.body).toMatchObject({ status: 'CLOSED', nextStatuses: [] })
      expect(closed.body.closedAt).not.toBeNull()

      expect(closed.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['CLOSED', 'COMPLETED', 'IN_PROGRESS', 'ASSIGNED', 'PLANNED', 'REQUESTED']) // más reciente primero
      expect(closed.body.history[1].note).toBe('Se cambió el rodamiento lado motor')
      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, wo.id), eq(auditEvents.action, 'status.changed')))
      expect(events).toHaveLength(5)
      expect(events.find((e) => (e.newData as { status: string }).status === 'CLOSED')?.oldData).toEqual({ status: 'COMPLETED' })
    })

    it('rechaza transiciones inválidas con 409 y no cambia el estado', async () => {
      const wo = await mkOrder()
      await go(wo.id, lead, { to: 'IN_PROGRESS' }).expect(409) // hay que planificar y asignar antes
      await go(wo.id, lead, { to: 'COMPLETED', completionNotes: 'x' }).expect(409)
      await go(wo.id, lead, { to: 'CLOSED' }).expect(409)
      expect((await get(`${M}/work-orders/${wo.id}`)).body.status).toBe('REQUESTED')
    })

    it('los estados terminales no admiten nada más', async () => {
      const closed = await mkOrder()
      await advance(closed.id, 'CLOSED')
      for (const to of ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']) await go(closed.id, lead, { to, note: 'x', completionNotes: 'x' }).expect(409)

      const cancelled = await mkOrder()
      await go(cancelled.id, lead, { to: 'CANCELLED', note: 'Duplicada' }).expect(201)
      await go(cancelled.id, lead, { to: 'PLANNED' }).expect(409)
    })

    it('permisos finos por transición', async () => {
      const wo = await mkOrder()
      await go(wo.id, op, { to: 'PLANNED' }).expect(403) // operador solo solicita
      await go(wo.id, tech, { to: 'PLANNED' }).expect(403) // técnico no planifica
      await go(wo.id, mgr, { to: 'PLANNED' }).expect(403) // gerente no planifica
      await go(wo.id, wh, { to: 'PLANNED' }).expect(403)
      await go(wo.id, null, { to: 'PLANNED' }).expect(401)
      await go(wo.id, lead, { to: 'PLANNED' }).expect(201)
      await go(wo.id, tech, { to: 'ASSIGNED', assignedTo: techId }).expect(403) // asignar es de quien planifica
      await go(wo.id, lead, { to: 'ASSIGNED', assignedTo: techId }).expect(201)
    })

    it('solo el técnico ASIGNADO puede reportar avance (otro técnico no)', async () => {
      const wo = await mkOrder()
      await advance(wo.id, 'ASSIGNED')
      const denied = await go(wo.id, tech2, { to: 'IN_PROGRESS' }).expect(403)
      expect(denied.body.message).toContain('maintenance.update')
      await go(wo.id, tech, { to: 'IN_PROGRESS' }).expect(201)
      await go(wo.id, tech2, { to: 'COMPLETED', completionNotes: 'x' }).expect(403)
    })

    it('el técnico asignado no puede cerrar su propia orden', async () => {
      const wo = await mkOrder()
      await advance(wo.id, 'COMPLETED')
      const res = await go(wo.id, tech, { to: 'CLOSED' }).expect(403)
      expect(res.body.message).toContain('maintenance.close')
    })

    it('asignar exige un responsable válido: miembro de la planta con acceso a mantenimiento', async () => {
      const wo = await mkOrder()
      await go(wo.id, lead, { to: 'PLANNED' }).expect(201)
      const none = await go(wo.id, lead, { to: 'ASSIGNED' }).expect(400)
      expect(none.body.errors[0].path).toBe('assignedTo')
      await go(wo.id, lead, { to: 'ASSIGNED', assignedTo: whId }).expect(400) // almacén no accede a mantenimiento
      await go(wo.id, lead, { to: 'ASSIGNED', assignedTo: '018f0000-0000-7000-8000-000000000000' }).expect(400) // no existe
      await go(wo.id, lead, { to: 'ASSIGNED', assignedTo: 'no-uuid' }).expect(400)
    })

    it('completar exige indicar el trabajo realizado; cancelar, el motivo', async () => {
      const wo = await mkOrder()
      await advance(wo.id, 'IN_PROGRESS')
      const e1 = await go(wo.id, tech, { to: 'COMPLETED' }).expect(400)
      expect(e1.body.errors[0].path).toBe('completionNotes')
      await go(wo.id, tech, { to: 'COMPLETED', completionNotes: '   ' }).expect(400)

      const other = await mkOrder()
      const e2 = await go(other.id, lead, { to: 'CANCELLED' }).expect(400)
      expect(e2.body.errors[0].path).toBe('note')
      await go(other.id, lead, { to: 'CANCELLED', note: 'Ya se resolvió' }).expect(201)
    })

    it('pausar y reanudar conserva el inicio real; reabrir una completada limpia el fin real', async () => {
      const wo = await mkOrder()
      await advance(wo.id, 'IN_PROGRESS')
      const started = (await get(`${M}/work-orders/${wo.id}`)).body.actualStart
      await go(wo.id, tech, { to: 'ON_HOLD', note: 'Falta repuesto' }).expect(201)
      const resumed = await go(wo.id, tech, { to: 'IN_PROGRESS' }).expect(201)
      expect(resumed.body.actualStart).toBe(started)

      await go(wo.id, tech, { to: 'COMPLETED', completionNotes: 'Listo' }).expect(201)
      const reopened = await go(wo.id, lead, { to: 'IN_PROGRESS', note: 'Persiste la vibración' }).expect(201)
      expect(reopened.body).toMatchObject({ status: 'IN_PROGRESS', actualEnd: null })
      expect(reopened.body.actualStart).toBe(started)
    })

    it('dos transiciones simultáneas desde el mismo estado: una gana y la otra recibe 409', async () => {
      const wo = await mkOrder()
      await go(wo.id, lead, { to: 'PLANNED' }).expect(201)
      const results = await Promise.all([
        go(wo.id, lead, { to: 'ASSIGNED', assignedTo: techId }),
        go(wo.id, lead, { to: 'CANCELLED', note: 'Cancelada a la vez' }),
      ])
      expect(results.map((r) => r.status).sort()).toEqual([201, 409])
      const history = await t.db.select().from(workOrderHistory).where(eq(workOrderHistory.workOrderId, wo.id))
      expect(history).toHaveLength(3) // creación + planificada + exactamente una de las dos
    })

    it('404 para órdenes inexistentes, de otra planta o con id inválido', async () => {
      const other = (await send('post', '/api/v1/plants/e2e-m3/maintenance/work-orders', admin, { assetId: bAsset, title: 'De B' }).expect(201)).body.id
      await go('018f0000-0000-7000-8000-000000000000', lead, { to: 'PLANNED' }).expect(404)
      await go(other, lead, { to: 'PLANNED' }).expect(404) // existe, pero en la planta B
      await get(`${M}/work-orders/${other}`).expect(404)
      await get(`${M}/work-orders/no-uuid`).expect(400)
    })

    it('valida el cuerpo de la transición', async () => {
      const wo = await mkOrder()
      await go(wo.id, lead, { to: 'VOLAR' }).expect(400)
      await go(wo.id, lead, {}).expect(400)
    })
  })

  describe('edición', () => {
    it('exige maintenance.update: el jefe sí, el operador y el técnico no', async () => {
      const wo = await mkOrder()
      await send('patch', `${M}/work-orders/${wo.id}`, op, { title: 'x' }).expect(403)
      await send('patch', `${M}/work-orders/${wo.id}`, tech, { title: 'x' }).expect(403)
      const res = await send('patch', `${M}/work-orders/${wo.id}`, lead, { title: 'Nuevo título', priority: 'URGENT', plannedStart: iso(day), plannedEnd: iso(2 * day), assignedTo: techId }).expect(200)
      expect(res.body).toMatchObject({ title: 'Nuevo título', priority: 'URGENT', assignedTo: { id: techId } })
      const [audit] = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, wo.id), eq(auditEvents.action, 'updated')))
      expect(audit.oldData).toMatchObject({ title: 'Falla en rodamiento', priority: 'MEDIUM' })
    })

    it('no se edita una orden cerrada/completada/cancelada (409)', async () => {
      const wo = await mkOrder()
      await advance(wo.id, 'CLOSED')
      await send('patch', `${M}/work-orders/${wo.id}`, lead, { title: 'x' }).expect(409)
    })

    it('valida fechas contra las ya guardadas, el responsable y los campos', async () => {
      const wo = await mkOrder(lead, { plannedStart: iso(5 * day) })
      await send('patch', `${M}/work-orders/${wo.id}`, lead, { plannedEnd: iso(day) }).expect(400) // anterior al inicio ya guardado
      await send('patch', `${M}/work-orders/${wo.id}`, lead, { assignedTo: whId }).expect(400)
      await send('patch', `${M}/work-orders/${wo.id}`, lead, {}).expect(400)
      await send('patch', `${M}/work-orders/${wo.id}`, lead, { assignedTo: null, plannedStart: null }).expect(200)
    })
  })

  describe('listado y filtros', () => {
    let aOrder: { id: string; code: string }
    let bOrder: { id: string; code: string }
    let cOrder: { id: string; code: string }

    beforeAll(async () => {
      aOrder = await mkOrder(lead, { assetId: a2, title: 'FILT-A bomba de pulpa', priority: 'URGENT', type: 'CORRECTIVE', plannedEnd: iso(-2 * day) })
      bOrder = await mkOrder(lead, { assetId: a2, title: 'FILT-B lubricación', priority: 'LOW', type: 'PREVENTIVE', plannedEnd: iso(5 * day) })
      cOrder = await mkOrder(lead, { assetId: a1, title: 'FILT-C inspección', priority: 'MEDIUM', type: 'INSPECTION' })
      await go(bOrder.id, lead, { to: 'PLANNED' }).expect(201)
      await go(bOrder.id, lead, { to: 'ASSIGNED', assignedTo: techId }).expect(201)
    })

    const list = (query: Record<string, string | number>, s: Session = lead) => get(`${M}/work-orders?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`, s).expect(200)

    it('filtra por estado (varios), tipo, prioridad y activo', async () => {
      expect(codes(await list({ search: 'FILT', status: 'ASSIGNED' }))).toEqual([bOrder.code])
      expect(codes(await list({ search: 'FILT', status: 'REQUESTED,ASSIGNED' })).sort()).toEqual([aOrder.code, bOrder.code, cOrder.code].sort())
      expect(codes(await list({ search: 'FILT', type: 'INSPECTION' }))).toEqual([cOrder.code])
      expect(codes(await list({ search: 'FILT', priority: 'URGENT,LOW' })).sort()).toEqual([aOrder.code, bOrder.code].sort())
      expect(codes(await list({ search: 'FILT', assetId: a1 }))).toEqual([cOrder.code])
    })

    it('filtra por responsable ("me" = las mías) y por atrasadas', async () => {
      expect(codes(await list({ search: 'FILT', assignedTo: 'me' }, tech))).toEqual([bOrder.code])
      expect((await list({ search: 'FILT', assignedTo: 'me' }, lead)).body.total).toBe(0)
      expect(codes(await list({ search: 'FILT', assignedTo: techId }))).toEqual([bOrder.code])
      expect(codes(await list({ search: 'FILT', overdue: 1 }))).toEqual([aOrder.code]) // la B vence en el futuro, la C no tiene fecha
    })

    it('busca por código, título y tag del activo (comodines SQL como texto)', async () => {
      expect(codes(await list({ search: aOrder.code }))).toEqual([aOrder.code])
      expect(codes(await list({ search: 'lubricación' }))).toEqual([bOrder.code])
      expect(codes(await list({ search: 'MB-2', status: 'REQUESTED,ASSIGNED' })).length).toBeGreaterThan(1)
      expect((await list({ search: '%' })).body.total).toBe(0)
    })

    it('ordena por prioridad y fecha límite, y pagina', async () => {
      expect(codes(await list({ search: 'FILT', sort: 'priority', dir: 'desc' }))).toEqual([aOrder.code, cOrder.code, bOrder.code]) // URGENT > MEDIUM > LOW
      expect(codes(await list({ search: 'FILT', sort: 'priority', dir: 'asc' }))).toEqual([bOrder.code, cOrder.code, aOrder.code])
      const byEnd = await list({ search: 'FILT', sort: 'plannedEnd' })
      expect(byEnd.body.items[0].code).toBe(aOrder.code) // la más vencida primero

      const p2 = await list({ search: 'FILT', pageSize: 2, page: 2 })
      expect(p2.body).toMatchObject({ total: 3, page: 2, pageSize: 2 })
      expect(p2.body.items).toHaveLength(1)
    })

    it('cada elemento marca overdue y los siguientes estados posibles', async () => {
      const res = await list({ search: 'FILT' })
      const a = res.body.items.find((o: { code: string }) => o.code === aOrder.code)
      expect(a).toMatchObject({ overdue: true, nextStatuses: ['PLANNED', 'CANCELLED'], asset: { tag: 'MB-2' } })
    })

    it('valida los parámetros', async () => {
      for (const q of ['status=VOLAR', 'type=X', 'priority=ALTISIMA', 'assetId=no-uuid', 'assignedTo=yo', 'overdue=2', 'sort=password', 'pageSize=101', 'page=0']) {
        await get(`${M}/work-orders?${q}`).expect(400)
      }
    })

    it('el operador y el técnico pueden consultar; las órdenes de otra planta no aparecen', async () => {
      for (const s of [op, tech, mgr]) await list({ search: 'FILT' }, s)
      const inB = await get('/api/v1/plants/e2e-m3/maintenance/work-orders', admin).expect(200)
      expect(inB.body.items.every((o: { asset: { tag: string } }) => o.asset.tag === 'B-1')).toBe(true)
    })
  })

  describe('responsables disponibles', () => {
    it('lista solo a miembros con acceso a mantenimiento, con sus roles', async () => {
      const res = await get(`${M}/assignees`).expect(200)
      const names = res.body.map((a: { name: string }) => a.name.split(' ')[0]).sort()
      expect(names).toEqual(['lead', 'mgr', 'op', 'pa', 'tech', 'tech2'])
      expect(names).not.toContain('wh') // almacén no tiene maintenance.read
      expect(res.body.find((a: { name: string }) => a.name.startsWith('tech ')).roles).toEqual(['TECHNICIAN'])
    })

    it('excluye asignaciones vencidas y usuarios desactivados', async () => {
      const gone = await t.user('expired')
      await t.assign(gone.id, plantA.id, 'TECHNICIAN', { endsAt: new Date(Date.now() - 60_000) })
      const off = await t.user('inactive', { status: 'INACTIVE' })
      await t.assign(off.id, plantA.id, 'TECHNICIAN')
      const names = (await get(`${M}/assignees`)).body.map((a: { name: string }) => a.name.split(' ')[0])
      expect(names).not.toContain('expired')
      expect(names).not.toContain('inactive')
    })
  })

  describe('tablero de indicadores (design.md §26)', () => {
    let plantD: Plant
    let dAsset: string
    const D = '/api/v1/plants/e2e-m2/maintenance'

    beforeAll(async () => {
      plantD = await t.plant('m2', 'PUBLIC')
      const model = (await t.model('MOLINO_BOLAS', 'E2E Bolas kpi')).id
      dAsset = (await http().post('/api/v1/plants/e2e-m2/assets').set('Authorization', bearer(admin)).send({ tag: 'K-1', name: 'K', assetModelId: model }).expect(201)).body.id

      type Seed = Partial<typeof workOrders.$inferInsert> & { status: string; type: string }
      const rows: Seed[] = [
        { status: 'REQUESTED', type: 'CORRECTIVE', plannedEnd: at(-2 * day) }, // atrasada
        { status: 'PLANNED', type: 'PREVENTIVE', plannedEnd: at(-1 * day) }, // atrasada
        { status: 'ASSIGNED', type: 'CORRECTIVE', plannedEnd: at(5 * day) },
        { status: 'IN_PROGRESS', type: 'PREDICTIVE' },
        { status: 'ON_HOLD', type: 'CORRECTIVE', plannedEnd: at(day) },
        { status: 'COMPLETED', type: 'CORRECTIVE', plannedEnd: at(-5 * day), actualStart: at(-10 * hour), actualEnd: at(-6 * hour) }, // 4 h
        { status: 'CLOSED', type: 'CORRECTIVE', plannedEnd: at(-5 * day), actualStart: at(-20 * hour), actualEnd: at(-18 * hour) }, // 2 h
        { status: 'CLOSED', type: 'PREVENTIVE', plannedEnd: at(-10 * day), actualStart: at(-11 * day - hour), actualEnd: at(-11 * day) }, // a tiempo
        { status: 'COMPLETED', type: 'PREVENTIVE', plannedEnd: at(-20 * day), actualStart: at(-19 * day - hour), actualEnd: at(-19 * day) }, // tarde
        { status: 'CANCELLED', type: 'PREVENTIVE', plannedEnd: at(-3 * day) }, // no cuenta
        { status: 'COMPLETED', type: 'CORRECTIVE', plannedEnd: at(-121 * day), actualStart: at(-120 * day - 3 * hour), actualEnd: at(-120 * day) }, // fuera de ventana
      ]
      await t.db.insert(workOrders).values(rows.map((r, i) => ({ plantId: plantD.id, assetId: dAsset, code: `OT-KPI-${i + 1}`, title: `KPI ${i + 1}`, ...r })))
    })

    it('calcula backlog, abiertas, atrasadas, completadas, MTTR y cumplimiento preventivo', async () => {
      const res = await get(`${D}/dashboard`, admin).expect(200)
      expect(res.body).toMatchObject({
        open: 5,
        backlog: 3, // solicitada + planificada + asignada
        inProgress: 1,
        overdue: 2,
        completedLast30Days: 4, // la de hace 120 días no cuenta
        mttrHours: 3, // (4 h + 2 h) / 2; la de hace 120 días queda fuera de la ventana de 90
        preventiveCompliancePct: 33.3, // 1 a tiempo de 3 (la cancelada no cuenta)
        mtbfHours: null, // requiere registro de fallas
      })
      expect(res.body.byStatus).toMatchObject({ REQUESTED: 1, PLANNED: 1, ASSIGNED: 1, IN_PROGRESS: 1, ON_HOLD: 1, COMPLETED: 3, CLOSED: 2, CANCELLED: 1 })
      expect(res.body.openByType).toEqual({ CORRECTIVE: 3, PREVENTIVE: 1, PREDICTIVE: 1 })
    })

    it('lista las atrasadas, la más vieja primero', async () => {
      const res = await get(`${D}/dashboard`, admin).expect(200)
      expect(res.body.overdueWorkOrders.map((o: { code: string }) => o.code)).toEqual(['OT-KPI-1', 'OT-KPI-2'])
      expect(res.body.overdueWorkOrders.every((o: { overdue: boolean }) => o.overdue)).toBe(true)
    })

    it('una planta sin órdenes devuelve ceros y "no disponible" (nunca inventa valores)', async () => {
      await t.plant('m4', 'PUBLIC')
      const res = await get('/api/v1/plants/e2e-m4/maintenance/dashboard', admin).expect(200)
      expect(res.body).toMatchObject({ open: 0, backlog: 0, overdue: 0, completedLast30Days: 0, mttrHours: null, preventiveCompliancePct: null, mtbfHours: null, overdueWorkOrders: [] })
    })
  })

  describe('planes de mantenimiento', () => {
    const plan = (over: object = {}) => ({ assetId: a1, name: 'Lubricación mensual', frequencyValue: 1, frequencyUnit: 'MONTHS', firstDueAt: '2026-01-15T10:00:00.000Z', ...over })
    const createPlan = async (over: object = {}, s: Session = lead) => (await send('post', `${M}/plans`, s, plan(over)).expect(201)).body

    it('exige maintenance.update para crear/editar; leer, solo maintenance.read', async () => {
      await send('post', `${M}/plans`, op, plan()).expect(403)
      await send('post', `${M}/plans`, tech, plan()).expect(403)
      await send('post', `${M}/plans`, mgr, plan()).expect(403)
      await get(`${M}/plans`, tech).expect(200)
    })

    it('crea el plan con activo, frecuencia y próxima fecha; marca vencidos como atrasados', async () => {
      const p = await createPlan()
      expect(p).toMatchObject({ name: 'Lubricación mensual', planType: 'PREVENTIVE', status: 'ACTIVE', frequencyValue: 1, frequencyUnit: 'MONTHS', nextDueAt: '2026-01-15T10:00:00.000Z', overdue: true, asset: { tag: 'MB-1' } })
      const future = await createPlan({ name: 'Anual', frequencyValue: 12, firstDueAt: iso(30 * day) })
      expect(future.overdue).toBe(false)
    })

    it('valida activo, frecuencia, unidad y fecha', async () => {
      const bad = (over: object) => send('post', `${M}/plans`, lead, plan(over)).expect(400)
      await bad({ assetId: bAsset })
      await bad({ assetId: aDecommissioned })
      await bad({ frequencyValue: 0 })
      await bad({ frequencyValue: 1.5 })
      await bad({ frequencyUnit: 'ANIOS' })
      await bad({ firstDueAt: '15/01/2026' })
      await bad({ name: '' })
    })

    it('genera la orden: PLANNED, tipo del plan, fecha límite = vencimiento; y avanza el plan', async () => {
      const p = await createPlan({ name: 'Cambio de aceite', priority: 'HIGH', description: 'Aceite ISO 320', frequencyValue: 2, frequencyUnit: 'WEEKS', firstDueAt: '2026-03-10T08:00:00.000Z' })
      const wo = (await send('post', `${M}/plans/${p.id}/generate`, lead).expect(201)).body

      expect(wo).toMatchObject({
        status: 'PLANNED',
        type: 'PREVENTIVE',
        priority: 'HIGH',
        title: 'Cambio de aceite',
        description: 'Aceite ISO 320',
        planId: p.id,
        plannedStart: '2026-03-10T08:00:00.000Z',
        plannedEnd: '2026-03-10T08:00:00.000Z',
        overdue: true,
      })
      expect(wo.history[0].note).toBe('Generada desde el plan «Cambio de aceite»')

      const after = (await get(`${M}/plans?assetId=${a1}`)).body.items.find((x: { id: string }) => x.id === p.id)
      expect(after.nextDueAt).toBe('2026-03-24T08:00:00.000Z') // +2 semanas desde el vencimiento anterior, no desde hoy
      expect(after.lastGeneratedAt).not.toBeNull()
    })

    it('no genera otra orden mientras haya una abierta del mismo plan (409); sí cuando se cierra', async () => {
      const p = await createPlan({ name: 'Inspección trimestral', frequencyValue: 3, firstDueAt: '2026-06-15T10:00:00.000Z' })
      const first = (await send('post', `${M}/plans/${p.id}/generate`, lead).expect(201)).body
      const dup = await send('post', `${M}/plans/${p.id}/generate`, lead).expect(409)
      expect(dup.body.message).toContain(first.code)

      await advance(first.id, 'CLOSED')
      const second = (await send('post', `${M}/plans/${p.id}/generate`, lead).expect(201)).body
      expect(second.plannedEnd).toBe('2026-09-15T10:00:00.000Z') // tras el primer avance (+3 meses)
      expect(second.code).not.toBe(first.code)
    })

    it('un plan pausado no genera; reactivarlo lo permite', async () => {
      const p = await createPlan({ name: 'Pausable' })
      const paused = await send('patch', `${M}/plans/${p.id}`, lead, { status: 'PAUSED' }).expect(200)
      expect(paused.body.status).toBe('PAUSED')
      await send('post', `${M}/plans/${p.id}/generate`, lead).expect(409)
      await send('patch', `${M}/plans/${p.id}`, lead, { status: 'ACTIVE' }).expect(200)
      await send('post', `${M}/plans/${p.id}/generate`, lead).expect(201)
    })

    it('planes predictivos y por condición generan órdenes del tipo correspondiente', async () => {
      const pred = await createPlan({ name: 'Análisis de vibraciones', planType: 'PREDICTIVE', firstDueAt: '2026-04-01T00:00:00.000Z' })
      const cond = await createPlan({ name: 'Inspección por condición', planType: 'CONDITION', firstDueAt: '2026-04-01T00:00:00.000Z' })
      expect((await send('post', `${M}/plans/${pred.id}/generate`, lead).expect(201)).body.type).toBe('PREDICTIVE')
      expect((await send('post', `${M}/plans/${cond.id}/generate`, lead).expect(201)).body.type).toBe('INSPECTION')
    })

    it('generar exige maintenance.update', async () => {
      const p = await createPlan({ name: 'Solo el jefe genera' })
      await send('post', `${M}/plans/${p.id}/generate`, op).expect(403)
      await send('post', `${M}/plans/${p.id}/generate`, tech).expect(403)
    })

    it('edita frecuencia, prioridad y próxima fecha; valida el cuerpo y el plan ajeno', async () => {
      const p = await createPlan({ name: 'Editable' })
      const res = await send('patch', `${M}/plans/${p.id}`, lead, { frequencyValue: 6, priority: 'LOW', nextDueAt: '2026-12-01T00:00:00.000Z' }).expect(200)
      expect(res.body).toMatchObject({ frequencyValue: 6, priority: 'LOW', nextDueAt: '2026-12-01T00:00:00.000Z' })
      await send('patch', `${M}/plans/${p.id}`, lead, {}).expect(400)
      await send('patch', `${M}/plans/${p.id}`, lead, { frequencyValue: -1 }).expect(400)
      await send('patch', `${M}/plans/${p.id}`, lead, { status: 'OTRO' }).expect(400)
      await send('patch', '/api/v1/plants/e2e-m3/maintenance/plans/' + p.id, admin, { priority: 'LOW' }).expect(404) // pertenece a la planta A
      await send('post', `${M}/plans/018f0000-0000-7000-8000-000000000000/generate`, lead).expect(404)
    })

    it('lista y filtra planes por activo y estado, con paginación', async () => {
      await createPlan({ assetId: a2, name: 'Plan de MB-2' })
      const byAsset = await get(`${M}/plans?assetId=${a2}`).expect(200)
      expect(byAsset.body.items.map((x: { name: string }) => x.name)).toEqual(['Plan de MB-2'])
      const paused = await get(`${M}/plans?status=PAUSED`).expect(200)
      expect(paused.body.items.every((x: { status: string }) => x.status === 'PAUSED')).toBe(true)
      await get(`${M}/plans?status=OTRO`).expect(400)
      await get(`${M}/plans?pageSize=101`).expect(400)
    })

    it('audita creación y generación', async () => {
      const events = await t.db.select().from(auditEvents).where(eq(auditEvents.plantId, plantA.id))
      const actions = events.filter((e) => e.entityType === 'plan').map((e) => e.action)
      expect(actions).toEqual(expect.arrayContaining(['created', 'work_order.generated', 'updated']))
    })

    it('borrar la planta elimina en cascada órdenes y planes', async () => {
      const tmp = await t.plant('mtmp', 'PUBLIC')
      const model = (await t.model('MOLINO_BOLAS', 'E2E Bolas tmp')).id
      const asset = (await http().post('/api/v1/plants/e2e-mtmp/assets').set('Authorization', bearer(admin)).send({ tag: 'T-1', name: 'T', assetModelId: model }).expect(201)).body.id
      await send('post', '/api/v1/plants/e2e-mtmp/maintenance/work-orders', admin, { assetId: asset, title: 'tmp' }).expect(201)
      await send('post', '/api/v1/plants/e2e-mtmp/maintenance/plans', admin, plan({ assetId: asset })).expect(201)
      await t.db.delete(plants).where(eq(plants.id, tmp.id))
      expect(await t.db.select().from(workOrders).where(eq(workOrders.plantId, tmp.id))).toHaveLength(0)
      expect(await t.db.select().from(maintenancePlans).where(eq(maintenancePlans.plantId, tmp.id))).toHaveLength(0)
    })
  })

  describe('ficha FUR del activo', () => {
    it('muestra a quien tiene maintenance.read el resumen: abiertas, atrasadas, último y próximo mantenimiento, recientes', async () => {
      const asset = (await http().post('/api/v1/plants/e2e-m1/assets').set('Authorization', bearer(pa)).send({ tag: 'FUR-M', name: 'Para FUR', assetModelId: (await t.model('MOLINO_BOLAS', 'E2E Bolas fur')).id, isPublic: true }).expect(201)).body.id
      const wo = await mkOrder(lead, { assetId: asset, title: 'Cerrada', plannedEnd: iso(-day) })
      await advance(wo.id, 'CLOSED')
      await mkOrder(lead, { assetId: asset, title: 'Abierta atrasada', plannedEnd: iso(-day) })
      await send('post', `${M}/plans`, lead, { assetId: asset, name: 'Plan lejano', frequencyValue: 1, frequencyUnit: 'MONTHS', firstDueAt: '2030-01-01T00:00:00.000Z' }).expect(201)
      await send('post', `${M}/plans`, lead, { assetId: asset, name: 'Plan cercano', frequencyValue: 1, frequencyUnit: 'MONTHS', firstDueAt: '2029-06-01T00:00:00.000Z' }).expect(201)

      const fur = (await get(`/api/v1/plants/e2e-m1/assets/${asset}/fur`, lead).expect(200)).body
      expect(fur.maintenance).toMatchObject({ openWorkOrders: 1, overdueWorkOrders: 1, nextMaintenanceAt: '2029-06-01T00:00:00.000Z' })
      expect(fur.maintenance.lastMaintenanceAt).not.toBeNull()
      expect(fur.maintenance.recent.map((o: { title: string }) => o.title).sort()).toEqual(['Abierta atrasada', 'Cerrada'])
    })

    it('quien no tiene maintenance.read (almacén, visitantes) no recibe datos de mantenimiento', async () => {
      const [asset] = (await get('/api/v1/plants/e2e-m1/assets?search=FUR-M', pa)).body.items
      // El visitante solo ve activos públicos si la planta publica sus activos.
      await t.db.update(plantSettings).set({ publicAssets: true }).where(eq(plantSettings.plantId, plantA.id))
      for (const s of [wh, null]) {
        const fur = await get(`/api/v1/plants/e2e-m1/assets/${asset.id}/fur`, s).expect(200) // wh ve el activo; el visitante, por ser público
        expect(fur.body.maintenance).toEqual({})
      }
    })
  })
})
