import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Costos de órdenes de trabajo y de activos (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let admin: Session
  let pa: Session // administrador de planta: edita órdenes y lee Presupuestos
  let lead: Session // jefe de mantenimiento: edita órdenes, SIN acceso a Presupuestos
  let tech: Session // técnico asignado
  let tech2: Session
  let op: Session // operador: solo lectura de mantenimiento
  let mgr: Session
  let outsider: Session
  let techId: string
  let asset: string
  let otherAsset: string
  let labor: { id: string }
  let penEquipment: { id: string }

  const P = '/api/v1/plants/e2e-mc1'
  const M = `${P}/maintenance`
  const B = `${P}/budgets`
  const send = (method: 'post' | 'patch' | 'put' | 'delete', url: string, s: Session | null, body: object = {}) => {
    const r = http()[method](url)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  const get = (url: string, s: Session | null = lead) => {
    const r = http().get(url)
    return s ? r.set('Authorization', bearer(s)) : r
  }
  const mkOrder = async (assetId = asset) => (await send('post', `${M}/work-orders`, lead, { assetId, title: 'Cambio de rodamiento' }).expect(201)).body
  const go = (id: string, s: Session, body: object) => send('post', `${M}/work-orders/${id}/transition`, s, body)
  const start = async (id: string) => {
    await go(id, lead, { to: 'PLANNED' }).expect(201)
    await go(id, lead, { to: 'ASSIGNED', assignedTo: techId }).expect(201)
    await go(id, tech, { to: 'IN_PROGRESS' }).expect(201)
  }
  const addCost = (woId: string, s: Session | null, body: object) => send('post', `${M}/work-orders/${woId}/costs`, s, body)
  const manual = { kind: 'SERVICE', description: 'Alineación láser', quantity: 1, unitCost: 350 }
  const resource = async (body: object) => (await send('post', `${B}/resources`, pa, body).expect(201)).body

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()

    const plant = await t.plant('mc1', 'PUBLIC')
    const other = await t.plant('mc2', 'PUBLIC')
    const model = (await t.model('MOLINO_BOLAS', 'E2E Bolas costos')).id
    const names = ['admin', 'pa', 'lead', 'tech', 'tech2', 'op', 'mgr', 'outsider']
    const users = await Promise.all(names.map((n) => t.user(n, { isGlobalAdmin: n === 'admin' })))
    const byName = Object.fromEntries(users.map((u) => [u.firstName, u]))
    const roles: Array<[string, string]> = [['pa', 'PLANT_ADMIN'], ['lead', 'MAINTENANCE_LEAD'], ['tech', 'TECHNICIAN'], ['tech2', 'TECHNICIAN'], ['op', 'OPERATOR'], ['mgr', 'PLANT_MANAGER']]
    for (const [name, role] of roles) await t.assign(byName[name].id, plant.id, role)
    await t.assign(byName.outsider.id, other.id, 'MAINTENANCE_LEAD')
    techId = byName.tech.id
    ;[admin, pa, lead, tech, tech2, op, mgr, outsider] = await Promise.all(names.map((n) => login(app, n)))
    void admin

    asset = (await http().post(`${P}/assets`).set('Authorization', bearer(pa)).send({ tag: 'MB-1', name: 'Molino 1', assetModelId: model }).expect(201)).body.id
    otherAsset = (await http().post(`${P}/assets`).set('Authorization', bearer(pa)).send({ tag: 'MB-2', name: 'Molino 2', assetModelId: model }).expect(201)).body.id

    // Libro de precios: mano de obra en USD, equipo en soles (con tipo de cambio) y un recurso en una moneda SIN tipo de cambio.
    await send('put', `${B}/exchange-rates`, pa, { currency: 'PEN', rate: 0.27 }).expect(200)
    labor = await resource({ code: 'LAB-MEC', name: 'Mecánico', resourceType: 'LABOR', unit: 'hh', unitPrice: 4.5, currency: 'USD' })
    penEquipment = await resource({ code: 'EQ-GRUA', name: 'Grúa 20 t', resourceType: 'EQUIPMENT', unit: 'hm', unitPrice: 100, currency: 'PEN' })
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('acceso y estado de la orden', () => {
    it('sin sesión 401; miembro de otra planta 403; el operador (solo lectura) y otro técnico no registran costos', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      await addCost(wo.id, null, manual).expect(401)
      await addCost(wo.id, outsider, manual).expect(403)
      for (const s of [op, tech2, mgr]) await addCost(wo.id, s, manual).expect(403)
    })

    it('el responsable y quien edita la orden sí registran', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      await addCost(wo.id, tech, manual).expect(201)
      await addCost(wo.id, lead, manual).expect(201)
    })

    it('solo con la orden en ejecución, en pausa o terminada (no solicitada, planificada ni asignada)', async () => {
      const wo = await mkOrder()
      await addCost(wo.id, lead, manual).expect(409)
      await go(wo.id, lead, { to: 'PLANNED' }).expect(201)
      await addCost(wo.id, lead, manual).expect(409)
      await go(wo.id, lead, { to: 'ASSIGNED', assignedTo: techId }).expect(201)
      await addCost(wo.id, tech, manual).expect(409)
      await go(wo.id, tech, { to: 'IN_PROGRESS' }).expect(201)
      await addCost(wo.id, tech, manual).expect(201)
      await go(wo.id, tech, { to: 'ON_HOLD', note: 'Falta repuesto' }).expect(201)
      await addCost(wo.id, tech, manual).expect(201)
      await go(wo.id, tech, { to: 'IN_PROGRESS' }).expect(201)
      await go(wo.id, tech, { to: 'COMPLETED', completionNotes: 'Listo' }).expect(201)
      await addCost(wo.id, lead, manual).expect(201) // terminada: aún se puede
    })

    it('al cerrar la orden ya no se editan los costos', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const line = (await addCost(wo.id, tech, manual).expect(201)).body.costs[0].id
      await go(wo.id, tech, { to: 'COMPLETED', completionNotes: 'Listo' }).expect(201)
      await go(wo.id, mgr, { to: 'CLOSED' }).expect(201)
      await addCost(wo.id, lead, manual).expect(409)
      await send('delete', `${M}/work-orders/${wo.id}/costs/${line}`, lead).expect(409)
    })

    it('orden inexistente u de otra planta → 404', async () => {
      await addCost('00000000-0000-4000-8000-000000000000', lead, manual).expect(404)
    })
  })

  describe('costo manual', () => {
    it('registra, calcula la línea y suma al detalle de la orden junto a los repuestos', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const res = await addCost(wo.id, lead, { kind: 'SERVICE', description: 'Alineación láser', quantity: 2, unitCost: 175.255 }).expect(201)
      expect(res.body.costs).toHaveLength(1)
      expect(res.body.costs[0]).toMatchObject({ kind: 'SERVICE', description: 'Alineación láser', quantity: 2, unitCost: 175.255, lineCost: 350.51, resource: null })
      expect(res.body.otherCost).toBe(350.51)

      const detail = (await get(`${M}/work-orders/${wo.id}`).expect(200)).body
      expect(detail.otherCost).toBe(350.51)
      expect(detail.partsCost).toBe(0)
      expect(detail.totalCost).toBe(350.51)
      expect(detail.costs[0].createdBy).toBeTruthy()
    })

    it('valida el cuerpo: tipo, cantidad, decimales, costo y campos obligatorios sin recurso', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const bad: Array<[object, string]> = [
        [{}, 'kind'],
        [{ ...manual, kind: 'MATERIAL' }, 'kind'],
        [{ ...manual, quantity: 0 }, 'quantity'],
        [{ ...manual, quantity: -2 }, 'quantity'],
        [{ ...manual, quantity: 1.00001 }, 'quantity'],
        [{ ...manual, unitCost: -1 }, 'unitCost'],
        [{ ...manual, unitCost: 1.00001 }, 'unitCost'],
        [{ kind: 'SERVICE', quantity: 1, unitCost: 5 }, 'description'], // sin recurso: descripción obligatoria
        [{ kind: 'SERVICE', description: 'x', quantity: 1 }, 'unitCost'], // sin recurso: costo obligatorio
        [{ ...manual, description: '   ' }, 'description'],
        [{ ...manual, resourceId: 'no-es-uuid' }, 'resourceId'],
      ]
      for (const [body, field] of bad) {
        const res = await addCost(wo.id, lead, body).expect(400)
        expect(JSON.stringify(res.body)).toContain(field)
      }
      expect((await get(`${M}/work-orders/${wo.id}`)).body.costs).toEqual([])
    })

    it('un costo en cero es válido (p. ej. servicio en garantía)', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const res = await addCost(wo.id, lead, { kind: 'SERVICE', description: 'Garantía del fabricante', quantity: 1, unitCost: 0 }).expect(201)
      expect(res.body.otherCost).toBe(0)
    })
  })

  describe('costo desde el libro de precios de Presupuestos', () => {
    it('toma el precio del recurso (USD), usa su nombre como descripción y enlaza el recurso', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const res = await addCost(wo.id, pa, { kind: 'LABOR', resourceId: labor.id, quantity: 6 }).expect(201)
      expect(res.body.costs[0]).toMatchObject({ kind: 'LABOR', description: 'Mecánico', quantity: 6, unitCost: 4.5, lineCost: 27, resource: { id: labor.id, code: 'LAB-MEC', unit: 'HH' } })
    })

    it('convierte a la moneda de la planta con el tipo de cambio vigente (100 PEN × 0.27 = USD 27)', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const res = await addCost(wo.id, pa, { kind: 'EQUIPMENT', resourceId: penEquipment.id, quantity: 3, description: 'Grúa para desmontaje' }).expect(201)
      expect(res.body.costs[0]).toMatchObject({ description: 'Grúa para desmontaje', unitCost: 27, lineCost: 81 })
    })

    it('el costo es una foto: si luego cambia el precio del recurso, la línea no cambia', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      await addCost(wo.id, pa, { kind: 'LABOR', resourceId: labor.id, quantity: 2 }).expect(201)
      await send('patch', `${B}/resources/${labor.id}`, pa, { unitPrice: 9 }).expect(200)
      const detail = (await get(`${M}/work-orders/${wo.id}`).expect(200)).body
      expect(detail.costs[0].unitCost).toBe(4.5)
      expect(detail.otherCost).toBe(9)
      // y un costo nuevo ya usa el precio nuevo
      const res = await addCost(wo.id, pa, { kind: 'LABOR', resourceId: labor.id, quantity: 1 }).expect(201)
      expect(res.body.costs.map((c: { unitCost: number }) => c.unitCost)).toEqual([4.5, 9])
      await send('patch', `${B}/resources/${labor.id}`, pa, { unitPrice: 4.5 }).expect(200) // restaura para el resto de pruebas
    })

    it('sin acceso a Presupuestos no se usan recursos (403), pero sí el costo manual', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      await addCost(wo.id, lead, { kind: 'LABOR', resourceId: labor.id, quantity: 1 }).expect(403)
      await addCost(wo.id, lead, { kind: 'LABOR', description: 'Mecánico externo', quantity: 1, unitCost: 5 }).expect(201)
    })

    it('el tipo de costo debe corresponder al tipo de recurso; servicios y otros no usan recursos', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const mismatch = await addCost(wo.id, pa, { kind: 'EQUIPMENT', resourceId: labor.id, quantity: 1 }).expect(400)
      expect(JSON.stringify(mismatch.body)).toContain('resourceId')
      await addCost(wo.id, pa, { kind: 'SERVICE', resourceId: labor.id, quantity: 1 }).expect(400)
      await addCost(wo.id, pa, { kind: 'OTHER', resourceId: labor.id, quantity: 1 }).expect(400)
    })

    it('no se mezcla costo manual con recurso, y un recurso inexistente o de otra planta se rechaza', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const both = await addCost(wo.id, pa, { kind: 'LABOR', resourceId: labor.id, quantity: 1, unitCost: 3 }).expect(400)
      expect(JSON.stringify(both.body)).toContain('unitCost')
      await addCost(wo.id, pa, { kind: 'LABOR', resourceId: '00000000-0000-4000-8000-000000000000', quantity: 1 }).expect(400)
    })

    it('un recurso inactivo → 409; uno en una moneda sin tipo de cambio → 409 con el motivo', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const old = await resource({ code: 'LAB-OLD', name: 'Capataz', resourceType: 'LABOR', unit: 'hh', unitPrice: 6, currency: 'USD' })
      await send('patch', `${B}/resources/${old.id}`, pa, { status: 'INACTIVE' }).expect(200)
      await addCost(wo.id, pa, { kind: 'LABOR', resourceId: old.id, quantity: 1 }).expect(409)

      // La API no deja crear un recurso en una moneda sin tipo de cambio (ni borrar un tipo de cambio en uso): se fuerza por SQL
      // para comprobar la defensa del servicio si los datos quedaran así (p. ej. por una carga directa).
      const plantId = (await t.pool.query("select id from core.plants where slug = 'e2e-mc1'")).rows[0].id
      const eurId = (
        await t.pool.query(
          "insert into budget.resources (id, plant_id, code, name, resource_type, unit, unit_price, currency) values (gen_random_uuid(), $1, 'LAB-EUR', 'Especialista europeo', 'LABOR', 'HH', 50, 'EUR') returning id",
          [plantId],
        )
      ).rows[0].id
      const res = await addCost(wo.id, pa, { kind: 'LABOR', resourceId: eurId, quantity: 1 }).expect(409)
      expect(res.body.message).toContain('EUR')
      expect((await get(`${M}/work-orders/${wo.id}`)).body.costs).toEqual([])
    })
  })

  describe('quitar un costo', () => {
    it('el responsable lo quita; quitarlo dos veces → 404; de otra orden → 404; sin permiso → 403', async () => {
      const wo = await mkOrder()
      const woB = await mkOrder()
      await start(wo.id)
      await start(woB.id)
      const line = (await addCost(wo.id, tech, manual).expect(201)).body.costs[0].id
      await send('delete', `${M}/work-orders/${woB.id}/costs/${line}`, tech).expect(404)
      await send('delete', `${M}/work-orders/${wo.id}/costs/${line}`, tech2).expect(403)
      await send('delete', `${M}/work-orders/${wo.id}/costs/${line}`, op).expect(403)
      const res = await send('delete', `${M}/work-orders/${wo.id}/costs/${line}`, tech).expect(200)
      expect(res.body).toMatchObject({ costs: [], otherCost: 0 })
      await send('delete', `${M}/work-orders/${wo.id}/costs/${line}`, tech).expect(404)
    })

    it('quitar costos simultáneamente: solo una petición lo logra', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const line = (await addCost(wo.id, tech, manual).expect(201)).body.costs[0].id
      const results = await Promise.all([1, 2, 3].map(() => send('delete', `${M}/work-orders/${wo.id}/costs/${line}`, tech)))
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      expect(results.filter((r) => r.status === 404)).toHaveLength(2)
    })

    it('carrera: registrar un costo mientras la orden se cierra → 409 y no queda la línea', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      await go(wo.id, tech, { to: 'COMPLETED', completionNotes: 'Listo' }).expect(201)
      const conn = await t.pool.connect()
      try {
        await conn.query('begin')
        await conn.query('select 1 from maintenance.work_orders where id = $1 for update', [wo.id])
        const pending = addCost(wo.id, lead, manual).then((r) => r)
        await new Promise((r) => setTimeout(r, 400))
        await conn.query("update maintenance.work_orders set status = 'CLOSED' where id = $1", [wo.id])
        await conn.query('commit')
        expect((await pending).status).toBe(409)
      } finally {
        conn.release()
      }
      const n = await t.pool.query('select count(*)::int as n from maintenance.work_order_costs where work_order_id = $1', [wo.id])
      expect(n.rows[0].n).toBe(0)
    })

    it('queda auditado (alta y baja)', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const line = (await addCost(wo.id, tech, manual).expect(201)).body.costs[0].id
      await send('delete', `${M}/work-orders/${wo.id}/costs/${line}`, tech).expect(200)
      const rows = await t.pool.query("select action from audit.events where entity_id = $1 and action like 'cost.%' order by occurred_at, id", [wo.id])
      expect(rows.rows.map((r: { action: string }) => r.action)).toEqual(['cost.added', 'cost.removed'])
    })
  })

  describe('costos del activo (pestaña Costos de la FUR)', () => {
    // Activo propio: sus totales no se mezclan con las órdenes de las pruebas anteriores.
    let wo1: { id: string; code: string }
    let wo2: { id: string; code: string }

    beforeAll(async () => {
      // Repuesto con costo promedio 50 consumido por wo1 (inventario mínimo para la prueba).
      const wh = await t.user('mcwh')
      await t.assign(wh.id, (await t.db.query.plants.findFirst({ where: (p, { eq }) => eq(p.slug, 'e2e-mc1') }))!.id, 'WAREHOUSE')
      const whS = await login(app, 'mcwh')
      const w = (await send('post', `${P}/inventory/warehouses`, whS, { code: 'ALM1', name: 'Central' }).expect(201)).body.id
      const loc = (await send('post', `${P}/inventory/locations`, whS, { warehouseId: w, code: 'A-01', name: 'Rack', locationType: 'RACK' }).expect(201)).body.id
      const item = (await send('post', `${P}/inventory/items`, whS, { sku: 'MC-PART', name: 'Rodamiento' }).expect(201)).body.id
      await send('post', `${P}/inventory/movements/receipt`, whS, { itemId: item, locationId: loc, quantity: 10, unitCost: 50 }).expect(201)

      wo1 = await mkOrder(otherAsset)
      await start(wo1.id)
      await send('post', `${M}/work-orders/${wo1.id}/parts`, tech, { itemId: item, locationId: loc, quantity: 2 }).expect(201) // 100
      await addCost(wo1.id, pa, { kind: 'LABOR', resourceId: labor.id, quantity: 10 }).expect(201) // 45
      await addCost(wo1.id, pa, { kind: 'EQUIPMENT', resourceId: penEquipment.id, quantity: 2 }).expect(201) // 54
      await addCost(wo1.id, lead, { kind: 'SERVICE', description: 'Rectificado externo', quantity: 1, unitCost: 300 }).expect(201) // 300
      await go(wo1.id, tech, { to: 'COMPLETED', completionNotes: 'Listo' }).expect(201)

      wo2 = (await send('post', `${M}/work-orders`, lead, { assetId: otherAsset, title: 'Inspección', type: 'PREVENTIVE' }).expect(201)).body
      await start(wo2.id)
      await addCost(wo2.id, lead, { kind: 'OTHER', description: 'Consumibles varios', quantity: 4, unitCost: 2.5 }).expect(201) // 10

      // Una tercera orden con costos que se CANCELA: no debe contar.
      const wo3 = await mkOrder(otherAsset)
      await start(wo3.id)
      await addCost(wo3.id, lead, { kind: 'SERVICE', description: 'Cancelado', quantity: 1, unitCost: 9999 }).expect(201)
      await go(wo3.id, tech, { to: 'ON_HOLD', note: 'Falta repuesto' }).expect(201) // en ejecución no se cancela: primero se pausa
      await go(wo3.id, lead, { to: 'CANCELLED', note: 'Duplicada' }).expect(201)
    })

    const costs = (s: Session | null = lead, id = otherAsset) => get(`${M}/assets/${id}/costs`, s)

    it('acceso: sin sesión 401; otra planta 403; el operador (maintenance.read) puede leer; activo ajeno 404', async () => {
      await costs(null).expect(401)
      await costs(outsider).expect(403)
      await costs(op).expect(200)
      await costs(lead, '00000000-0000-4000-8000-000000000000').expect(404)
      await costs(lead, 'no-uuid').expect(400)
    })

    it('desglose por categoría; excluye las órdenes canceladas', async () => {
      const { body } = await costs().expect(200)
      expect(body.currency).toBe('USD')
      expect(body.totals).toEqual({ parts: 100, labor: 45, equipment: 54, transport: 0, service: 300, other: 10, total: 509, partsWithoutCost: 0 })
      expect(body.orderCount).toBe(2)
    })

    it('por orden, de mayor a menor costo, con repuestos y resto por separado', async () => {
      const { body } = await costs().expect(200)
      expect(body.orders.map((o: { code: string }) => o.code)).toEqual([wo1.code, wo2.code])
      expect(body.orders[0]).toMatchObject({ id: wo1.id, parts: 100, other: 399, total: 499, type: 'CORRECTIVE', status: 'COMPLETED' })
      expect(body.orders[1]).toMatchObject({ id: wo2.id, parts: 0, other: 10, total: 10, type: 'PREVENTIVE' })
    })

    it('por tipo de orden', async () => {
      const { body } = await costs().expect(200)
      expect(body.byType).toEqual([
        { type: 'CORRECTIVE', orders: 1, total: 499 },
        { type: 'PREVENTIVE', orders: 1, total: 10 },
      ])
    })

    it('serie de 12 meses continua: el costo cae en el mes actual y el resto va en cero', async () => {
      const { body } = await costs().expect(200)
      expect(body.byMonth).toHaveLength(12)
      const now = new Date()
      const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
      expect(body.byMonth.at(-1)).toEqual({ month: current, parts: 100, other: 409, total: 509 })
      expect(body.byMonth.slice(0, 11).every((m: { total: number }) => m.total === 0)).toBe(true)
      expect(body.byMonth.map((m: { month: string }) => m.month)).toEqual([...body.byMonth.map((m: { month: string }) => m.month)].sort())
      expect(body.beforeWindow).toBe(0)
    })

    it('un activo sin costos devuelve ceros, no errores', async () => {
      const { body } = await costs(lead, asset).expect(200)
      expect(body.orderCount).toBeGreaterThan(0) // el activo "asset" sí tiene órdenes de las pruebas anteriores…
      const empty = (await http().post(`${P}/assets`).set('Authorization', bearer(pa)).send({ tag: 'MB-3', name: 'Molino 3', assetModelId: (await t.model('MOLINO_BOLAS', 'E2E Bolas costos 2')).id }).expect(201)).body.id
      const res = (await costs(lead, empty).expect(200)).body
      expect(res.totals).toEqual({ parts: 0, labor: 0, equipment: 0, transport: 0, service: 0, other: 0, total: 0, partsWithoutCost: 0 })
      expect(res.orders).toEqual([])
      expect(res.byType).toEqual([])
    })

    it('la FUR y el tablero de mantenimiento incluyen estos costos (el tablero solo cuenta órdenes terminadas)', async () => {
      const fur = (await get(`${P}/assets/${otherAsset}/fur`).expect(200)).body.maintenance
      expect(fur).toMatchObject({ partsCost: 100, otherCost: 409, totalCost: 509 })

      const dash = (await get(`${M}/dashboard`).expect(200)).body
      // wo1 está terminada (cuenta); wo2 sigue en ejecución y wo3 se canceló (no cuentan)
      expect(dash.otherCostLast30Days).toBeGreaterThanOrEqual(399)
      expect(dash.totalCostLast30Days).toBeCloseTo(dash.partsCostLast30Days + dash.otherCostLast30Days, 2)
    })

    it('un repuesto sin costo cargado se cuenta aparte (no suma ni se oculta)', async () => {
      const wh = await login(app, 'mcwh')
      const w = (await send('post', `${P}/inventory/warehouses`, wh, { code: 'ALM2', name: 'Secundario' }).expect(201)).body.id
      const loc = (await send('post', `${P}/inventory/locations`, wh, { warehouseId: w, code: 'B-01', name: 'Rack B', locationType: 'RACK' }).expect(201)).body.id
      const free = (await send('post', `${P}/inventory/items`, wh, { sku: 'MC-FREE', name: 'Grasa', itemType: 'CONSUMABLE' }).expect(201)).body.id
      await send('post', `${P}/inventory/movements/receipt`, wh, { itemId: free, locationId: loc, quantity: 5 }).expect(201)
      const wo = await mkOrder(otherAsset)
      await start(wo.id)
      await send('post', `${M}/work-orders/${wo.id}/parts`, tech, { itemId: free, locationId: loc, quantity: 1 }).expect(201)
      const { body } = await costs().expect(200)
      expect(body.totals.partsWithoutCost).toBe(1)
      expect(body.totals.parts).toBe(100)
    })
  })

  describe('borrado de la planta', () => {
    it('al borrar la planta caen en cascada los costos y los recursos enlazados (sin romper claves foráneas)', async () => {
      const plant = await t.plant('mc3', 'PUBLIC')
      const u = await t.user('mcdel')
      await t.assign(u.id, plant.id, 'PLANT_ADMIN')
      const s = await login(app, 'mcdel')
      const P3 = '/api/v1/plants/e2e-mc3'
      const model = (await t.model('MOLINO_BOLAS', 'E2E Bolas costos 3')).id
      const a = (await send('post', `${P3}/assets`, s, { tag: 'D-1', name: 'D1', assetModelId: model }).expect(201)).body.id
      const res = (await send('post', `${P3}/budgets/resources`, s, { code: 'L-1', name: 'Mec', resourceType: 'LABOR', unit: 'hh', unitPrice: 4, currency: 'USD' }).expect(201)).body
      const wo = (await send('post', `${P3}/maintenance/work-orders`, s, { assetId: a, title: 'X' }).expect(201)).body
      await send('post', `${P3}/maintenance/work-orders/${wo.id}/transition`, s, { to: 'PLANNED' }).expect(201)
      await send('post', `${P3}/maintenance/work-orders/${wo.id}/transition`, s, { to: 'ASSIGNED', assignedTo: u.id }).expect(201)
      await send('post', `${P3}/maintenance/work-orders/${wo.id}/transition`, s, { to: 'IN_PROGRESS' }).expect(201)
      await send('post', `${P3}/maintenance/work-orders/${wo.id}/costs`, s, { kind: 'LABOR', resourceId: res.id, quantity: 1 }).expect(201)
      await t.cleanup() // borra plantas e2e-* y usuarios: no debe fallar
      const left = await t.pool.query('select count(*)::int as n from maintenance.work_order_costs where work_order_id = $1', [wo.id])
      expect(left.rows[0].n).toBe(0)
    })
  })
})
