import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, movements, plants, stock } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Plant = typeof plants.$inferSelect

describe('Inventario / WMS (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let plantA: Plant
  let admin: Session
  let pa: Session
  let wh: Session // almacén: todo el inventario
  let lead: Session // jefe de mantenimiento: solo lee inventario
  let tech: Session // técnico: lee inventario, ejecuta órdenes asignadas
  let tech2: Session
  let op: Session
  let mgr: Session
  let outsider: Session // miembro de otra planta
  let techId: string
  let asset: string
  let whA: string // almacén A
  let locA: string
  let locB: string

  const I = '/api/v1/plants/e2e-i1/inventory'
  const M = '/api/v1/plants/e2e-i1/maintenance'
  const send = (method: 'post' | 'patch' | 'delete', url: string, s: Session | null, body: object = {}) => {
    const r = http()[method](url)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  const get = (url: string, s: Session | null = wh) => {
    const r = http().get(url)
    return s ? r.set('Authorization', bearer(s)) : r
  }

  let skuN = 0
  const mkItem = async (over: object = {}) =>
    (await send('post', `${I}/items`, wh, { sku: `SKU-${++skuN}-${Date.now() % 100000}`, name: 'Rodamiento 6205', ...over }).expect(201)).body
  const receipt = (itemId: string, locationId: string, quantity: number, unitCost?: number, s: Session = wh) =>
    send('post', `${I}/movements/receipt`, s, { itemId, locationId, quantity, ...(unitCost === undefined ? {} : { unitCost }) })
  const issue = (itemId: string, locationId: string, quantity: number, s: Session = wh) => send('post', `${I}/movements/issue`, s, { itemId, locationId, quantity })
  const item = async (id: string) => (await get(`${I}/items/${id}`).expect(200)).body
  const mkOrder = async () => (await send('post', `${M}/work-orders`, lead, { assetId: asset, title: 'Cambio de rodamiento' }).expect(201)).body
  const go = (id: string, s: Session, body: object) => send('post', `${M}/work-orders/${id}/transition`, s, body)
  const start = async (id: string) => {
    await go(id, lead, { to: 'PLANNED' }).expect(201)
    await go(id, lead, { to: 'ASSIGNED', assignedTo: techId }).expect(201)
    await go(id, tech, { to: 'IN_PROGRESS' }).expect(201)
  }
  const addPart = (woId: string, s: Session, body: object) => send('post', `${M}/work-orders/${woId}/parts`, s, body)

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()

    plantA = await t.plant('i1', 'PUBLIC')
    const other = await t.plant('i2', 'PUBLIC')
    const model = (await t.model('MOLINO_BOLAS', 'E2E Bolas inv')).id

    const names = ['admin', 'pa', 'wh', 'lead', 'tech', 'tech2', 'op', 'mgr', 'outsider']
    const users = await Promise.all(names.map((n) => t.user(n, { isGlobalAdmin: n === 'admin' })))
    const byName = Object.fromEntries(users.map((u) => [u.firstName, u]))
    const roles: Array<[string, string]> = [['pa', 'PLANT_ADMIN'], ['wh', 'WAREHOUSE'], ['lead', 'MAINTENANCE_LEAD'], ['tech', 'TECHNICIAN'], ['tech2', 'TECHNICIAN'], ['op', 'OPERATOR'], ['mgr', 'PLANT_MANAGER']]
    for (const [name, role] of roles) await t.assign(byName[name].id, plantA.id, role)
    await t.assign(byName.outsider.id, other.id, 'WAREHOUSE')
    techId = byName.tech.id
    ;[admin, pa, wh, lead, tech, tech2, op, mgr, outsider] = await Promise.all(names.map((n) => login(app, n)))

    asset = (await http().post('/api/v1/plants/e2e-i1/assets').set('Authorization', bearer(pa)).send({ tag: 'MB-1', name: 'Molino 1', assetModelId: model }).expect(201)).body.id
    whA = (await send('post', `${I}/warehouses`, wh, { code: 'ALM1', name: 'Almacén central' }).expect(201)).body.id
    locA = (await send('post', `${I}/locations`, wh, { warehouseId: whA, code: 'A-01', name: 'Rack A-01', locationType: 'RACK' }).expect(201)).body.id
    locB = (await send('post', `${I}/locations`, wh, { warehouseId: whA, code: 'B-01', name: 'Rack B-01', locationType: 'RACK' }).expect(201)).body.id
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('acceso: inventario es información interna', () => {
    it('sin sesión → 401', async () => {
      await get(`${I}/items`, null).expect(401)
      await get(`${I}/dashboard`, null).expect(401)
      await send('post', `${I}/movements/issue`, null, {}).expect(401)
    })

    it('miembro de otra planta → 403', async () => {
      await get(`${I}/items`, outsider).expect(403)
      await send('post', `${I}/items`, outsider, { sku: 'X', name: 'x' }).expect(403)
    })

    it('lectura: almacén, mantenimiento, técnico y operador; no el administrador de otra planta', async () => {
      for (const s of [wh, lead, tech, op, pa, admin]) await get(`${I}/items`, s).expect(200)
    })

    it('solo el almacén y el administrador crean ítems y mueven stock', async () => {
      const it = await mkItem()
      for (const s of [lead, tech, op, mgr]) {
        await send('post', `${I}/items`, s, { sku: 'NOPE', name: 'x' }).expect(403)
        await receipt(it.id, locA, 1, 1, s).expect(403)
        await issue(it.id, locA, 1, s).expect(403)
      }
      await receipt(it.id, locA, 1, 1, pa).expect(201)
    })
  })

  describe('almacenes y ubicaciones', () => {
    it('código duplicado → 409 (almacén y ubicación)', async () => {
      await send('post', `${I}/warehouses`, wh, { code: 'alm1', name: 'Otro' }).expect(409)
      await send('post', `${I}/locations`, wh, { warehouseId: whA, code: 'a-01', name: 'Otra' }).expect(409)
    })

    it('guarda códigos en mayúsculas', async () => {
      const w = (await send('post', `${I}/warehouses`, wh, { code: 'alm-x', name: 'Auxiliar' }).expect(201)).body
      expect(w.code).toBe('ALM-X')
    })

    it('el padre debe ser del mismo almacén', async () => {
      const other = (await send('post', `${I}/warehouses`, wh, { code: 'ALM2', name: 'Almacén 2' }).expect(201)).body.id
      const res = await send('post', `${I}/locations`, wh, { warehouseId: other, parentId: locA, code: 'P-1', name: 'Hija' }).expect(400)
      expect(res.body.errors?.parentId ?? JSON.stringify(res.body)).toBeTruthy()
      const ok = await send('post', `${I}/locations`, wh, { warehouseId: whA, parentId: locA, code: 'A-01-N1', name: 'Nivel 1', locationType: 'SHELF' }).expect(201)
      expect(ok.body.parentId).toBe(locA)
    })

    it('un almacén de otra planta no se puede usar', async () => {
      await send('post', `${I}/locations`, wh, { warehouseId: '00000000-0000-4000-8000-000000000000', code: 'Z', name: 'z' }).expect(400)
    })

    it('no se desactiva una ubicación ni un almacén con existencias', async () => {
      const w = (await send('post', `${I}/warehouses`, wh, { code: 'ALM3', name: 'Almacén 3' }).expect(201)).body.id
      const l = (await send('post', `${I}/locations`, wh, { warehouseId: w, code: 'L1', name: 'L1' }).expect(201)).body.id
      const it = await mkItem()
      await receipt(it.id, l, 4).expect(201)
      await send('patch', `${I}/locations/${l}`, wh, { status: 'INACTIVE' }).expect(409)
      await send('patch', `${I}/warehouses/${w}`, wh, { status: 'INACTIVE' }).expect(409)
      await issue(it.id, l, 4).expect(201)
      await send('patch', `${I}/locations/${l}`, wh, { status: 'INACTIVE' }).expect(200)
      await send('patch', `${I}/warehouses/${w}`, wh, { status: 'INACTIVE' }).expect(200)
      // y no se recibe en una ubicación inactiva
      await receipt(it.id, l, 1).expect(400)
    })
  })

  describe('ítems', () => {
    it('SKU duplicado en la planta → 409; el SKU y la unidad no cambian', async () => {
      const it = await mkItem({ sku: 'DUP-1', uom: 'kg' })
      expect(it.sku).toBe('DUP-1')
      expect(it.uom).toBe('KG')
      await send('post', `${I}/items`, wh, { sku: 'dup-1', name: 'Otro' }).expect(409)
      const patched = (await send('patch', `${I}/items/${it.id}`, wh, { name: 'Renombrado', sku: 'CAMBIO', uom: 'UND' }).expect(200)).body
      expect(patched.name).toBe('Renombrado')
      expect(patched.sku).toBe('DUP-1')
      expect(patched.uom).toBe('KG')
    })

    it('valida: máximo ≥ mínimo, cantidades no negativas, máximo 4 decimales', async () => {
      await send('post', `${I}/items`, wh, { sku: 'V1', name: 'x', minStock: 10, maxStock: 5 }).expect(400)
      await send('post', `${I}/items`, wh, { sku: 'V2', name: 'x', minStock: -1 }).expect(400)
      await send('post', `${I}/items`, wh, { sku: 'V3', name: 'x', unitCost: 1.123456 }).expect(400)
      const it = await mkItem({ minStock: 5, maxStock: 10 })
      await send('patch', `${I}/items/${it.id}`, wh, { maxStock: 2 }).expect(400)
    })

    it('el modelo de catálogo debe existir', async () => {
      await send('post', `${I}/items`, wh, { sku: 'M1', name: 'x', assetModelId: '00000000-0000-4000-8000-000000000000' }).expect(400)
    })

    it('filtros: búsqueda, tipo, críticos, bajo mínimo, estado', async () => {
      const crit = await mkItem({ sku: 'FLT-CRIT', name: 'Sello mecánico filtro', isCritical: true, minStock: 5 })
      const tool = await mkItem({ sku: 'FLT-TOOL', name: 'Llave torque filtro', itemType: 'TOOL' })
      await receipt(tool.id, locA, 3).expect(201)

      const names = async (qs: string) => (await get(`${I}/items?${qs}`).expect(200)).body.items.map((i: { sku: string }) => i.sku)
      expect(await names('search=filtro')).toEqual(expect.arrayContaining(['FLT-CRIT', 'FLT-TOOL']))
      expect(await names('search=filtro&type=TOOL')).toEqual(['FLT-TOOL'])
      expect(await names('search=filtro&critical=1')).toEqual(['FLT-CRIT'])
      expect(await names('search=filtro&low=1')).toEqual(['FLT-CRIT']) // 0 < mínimo 5
      expect(await names(`search=filtro&warehouseId=${whA}`)).toEqual(['FLT-TOOL']) // solo con existencias en ese almacén
      await send('patch', `${I}/items/${tool.id}`, wh, { status: 'INACTIVE' }).expect(200)
      expect(await names('search=filtro')).toEqual(['FLT-CRIT'])
      expect(await names('search=filtro&status=ALL')).toEqual(expect.arrayContaining(['FLT-CRIT', 'FLT-TOOL']))
      expect(crit.belowMin).toBe(true)
      await get(`${I}/items?type=BOGUS`).expect(400)
    })

    it('los comodines de la búsqueda se escapan', async () => {
      await mkItem({ sku: 'PCT-1', name: '100% algodón' })
      const res = await get(`${I}/items?search=${encodeURIComponent('%')}`).expect(200)
      expect(res.body.items.every((i: { name: string }) => i.name.includes('%'))).toBe(true)
    })

    it('un ítem inactivo no recibe ingresos ni transferencias', async () => {
      const it = await mkItem()
      await receipt(it.id, locA, 5).expect(201)
      await send('patch', `${I}/items/${it.id}`, wh, { status: 'INACTIVE' }).expect(200)
      await receipt(it.id, locA, 1).expect(409)
      await send('post', `${I}/movements/transfer`, wh, { itemId: it.id, fromLocationId: locA, toLocationId: locB, quantity: 1 }).expect(409)
      await issue(it.id, locA, 5).expect(201) // sí se puede vaciar el stock remanente
    })
  })

  describe('movimientos', () => {
    it('ingreso: costo promedio ponderado y valorización', async () => {
      const it = await mkItem()
      await receipt(it.id, locA, 10, 100).expect(201)
      expect((await item(it.id)).unitCost).toBe(100)
      await receipt(it.id, locB, 10, 200).expect(201)
      const after = await item(it.id)
      expect(after.unitCost).toBe(150) // (10×100 + 10×200) / 20
      expect(after.onHand).toBe(20)
      expect(after.value).toBe(3000)
      expect(after.stock.map((s: { locationCode: string; quantity: number }) => [s.locationCode, s.quantity]).sort()).toEqual([['A-01', 10], ['B-01', 10]])
    })

    it('ingreso sin costo no cambia el costo promedio; con stock en cero el costo nuevo reemplaza al anterior', async () => {
      const it = await mkItem()
      await receipt(it.id, locA, 4, 50).expect(201)
      await receipt(it.id, locA, 4).expect(201)
      expect((await item(it.id)).unitCost).toBe(50)
      await issue(it.id, locA, 8).expect(201)
      await receipt(it.id, locA, 2, 80).expect(201)
      expect((await item(it.id)).unitCost).toBe(80)
    })

    it('salida: descuenta y registra costo vigente; sin stock suficiente → 409 y nada cambia', async () => {
      const it = await mkItem()
      await receipt(it.id, locA, 5, 10).expect(201)
      await issue(it.id, locA, 2).expect(201)
      const res = await issue(it.id, locA, 3.5).expect(409)
      expect(res.body.message).toMatch(/Stock insuficiente/)
      expect((await item(it.id)).onHand).toBe(3)
      await issue(it.id, locB, 1).expect(409) // en esa ubicación no hay nada
      const moves = await get(`${I}/movements?itemId=${it.id}`).expect(200)
      expect(moves.body.items).toHaveLength(2)
      expect(moves.body.items[0]).toMatchObject({ type: 'ISSUE', quantity: 2, unitCost: 10, from: 'A-01', to: null })
    })

    it('salidas simultáneas nunca dejan el saldo en negativo', async () => {
      const it = await mkItem()
      await receipt(it.id, locA, 10, 5).expect(201)
      const results = await Promise.all(Array.from({ length: 6 }, () => issue(it.id, locA, 3)))
      const ok = results.filter((r) => r.status === 201).length
      const conflicts = results.filter((r) => r.status === 409).length
      expect(ok).toBe(3)
      expect(conflicts).toBe(3)
      expect((await item(it.id)).onHand).toBe(1)
    })

    it('ingresos simultáneos con costos distintos: ni se pierden unidades ni se descuadra el costo promedio', async () => {
      const it = await mkItem()
      await receipt(it.id, locA, 1, 10).expect(201)
      const results = await Promise.all([20, 30, 40, 50, 20, 30, 40, 50].map((cost) => receipt(it.id, locA, 1, cost)))
      expect(results.every((r) => r.status === 201)).toBe(true)
      const after = await item(it.id)
      expect(after.onHand).toBe(9)
      // El promedio se redondea a 4 decimales en cada ingreso: con el orden arbitrario de ingresos simultáneos la última cifra puede variar.
      expect(Math.abs(after.unitCost - (10 + 2 * (20 + 30 + 40 + 50)) / 9)).toBeLessThan(0.001)
    })

    it('la base impide existencias negativas aunque se salte la aplicación', async () => {
      const it = await mkItem()
      await receipt(it.id, locA, 1).expect(201)
      await expect(t.pool.query('update inventory.stock set quantity_on_hand = -1 where item_id = $1', [it.id])).rejects.toThrow(/stock_on_hand_non_negative/)
    })

    it('transferencia: mueve entre ubicaciones y es atómica', async () => {
      const it = await mkItem()
      await receipt(it.id, locA, 6, 20).expect(201)
      await send('post', `${I}/movements/transfer`, wh, { itemId: it.id, fromLocationId: locA, toLocationId: locB, quantity: 2 }).expect(201)
      const mid = await item(it.id)
      expect(mid.onHand).toBe(6) // el total no cambia
      expect(mid.stock.find((s: { locationCode: string }) => s.locationCode === 'B-01').quantity).toBe(2)

      // Excede el origen: falla completa, el destino no recibe nada
      await send('post', `${I}/movements/transfer`, wh, { itemId: it.id, fromLocationId: locA, toLocationId: locB, quantity: 9 }).expect(409)
      const end = await item(it.id)
      expect(end.stock.find((s: { locationCode: string }) => s.locationCode === 'A-01').quantity).toBe(4)
      expect(end.stock.find((s: { locationCode: string }) => s.locationCode === 'B-01').quantity).toBe(2)

      await send('post', `${I}/movements/transfer`, wh, { itemId: it.id, fromLocationId: locA, toLocationId: locA, quantity: 1 }).expect(400)
    })

    it('ajuste: exige motivo, fija el saldo y registra la diferencia', async () => {
      const it = await mkItem()
      await receipt(it.id, locA, 10, 3).expect(201)
      await send('post', `${I}/movements/adjust`, wh, { itemId: it.id, locationId: locA, newQuantity: 7 }).expect(400)
      await send('post', `${I}/movements/adjust`, wh, { itemId: it.id, locationId: locA, newQuantity: 7, reason: '  ' }).expect(400)
      await send('post', `${I}/movements/adjust`, wh, { itemId: it.id, locationId: locA, newQuantity: 10, reason: 'Conteo' }).expect(400) // sin diferencia
      await send('post', `${I}/movements/adjust`, wh, { itemId: it.id, locationId: locA, newQuantity: 7, reason: 'Conteo cíclico: faltan 3' }).expect(201)
      expect((await item(it.id)).onHand).toBe(7)
      await send('post', `${I}/movements/adjust`, wh, { itemId: it.id, locationId: locA, newQuantity: 9, reason: 'Se encontraron 2' }).expect(201)
      const moves = (await get(`${I}/movements?itemId=${it.id}&type=ADJUSTMENT`).expect(200)).body.items
      expect(moves.map((m: { quantity: number; from: string | null; to: string | null; note: string }) => [m.quantity, m.from, m.to])).toEqual([[2, null, 'A-01'], [3, 'A-01', null]])
      expect(moves[1].note).toBe('Conteo cíclico: faltan 3')
    })

    it('valida cantidades: cero, negativas, texto y más de 4 decimales', async () => {
      const it = await mkItem()
      for (const quantity of [0, -1, '3', 0.00001]) await receipt(it.id, locA, quantity as number).expect(400)
      await send('post', `${I}/movements/issue`, wh, { itemId: it.id, locationId: 'no-uuid', quantity: 1 }).expect(400)
    })

    it('un ítem o ubicación de otra planta no se acepta (400)', async () => {
      const it = await mkItem()
      await receipt('00000000-0000-4000-8000-000000000000', locA, 1).expect(400)
      await receipt(it.id, '00000000-0000-4000-8000-000000000000', 1).expect(400)
    })

    it('el historial se filtra y pagina; nunca se modifica', async () => {
      const it = await mkItem()
      await receipt(it.id, locA, 3, 1).expect(201)
      await issue(it.id, locA, 1).expect(201)
      expect((await get(`${I}/movements?itemId=${it.id}&type=RECEIPT`).expect(200)).body.total).toBe(1)
      expect((await get(`${I}/movements?itemId=${it.id}&locationId=${locA}`).expect(200)).body.total).toBe(2)
      expect((await get(`${I}/movements?itemId=${it.id}&pageSize=1`).expect(200)).body.items).toHaveLength(1)
      await get(`${I}/movements?from=2020-13-45`).expect(400)
      const today = new Date().toISOString().slice(0, 10)
      expect((await get(`${I}/movements?itemId=${it.id}&from=${today}&to=${today}`).expect(200)).body.total).toBe(2)
      expect((await get(`${I}/movements?itemId=${it.id}&to=2020-01-01`).expect(200)).body.total).toBe(0)
      await http().patch(`${I}/movements/${(await get(`${I}/movements?itemId=${it.id}`)).body.items[0].id}`).set('Authorization', bearer(admin)).send({ quantity: 99 }).expect(404)
    })

    it('registra el responsable y deja auditoría', async () => {
      const it = await mkItem()
      await receipt(it.id, locA, 2, 7).expect(201)
      const [m] = (await get(`${I}/movements?itemId=${it.id}`).expect(200)).body.items
      expect(m.performedBy).toMatch(/^wh/)
      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.plantId, plantA.id), eq(auditEvents.action, 'receipt')))
      expect(events.length).toBeGreaterThan(0)
    })
  })

  describe('indicadores', () => {
    it('tablero: valor, bajo mínimo, críticos, movimientos 30 días, activos en stock/reparación', async () => {
      // Planta limpia para números exactos
      await t.plant('i3', 'PUBLIC')
      const p3 = (await t.db.select().from(plants).where(eq(plants.slug, 'e2e-i3')))[0]
      await t.assign((await t.user('dash')).id, p3.id, 'WAREHOUSE')
      const dash = await login(app, 'dash')
      const D = '/api/v1/plants/e2e-i3/inventory'
      const w = (await send('post', `${D}/warehouses`, dash, { code: 'W', name: 'W' }).expect(201)).body.id
      const l = (await send('post', `${D}/locations`, dash, { warehouseId: w, code: 'L', name: 'L' }).expect(201)).body.id
      const mk = async (sku: string, extra: object) => (await send('post', `${D}/items`, dash, { sku, name: sku, ...extra }).expect(201)).body.id
      const a = await mk('A', { minStock: 5, isCritical: true })
      const b = await mk('B', { minStock: 2 })
      const c = await mk('C', { minStock: 1 })
      await send('post', `${D}/movements/receipt`, dash, { itemId: a, locationId: l, quantity: 2, unitCost: 100 }).expect(201) // bajo mínimo, crítico → 200
      await send('post', `${D}/movements/receipt`, dash, { itemId: b, locationId: l, quantity: 10, unitCost: 10.5 }).expect(201) // ok → 105
      await send('post', `${D}/movements/receipt`, dash, { itemId: c, locationId: l, quantity: 1 }).expect(201) // sin costo → 0 al valorizar
      await send('post', `${D}/movements/issue`, dash, { itemId: b, locationId: l, quantity: 9 }).expect(201) // queda 1 < 2 → bajo mínimo; valor 10.5

      const res = (await get(`${D}/dashboard`, dash).expect(200)).body
      expect(res).toMatchObject({
        currency: 'USD',
        itemCount: 3,
        stockValue: 210.5, // 2×100 + 1×10.5
        lowStockCount: 2,
        criticalLowCount: 1,
        movementsLast30Days: 4,
        receiptsLast30Days: 3,
        issuesLast30Days: 1,
        assetsInStock: 0,
        assetsInRepair: 0,
        reservations: null,
      })
      expect(res.lowStock.map((i: { sku: string }) => i.sku)).toEqual(['A', 'B']) // crítico primero
      expect(res.lowStock[0]).toMatchObject({ onHand: 2, minStock: 5, deficit: 3 })
      expect(res.recentMovements).toHaveLength(4)
    })

    it('el tablero cuenta activos en STOCK y REPAIR de la planta', async () => {
      await http().patch(`/api/v1/plants/e2e-i1/assets/${asset}`).set('Authorization', bearer(pa)).send({ status: 'REPAIR' }).expect(200)
      const res = (await get(`${I}/dashboard`).expect(200)).body
      expect(res.assetsInRepair).toBe(1)
      await http().patch(`/api/v1/plants/e2e-i1/assets/${asset}`).set('Authorization', bearer(pa)).send({ status: 'OPERATIVE' }).expect(200)
    })
  })

  describe('repuestos consumidos por una orden de trabajo', () => {
    let part: string

    beforeAll(async () => {
      part = (await mkItem({ sku: 'WO-PART', name: 'Rodamiento 22218' })).id
      await receipt(part, locA, 10, 40).expect(201)
      await receipt(part, locA, 10, 60).expect(201) // promedio 50
    })

    it('solo con la orden en ejecución, en pausa o terminada (no solicitada, planificada ni asignada)', async () => {
      const wo = await mkOrder()
      await addPart(wo.id, lead, { itemId: part, locationId: locA, quantity: 1 }).expect(409)
      await go(wo.id, lead, { to: 'PLANNED' }).expect(201)
      await addPart(wo.id, lead, { itemId: part, locationId: locA, quantity: 1 }).expect(409)
      await go(wo.id, lead, { to: 'ASSIGNED', assignedTo: techId }).expect(201)
      await addPart(wo.id, tech, { itemId: part, locationId: locA, quantity: 1 }).expect(409)
      expect((await item(part)).onHand).toBe(20)
    })

    it('permisos: el responsable y quien edita la orden; no otro técnico, operador ni gerente', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      for (const s of [tech2, op, mgr]) await addPart(wo.id, s, { itemId: part, locationId: locA, quantity: 1 }).expect(403)
      await addPart(wo.id, tech, { itemId: part, locationId: locA, quantity: 1 }).expect(201) // responsable
      await addPart(wo.id, lead, { itemId: part, locationId: locA, quantity: 1 }).expect(201) // maintenance.update
      await send('post', `${M}/work-orders/${wo.id}/parts`, null, { itemId: part, locationId: locA, quantity: 1 }).expect(401)
    })

    it('consume stock, registra el movimiento con referencia a la orden y calcula el costo', async () => {
      const before = (await item(part)).onHand
      const wo = await mkOrder()
      await start(wo.id)
      const res = await addPart(wo.id, tech, { itemId: part, locationId: locA, quantity: 3, note: 'Cambio lado motor' }).expect(201)
      expect(res.body.parts).toHaveLength(1)
      expect(res.body.parts[0]).toMatchObject({ quantity: 3, unitCost: 50, lineCost: 150, location: 'A-01' })
      expect(res.body.partsCost).toBe(150)
      expect((await item(part)).onHand).toBe(before - 3)

      const detail = (await get(`${M}/work-orders/${wo.id}`, lead).expect(200)).body
      expect(detail.partsCost).toBe(150)
      expect(detail.parts[0].item.sku).toBe('WO-PART')

      const moves = (await get(`${I}/movements?itemId=${part}&referenceType=WORK_ORDER`).expect(200)).body.items
      expect(moves[0]).toMatchObject({ type: 'ISSUE', quantity: 3, referenceType: 'WORK_ORDER', referenceId: wo.id, note: 'Cambio lado motor' })
    })

    it('sin stock suficiente → 409 y no queda ni la línea ni el movimiento', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const before = (await item(part)).onHand
      await addPart(wo.id, tech, { itemId: part, locationId: locA, quantity: before + 1 }).expect(409)
      expect((await item(part)).onHand).toBe(before)
      expect((await get(`${M}/work-orders/${wo.id}`, lead)).body.parts).toEqual([])
    })

    it('consumos simultáneos sobre el mismo stock no lo sobregiran', async () => {
      const scarce = (await mkItem({ sku: 'WO-SCARCE', name: 'Sello escaso' })).id
      await receipt(scarce, locA, 5, 10).expect(201)
      const wo = await mkOrder()
      await start(wo.id)
      const results = await Promise.all(Array.from({ length: 4 }, () => addPart(wo.id, tech, { itemId: scarce, locationId: locA, quantity: 2 })))
      expect(results.filter((r) => r.status === 201)).toHaveLength(2)
      expect(results.filter((r) => r.status === 409)).toHaveLength(2)
      expect((await item(scarce)).onHand).toBe(1)
      expect((await get(`${M}/work-orders/${wo.id}`, lead)).body.partsCost).toBe(40)
    })

    it('devolver una línea reingresa el stock sin cambiar el costo promedio', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const before = await item(part)
      const added = (await addPart(wo.id, tech, { itemId: part, locationId: locA, quantity: 2 }).expect(201)).body
      const line = added.parts[0].id
      // Entre tanto el costo promedio cambia por una compra nueva
      await receipt(part, locB, 10, 100).expect(201)
      const mid = await item(part)

      const res = await send('delete', `${M}/work-orders/${wo.id}/parts/${line}`, tech).expect(200)
      expect(res.body.parts).toEqual([])
      expect(res.body.partsCost).toBe(0)
      const after = await item(part)
      expect(after.onHand).toBe(mid.onHand + 2)
      expect(after.unitCost).toBe(mid.unitCost) // devolver no revalora
      expect(before.unitCost).toBe(50)

      // Doble devolución: la segunda no encuentra la línea y no reingresa de nuevo
      await send('delete', `${M}/work-orders/${wo.id}/parts/${line}`, tech).expect(404)
      expect((await item(part)).onHand).toBe(after.onHand)
      // El libro conserva consumo y devolución
      const moves = (await get(`${I}/movements?itemId=${part}&referenceType=WORK_ORDER`).expect(200)).body.items.filter((m: { referenceId: string }) => m.referenceId === wo.id)
      expect(moves.map((m: { type: string }) => m.type).sort()).toEqual(['ISSUE', 'RECEIPT'])
    })

    it('devoluciones simultáneas de la misma línea reingresan una sola vez', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const line = (await addPart(wo.id, tech, { itemId: part, locationId: locA, quantity: 1 }).expect(201)).body.parts[0].id
      const before = (await item(part)).onHand
      const results = await Promise.all([1, 2, 3].map(() => send('delete', `${M}/work-orders/${wo.id}/parts/${line}`, tech)))
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      expect((await item(part)).onHand).toBe(before + 1)
    })

    it('devolver una línea deja intactas las demás de la misma orden', async () => {
      const other = (await mkItem({ sku: 'WO-OTHER', name: 'Otro repuesto' })).id
      await receipt(other, locA, 5, 10).expect(201)
      const wo = await mkOrder()
      await start(wo.id)
      await addPart(wo.id, tech, { itemId: part, locationId: locA, quantity: 1 }).expect(201)
      const lines = (await addPart(wo.id, tech, { itemId: other, locationId: locA, quantity: 2 }).expect(201)).body.parts
      const returned = lines.find((l: { item: { sku: string } }) => l.item.sku === 'WO-PART').id
      const res = (await send('delete', `${M}/work-orders/${wo.id}/parts/${returned}`, tech).expect(200)).body
      expect(res.parts.map((l: { item: { sku: string } }) => l.item.sku)).toEqual(['WO-OTHER'])
      expect((await item(other)).onHand).toBe(3) // la otra línea sigue consumida
    })

    it('una línea de otra orden no se puede devolver desde esta', async () => {
      const woA = await mkOrder()
      const woB = await mkOrder()
      await start(woA.id)
      await start(woB.id)
      const line = (await addPart(woA.id, tech, { itemId: part, locationId: locA, quantity: 1 }).expect(201)).body.parts[0].id
      await send('delete', `${M}/work-orders/${woB.id}/parts/${line}`, tech).expect(404)
    })

    it('al cerrar la orden ya no se editan los repuestos', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      const line = (await addPart(wo.id, tech, { itemId: part, locationId: locA, quantity: 1 }).expect(201)).body.parts[0].id
      await go(wo.id, tech, { to: 'COMPLETED', completionNotes: 'Listo' }).expect(201)
      await addPart(wo.id, lead, { itemId: part, locationId: locA, quantity: 1 }).expect(201) // terminada: aún se puede
      await go(wo.id, mgr, { to: 'CLOSED' }).expect(201)
      await addPart(wo.id, lead, { itemId: part, locationId: locA, quantity: 1 }).expect(409)
      await send('delete', `${M}/work-orders/${wo.id}/parts/${line}`, lead).expect(409)
    })

    it('valida el cuerpo: cantidad, ubicación e ítem', async () => {
      const wo = await mkOrder()
      await start(wo.id)
      for (const body of [{}, { itemId: part, locationId: locA, quantity: 0 }, { itemId: part, locationId: locA, quantity: -1 }, { itemId: part, quantity: 1 }, { itemId: 'x', locationId: locA, quantity: 1 }]) {
        await addPart(wo.id, tech, body).expect(400)
      }
      await addPart(wo.id, tech, { itemId: '00000000-0000-4000-8000-000000000000', locationId: locA, quantity: 1 }).expect(400)
    })

    it('un ítem sin costo se consume pero no suma al costo y se marca', async () => {
      const free = (await mkItem({ sku: 'WO-FREE', name: 'Grasa sin costo', itemType: 'CONSUMABLE' })).id
      await receipt(free, locA, 5).expect(201)
      const wo = await mkOrder()
      await start(wo.id)
      const res = (await addPart(wo.id, tech, { itemId: free, locationId: locA, quantity: 1 }).expect(201)).body
      expect(res.parts[0].lineCost).toBeNull()
      expect(res.partsCost).toBe(0)
      expect(res.hasUncosted).toBe(true)
    })

    it('el costo aparece en el tablero de mantenimiento y en la FUR solo cuando la orden termina', async () => {
      const priced = (await mkItem({ sku: 'WO-PRICED', name: 'Filtro con costo' })).id
      await receipt(priced, locA, 5, 10).expect(201)
      const dashBefore = (await get(`${M}/dashboard`, lead).expect(200)).body
      const furBefore = (await get(`/api/v1/plants/e2e-i1/assets/${asset}/fur`, lead).expect(200)).body.maintenance.partsCost

      const wo = await mkOrder()
      await start(wo.id)
      await addPart(wo.id, tech, { itemId: priced, locationId: locA, quantity: 2 }).expect(201)
      // En ejecución todavía no cuenta en el KPI de 30 días (solo órdenes terminadas)...
      expect((await get(`${M}/dashboard`, lead)).body.partsCostLast30Days).toBe(dashBefore.partsCostLast30Days)
      await go(wo.id, tech, { to: 'COMPLETED', completionNotes: 'Listo' }).expect(201)
      const dash = (await get(`${M}/dashboard`, lead).expect(200)).body
      expect(dash.currency).toBe('USD')
      expect(Math.round((dash.partsCostLast30Days - dashBefore.partsCostLast30Days) * 100) / 100).toBe(20)
      // ...pero en la FUR el activo acumula el costo de sus órdenes no canceladas
      const fur = (await get(`/api/v1/plants/e2e-i1/assets/${asset}/fur`, lead).expect(200)).body
      expect(Math.round((fur.maintenance.partsCost - furBefore) * 100) / 100).toBe(20)
      expect(fur.inventory.partsUsed.find((p: { sku: string }) => p.sku === 'WO-PRICED')).toMatchObject({ quantity: 2, cost: 20 })
    })

    it('la FUR muestra repuestos compatibles por modelo solo con inventory.read', async () => {
      const model = (await get(`/api/v1/plants/e2e-i1/assets/${asset}`, pa).expect(200)).body.model.id
      const comp = await mkItem({ sku: 'WO-COMPAT', name: 'Revestimiento molino', assetModelId: model, minStock: 4, isCritical: true })
      await receipt(comp.id, locA, 1).expect(201)
      const fur = (await get(`/api/v1/plants/e2e-i1/assets/${asset}/fur`, wh).expect(200)).body
      expect(fur.inventory.compatibleItems.find((i: { sku: string }) => i.sku === 'WO-COMPAT')).toMatchObject({ onHand: 1, minStock: 4, belowMin: true, isCritical: true })
      // sin sesión (planta pública): no se expone inventario ni mantenimiento
      const anon = (await get(`/api/v1/plants/e2e-i1/assets/${asset}/fur`, null)).body
      if (anon.inventory) expect(anon.inventory).toEqual({})
    })

    it('el movimiento de la orden queda auditado', async () => {
      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.plantId, plantA.id), eq(auditEvents.action, 'part.consumed')))
      expect(events.length).toBeGreaterThan(0)
      const returned = await t.db.select().from(auditEvents).where(and(eq(auditEvents.plantId, plantA.id), eq(auditEvents.action, 'part.returned')))
      expect(returned.length).toBeGreaterThan(0)
    })

    it('la tabla de movimientos nunca queda con cantidades inválidas', async () => {
      const bad = await t.db.select({ id: movements.id }).from(movements).where(eq(movements.plantId, plantA.id))
      expect(bad.length).toBeGreaterThan(0)
      const negatives = await t.db.select({ q: stock.quantityOnHand }).from(stock)
      expect(negatives.every((s) => Number(s.q) >= 0)).toBe(true)
    })
  })
})
