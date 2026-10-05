import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, plants } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Plant = typeof plants.$inferSelect

describe('Compras: requisiciones, RFQ y cotizaciones (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let plantA: Plant
  let admin: Session
  let buyer: Session // PROCUREMENT: lee, crea y aprueba
  let lead: Session // MAINTENANCE_LEAD: lee y crea (no aprueba)
  let lead2: Session
  let mgr: Session // PLANT_MANAGER: lee y aprueba (no crea)
  let wh: Session // WAREHOUSE: lee y mueve inventario
  let op: Session // OPERATOR: sin acceso a compras
  let consumer: Session
  let pOwner: Session // responsable del proveedor invitado
  let pOther: Session // responsable de otro proveedor (no invitado)
  let provA: string
  let provB: string
  let provSuspended: string
  let asset: string
  let loc: string
  let item: string

  const P = '/api/v1/plants/e2e-q1/procurement'
  const send = (method: 'post' | 'patch' | 'delete', url: string, s: Session | null, body: object = {}) => {
    const r = http()[method](url)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  const get = (url: string, s: Session | null = buyer) => {
    const r = http().get(url)
    return s ? r.set('Authorization', bearer(s)) : r
  }
  const future = (days = 3) => new Date(Date.now() + days * 86_400_000).toISOString()
  const today = () => new Date().toISOString().slice(0, 10)
  const line = (over: object = {}) => ({ description: 'Sello mecánico', quantity: 2, uom: 'UND', estimatedPrice: 100, ...over })
  const mkReq = async (s: Session = lead, over: object = {}) =>
    (await send('post', `${P}/requisitions`, s, { justification: 'Cambio programado de sellos', lines: [line()], ...over }).expect(201)).body
  const action = (id: string, name: string, s: Session | null, body: object = {}) => send('post', `${P}/requisitions/${id}/${name}`, s, body)
  const approved = async (over: object = {}) => {
    const rq = await mkReq(lead, over)
    await action(rq.id, 'submit', lead).expect(201)
    await action(rq.id, 'approve', buyer).expect(201)
    return rq.id as string
  }
  const withRfq = async (providerIds = [provA], over: object = {}) => {
    const id = await approved(over)
    const res = await send('post', `${P}/requisitions/${id}/rfq`, buyer, { providerIds, deadlineAt: future() }).expect(201)
    return { id, rfqId: res.body.rfq.id as string }
  }
  const quote = (providerId: string, rfqId: string, s: Session | null, body: object = {}) =>
    send('post', `/api/v1/providers/${providerId}/rfqs/${rfqId}/quote`, s, { currency: 'usd', totalAmount: 250, deliveryDays: 10, ...body })
  const status = async (id: string) => (await get(`${P}/requisitions/${id}`).expect(200)).body.status as string

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    plantA = await t.plant('q1', 'PUBLIC')
    await t.enableStage(plantA.id, 'D06')

    const names = ['admin', 'buyer', 'lead', 'lead2', 'mgr', 'wh', 'op', 'consumer', 'powner', 'pother']
    const users = await Promise.all(names.map((n) => t.user(n, { isGlobalAdmin: n === 'admin' })))
    const by = Object.fromEntries(users.map((u) => [u.firstName, u]))
    for (const [n, role] of [['buyer', 'PROCUREMENT'], ['lead', 'MAINTENANCE_LEAD'], ['lead2', 'MAINTENANCE_LEAD'], ['mgr', 'PLANT_MANAGER'], ['wh', 'WAREHOUSE'], ['op', 'OPERATOR']] as const) {
      await t.assign(by[n].id, plantA.id, role)
    }
    await t.assign(by.consumer.id, plantA.id, 'CONSUMER')
    ;[admin, buyer, lead, lead2, mgr, wh, op, consumer, pOwner, pOther] = await Promise.all(names.map((n) => login(app, n)))

    const mkProv = async (name: string, owner: string, extra: object = {}) =>
      (await send('post', '/api/v1/providers', admin, { organizationName: name, countryCode: 'PE', ownerEmail: `${owner}@e2e.fur.local`, ...extra }).expect(201)).body.id as string
    provA = await mkProv('E2E Proveedor A', 'powner')
    provB = await mkProv('E2E Proveedor B', 'pother')
    provSuspended = await mkProv('E2E Proveedor Suspendido', 'pother')
    await send('patch', `/api/v1/providers/${provSuspended}`, admin, { status: 'SUSPENDED' }).expect(200)

    const model = (await t.model('MOLINO_BOLAS', 'E2E Bolas compras')).id
    asset = (await send('post', '/api/v1/plants/e2e-q1/assets', admin, { tag: 'MB-1', name: 'Molino 1', assetModelId: model, stageCode: 'D06' }).expect(201)).body.id
    const wid = (await send('post', '/api/v1/plants/e2e-q1/inventory/warehouses', wh, { code: 'ALM', name: 'Almacén' }).expect(201)).body.id
    loc = (await send('post', '/api/v1/plants/e2e-q1/inventory/locations', wh, { warehouseId: wid, code: 'R1', name: 'Rack 1' }).expect(201)).body.id
    item = (await send('post', '/api/v1/plants/e2e-q1/inventory/items', wh, { sku: 'SELLO-1', name: 'Sello mecánico', uom: 'und', minStock: 5, maxStock: 10, unitCost: 100 }).expect(201)).body.id
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('acceso', () => {
    it('sin sesión 401; sin procurement.read (operador) 403; usuario común (solo lectura) puede ver pero no crear', async () => {
      await get(`${P}/requisitions`, null).expect(401)
      await get(`${P}/requisitions`, op).expect(403)
      await get(`${P}/summary`, op).expect(403)
      await get(`${P}/requisitions`, consumer).expect(200)
      await send('post', `${P}/requisitions`, consumer, { justification: 'x y z', lines: [line()] }).expect(403)
      await send('post', `${P}/requisitions`, wh, { justification: 'x y z', lines: [line()] }).expect(403)
    })

    it('el gerente aprueba pero no crea; el que crea (jefe de mantenimiento) no aprueba', async () => {
      await send('post', `${P}/requisitions`, mgr, { justification: 'x y z', lines: [line()] }).expect(403)
      const rq = await mkReq(lead)
      await action(rq.id, 'submit', lead).expect(201)
      await action(rq.id, 'approve', lead2).expect(403)
      await action(rq.id, 'reject', lead2, { note: 'no' }).expect(403)
      await action(rq.id, 'approve', mgr).expect(201)
    })

    it('otra planta: 403 con rol en la planta equivocada', async () => {
      const other = await t.plant('q2', 'PUBLIC')
      expect(other.id).toBeTruthy()
      await get('/api/v1/plants/e2e-q2/procurement/requisitions', buyer).expect(403)
    })
  })

  describe('crear y editar', () => {
    it('código RQ-AAAA-NNNNN secuencial, en borrador, con historial', async () => {
      const a = await mkReq()
      const b = await mkReq()
      expect(a.code).toMatch(/^RQ-\d{4}-\d{5}$/)
      expect(Number(b.code.slice(-5))).toBe(Number(a.code.slice(-5)) + 1)
      expect(a).toMatchObject({ status: 'DRAFT', priority: 'MEDIUM', estimatedTotal: 200, lineCount: 1 })
      expect(a.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['DRAFT'])
    })

    it('altas simultáneas no repiten código', async () => {
      const res = await Promise.all(Array.from({ length: 5 }, () => send('post', `${P}/requisitions`, lead, { justification: 'En paralelo', lines: [line()] })))
      const codes = res.map((r) => r.body.code)
      expect(new Set(codes).size).toBe(5)
    })

    it('valida: justificación, líneas, cantidades, decimales, fecha pasada, precios', async () => {
      const bad: object[] = [
        { justification: 'x' },
        { lines: [] },
        { lines: [line({ quantity: 0 })] },
        { lines: [line({ quantity: -1 })] },
        { lines: [line({ quantity: 0.00001 })] },
        { lines: [line({ description: '' })] },
        { lines: [line({ estimatedPrice: -5 })] },
        { lines: [line({ estimatedPrice: 1.005 })] },
        { priority: 'NOW' },
        { neededBy: '2020-01-01' },
        { neededBy: '2026-13-40' },
      ]
      for (const over of bad) await send('post', `${P}/requisitions`, lead, { justification: 'Motivo válido', lines: [line()], ...over }).expect(400)
    })

    it('referencias: etapa habilitada, activo y orden de la planta, ítem existente con su unidad', async () => {
      const ok = await mkReq(lead, { stageCode: 'D06', assetId: asset, neededBy: today(), lines: [line({ itemId: item, uom: undefined })] })
      expect(ok).toMatchObject({ stage: { code: 'D06' }, asset: { tag: 'MB-1' } })
      expect(ok.lines[0]).toMatchObject({ uom: 'UND', item: { sku: 'SELLO-1' } })
      for (const over of [{ stageCode: 'D07' }, { assetId: '00000000-0000-4000-8000-000000000000' }, { workOrderId: '00000000-0000-4000-8000-000000000000' }, { lines: [line({ itemId: '00000000-0000-4000-8000-000000000000' })] }, { lines: [line({ itemId: item, uom: 'KG' })] }]) {
        await send('post', `${P}/requisitions`, lead, { justification: 'Motivo válido', lines: [line()], ...over }).expect(400)
      }
    })

    it('editar: solo en borrador y solo quien la creó o quien aprueba; reemplaza las líneas', async () => {
      const rq = await mkReq()
      await send('patch', `${P}/requisitions/${rq.id}`, lead2, { priority: 'HIGH' }).expect(403)
      const res = await send('patch', `${P}/requisitions/${rq.id}`, lead, { priority: 'HIGH', lines: [line({ description: 'Otra' }), line({ description: 'Y otra', quantity: 1, estimatedPrice: 50 })] }).expect(200)
      expect(res.body).toMatchObject({ priority: 'HIGH', lineCount: 2, estimatedTotal: 250 })
      await send('patch', `${P}/requisitions/${rq.id}`, buyer, { justification: 'Ajustada por compras' }).expect(200) // quien aprueba
      await send('patch', `${P}/requisitions/${rq.id}`, lead, {}).expect(400)
      await action(rq.id, 'submit', lead).expect(201)
      await send('patch', `${P}/requisitions/${rq.id}`, lead, { priority: 'LOW' }).expect(409)
    })

    it('listado: filtros por estado (csv), prioridad, mías, búsqueda y paginación', async () => {
      const mine = await mkReq(lead, { priority: 'URGENT', justification: 'Búsqueda única ZETA9' })
      const codes = async (qs: string, s: Session = buyer) => (await get(`${P}/requisitions?${qs}`, s).expect(200)).body.items.map((i: { code: string }) => i.code)
      expect(await codes('search=ZETA9')).toEqual([mine.code])
      expect(await codes('search=ZETA9&priority=URGENT')).toEqual([mine.code])
      expect(await codes('search=ZETA9&priority=LOW')).toEqual([])
      expect(await codes('search=ZETA9&status=DRAFT,SUBMITTED')).toEqual([mine.code])
      expect(await codes('search=ZETA9&status=APPROVED')).toEqual([])
      expect(await codes('search=ZETA9&mine=1', lead)).toEqual([mine.code])
      expect(await codes('search=ZETA9&mine=1', lead2)).toEqual([])
      expect((await get(`${P}/requisitions?pageSize=1`).expect(200)).body.items).toHaveLength(1)
      expect(await codes('search=' + encodeURIComponent('%'))).toEqual([])
      for (const bad of ['status=NOPE', 'sort=chaos', 'priority=X', 'pageSize=500']) await get(`${P}/requisitions?${bad}`).expect(400)
    })
  })

  describe('flujo de aprobación', () => {
    it('enviar exige borrador; aprobar/rechazar solo lo enviado; rechazo exige motivo', async () => {
      const rq = await mkReq()
      await action(rq.id, 'approve', buyer).expect(409) // aún borrador
      await action(rq.id, 'submit', lead2).expect(403)
      await action(rq.id, 'submit', lead).expect(201)
      await action(rq.id, 'submit', lead).expect(409)
      await action(rq.id, 'reject', buyer, {}).expect(400)
      const res = await action(rq.id, 'reject', buyer, { note: 'Presupuesto agotado' }).expect(201)
      expect(res.body).toMatchObject({ status: 'REJECTED', decisionNote: 'Presupuesto agotado' })
      await action(rq.id, 'approve', buyer).expect(409)
      expect(res.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['REJECTED', 'SUBMITTED', 'DRAFT'])
    })

    it('nadie aprueba ni rechaza su propia requisición (salvo el administrador del ecosistema)', async () => {
      const rq = await mkReq(buyer)
      await action(rq.id, 'submit', buyer).expect(201)
      await action(rq.id, 'approve', buyer).expect(403)
      await action(rq.id, 'reject', buyer, { note: 'x' }).expect(403)
      expect(await status(rq.id)).toBe('SUBMITTED')
      await action(rq.id, 'approve', mgr).expect(201)

      const own = await mkReq(admin)
      await action(own.id, 'submit', admin).expect(201)
      await action(own.id, 'approve', admin).expect(201)
    })

    it('aprobaciones simultáneas: una sola gana', async () => {
      const rq = await mkReq()
      await action(rq.id, 'submit', lead).expect(201)
      const res = await Promise.all([action(rq.id, 'approve', buyer), action(rq.id, 'approve', mgr), action(rq.id, 'reject', buyer, { note: 'x' })])
      expect(res.filter((r) => r.status === 201)).toHaveLength(1)
      expect(res.filter((r) => r.status === 409)).toHaveLength(2)
      expect((await get(`${P}/requisitions/${rq.id}`).expect(200)).body.history.filter((h: { toStatus: string }) => ['APPROVED', 'REJECTED'].includes(h.toStatus))).toHaveLength(1)
    })

    it('cancelar exige motivo y solo antes de pedir; quien la creó o quien aprueba', async () => {
      const rq = await mkReq()
      await action(rq.id, 'cancel', lead, {}).expect(400)
      await action(rq.id, 'cancel', lead2, { note: 'ya no' }).expect(403)
      await action(rq.id, 'cancel', lead, { note: 'ya no' }).expect(201)
      await action(rq.id, 'cancel', lead, { note: 'otra vez' }).expect(409)
      const rej = await mkReq()
      await action(rej.id, 'submit', lead).expect(201)
      await action(rej.id, 'reject', buyer, { note: 'x' }).expect(201)
      await action(rej.id, 'cancel', lead, { note: 'x' }).expect(409) // ya cerrada
    })

    it('resumen de compras', async () => {
      const s = (await get(`${P}/summary`).expect(200)).body
      expect(s.pendingApproval).toBeGreaterThanOrEqual(1)
      expect(typeof s.byStatus).toBe('object')
    })

    it('auditoría', async () => {
      const ev = await t.db.select().from(auditEvents).where(and(eq(auditEvents.plantId, plantA.id), eq(auditEvents.module, 'procurement')))
      expect(ev.map((e) => e.action)).toEqual(expect.arrayContaining(['created', 'status.changed']))
    })
  })

  describe('RFQ y cotizaciones', () => {
    it('solo se pide cotización de una requisición aprobada, a proveedores activos y con plazo futuro', async () => {
      const draft = await mkReq()
      await send('post', `${P}/requisitions/${draft.id}/rfq`, buyer, { providerIds: [provA], deadlineAt: future() }).expect(409)
      const id = await approved()
      await send('post', `${P}/requisitions/${id}/rfq`, lead, { providerIds: [provA], deadlineAt: future() }).expect(201) // crea = procurement.create
      const id2 = await approved()
      for (const body of [
        { providerIds: [], deadlineAt: future() },
        { providerIds: [provA], deadlineAt: new Date(Date.now() - 1000).toISOString() },
        { providerIds: [provA], deadlineAt: 'mañana' },
        { providerIds: [provSuspended], deadlineAt: future() },
        { providerIds: ['00000000-0000-4000-8000-000000000000'], deadlineAt: future() },
        { providerIds: [provA, 'no-uuid'], deadlineAt: future() },
      ]) {
        await send('post', `${P}/requisitions/${id2}/rfq`, buyer, body).expect(400)
      }
      expect(await status(id2)).toBe('APPROVED')
    })

    it('crea el RFQ con código, invitados y mueve la requisición a RFQ; no se pide dos veces', async () => {
      const { id } = await withRfq([provA, provB])
      const rq = (await get(`${P}/requisitions/${id}`).expect(200)).body
      expect(rq.status).toBe('RFQ')
      expect(rq.rfq).toMatchObject({ status: 'OPEN', expired: false })
      expect(rq.rfq.code).toMatch(/^RFQ-\d{4}-\d{5}$/)
      expect(rq.rfq.invited.map((p: { name: string }) => p.name)).toEqual(['E2E Proveedor A', 'E2E Proveedor B'])
      await send('post', `${P}/requisitions/${id}/rfq`, buyer, { providerIds: [provA], deadlineAt: future() }).expect(409)
    })

    it('el proveedor ve solo lo necesario para cotizar: sin justificación ni precios estimados', async () => {
      const { rfqId } = await withRfq([provA], { justification: 'SECRETO-INTERNO', lines: [line({ estimatedPrice: 7654.32 })] })
      const list = (await get(`/api/v1/providers/${provA}/rfqs`, pOwner).expect(200)).body
      const mine = list.find((r: { id: string }) => r.id === rfqId)
      expect(mine).toMatchObject({ status: 'OPEN', acceptsQuotes: true, plant: { name: expect.any(String) }, myQuote: null })
      expect(mine.lines[0]).toEqual({ id: expect.any(String), description: 'Sello mecánico', quantity: 2, uom: 'UND' })
      expect(JSON.stringify(list)).not.toMatch(/SECRETO-INTERNO|7654/)
    })

    it('el acceso es por membresía: ajenos y anónimos no ven ni cotizan; un proveedor no invitado no ve el RFQ', async () => {
      const { rfqId } = await withRfq([provA])
      await get(`/api/v1/providers/${provA}/rfqs`, null).expect(401)
      await get(`/api/v1/providers/${provA}/rfqs`, pOther).expect(403)
      await get(`/api/v1/providers/${provA}/rfqs`, buyer).expect(403) // un comprador de planta tampoco
      await quote(provA, rfqId, pOther).expect(403)
      await quote(provA, rfqId, null).expect(401)
      const notInvited = (await get(`/api/v1/providers/${provB}/rfqs`, pOther).expect(200)).body
      expect(notInvited.find((r: { id: string }) => r.id === rfqId)).toBeUndefined()
      await quote(provB, rfqId, pOther).expect(404) // no invitado: indistinguible de inexistente
    })

    it('cotizar: valida el cuerpo, normaliza la moneda y reenviar reemplaza la cotización', async () => {
      const { rfqId } = await withRfq([provA])
      for (const body of [{ totalAmount: 0 }, { totalAmount: -5 }, { totalAmount: 10.005 }, { currency: 'US' }, { deliveryDays: -1 }, { deliveryDays: 1.5 }, { deliveryDays: 99999 }]) {
        await quote(provA, rfqId, pOwner, body).expect(400)
      }
      const first = (await quote(provA, rfqId, pOwner, { totalAmount: 300.5 }).expect(201)).body
      expect(first.myQuote).toMatchObject({ currency: 'USD', totalAmount: 300.5, deliveryDays: 10, status: 'SUBMITTED' })
      const second = (await quote(provA, rfqId, pOwner, { totalAmount: 280, conditions: 'Pago a 30 días' }).expect(201)).body
      expect(second.myQuote).toMatchObject({ totalAmount: 280, conditions: 'Pago a 30 días' })
      expect(second.myQuote.id).toBe(first.myQuote.id) // una cotización vigente por proveedor
    })

    it('un proveedor suspendido no cotiza; el plazo vencido o RFQ no abierto bloquea', async () => {
      const { id, rfqId } = await withRfq([provA])
      await t.pool.query('update procurement.rfqs set deadline_at = now() - interval \'1 minute\' where id = $1', [rfqId])
      await quote(provA, rfqId, pOwner).expect(409)
      const list = (await get(`/api/v1/providers/${provA}/rfqs`, pOwner).expect(200)).body
      expect(list.find((r: { id: string }) => r.id === rfqId).acceptsQuotes).toBe(false)
      expect((await get(`${P}/requisitions/${id}`).expect(200)).body.rfq.expired).toBe(true)

      const open = await withRfq([provA])
      await action(open.id, 'cancel', buyer, { note: 'ya no' }).expect(201)
      await quote(provA, open.rfqId, pOwner).expect(409)
    })

    it('retirar la cotización: solo si existe y el RFQ sigue abierto; no se puede adjudicar una retirada', async () => {
      const { id, rfqId } = await withRfq([provA])
      await send('delete', `/api/v1/providers/${provA}/rfqs/${rfqId}/quote`, pOwner).expect(400) // aún sin cotización
      const q = (await quote(provA, rfqId, pOwner).expect(201)).body.myQuote.id
      const res = await send('delete', `/api/v1/providers/${provA}/rfqs/${rfqId}/quote`, pOwner).expect(200)
      expect(res.body.myQuote.status).toBe('WITHDRAWN')
      await action(id, 'award', buyer, { quoteId: q }).expect(400)
      await quote(provA, rfqId, pOwner).expect(201) // volver a cotizar la reactiva
      await send('delete', `/api/v1/providers/${provB}/rfqs/${rfqId}/quote`, pOwner).expect(403)
    })

    it('el comprador ve las cotizaciones ordenadas por monto', async () => {
      const { id, rfqId } = await withRfq([provA, provB])
      await quote(provA, rfqId, pOwner, { totalAmount: 500 }).expect(201)
      await quote(provB, rfqId, pOther, { totalAmount: 320.75, currency: 'pen' }).expect(201)
      const rfq = (await get(`${P}/requisitions/${id}`).expect(200)).body.rfq
      expect(rfq.quotes.map((x: { providerName: string; totalAmount: number }) => [x.providerName, x.totalAmount])).toEqual([['E2E Proveedor B', 320.75], ['E2E Proveedor A', 500]])
      expect(rfq.quotes[0].currency).toBe('PEN')
    })

    it('cancelar el RFQ devuelve la requisición a APROBADA y descarta lo cotizado; se puede volver a pedir', async () => {
      const { id, rfqId } = await withRfq([provA])
      await quote(provA, rfqId, pOwner).expect(201)
      await send('delete', `${P}/requisitions/${id}/rfq`, wh).expect(403) // sin procurement.create
      const res = await send('delete', `${P}/requisitions/${id}/rfq`, buyer).expect(200)
      expect(res.body.status).toBe('APPROVED')
      expect(res.body.rfq).toMatchObject({ status: 'CANCELLED' })
      expect(res.body.rfq.quotes[0].status).toBe('REJECTED')
      await send('delete', `${P}/requisitions/${id}/rfq`, buyer).expect(409)
      await send('post', `${P}/requisitions/${id}/rfq`, buyer, { providerIds: [provB], deadlineAt: future() }).expect(201)
    })
  })

  describe('adjudicación', () => {
    it('adjudica: gana una, el resto se rechaza, el RFQ se cierra y la requisición queda ORDENADA; solo quien aprueba', async () => {
      const { id, rfqId } = await withRfq([provA, provB])
      const qa = (await quote(provA, rfqId, pOwner, { totalAmount: 500 }).expect(201)).body.myQuote.id
      const qb = (await quote(provB, rfqId, pOther, { totalAmount: 450 }).expect(201)).body.myQuote.id
      await action(id, 'award', lead, { quoteId: qb }).expect(403) // crea pero no aprueba
      await action(id, 'award', buyer, { quoteId: '00000000-0000-4000-8000-000000000000' }).expect(400)
      await action(id, 'award', buyer, { quoteId: 'x' }).expect(400)
      const res = await action(id, 'award', buyer, { quoteId: qb }).expect(201)
      expect(res.body.status).toBe('ORDERED')
      expect(res.body.rfq.status).toBe('AWARDED')
      expect(Object.fromEntries(res.body.rfq.quotes.map((x: { id: string; status: string }) => [x.id, x.status]))).toEqual({ [qa]: 'REJECTED', [qb]: 'AWARDED' })
      expect(res.body.history[0].note).toMatch(/Adjudicada a E2E Proveedor B/)
      // lo adjudicado se ve en el proveedor
      const mine = (await get(`/api/v1/providers/${provB}/rfqs`, pOther).expect(200)).body.find((r: { id: string }) => r.id === rfqId)
      expect(mine).toMatchObject({ status: 'AWARDED', acceptsQuotes: false, myQuote: { status: 'AWARDED' } })
      await action(id, 'award', buyer, { quoteId: qa }).expect(409)
      await quote(provA, rfqId, pOwner).expect(409)
    })

    it('adjudicaciones y cotizaciones simultáneas no dejan dos ganadoras ni cotizaciones vigentes en un RFQ cerrado', async () => {
      for (let i = 0; i < 4; i++) {
        const { id, rfqId } = await withRfq([provA, provB])
        const qa = (await quote(provA, rfqId, pOwner).expect(201)).body.myQuote.id
        const qb = (await quote(provB, rfqId, pOther).expect(201)).body.myQuote.id
        const res = await Promise.all([action(id, 'award', buyer, { quoteId: qa }), action(id, 'award', mgr, { quoteId: qb }), quote(provA, rfqId, pOwner, { totalAmount: 1 }), quote(provB, rfqId, pOther, { totalAmount: 2 })])
        expect(res.slice(0, 2).filter((r) => r.status === 201)).toHaveLength(1)
        expect(res.every((r) => r.status === 201 || r.status === 409)).toBe(true)
        const rfq = (await get(`${P}/requisitions/${id}`).expect(200)).body.rfq
        expect(rfq.status).toBe('AWARDED')
        expect(rfq.quotes.filter((x: { status: string }) => x.status === 'AWARDED')).toHaveLength(1)
        expect(rfq.quotes.filter((x: { status: string }) => x.status === 'SUBMITTED')).toHaveLength(0) // nada queda "vigente" tras adjudicar
      }
    })

    it('una requisición ordenada ya no se cancela', async () => {
      const { id, rfqId } = await withRfq([provA])
      const q = (await quote(provA, rfqId, pOwner).expect(201)).body.myQuote.id
      await action(id, 'award', buyer, { quoteId: q }).expect(201)
      await action(id, 'cancel', buyer, { note: 'x' }).expect(409)
    })
  })

  describe('recepción en inventario', () => {
    const ordered = async (lines: object[]) => {
      const { id, rfqId } = await withRfq([provA], { lines })
      const q = (await quote(provA, rfqId, pOwner).expect(201)).body.myQuote.id
      await action(id, 'award', buyer, { quoteId: q }).expect(201)
      return (await get(`${P}/requisitions/${id}`).expect(200)).body
    }
    const onHand = async () => (await get(`/api/v1/plants/e2e-q1/inventory/items/${item}`, wh).expect(200)).body.onHand as number

    it('solo con inventory.move, solo si está ORDENADA', async () => {
      const rq = await ordered([line({ itemId: item, uom: undefined })])
      const body = { lines: [{ lineId: rq.lines[0].id, quantity: 1, locationId: loc }] }
      await action(rq.id, 'receive', buyer, body).expect(403) // compras no mueve inventario
      await action(rq.id, 'receive', lead, body).expect(403)
      const draft = await mkReq()
      await action(draft.id, 'receive', wh, { lines: [{ lineId: draft.lines[0].id, quantity: 1 }] }).expect(409)
      await action(rq.id, 'receive', wh, body).expect(201)
    })

    it('ingresa stock con referencia a la requisición, recepción parcial y luego completa → RECIBIDA', async () => {
      const before = await onHand()
      const rq = await ordered([line({ itemId: item, uom: undefined, quantity: 6 })])
      const lineId = rq.lines[0].id
      const p1 = (await action(rq.id, 'receive', wh, { lines: [{ lineId, quantity: 4, locationId: loc, unitCost: 100 }] }).expect(201)).body
      expect(p1.status).toBe('ORDERED')
      expect(p1.lines[0].receivedQuantity).toBe(4)
      expect(await onHand()).toBe(before + 4)
      const moves = (await get(`/api/v1/plants/e2e-q1/inventory/movements?itemId=${item}&referenceType=REQUISITION`, wh).expect(200)).body.items
      expect(moves[0]).toMatchObject({ type: 'RECEIPT', quantity: 4, referenceType: 'REQUISITION', referenceId: rq.id })

      await action(rq.id, 'receive', wh, { lines: [{ lineId, quantity: 3, locationId: loc }] }).expect(409) // solo faltan 2
      expect(await onHand()).toBe(before + 4) // el rechazo no ingresó nada
      const p2 = (await action(rq.id, 'receive', wh, { lines: [{ lineId, quantity: 2, locationId: loc }] }).expect(201)).body
      expect(p2.status).toBe('RECEIVED')
      expect(p2.history[0]).toMatchObject({ toStatus: 'RECEIVED', note: 'Recepción completa' })
      expect(await onHand()).toBe(before + 6)
      await action(rq.id, 'receive', wh, { lines: [{ lineId, quantity: 1, locationId: loc }] }).expect(409)
    })

    it('valida línea, ubicación, duplicados y cantidades', async () => {
      const rq = await ordered([line({ itemId: item, uom: undefined })])
      const lineId = rq.lines[0].id
      const before = await onHand()
      for (const [body, status] of [
        [{ lines: [{ lineId, quantity: 1 }] }, 400], // falta ubicación (línea con ítem)
        [{ lines: [{ lineId, quantity: 1, locationId: '00000000-0000-4000-8000-000000000000' }] }, 400],
        [{ lines: [{ lineId: '00000000-0000-4000-8000-000000000000', quantity: 1, locationId: loc }] }, 400],
        [{ lines: [{ lineId, quantity: 1, locationId: loc }, { lineId, quantity: 1, locationId: loc }] }, 400],
        [{ lines: [{ lineId, quantity: 0, locationId: loc }] }, 400],
        [{ lines: [{ lineId, quantity: 1.00001, locationId: loc }] }, 400],
        [{ lines: [] }, 400],
        [{ lines: [{ lineId, quantity: 99, locationId: loc }] }, 409],
      ] as Array<[object, number]>) {
        await action(rq.id, 'receive', wh, body).expect(status)
      }
      expect(await onHand()).toBe(before)
    })

    it('atómica: si una línea falla, ninguna recibe; las líneas sin ítem solo cuentan lo recibido', async () => {
      const rq = await ordered([line({ itemId: item, uom: undefined }), line({ description: 'Servicio de montaje', quantity: 1 })])
      const [l1, l2] = rq.lines
      const before = await onHand()
      await action(rq.id, 'receive', wh, { lines: [{ lineId: l1.id, quantity: 1, locationId: loc }, { lineId: l2.id, quantity: 5 }] }).expect(409)
      expect(await onHand()).toBe(before)
      expect((await get(`${P}/requisitions/${rq.id}`).expect(200)).body.lines.map((l: { receivedQuantity: number }) => l.receivedQuantity)).toEqual([0, 0])

      await action(rq.id, 'receive', wh, { lines: [{ lineId: l2.id, quantity: 1 }] }).expect(201) // sin stock, sin ubicación
      expect(await onHand()).toBe(before)
      const done = (await action(rq.id, 'receive', wh, { lines: [{ lineId: l1.id, quantity: 2, locationId: loc }] }).expect(201)).body
      expect(done.status).toBe('RECEIVED')
    })

    it('recepciones simultáneas de la misma línea no pasan de lo pedido', async () => {
      const rq = await ordered([line({ itemId: item, uom: undefined, quantity: 3 })])
      const lineId = rq.lines[0].id
      const before = await onHand()
      const res = await Promise.all(Array.from({ length: 4 }, () => action(rq.id, 'receive', wh, { lines: [{ lineId, quantity: 2, locationId: loc }] })))
      expect(res.filter((r) => r.status === 201)).toHaveLength(1)
      expect(res.filter((r) => r.status === 409)).toHaveLength(3) // nunca un 500 por chocar con la restricción de la base
      expect(await onHand()).toBe(before + 2)
      expect((await get(`${P}/requisitions/${rq.id}`).expect(200)).body.lines[0].receivedQuantity).toBe(2)
    })

    it('la base impide recibir más de lo pedido aunque se salte la aplicación', async () => {
      const rq = await ordered([line({ quantity: 1 })])
      await expect(t.pool.query('update procurement.requisition_lines set received_quantity = 5 where id = $1', [rq.lines[0].id])).rejects.toThrow(/received_range/)
    })
  })

  describe('bloqueos de fila (carreras deterministas)', () => {
    /** Retiene el bloqueo de una fila, lanza la petición, cambia el estado y confirma: la petición debe ver el estado nuevo. */
    async function raceWith<T>(lockSql: string, id: string, change: string, fire: () => Promise<T>): Promise<T> {
      const c = await t.pool.connect()
      try {
        await c.query('begin')
        await c.query(lockSql, [id])
        const pending = fire().then((r) => r)
        await new Promise((r) => setTimeout(r, 400)) // la petición ya leyó y espera el bloqueo
        await c.query(change, [id])
        await c.query('commit')
        return await pending
      } catch (e) {
        await c.query('rollback').catch(() => undefined)
        throw e
      } finally {
        c.release()
      }
    }

    it('editar una requisición que se envió mientras tanto → 409, sin pisar sus líneas', async () => {
      const rq = await mkReq()
      const res = await raceWith('select 1 from procurement.requisitions where id = $1 for update', rq.id, "update procurement.requisitions set status = 'SUBMITTED' where id = $1", () =>
        send('patch', `${P}/requisitions/${rq.id}`, lead, { priority: 'URGENT', lines: [line({ description: 'Pisada' })] }),
      )
      expect(res.status).toBe(409)
      const after = (await get(`${P}/requisitions/${rq.id}`).expect(200)).body
      expect(after.lines[0].description).toBe('Sello mecánico')
      expect(after.priority).toBe('MEDIUM')
    })

    it('cotizar en un RFQ que se cerró mientras tanto → 409 y no queda cotización', async () => {
      const { id, rfqId } = await withRfq([provA])
      const res = await raceWith('select 1 from procurement.rfqs where id = $1 for update', rfqId, "update procurement.rfqs set status = 'CANCELLED' where id = $1", () => quote(provA, rfqId, pOwner))
      expect(res.status).toBe(409)
      expect((await get(`${P}/requisitions/${id}`).expect(200)).body.rfq.quotes).toEqual([])
    })
  })

  describe('sugerencias desde inventario', () => {
    it('lista los ítems bajo mínimo con la cantidad faltante hasta el máximo; solo con procurement.create', async () => {
      await get(`${P}/suggestions`, wh).expect(403)
      const low = await send('post', '/api/v1/plants/e2e-q1/inventory/items', wh, { sku: 'BAJO-1', name: 'Rodamiento bajo', uom: 'UND', minStock: 5, maxStock: 12 }).expect(201)
      await send('post', '/api/v1/plants/e2e-q1/inventory/movements/receipt', wh, { itemId: low.body.id, locationId: loc, quantity: 2 }).expect(201)
      const s = (await get(`${P}/suggestions`, lead).expect(200)).body
      expect(s.find((x: { sku: string }) => x.sku === 'BAJO-1')).toMatchObject({ onHand: 2, suggestedQuantity: 10, uom: 'UND' })
    })
  })
})
