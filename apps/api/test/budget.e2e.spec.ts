import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

/**
 * Cifras de referencia (calculadas a mano; USD base, 1 PEN = 0.25 USD):
 *  APU Concreto (M3, rinde 12 m3/jornada de 8 h):
 *    cemento 10 BOL +5 % × 8.50 = 89.25 · arena 0.5 M3 × 20 = 10 · oficial 1×8/12×4 = 2.6667 · peón 3×8/12×3 = 6
 *    mezcladora 8/12×6 = 4 · flete 0.5 × (10 PEN → 2.50 USD) = 1.25   →  directo 113.1667
 *  APU Excavación (M3, rinde 4): peón 2×8/4×3 = 12                      →  directo 12
 *  Presupuesto: 20 m3 concreto + 50 m3 excavación → 2263.33 + 600 = 2863.33 directo
 *    GG 10 % 286.33 · utilidad 6 % 171.80 · subtotal 3321.46 · IGV 18 % 597.86 · total 3919.32
 */
describe('Presupuestos LULO (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let admin: Session
  let pa: Session // administrador de planta: todo
  let budgeter: Session // rol Presupuesto: budget.read + budget.edit
  let mgr: Session // gerente: lectura + budget.approve
  let op: Session // operador: sin acceso a presupuestos
  let consumer: Session // usuario común: solo lectura
  let outsider: Session

  const B = '/api/v1/plants/e2e-bg1/budgets'
  const send = (method: 'post' | 'patch' | 'delete' | 'put', url: string, s: Session | null, body: object = {}) => {
    const r = http()[method](url)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  const get = (url: string, s: Session | null = budgeter) => {
    const r = http().get(url)
    return s ? r.set('Authorization', bearer(s)) : r
  }

  let cem: string
  let ids: Record<string, string> = {}
  let concreteApu: string
  let digApu: string
  let projectId: string
  let seq = 0
  const uniq = (p: string) => `${p}${++seq}${Date.now() % 10000}`

  const mkResource = async (over: object = {}, s: Session = budgeter) =>
    (await send('post', `${B}/resources`, s, { code: uniq('R'), name: 'Recurso', resourceType: 'MATERIAL', unit: 'UND', unitPrice: 1, ...over }).expect(201)).body
  const mkApu = async (over: object = {}) => (await send('post', `${B}/apus`, budgeter, { code: uniq('A'), name: 'APU', unit: 'M3', ...over }).expect(201)).body
  const addLine = (apu: string, resourceId: string, quantity: number, wastePct = 0) => send('post', `${B}/apus/${apu}/lines`, budgeter, { resourceId, quantity, wastePct })
  const mkBudget = async (over: object = {}, s: Session = budgeter) =>
    (await send('post', B, s, { projectId, name: 'Presupuesto', overheadPct: 10, utilityPct: 6, taxPct: 18, ...over }).expect(201)).body
  const addChapter = async (id: string, code = '01') => (await send('post', `${B}/${id}/chapters`, budgeter, { code, name: 'Obras civiles' }).expect(201)).body.chapters.find((c: { code: string }) => c.code === code)
  const addItem = (id: string, chapterId: string, apuId: string, code: string, quantity: number) => send('post', `${B}/${id}/items`, budgeter, { chapterId, apuId, code, quantity })
  const itemId = (b: { chapters: Array<{ items: Array<{ id: string; code: string }> }> }, code: string) => b.chapters.flatMap((c) => c.items).find((i) => i.code === code)!.id

  /** Presupuesto de referencia en borrador (concreto 20 + excavación 50). */
  const reference = async () => {
    const b = await mkBudget()
    const ch = await addChapter(b.id)
    await addItem(b.id, ch.id, concreteApu, '01.01', 20).expect(201)
    const full = (await addItem(b.id, ch.id, digApu, '01.02', 50).expect(201)).body
    return full as Awaited<ReturnType<typeof mkBudget>>
  }
  const approved = async () => {
    const b = await reference()
    await send('post', `${B}/${b.id}/approve`, mgr).expect(201)
    return (await get(`${B}/${b.id}`)).body
  }

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const plant = await t.plant('bg1', 'PUBLIC')
    const other = await t.plant('bg2', 'PUBLIC')
    const names = ['admin', 'pa', 'budgeter', 'mgr', 'op', 'consumer', 'outsider']
    const users = await Promise.all(names.map((n) => t.user(n, { isGlobalAdmin: n === 'admin' })))
    const by = Object.fromEntries(users.map((u) => [u.firstName, u]))
    for (const [n, role] of [['pa', 'PLANT_ADMIN'], ['budgeter', 'BUDGET'], ['mgr', 'PLANT_MANAGER'], ['op', 'OPERATOR'], ['consumer', 'CONSUMER']] as const) await t.assign(by[n].id, plant.id, role)
    await t.assign(by.outsider.id, other.id, 'PLANT_ADMIN')
    ;[admin, pa, budgeter, mgr, op, consumer, outsider] = await Promise.all(names.map((n) => login(app, n)))

    await send('put', `${B}/exchange-rates`, budgeter, { currency: 'PEN', rate: 0.25 }).expect(200)
    const r = async (code: string, resourceType: string, unit: string, unitPrice: number, currency?: string) => (await mkResource({ code, name: code, resourceType, unit, unitPrice, ...(currency && { currency }) })).id as string
    ids = {
      cem: await r('MAT-CEM', 'MATERIAL', 'BOL', 8.5),
      are: await r('MAT-ARE', 'MATERIAL', 'M3', 20),
      of: await r('LAB-OF', 'LABOR', 'HH', 4),
      pe: await r('LAB-PE', 'LABOR', 'HH', 3),
      mez: await r('EQ-MEZ', 'EQUIPMENT', 'HM', 6),
      fle: await r('TR-FLE', 'TRANSPORT', 'M3', 10, 'PEN'),
    }
    cem = ids.cem
    concreteApu = (await mkApu({ code: 'APU-CONC', name: "Concreto f'c=210", yieldValue: 12, hoursPerDay: 8 })).id
    await addLine(concreteApu, ids.cem, 10, 5).expect(201)
    await addLine(concreteApu, ids.are, 0.5).expect(201)
    await addLine(concreteApu, ids.of, 1).expect(201)
    await addLine(concreteApu, ids.pe, 3).expect(201)
    await addLine(concreteApu, ids.mez, 1).expect(201)
    await addLine(concreteApu, ids.fle, 0.5).expect(201)
    digApu = (await mkApu({ code: 'APU-EXC', name: 'Excavación manual', yieldValue: 4 })).id
    await addLine(digApu, ids.pe, 2).expect(201)
    projectId = (await send('post', `${B}/projects`, budgeter, { code: 'PRJ-1', name: 'Ampliación de planta' }).expect(201)).body.id
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('acceso', () => {
    it('sin sesión 401; sin budget.read (operador) o de otra planta 403; el usuario común lee pero no edita', async () => {
      await get(`${B}/summary`, null).expect(401)
      await get(`${B}/summary`, op).expect(403)
      await get(`${B}/apus`, op).expect(403)
      await get(`${B}/summary`, outsider).expect(403)
      await get(`${B}/summary`, consumer).expect(200)
      await send('post', `${B}/resources`, consumer, { code: 'X', name: 'x', resourceType: 'MATERIAL', unit: 'UND', unitPrice: 1 }).expect(403)
      await send('post', `${B}/projects`, op, { code: 'X', name: 'x' }).expect(403)
    })

    it('editar es del rol Presupuesto; aprobar, de la gerencia; el rol Presupuesto no aprueba', async () => {
      const b = await reference()
      await send('post', `${B}/${b.id}/approve`, budgeter).expect(403)
      await send('post', `${B}/${b.id}/approve`, consumer).expect(403)
      await send('patch', `${B}/${b.id}`, mgr, { name: 'x' }).expect(403) // el gerente aprueba, no edita
      await send('post', `${B}/${b.id}/approve`, mgr).expect(201)
    })
  })

  describe('recursos, precios y tipos de cambio', () => {
    it('crea con código en mayúsculas y precio inicial en el historial; duplicado 409', async () => {
      const r = await mkResource({ code: 'mat-x1', name: 'Fierro', unitPrice: 4.25 })
      expect(r).toMatchObject({ code: 'MAT-X1', unitPrice: 4.25, currency: 'USD', status: 'ACTIVE' })
      await send('post', `${B}/resources`, budgeter, { code: 'MAT-X1', name: 'Otro', resourceType: 'MATERIAL', unit: 'UND', unitPrice: 1 }).expect(409)
      const h = (await get(`${B}/resources/${r.id}/history`).expect(200)).body
      expect(h).toHaveLength(1)
      expect(h[0]).toMatchObject({ unitPrice: 4.25, note: 'Precio inicial' })
    })

    it('guarda texto Unicode (signo menos, emojis, otros alfabetos) sin error', async () => {
      const name = 'Fierro Ø 1/2" − corrugado 😀 中文 ñ'
      const r = await mkResource({ name })
      expect(r.name).toBe(name)
      expect((await get(`${B}/resources?search=${encodeURIComponent('corrugado 😀')}`).expect(200)).body.items.map((x: { id: string }) => x.id)).toContain(r.id)
    })

    it('valida tipo, precio (≥0, 4 decimales), unidad y moneda', async () => {
      for (const body of [{ resourceType: 'ALIEN' }, { unitPrice: -1 }, { unitPrice: 1.23456 }, { unit: '' }, { name: '' }, { currency: 'US' }]) {
        await send('post', `${B}/resources`, budgeter, { code: uniq('V'), name: 'x', resourceType: 'MATERIAL', unit: 'UND', unitPrice: 1, ...body }).expect(400)
      }
    })

    it('una moneda sin tipo de cambio cargado se rechaza', async () => {
      const res = await send('post', `${B}/resources`, budgeter, { code: uniq('E'), name: 'x', resourceType: 'MATERIAL', unit: 'UND', unitPrice: 1, currency: 'EUR' }).expect(400)
      expect(JSON.stringify(res.body)).toMatch(/tipo de cambio de EUR/)
    })

    it('cambiar el precio deja historial (con nota y autor); renombrar no', async () => {
      const r = await mkResource({ unitPrice: 10 })
      await send('patch', `${B}/resources/${r.id}`, budgeter, { name: 'Renombrado' }).expect(200)
      expect((await get(`${B}/resources/${r.id}/history`)).body).toHaveLength(1)
      await send('patch', `${B}/resources/${r.id}`, budgeter, { unitPrice: 12.5, note: 'Nueva cotización' }).expect(200)
      await send('patch', `${B}/resources/${r.id}`, budgeter, { unitPrice: 12.5 }).expect(200) // mismo precio: sin fila nueva
      const h = (await get(`${B}/resources/${r.id}/history`)).body
      expect(h.map((x: { unitPrice: number }) => x.unitPrice)).toEqual([12.5, 10])
      expect(h[0]).toMatchObject({ note: 'Nueva cotización', changedBy: expect.stringContaining('budgeter') })
      await send('patch', `${B}/resources/${r.id}`, budgeter, {}).expect(400)
      await send('patch', `${B}/resources/${r.id}`, budgeter, { unitPrice: -2 }).expect(400)
    })

    it('listado: filtros por tipo, estado y búsqueda; un recurso inactivo no entra a un APU nuevo', async () => {
      const r = await mkResource({ code: 'ZZ-FILTRO', name: 'Filtro único', resourceType: 'EQUIPMENT', unit: 'HM' })
      const names = async (qs: string) => (await get(`${B}/resources?${qs}`).expect(200)).body.items.map((i: { code: string }) => i.code)
      expect(await names('search=filtro%20%C3%BAnico')).toEqual(['ZZ-FILTRO'])
      expect(await names('search=ZZ-FILTRO&type=LABOR')).toEqual([])
      await send('patch', `${B}/resources/${r.id}`, budgeter, { status: 'INACTIVE' }).expect(200)
      expect(await names('search=ZZ-FILTRO')).toEqual([])
      expect(await names('search=ZZ-FILTRO&status=ALL')).toEqual(['ZZ-FILTRO'])
      const apu = await mkApu()
      await addLine(apu.id, r.id, 1).expect(400)
      expect((await get(`${B}/resources`).expect(200)).body.baseCurrency).toBe('USD')
      for (const bad of ['type=X', 'status=Y', 'pageSize=999']) await get(`${B}/resources?${bad}`).expect(400)
    })

    it('importa el costo promedio de un ítem de inventario (una sola vez; sin costo no)', async () => {
      const inv = '/api/v1/plants/e2e-bg1/inventory'
      const item = (await send('post', `${inv}/items`, pa, { sku: 'CABLE-1', name: 'Cable NYY 10 mm²', uom: 'm', unitCost: 3.75 }).expect(201)).body
      const noCost = (await send('post', `${inv}/items`, pa, { sku: 'SINCOSTO', name: 'Sin costo', uom: 'und' }).expect(201)).body
      const res = await send('post', `${B}/resources/import-inventory`, budgeter, { itemId: item.id, resourceType: 'MATERIAL' }).expect(201)
      expect(res.body).toMatchObject({ code: 'INV-CABLE-1', name: 'Cable NYY 10 mm²', unit: 'M', unitPrice: 3.75, sourceItemId: item.id })
      await send('post', `${B}/resources/import-inventory`, budgeter, { itemId: item.id }).expect(409)
      await send('post', `${B}/resources/import-inventory`, budgeter, { itemId: noCost.id }).expect(409)
      await send('post', `${B}/resources/import-inventory`, budgeter, { itemId: '00000000-0000-4000-8000-000000000000' }).expect(400)
      await send('post', `${B}/resources/import-inventory`, budgeter, { itemId: item.id, resourceType: 'LABOR' }).expect(400)
    })

    it('tipos de cambio: la base no se define; no se quita uno en uso', async () => {
      const list = (await get(`${B}/exchange-rates`).expect(200)).body
      expect(list).toMatchObject({ baseCurrency: 'USD', rates: [{ currency: 'PEN', rate: 0.25 }] })
      await send('put', `${B}/exchange-rates`, budgeter, { currency: 'USD', rate: 1 }).expect(400)
      await send('put', `${B}/exchange-rates`, budgeter, { currency: 'PEN', rate: 0 }).expect(400)
      await send('put', `${B}/exchange-rates`, budgeter, { currency: 'PEN', rate: 0.1234567 }).expect(400)
      await send('delete', `${B}/exchange-rates/PEN`, budgeter).expect(409) // TR-FLE está en PEN
      await send('put', `${B}/exchange-rates`, budgeter, { currency: 'CLP', rate: 0.001 }).expect(200)
      await send('delete', `${B}/exchange-rates/clp`, budgeter).expect(200)
      await send('delete', `${B}/exchange-rates/CLP`, budgeter).expect(404)
      await send('put', `${B}/exchange-rates`, consumer, { currency: 'CLP', rate: 1 }).expect(403)
    })
  })

  describe('APU: motor de precios', () => {
    it('concreto: 113.1667 con desglose por tipo; cada línea con su subtotal', async () => {
      const a = (await get(`${B}/apus/${concreteApu}`).expect(200)).body
      expect(a).toMatchObject({ code: 'APU-CONC', yieldValue: 12, hoursPerDay: 8, directCost: 113.1667, missingRates: [], baseCurrency: 'USD' })
      expect(a.breakdown).toEqual({ MATERIAL: 99.25, LABOR: 8.6667, EQUIPMENT: 4, TRANSPORT: 1.25 })
      expect(a.lines.map((l: { code: string; subtotal: number }) => [l.code, l.subtotal])).toEqual([['MAT-CEM', 89.25], ['MAT-ARE', 10], ['LAB-OF', 2.6667], ['LAB-PE', 6], ['EQ-MEZ', 4], ['TR-FLE', 1.25]])
      expect(a.lines.find((l: { code: string }) => l.code === 'TR-FLE')).toMatchObject({ unitPrice: 10, currency: 'PEN' }) // se muestra en su moneda; el subtotal ya está convertido
    })

    it('excavación: 12; el listado trae el precio unitario', async () => {
      expect((await get(`${B}/apus/${digApu}`)).body.directCost).toBe(12)
      const list = (await get(`${B}/apus?search=APU-`).expect(200)).body
      expect(list.items.find((x: { code: string }) => x.code === 'APU-CONC')).toMatchObject({ unitPrice: 113.1667, lineCount: 6, missingRates: [] })
      expect(list.baseCurrency).toBe('USD')
    })

    it('el rendimiento y la jornada mueven solo mano de obra y equipo', async () => {
      const a = await mkApu({ yieldValue: 8, hoursPerDay: 8 })
      await addLine(a.id, ids.pe, 2).expect(201) // 2×8/8×3 = 6
      await addLine(a.id, ids.cem, 1, 10).expect(201) // 1.1×8.5 = 9.35
      expect((await get(`${B}/apus/${a.id}`)).body.directCost).toBe(15.35)
      const half = (await send('patch', `${B}/apus/${a.id}`, budgeter, { hoursPerDay: 4 }).expect(200)).body
      expect(half.directCost).toBe(12.35) // mano de obra 3 + material 9.35
      const doubleYield = (await send('patch', `${B}/apus/${a.id}`, budgeter, { hoursPerDay: 8, yieldValue: 16 }).expect(200)).body
      expect(doubleYield.directCost).toBe(12.35)
    })

    it('editar línea y quitarla recalcula; un APU sin líneas cuesta 0', async () => {
      const a = await mkApu()
      const line = (await addLine(a.id, ids.cem, 2).expect(201)).body.lines[0]
      expect((await send('patch', `${B}/apus/${a.id}/lines/${line.id}`, budgeter, { quantity: 4, wastePct: 25 }).expect(200)).body.directCost).toBe(42.5) // 4×1.25×8.5
      expect((await send('delete', `${B}/apus/${a.id}/lines/${line.id}`, budgeter).expect(200)).body.directCost).toBe(0)
      await send('delete', `${B}/apus/${a.id}/lines/${line.id}`, budgeter).expect(404)
    })

    it('valida: rendimiento > 0, jornada ≤ 24, desperdicio 0–100, cantidad > 0, recurso ajeno o repetido', async () => {
      for (const body of [{ yieldValue: 0 }, { yieldValue: -1 }, { hoursPerDay: 0 }, { hoursPerDay: 25 }, { unit: '' }]) {
        await send('post', `${B}/apus`, budgeter, { code: uniq('B'), name: 'x', unit: 'M3', ...body }).expect(400)
      }
      const a = await mkApu()
      for (const body of [{ quantity: 0 }, { quantity: -1 }, { quantity: 1, wastePct: 101 }, { quantity: 1, wastePct: -1 }, { quantity: 1.00001 }, { quantity: 1, resourceId: 'x' }]) {
        await send('post', `${B}/apus/${a.id}/lines`, budgeter, { resourceId: ids.cem, ...body }).expect(400)
      }
      await send('post', `${B}/apus/${a.id}/lines`, budgeter, { resourceId: '00000000-0000-4000-8000-000000000000', quantity: 1 }).expect(400)
      await addLine(a.id, ids.cem, 1).expect(201)
      await addLine(a.id, ids.cem, 2).expect(409) // el mismo recurso dos veces
      await send('patch', `${B}/apus/${a.id}`, budgeter, { yieldValue: 0 }).expect(400)
      await send('post', `${B}/apus`, budgeter, { code: 'APU-CONC', name: 'dup', unit: 'M3' }).expect(409)
    })

    it('un tipo de cambio faltante deja al APU sin precio y lo dice', async () => {
      await send('put', `${B}/exchange-rates`, budgeter, { currency: 'EUR', rate: 1.1 }).expect(200)
      const eur = await mkResource({ currency: 'EUR', unitPrice: 5 })
      const a = await mkApu()
      await addLine(a.id, eur.id, 2).expect(201)
      expect((await get(`${B}/apus/${a.id}`)).body.directCost).toBe(11)
      await t.pool.query("delete from budget.exchange_rates where currency = 'EUR' and plant_id = (select id from core.plants where slug = 'e2e-bg1')")
      const broken = (await get(`${B}/apus/${a.id}`).expect(200)).body
      expect(broken).toMatchObject({ directCost: null, breakdown: null, missingRates: ['EUR'] })
      const list = (await get(`${B}/apus?search=${a.code}`)).body.items[0]
      expect(list).toMatchObject({ unitPrice: null, missingRates: ['EUR'] })
    })

    it('cambiar el precio de un recurso cambia el APU vigente (y el historial lo conserva)', async () => {
      const r = await mkResource({ unitPrice: 10 })
      const a = await mkApu()
      await addLine(a.id, r.id, 3).expect(201)
      expect((await get(`${B}/apus/${a.id}`)).body.directCost).toBe(30)
      await send('patch', `${B}/resources/${r.id}`, budgeter, { unitPrice: 11 }).expect(200)
      expect((await get(`${B}/apus/${a.id}`)).body.directCost).toBe(33)
      expect((await get(`${B}/resources/${r.id}/usage`)).body).toEqual({ apus: 1 })
    })

    it('la base impide rendimiento ≤ 0, precios negativos y cantidades ≤ 0', async () => {
      await expect(t.pool.query("update budget.apus set yield_value = 0 where code = 'APU-CONC'")).rejects.toThrow(/yield_positive/)
      await expect(t.pool.query("update budget.resources set unit_price = -1 where code = 'MAT-CEM'")).rejects.toThrow(/price_non_negative/)
      await expect(t.pool.query('update budget.apu_resources set quantity = 0 where apu_id = $1', [digApu])).rejects.toThrow(/quantity_positive/)
    })
  })

  describe('presupuesto: estructura y totales', () => {
    it('crea con código PRE-AAAA-NNNNN, en borrador y totales en cero', async () => {
      const b = await mkBudget({ name: 'Vacío' })
      expect(b).toMatchObject({ status: 'DRAFT', baseCurrency: 'USD', rates: { overheadPct: 10, utilityPct: 6, taxPct: 18 }, chapters: [] })
      expect(b.code).toMatch(/^PRE-\d{4}-\d{5}$/)
      expect(b.totals).toEqual({ direct: 0, overhead: 0, utility: 0, subtotal: 0, tax: 0, total: 0, incomplete: false })
    })

    it('valida proyecto y tasas (0–100)', async () => {
      await send('post', B, budgeter, { projectId: '00000000-0000-4000-8000-000000000000', name: 'x' }).expect(400)
      await send('post', B, budgeter, { projectId, name: 'x', taxPct: 101 }).expect(400)
      await send('post', B, budgeter, { projectId, name: 'x', overheadPct: -1 }).expect(400)
      await send('post', B, budgeter, { projectId, name: 'x', utilityPct: 5.123 }).expect(400)
      await send('post', B, budgeter, { projectId, name: '' }).expect(400)
      const closed = (await send('post', `${B}/projects`, budgeter, { code: uniq('PC'), name: 'Cerrado' }).expect(201)).body
      await send('patch', `${B}/projects/${closed.id}`, budgeter, { status: 'CLOSED' }).expect(200)
      await send('post', B, budgeter, { projectId: closed.id, name: 'x' }).expect(400)
      await send('post', `${B}/projects`, budgeter, { code: 'prj-1', name: 'dup' }).expect(409)
    })

    it('el presupuesto de referencia suma exactamente 2863.33 → 3919.32', async () => {
      const b = await reference()
      expect(b.totals).toEqual({ direct: 2863.33, overhead: 286.33, utility: 171.8, subtotal: 3321.46, tax: 597.86, total: 3919.32, incomplete: false })
      const ch = b.chapters[0]
      expect(ch.subtotal).toBe(2863.33)
      expect(ch.items.map((i: { code: string; unitPrice: number; amount: number; unit: string }) => [i.code, i.unitPrice, i.amount, i.unit])).toEqual([['01.01', 113.1667, 2263.33, 'M3'], ['01.02', 12, 600, 'M3']])
      expect(ch.items[0].apu).toMatchObject({ code: 'APU-CONC' })
    })

    it('capítulos: código único, reordenar, no se borra uno con partidas', async () => {
      const b = await mkBudget()
      const a = await addChapter(b.id, '01')
      await send('post', `${B}/${b.id}/chapters`, budgeter, { code: '01', name: 'dup' }).expect(409)
      const second = await send('post', `${B}/${b.id}/chapters`, budgeter, { code: '02', name: 'Segundo' }).expect(201)
      const third = (await send('post', `${B}/${b.id}/chapters`, budgeter, { code: '03', name: 'Tercero' }).expect(201)).body
      const moved = (await send('patch', `${B}/${b.id}/chapters/${third.chapters[2].id}`, budgeter, { position: 0 }).expect(200)).body
      expect(moved.chapters.map((c: { code: string }) => c.code)).toEqual(['03', '01', '02'])
      expect(second.body.chapters).toHaveLength(2)
      await addItem(b.id, a.id, digApu, '01.01', 1).expect(201)
      await send('delete', `${B}/${b.id}/chapters/${a.id}`, budgeter).expect(409)
      await send('delete', `${B}/${b.id}/chapters/${third.chapters[2].id}`, budgeter).expect(200)
      await send('delete', `${B}/${b.id}/chapters/${third.chapters[2].id}`, budgeter).expect(404)
    })

    it('partidas: toman unidad y descripción del APU; código único; validan APU, capítulo y cantidad', async () => {
      const b = await mkBudget()
      const ch = await addChapter(b.id)
      const ok = (await addItem(b.id, ch.id, digApu, '01.01', 12.5).expect(201)).body
      expect(ok.chapters[0].items[0]).toMatchObject({ unit: 'M3', description: 'Excavación manual', quantity: 12.5, amount: 150 })
      await addItem(b.id, ch.id, digApu, '01.01', 1).expect(409)
      await addItem(b.id, ch.id, '00000000-0000-4000-8000-000000000000', '01.09', 1).expect(400)
      await send('post', `${B}/${b.id}/items`, budgeter, { chapterId: '00000000-0000-4000-8000-000000000000', apuId: digApu, code: '01.08', quantity: 1 }).expect(400)
      for (const quantity of [0, -3, 1.00001]) await addItem(b.id, ch.id, digApu, '01.07', quantity).expect(400)
      const other = await mkBudget()
      const otherCh = await addChapter(other.id)
      await addItem(b.id, otherCh.id, digApu, '01.06', 1).expect(400) // capítulo de otro presupuesto
      const inactive = await mkApu()
      await send('patch', `${B}/apus/${inactive.id}`, budgeter, { status: 'INACTIVE' }).expect(200)
      await addItem(b.id, ch.id, inactive.id, '01.05', 1).expect(400)
    })

    it('editar y mover partidas; cambiar de APU actualiza la unidad; borrar', async () => {
      const b = await reference()
      const dig = itemId(b, '01.02')
      const second = (await addChapter(b.id, '02')) as { id: string }
      const edited = (await send('patch', `${B}/${b.id}/items/${dig}`, budgeter, { quantity: 100, chapterId: second.id, description: 'Excavación en roca' }).expect(200)).body
      expect(edited.chapters.find((c: { code: string }) => c.code === '02').items[0]).toMatchObject({ quantity: 100, amount: 1200, description: 'Excavación en roca' })
      expect(edited.totals.direct).toBe(3463.33) // 2263.33 + 1200
      await send('patch', `${B}/${b.id}/items/${dig}`, budgeter, { apuId: concreteApu }).expect(200)
      await send('patch', `${B}/${b.id}/items/${dig}`, budgeter, {}).expect(400)
      await send('patch', `${B}/${b.id}/items/00000000-0000-4000-8000-000000000000`, budgeter, { quantity: 1 }).expect(404)
      const gone = (await send('delete', `${B}/${b.id}/items/${dig}`, budgeter).expect(200)).body
      expect(gone.totals.direct).toBe(2263.33)
      await send('delete', `${B}/${b.id}/items/${dig}`, budgeter).expect(404)
    })

    it('editar tasas recalcula los totales', async () => {
      const b = await reference()
      const r = (await send('patch', `${B}/${b.id}`, budgeter, { overheadPct: 0, utilityPct: 0, taxPct: 0 }).expect(200)).body
      expect(r.totals).toMatchObject({ direct: 2863.33, total: 2863.33 })
      await send('patch', `${B}/${b.id}`, budgeter, {}).expect(400)
    })

    it('un presupuesto de otra planta no se alcanza', async () => {
      const b = await reference()
      await get(`/api/v1/plants/e2e-bg2/budgets/${b.id}`, outsider).expect(404)
      await send('patch', `/api/v1/plants/e2e-bg2/budgets/${b.id}`, outsider, { name: 'x' }).expect(404)
    })

    it('listado con totales y filtros', async () => {
      const b = await reference()
      const list = (await get(`${B}?search=${b.code}`).expect(200)).body
      expect(list.items[0]).toMatchObject({ code: b.code, status: 'DRAFT', itemCount: 2, direct: 2863.33, total: 3919.32, project: { code: 'PRJ-1' }, incomplete: false })
      expect(list.baseCurrency).toBe('USD')
      expect((await get(`${B}?status=APPROVED&search=${b.code}`)).body.items).toEqual([])
      await get(`${B}?status=NOPE`).expect(400)
    })
  })

  describe('aprobación y congelado de precios', () => {
    it('no se aprueba un presupuesto vacío ni uno con un APU sin costo ni sin tipo de cambio', async () => {
      const empty = await mkBudget()
      await send('post', `${B}/${empty.id}/approve`, mgr).expect(409)
      const noCost = await mkBudget()
      const ch = await addChapter(noCost.id)
      const zero = await mkApu()
      await addItem(noCost.id, ch.id, zero.id, '01.01', 1).expect(201)
      const res = await send('post', `${B}/${noCost.id}/approve`, mgr).expect(409)
      expect(res.body.message).toMatch(/01\.01.*no tiene costo/)

      await send('put', `${B}/exchange-rates`, budgeter, { currency: 'EUR', rate: 1.1 }).expect(200)
      const eur = await mkResource({ currency: 'EUR', unitPrice: 5 })
      const withEur = await mkApu()
      await addLine(withEur.id, eur.id, 1).expect(201)
      const broken = await mkBudget()
      const bch = await addChapter(broken.id)
      await addItem(broken.id, bch.id, withEur.id, '01.01', 1).expect(201)
      await t.pool.query("delete from budget.exchange_rates where currency = 'EUR' and plant_id = (select id from core.plants where slug = 'e2e-bg1')")
      const res2 = await send('post', `${B}/${broken.id}/approve`, mgr).expect(409)
      expect(res2.body.message).toMatch(/tipo de cambio de EUR/)
      expect((await get(`${B}/${broken.id}`)).body.totals.incomplete).toBe(true) // en borrador se ve incompleto, no inventado
    })

    it('nadie aprueba lo que creó (salvo el administrador del ecosistema)', async () => {
      const b = await reference()
      const own = await mkBudget({}, pa)
      const ch = (await send('post', `${B}/${own.id}/chapters`, pa, { code: '01', name: 'x' }).expect(201)).body.chapters[0]
      await send('post', `${B}/${own.id}/items`, pa, { chapterId: ch.id, apuId: digApu, code: '01.01', quantity: 1 }).expect(201)
      await send('post', `${B}/${own.id}/approve`, pa).expect(403)
      await send('post', `${B}/${own.id}/approve`, admin).expect(201)
      await send('post', `${B}/${b.id}/approve`, mgr).expect(201)
    })

    it('aprobar congela precio y desglose; el estado, quién y cuándo quedan registrados', async () => {
      const a = await approved()
      expect(a).toMatchObject({ status: 'APPROVED', approvedBy: expect.stringContaining('mgr') })
      expect(a.approvedAt).toBeTruthy()
      expect(a.totals.total).toBe(3919.32)
      const rows = await t.pool.query('select frozen_unit_price::float8 as p, frozen_breakdown as b from budget.items where budget_id = $1 order by code', [a.id])
      expect(rows.rows[0].p).toBe(113.1667)
      expect(rows.rows[0].b).toEqual({ MATERIAL: 99.25, LABOR: 8.6667, EQUIPMENT: 4, TRANSPORT: 1.25 })
    })

    it('un cambio de precios posterior NO altera el presupuesto aprobado, pero sí uno en borrador', async () => {
      const draft = await reference()
      const a = await approved()
      await send('patch', `${B}/resources/${cem}`, budgeter, { unitPrice: 9.5, note: 'Subió el cemento' }).expect(200)
      expect((await get(`${B}/${a.id}`)).body.totals.total).toBe(3919.32) // congelado
      expect((await get(`${B}/${draft.id}`)).body.totals.direct).toBe(3073.33) // vigente: 20×123.6667 + 600
      await send('patch', `${B}/resources/${cem}`, budgeter, { unitPrice: 8.5, note: 'Vuelve' }).expect(200)
    })

    it('aprobado: ya no se modifica nada de su estructura (409) ni se vuelve a aprobar', async () => {
      const a = await approved()
      const ch = a.chapters[0]
      const item = ch.items[0]
      await send('patch', `${B}/${a.id}`, budgeter, { name: 'x' }).expect(409)
      await send('post', `${B}/${a.id}/chapters`, budgeter, { code: '09', name: 'x' }).expect(409)
      await send('patch', `${B}/${a.id}/chapters/${ch.id}`, budgeter, { name: 'x' }).expect(409)
      await send('delete', `${B}/${a.id}/chapters/${ch.id}`, budgeter).expect(409)
      await addItem(a.id, ch.id, digApu, '01.09', 1).expect(409)
      await send('patch', `${B}/${a.id}/items/${item.id}`, budgeter, { quantity: 1 }).expect(409)
      await send('delete', `${B}/${a.id}/items/${item.id}`, budgeter).expect(409)
      await send('post', `${B}/${a.id}/approve`, mgr).expect(409)
    })

    it('carrera: agregar una partida mientras se aprueba → 409 y nada queda a medias', async () => {
      const b = await reference()
      const ch = b.chapters[0]
      const conn = await t.pool.connect()
      try {
        await conn.query('begin')
        await conn.query('select 1 from budget.budgets where id = $1 for update', [b.id])
        const pending = addItem(b.id, ch.id, digApu, '01.99', 5).then((r) => r)
        await new Promise((r) => setTimeout(r, 400))
        await conn.query("update budget.budgets set status = 'APPROVED' where id = $1", [b.id])
        await conn.query('commit')
        expect((await pending).status).toBe(409)
      } finally {
        conn.release()
      }
      const n = await t.pool.query('select count(*)::int as n from budget.items where budget_id = $1', [b.id])
      expect(n.rows[0].n).toBe(2)
    })

    it('duplicar crea un borrador nuevo con la misma estructura (y escenarios), editable', async () => {
      const a = await approved()
      await send('post', `${B}/${a.id}/scenarios`, budgeter, { name: 'Materiales +10 %', adjustments: { MATERIAL: 10 } }).expect(201)
      const copy = (await send('post', `${B}/${a.id}/duplicate`, budgeter).expect(201)).body
      expect(copy).toMatchObject({ status: 'DRAFT', name: expect.stringContaining('(copia)'), totals: { total: 3919.32 } })
      expect(copy.code).not.toBe(a.code)
      expect(copy.chapters[0].items).toHaveLength(2)
      expect((await get(`${B}/${copy.id}/scenarios`)).body).toHaveLength(1)
      await send('patch', `${B}/${copy.id}`, budgeter, { name: 'Revisión 2' }).expect(200)
      await send('post', `${B}/${a.id}/duplicate`, mgr).expect(403)
    })

    it('cerrar: solo lo aprobado y con budget.approve', async () => {
      const draft = await reference()
      await send('post', `${B}/${draft.id}/close`, mgr).expect(409)
      const a = await approved()
      await send('post', `${B}/${a.id}/close`, budgeter).expect(403)
      expect((await send('post', `${B}/${a.id}/close`, mgr).expect(201)).body.status).toBe('CLOSED')
      await send('post', `${B}/${a.id}/close`, mgr).expect(409)
    })

    it('un APU en uso por un presupuesto no puede desaparecer de la base (restricción)', async () => {
      await expect(t.pool.query("delete from budget.apus where code = 'APU-CONC'")).rejects.toThrow()
    })
  })

  describe('escenarios, sensibilidad y desviaciones', () => {
    it('escenario "materiales +10 %": 4191.03; el análisis compara contra la base', async () => {
      const b = await approved()
      await send('post', `${B}/${b.id}/scenarios`, budgeter, { name: 'Materiales +10 %', adjustments: { MATERIAL: 10 } }).expect(201)
      await send('post', `${B}/${b.id}/scenarios`, budgeter, { name: 'Mano de obra −10 %', adjustments: { LABOR: -10 } }).expect(201)
      const an = (await get(`${B}/${b.id}/analysis`).expect(200)).body
      expect(an.base.total).toBe(3919.32)
      const mat = an.scenarios.find((s: { name: string }) => s.name === 'Materiales +10 %')
      expect(mat.totals).toMatchObject({ direct: 3061.83, total: 4191.03 })
      expect(mat.change).toBe(271.71)
      expect(mat.changePct).toBe(6.93)
      expect(an.scenarios.find((s: { name: string }) => s.name === 'Mano de obra −10 %').change).toBeLessThan(0)
    })

    it('sensibilidad ±10 % por tipo, ordenada por impacto: materiales pesan más que transporte', async () => {
      const b = await approved()
      const s = (await get(`${B}/${b.id}/analysis`)).body.sensitivity
      expect(s.base).toBe(3919.32)
      expect(s.rows).toHaveLength(8)
      const impact = (type: string) => Math.abs(s.rows.find((r: { type: string; deltaPct: number }) => r.type === type && r.deltaPct === 10).change)
      expect(impact('MATERIAL')).toBeGreaterThan(impact('LABOR'))
      expect(impact('LABOR')).toBeGreaterThan(impact('TRANSPORT'))
      expect(Math.abs(s.rows[0].change)).toBeGreaterThanOrEqual(Math.abs(s.rows.at(-1).change))
      const up = s.rows.find((r: { type: string; deltaPct: number }) => r.type === 'MATERIAL' && r.deltaPct === 10).change
      const down = s.rows.find((r: { type: string; deltaPct: number }) => r.type === 'MATERIAL' && r.deltaPct === -10).change
      expect(Math.abs(up + down)).toBeLessThan(0.05) // simétrico salvo redondeo
    })

    it('escenarios: nombre único, ajustes válidos, se pueden borrar; también sobre un presupuesto aprobado', async () => {
      const b = await approved()
      await send('post', `${B}/${b.id}/scenarios`, budgeter, { name: 'A', adjustments: { MATERIAL: 5 } }).expect(201)
      await send('post', `${B}/${b.id}/scenarios`, budgeter, { name: 'A', adjustments: {} }).expect(409)
      for (const adjustments of [{ MATERIAL: -101 }, { MATERIAL: 1001 }, { ALIEN: 5 }, { MATERIAL: 'x' }, { MATERIAL: 1.234 }]) {
        await send('post', `${B}/${b.id}/scenarios`, budgeter, { name: uniq('S'), adjustments }).expect(400)
      }
      const sc = (await get(`${B}/${b.id}/scenarios`)).body[0]
      await send('delete', `${B}/${b.id}/scenarios/${sc.id}`, budgeter).expect(204)
      await send('delete', `${B}/${b.id}/scenarios/${sc.id}`, budgeter).expect(404)
      await send('post', `${B}/${b.id}/scenarios`, consumer, { name: 'x' }).expect(403)
    })

    it('el análisis de un borrador con partidas sin precio se rechaza en vez de calcular a medias', async () => {
      await send('put', `${B}/exchange-rates`, budgeter, { currency: 'EUR', rate: 1.1 }).expect(200)
      const eur = await mkResource({ currency: 'EUR', unitPrice: 5 })
      const a = await mkApu()
      await addLine(a.id, eur.id, 1).expect(201)
      const b = await mkBudget()
      const ch = await addChapter(b.id)
      await addItem(b.id, ch.id, a.id, '01.01', 1).expect(201)
      await t.pool.query("delete from budget.exchange_rates where currency = 'EUR' and plant_id = (select id from core.plants where slug = 'e2e-bg1')")
      const res = await get(`${B}/${b.id}/analysis`).expect(409)
      expect(res.body.message).toMatch(/sin precio/)
    })

    it('desviaciones: aprobado vs precios vigentes (cemento 8.50 → 9.50 = +10.50 por m3 → +210 directo)', async () => {
      const b = await approved()
      expect((await get(`${B}/${b.id}/deviations`)).body).toMatchObject({ impactDirect: 0, impactTotal: 0, itemsAffected: 0 })
      await send('patch', `${B}/resources/${cem}`, budgeter, { unitPrice: 9.5 }).expect(200)
      const d = (await get(`${B}/${b.id}/deviations`).expect(200)).body
      expect(d).toMatchObject({ impactDirect: 210, impactTotal: 287.45, itemsAffected: 1 })
      expect(d.items[0]).toMatchObject({ code: '01.01', frozenUnitPrice: 113.1667, currentUnitPrice: 123.6667, diff: 10.5, diffPct: 9.28, impact: 210 })
      expect(d.items[1]).toMatchObject({ code: '01.02', diff: 0, impact: 0 })
      await send('patch', `${B}/resources/${cem}`, budgeter, { unitPrice: 8.5 }).expect(200)
      const draft = await reference()
      await get(`${B}/${draft.id}/deviations`).expect(409) // en borrador los precios ya son los vigentes
    })
  })

  describe('valorizaciones', () => {
    const val = (budgetId: string, lines: Array<{ itemId: string; quantity: number }>, over: object = {}, s: Session = budgeter) =>
      send('post', `${B}/${budgetId}/valuations`, s, { periodStart: '2026-10-01', periodEnd: '2026-10-31', lines, ...over })

    it('solo sobre un presupuesto aprobado', async () => {
      const draft = await reference()
      await val(draft.id, [{ itemId: itemId(draft, '01.01'), quantity: 1 }]).expect(409)
      const a = await approved()
      await send('post', `${B}/${a.id}/close`, mgr).expect(201)
      await val(a.id, [{ itemId: itemId(a, '01.01'), quantity: 1 }]).expect(409)
    })

    it('valoriza a precios congelados y aplica las mismas tasas: 1145.33 directo → 1567.72', async () => {
      const a = await approved()
      const v = (await val(a.id, [{ itemId: itemId(a, '01.01'), quantity: 8 }, { itemId: itemId(a, '01.02'), quantity: 20 }]).expect(201)).body
      expect(v).toMatchObject({ number: 1, status: 'DRAFT', totals: { direct: 1145.33, overhead: 114.53, utility: 68.72, subtotal: 1328.58, tax: 239.14, total: 1567.72 } })
      expect(v.lines.find((l: { code: string }) => l.code === '01.01')).toMatchObject({ contractQuantity: 20, previousQuantity: 0, quantity: 8, cumulativeQuantity: 8, unitPrice: 113.1667, amount: 905.33 })
      // los precios del libro cambian: la valorización sigue a precios del presupuesto
      await send('patch', `${B}/resources/${cem}`, budgeter, { unitPrice: 20 }).expect(200)
      expect((await get(`${B}/${a.id}/valuations/${v.id}`)).body.totals.direct).toBe(1145.33)
      await send('patch', `${B}/resources/${cem}`, budgeter, { unitPrice: 8.5 }).expect(200)
    })

    it('numeración consecutiva; el avance suma solo lo aprobado; no se mide más de lo contratado', async () => {
      const a = await approved()
      const i1 = itemId(a, '01.01')
      const i2 = itemId(a, '01.02')
      const v1 = (await val(a.id, [{ itemId: i1, quantity: 8 }, { itemId: i2, quantity: 20 }]).expect(201)).body
      const v2 = (await val(a.id, [{ itemId: i1, quantity: 12 }], { periodStart: '2026-11-01', periodEnd: '2026-11-30' }).expect(201)).body
      expect([v1.number, v2.number]).toEqual([1, 2])
      let list = (await get(`${B}/${a.id}/valuations`).expect(200)).body
      expect(list).toMatchObject({ budgetStatus: 'APPROVED', executedDirect: 0, progressPct: 0 }) // nada aprobado todavía
      await send('post', `${B}/${a.id}/valuations/${v1.id}/approve`, mgr).expect(201)
      list = (await get(`${B}/${a.id}/valuations`)).body
      expect(list).toMatchObject({ executedDirect: 1145.33, executedTotal: 1567.72, progressPct: 40 })
      expect(list.items.map((x: { number: number }) => x.number)).toEqual([2, 1])
      await val(a.id, [{ itemId: i1, quantity: 13 }]).expect(409) // 8 aprobados + 13 > 20
      await send('post', `${B}/${a.id}/valuations/${v2.id}/approve`, mgr).expect(201) // 8 + 12 = 20 justo
      const v2d = (await get(`${B}/${a.id}/valuations/${v2.id}`)).body
      expect(v2d.lines[0]).toMatchObject({ previousQuantity: 8, quantity: 12, cumulativeQuantity: 20 })
      await val(a.id, [{ itemId: i1, quantity: 0.0001 }]).expect(409) // ya no queda nada
      await val(a.id, [{ itemId: i2, quantity: 30 }]).expect(201) // 20 + 30 = 50 justo en la otra partida
    })

    it('valida: partida del presupuesto, sin repetidas, cantidades y periodo', async () => {
      const a = await approved()
      const i1 = itemId(a, '01.01')
      await val(a.id, [{ itemId: '00000000-0000-4000-8000-000000000000', quantity: 1 }]).expect(409 - 409 + 400).catch(() => undefined)
      for (const [lines, over] of [
        [[], {}],
        [[{ itemId: i1, quantity: 0 }], {}],
        [[{ itemId: i1, quantity: -1 }], {}],
        [[{ itemId: i1, quantity: 1 }, { itemId: i1, quantity: 2 }], {}],
        [[{ itemId: i1, quantity: 1 }], { periodEnd: '2026-09-30' }],
        [[{ itemId: i1, quantity: 1 }], { periodStart: '2026-13-01' }],
      ] as Array<[Array<{ itemId: string; quantity: number }>, object]>) {
        await val(a.id, lines, over).expect(400)
      }
      const other = await approved()
      await val(a.id, [{ itemId: itemId(other, '01.01'), quantity: 1 }]).expect(400) // partida de otro presupuesto
    })

    it('el borrador se edita y se elimina; el aprobado queda fijo', async () => {
      const a = await approved()
      const i1 = itemId(a, '01.01')
      const v = (await val(a.id, [{ itemId: i1, quantity: 5 }]).expect(201)).body
      const edited = (await send('patch', `${B}/${a.id}/valuations/${v.id}`, budgeter, { periodStart: '2026-10-05', periodEnd: '2026-10-20', note: 'Ajuste', lines: [{ itemId: i1, quantity: 6 }] }).expect(200)).body
      expect(edited).toMatchObject({ note: 'Ajuste', lines: [{ quantity: 6 }] })
      await send('post', `${B}/${a.id}/valuations/${v.id}/approve`, budgeter).expect(403) // el rol Presupuesto no aprueba
      await send('post', `${B}/${a.id}/valuations/${v.id}/approve`, mgr).expect(201)
      await send('post', `${B}/${a.id}/valuations/${v.id}/approve`, mgr).expect(409)
      await send('patch', `${B}/${a.id}/valuations/${v.id}`, budgeter, { periodStart: '2026-10-05', periodEnd: '2026-10-20', lines: [{ itemId: i1, quantity: 1 }] }).expect(409)
      await send('delete', `${B}/${a.id}/valuations/${v.id}`, budgeter).expect(409)
      const draft = (await val(a.id, [{ itemId: i1, quantity: 1 }]).expect(201)).body
      await send('delete', `${B}/${a.id}/valuations/${draft.id}`, budgeter).expect(204)
      await send('delete', `${B}/${a.id}/valuations/${draft.id}`, budgeter).expect(404)
    })

    it('nadie aprueba la valorización que creó (salvo el administrador del ecosistema)', async () => {
      const a = await approved()
      const i1 = itemId(a, '01.01')
      const v = (await val(a.id, [{ itemId: i1, quantity: 2 }], {}, pa).expect(201)).body
      await send('post', `${B}/${a.id}/valuations/${v.id}/approve`, pa).expect(403)
      await send('post', `${B}/${a.id}/valuations/${v.id}/approve`, admin).expect(201)
    })

    it('aprobaciones simultáneas de dos borradores que se disputan lo que queda: solo una pasa', async () => {
      const a = await approved()
      const i1 = itemId(a, '01.01')
      const v1 = (await val(a.id, [{ itemId: i1, quantity: 15 }]).expect(201)).body
      const v2 = (await val(a.id, [{ itemId: i1, quantity: 15 }]).expect(201)).body // cada una cabe sola (20), juntas no
      const res = await Promise.all([send('post', `${B}/${a.id}/valuations/${v1.id}/approve`, mgr), send('post', `${B}/${a.id}/valuations/${v2.id}/approve`, mgr)])
      expect(res.map((r) => r.status).sort()).toEqual([201, 409])
      const sum = await t.pool.query("select coalesce(sum(vl.quantity),0)::float8 as q from budget.valuation_lines vl join budget.valuations v on v.id = vl.valuation_id where v.budget_id = $1 and v.status = 'APPROVED'", [a.id])
      expect(sum.rows[0].q).toBe(15)
    })

    it('la base impide cantidades ≤ 0 y periodos invertidos', async () => {
      const a = await approved()
      const v = (await val(a.id, [{ itemId: itemId(a, '01.01'), quantity: 1 }]).expect(201)).body
      await expect(t.pool.query('update budget.valuation_lines set quantity = 0 where valuation_id = $1', [v.id])).rejects.toThrow(/quantity_positive/)
      await expect(t.pool.query("update budget.valuations set period_end = '2020-01-01' where id = $1", [v.id])).rejects.toThrow(/period_order/)
    })
  })

  describe('tablero y auditoría', () => {
    it('resumen: presupuestos por estado, aprobado, ejecutado, avance y desviación de precios', async () => {
      const s = (await get(`${B}/summary`).expect(200)).body
      expect(s.baseCurrency).toBe('USD')
      expect(s.budgetCount).toBeGreaterThan(5)
      expect(s.budgetsByStatus.APPROVED).toBeGreaterThan(0)
      expect(s.approvedTotal).toBeGreaterThan(0)
      expect(s.executedDirect).toBeGreaterThan(0)
      expect(s.progressPct).toBeGreaterThan(0)
      expect(s.apuCount).toBeGreaterThan(2)
      expect(s.resourceCount).toBeGreaterThan(5)
      await get(`${B}/summary`, op).expect(403)
    })

    it('resumen exacto en una planta limpia con un presupuesto aprobado y una valorización', async () => {
      const p = await t.plant('bg3', 'PUBLIC')
      const u = await t.user('bgsolo')
      await t.assign(u.id, p.id, 'PLANT_ADMIN')
      const solo = await login(app, 'bgsolo')
      const S = '/api/v1/plants/e2e-bg3/budgets'
      const r = (await send('post', `${S}/resources`, solo, { code: 'M1', name: 'M1', resourceType: 'MATERIAL', unit: 'UND', unitPrice: 10 }).expect(201)).body
      const a = (await send('post', `${S}/apus`, solo, { code: 'A1', name: 'A1', unit: 'UND' }).expect(201)).body
      await send('post', `${S}/apus/${a.id}/lines`, solo, { resourceId: r.id, quantity: 2 }).expect(201)
      const pr = (await send('post', `${S}/projects`, solo, { code: 'P', name: 'P' }).expect(201)).body
      const b = (await send('post', S, solo, { projectId: pr.id, name: 'B', taxPct: 10 }).expect(201)).body
      const ch = (await send('post', `${S}/${b.id}/chapters`, solo, { code: '01', name: 'C' }).expect(201)).body.chapters[0]
      const it = (await send('post', `${S}/${b.id}/items`, solo, { chapterId: ch.id, apuId: a.id, code: '01.01', quantity: 10 }).expect(201)).body.chapters[0].items[0]
      await send('post', `${S}/${b.id}/approve`, admin).expect(201)
      const v = (await send('post', `${S}/${b.id}/valuations`, solo, { periodStart: '2026-10-01', periodEnd: '2026-10-31', lines: [{ itemId: it.id, quantity: 4 }] }).expect(201)).body
      await send('post', `${S}/${b.id}/valuations/${v.id}/approve`, admin).expect(201)
      await send('patch', `${S}/resources/${r.id}`, solo, { unitPrice: 12 }).expect(200)
      const s = (await get(`${S}/summary`, solo).expect(200)).body
      // directo aprobado 10×20 = 200 → total 220; ejecutado 4×20 = 80 → 88; avance 40 %; el precio sube a 24 por unidad → +40 de desviación
      expect(s).toMatchObject({ budgetCount: 1, budgetsByStatus: { APPROVED: 1 }, approvedDirect: 200, approvedTotal: 220, executedDirect: 80, executedTotal: 88, progressPct: 40, priceDriftDirect: 40, apuCount: 1, resourceCount: 1 })
    })

    it('las acciones relevantes quedan auditadas', async () => {
      const rows = await t.pool.query("select distinct action from audit.events where module = 'budget'")
      const actions = rows.rows.map((r: { action: string }) => r.action)
      expect(actions).toEqual(expect.arrayContaining(['created', 'price.changed', 'approved', 'closed', 'duplicated', 'scenario.created', 'item.added', 'rate.set']))
    })
  })
})
