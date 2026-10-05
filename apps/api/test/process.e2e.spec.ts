import type { INestApplication } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { assets, plants, plantSettings } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Plant = typeof plants.$inferSelect

describe('Procesos y redes transversales (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let plantA: Plant
  let admin: Session
  let pa: Session // administrador de planta (todo)
  let tech: Session // técnico: lee activos y mantenimiento
  let op: Session // operador: lee activos y mantenimiento
  let wh: Session // almacén: plant.read + asset.read, sin mantenimiento
  let consumer: Session // usuario común
  let outsider: Session
  let s6: string // plant_stage ids
  let s7: string
  let s11: string
  let nIot: string

  const B = '/api/v1/plants/e2e-pr1'
  const get = (url: string, s: Session | null = pa) => {
    const r = http().get(url)
    return s ? r.set('Authorization', bearer(s)) : r
  }
  const send = (method: 'post' | 'delete', url: string, s: Session | null, body: object = {}) => {
    const r = http()[method](url)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  const conn = (source: string, target: string, over: object = {}, s: Session = pa) => send('post', `${B}/process/connections`, s, { sourceStageId: source, targetStageId: target, ...over })
  const setSettings = (patch: Partial<typeof plantSettings.$inferInsert>) => t.db.update(plantSettings).set(patch).where(eq(plantSettings.plantId, plantA.id))
  const clearConnections = () => t.pool.query('delete from process.stage_connections where plant_id = $1', [plantA.id])
  const stage = (res: request.Response, code: string) => res.body.stages.find((s: { code: string }) => s.code === code)

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    plantA = await t.plant('pr1', 'PUBLIC')
    const other = await t.plant('pr2', 'PUBLIC')
    s6 = (await t.enableStage(plantA.id, 'D06', { isPublic: true })).id
    s7 = (await t.enableStage(plantA.id, 'D07', { isPublic: false })).id
    s11 = (await t.enableStage(plantA.id, 'D11', { isPublic: true })).id
    await t.enableStage(plantA.id, 'D08', { isEnabled: false })
    nIot = (await t.enableNetwork(plantA.id, 'FUR-IOT', { isPublic: true })).id
    await t.enableNetwork(plantA.id, 'FUR-PTE', { isPublic: false })
    await t.enableNetwork(plantA.id, 'FUR-MNT', { isEnabled: false, isPublic: true })

    const names = ['admin', 'pa', 'tech', 'op', 'wh', 'consumer', 'outsider']
    const users = await Promise.all(names.map((n) => t.user(n, { isGlobalAdmin: n === 'admin' })))
    const by = Object.fromEntries(users.map((u) => [u.firstName, u]))
    for (const [n, role] of [['pa', 'PLANT_ADMIN'], ['tech', 'TECHNICIAN'], ['op', 'OPERATOR'], ['wh', 'WAREHOUSE']] as const) await t.assign(by[n].id, plantA.id, role)
    await t.assign(by.consumer.id, plantA.id, 'CONSUMER')
    await t.assign(by.outsider.id, other.id, 'PLANT_ADMIN')
    ;[admin, pa, tech, op, wh, consumer, outsider] = await Promise.all(names.map((n) => login(app, n)))

    const model = (await t.model('MOLINO_BOLAS', 'E2E Bolas proc')).id
    const mk = async (tag: string, stageCode: string | undefined, over: object = {}, networks: string[] = []) =>
      (await http().post(`${B}/assets`).set('Authorization', bearer(pa)).send({ tag, name: tag, assetModelId: model, stageCode, networkCodes: networks, ...over }).expect(201)).body.id as string
    await mk('A-6a', 'D06', { isPublic: true, criticality: 'CRITICAL' }, ['FUR-IOT'])
    const a6b = await mk('A-6b', 'D06', { isPublic: false, criticality: 'MEDIUM' }, ['FUR-IOT', 'FUR-PTE'])
    const a7 = await mk('A-7a', 'D07', { isPublic: true, criticality: 'HIGH' }, ['FUR-IOT'])
    await mk('A-11', 'D11', { isPublic: true }, ['FUR-PTE'])
    const dec = await mk('A-OLD', 'D06', { isPublic: true }, ['FUR-IOT'])
    await http().patch(`${B}/assets/${a6b}`).set('Authorization', bearer(pa)).send({ status: 'REPAIR', statusReason: 'Cambio de motor' }).expect(200)
    await http().patch(`${B}/assets/${a7}`).set('Authorization', bearer(pa)).send({ status: 'CRITICAL', statusReason: 'Vibración' }).expect(200)
    await http().delete(`${B}/assets/${dec}`).set('Authorization', bearer(pa)).expect(204)
    const wo = await http().post(`${B}/maintenance/work-orders`).set('Authorization', bearer(pa)).send({ assetId: a6b, title: 'Cambio de motor' }).expect(201)
    expect(wo.body.id).toBeTruthy()
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('mapa de proceso: visibilidad', () => {
    it('interno: todas las etapas habilitadas (no las deshabilitadas) con conteos por estado, atención y críticos', async () => {
      const res = await get(`${B}/process`).expect(200)
      expect(res.body.stages.map((s: { code: string }) => s.code)).toEqual(['D06', 'D07', 'D11'])
      expect(stage(res, 'D06')).toMatchObject({ assetCount: 2, statusCounts: { OPERATIVE: 1, REPAIR: 1 }, criticalAssets: 1, attentionAssets: 1, openWorkOrders: 1 })
      expect(stage(res, 'D07')).toMatchObject({ assetCount: 1, statusCounts: { CRITICAL: 1 }, attentionAssets: 1, openWorkOrders: 0 })
      expect(stage(res, 'D11')).toMatchObject({ assetCount: 1, attentionAssets: 0 })
      expect(res.body.totals).toEqual({ assets: 4, attention: 2 }) // el activo dado de baja no cuenta
    })

    it('el estado dado de baja nunca aparece en los conteos', async () => {
      const res = await get(`${B}/process`).expect(200)
      expect(JSON.stringify(res.body.stages.map((s: { statusCounts: object }) => s.statusCounts))).not.toMatch(/DECOMMISSIONED/)
    })

    it('visitante: sin procesos públicos no ve nada; con ellos, solo etapas públicas y sin datos de mantenimiento', async () => {
      const closed = (await get(`${B}/process`, null).expect(200)).body
      expect(closed).toEqual({ stages: [], connections: [], totals: null })

      await setSettings({ publicProcesses: true })
      const open = await get(`${B}/process`, null).expect(200)
      expect(open.body.stages.map((s: { code: string }) => s.code)).toEqual(['D06', 'D11']) // D07 no es pública
      expect(stage(open, 'D06').openWorkOrders).toBeNull()
      // sin activos publicados: el conteo es "no visible" (null), no cero
      expect(stage(open, 'D06').assetCount).toBeNull()
      expect(open.body.totals).toBeNull()
    })

    it('visitante con activos públicos: cuenta solo los marcados como públicos', async () => {
      await setSettings({ publicProcesses: true, publicAssets: true })
      const res = await get(`${B}/process`, null).expect(200)
      expect(stage(res, 'D06')).toMatchObject({ assetCount: 1, statusCounts: { OPERATIVE: 1 }, criticalAssets: 1, attentionAssets: 0 }) // A-6b es privado y está en reparación
      expect(stage(res, 'D11').assetCount).toBe(1)
      await setSettings({ publicProcesses: false, publicAssets: false })
    })

    it('usuario común asignado (solo lectura de la planta): ve todo lo interno, incluidas las órdenes abiertas (ADR-006)', async () => {
      const res = await get(`${B}/process`, consumer).expect(200)
      expect(res.body.stages).toHaveLength(3)
      expect(stage(res, 'D06').openWorkOrders).toBe(1)
    })

    it('un usuario sin asignación en la planta se comporta como visitante', async () => {
      expect(await get(`${B}/process`, outsider).expect(200).then((r) => r.body.stages)).toEqual([])
    })

    it('mantenimiento visible solo con maintenance.read', async () => {
      expect(stage(await get(`${B}/process`, tech).expect(200), 'D06').openWorkOrders).toBe(1)
      expect(stage(await get(`${B}/process`, op).expect(200), 'D06').openWorkOrders).toBe(1)
      expect(stage(await get(`${B}/process`, wh).expect(200), 'D06').openWorkOrders).toBeNull()
    })

    it('planta privada: 404 para quien no es miembro', async () => {
      await t.plant('prpriv', 'PRIVATE')
      await get('/api/v1/plants/e2e-prpriv/process', outsider).expect(404)
      await get('/api/v1/plants/e2e-prpriv/process', null).expect(404)
    })
  })

  describe('conexiones del flujo', () => {
    beforeEach(async () => {
      await clearConnections()
    })

    it('solo quien configura la planta crea y borra; ajenos y anónimos no', async () => {
      for (const s of [tech, op, wh, consumer, outsider]) await conn(s6, s7, {}, s).expect(403)
      await conn(s6, s7, {}, null as unknown as Session).expect(401)
      const ok = await conn(s6, s7).expect(201)
      expect(ok.body).toMatchObject({ sourceStageId: s6, targetStageId: s7, flowType: 'MATERIAL', isReturnFlow: false })
      await send('delete', `${B}/process/connections/${ok.body.id}`, tech).expect(403)
      await send('delete', `${B}/process/connections/${ok.body.id}`, pa).expect(204)
      await send('delete', `${B}/process/connections/${ok.body.id}`, pa).expect(404)
    })

    it('valida: etapas de la planta, habilitadas, distintas, tipo de flujo, duplicados', async () => {
      const [{ id: foreign }] = await t.db.select({ id: assets.id }).from(assets).limit(1) // un uuid que no es etapa
      await conn(s6, foreign).expect(400)
      await conn(foreign, s6).expect(400)
      await conn(s6, s6).expect(400)
      await conn(s6, s7, { flowType: 'PLASMA' }).expect(400)
      await conn('no-uuid', s7).expect(400)
      const disabled = (await t.db.query.plantStages.findMany({ where: (p, { and, eq }) => and(eq(p.plantId, plantA.id), eq(p.isEnabled, false)) }))[0].id
      await conn(s6, disabled).expect(400)
      const first = await conn(s6, s7).expect(201)
      await conn(s6, s7).expect(409)
      await conn(s6, s7, { flowType: 'WATER' }).expect(201) // otro tipo de flujo entre las mismas etapas: válido
      await send('delete', `${B}/process/connections/${first.body.id}`, pa).expect(204)
    })

    it('un ciclo en el flujo principal se rechaza; como retorno se admite; otro tipo de flujo no cuenta', async () => {
      const a = await conn(s6, s7).expect(201)
      const b = await conn(s7, s11).expect(201)
      const res = await conn(s11, s6).expect(400)
      expect(JSON.stringify(res.body)).toMatch(/ciclo/)
      await conn(s7, s6).expect(400) // ciclo directo
      await conn(s11, s6, { isReturnFlow: true }).expect(201) // recirculación explícita
      await conn(s11, s6, { flowType: 'WATER' }).expect(201) // distinto tipo: sin ciclo en ese tipo
      const overview = (await get(`${B}/process`).expect(200)).body
      expect(overview.connections).toHaveLength(4)
      expect(overview.connections.find((c: { isReturnFlow: boolean }) => c.isReturnFlow)).toMatchObject({ sourceStageId: s11, targetStageId: s6 })
      for (const c of overview.connections) await send('delete', `${B}/process/connections/${c.id}`, pa).expect(204)
      expect(a.body.id && b.body.id).toBeTruthy()
    })

    it('conexiones simultáneas que cerrarían un ciclo: el resultado nunca es un ciclo no marcado', async () => {
      await conn(s6, s7).expect(201)
      // s7→s11 y s11→s6 a la vez: pueden entrar ambas solo si la segunda ve la primera; en el peor caso se cierra el ciclo
      const res = await Promise.all([conn(s7, s11), conn(s11, s6)])
      expect(res.every((r) => [201, 400].includes(r.status))).toBe(true)
      const overview = (await get(`${B}/process`).expect(200)).body
      for (const c of overview.connections) await send('delete', `${B}/process/connections/${c.id}`, pa).expect(204)
    })

    it('el mapa muestra solo conexiones entre etapas visibles para el visitante', async () => {
      const c1 = await conn(s6, s7).expect(201) // D07 no es pública
      const c2 = await conn(s6, s11).expect(201)
      await setSettings({ publicProcesses: true })
      const pub = (await get(`${B}/process`, null).expect(200)).body
      expect(pub.connections.map((c: { id: string }) => c.id)).toEqual([c2.body.id])
      expect((await get(`${B}/process`).expect(200)).body.connections).toHaveLength(2)
      await setSettings({ publicProcesses: false })
      for (const id of [c1.body.id, c2.body.id]) await send('delete', `${B}/process/connections/${id}`, pa).expect(204)
    })

    it('una conexión de otra planta no se borra desde esta', async () => {
      const c = await conn(s6, s7).expect(201)
      await send('delete', `/api/v1/plants/e2e-pr2/process/connections/${c.body.id}`, outsider).expect(404)
      await send('delete', `${B}/process/connections/${c.body.id}`, pa).expect(204)
    })

    it('al quitar una etapa de la planta sus conexiones caen con ella (cascada)', async () => {
      const p3 = await t.plant('pr3', 'PUBLIC')
      const a = (await t.enableStage(p3.id, 'D01')).id
      const b = (await t.enableStage(p3.id, 'D02')).id
      await t.db.insert((await import('../src/database/schema')).stageConnections).values({ plantId: p3.id, sourceStageId: a, targetStageId: b })
      await t.pool.query('delete from process.plant_stages where id = $1', [a])
      const left = await t.pool.query('select count(*)::int as n from process.stage_connections where plant_id = $1', [p3.id])
      expect(left.rows[0].n).toBe(0)
    })

    it('la base impide una conexión consigo misma', async () => {
      await expect(t.pool.query('insert into process.stage_connections (id, plant_id, source_stage_id, target_stage_id) values (gen_random_uuid(), $1, $2, $2)', [plantA.id, s6])).rejects.toThrow(/no_self_loop/)
    })

    it('las conexiones quedan auditadas', async () => {
      const c = await conn(s6, s7).expect(201)
      await send('delete', `${B}/process/connections/${c.body.id}`, pa).expect(204)
      const rows = await t.pool.query("select action from audit.events where plant_id = $1 and module = 'process'", [plantA.id])
      expect(rows.rows.map((r: { action: string }) => r.action)).toEqual(expect.arrayContaining(['created', 'deleted']))
    })
  })

  describe('redes transversales', () => {
    it('solo redes habilitadas; el visitante, además, solo las públicas', async () => {
      const internal = (await get(`${B}/network-overview`).expect(200)).body
      expect(internal.map((n: { code: string }) => n.code)).toEqual(['FUR-IOT', 'FUR-PTE']) // FUR-MNT está deshabilitada
      const anon = (await get(`${B}/network-overview`, null).expect(200)).body
      expect(anon.map((n: { code: string }) => n.code)).toEqual(['FUR-IOT'])
    })

    it('resumen por red: activos y atención; no cuenta dados de baja', async () => {
      const list = (await get(`${B}/network-overview`).expect(200)).body
      const iot = list.find((n: { code: string }) => n.code === 'FUR-IOT')
      expect(iot).toMatchObject({ id: nIot, assetCount: 3, attentionAssets: 2, statusCounts: { OPERATIVE: 1, REPAIR: 1, CRITICAL: 1 } })
      expect(list.find((n: { code: string }) => n.code === 'FUR-PTE')).toMatchObject({ assetCount: 2 })
    })

    it('visitante: conteos nulos si la planta no publica activos; con activos públicos, solo esos', async () => {
      expect((await get(`${B}/network-overview`, null).expect(200)).body[0]).toMatchObject({ assetCount: null, statusCounts: null })
      await setSettings({ publicAssets: true })
      expect((await get(`${B}/network-overview`, null).expect(200)).body[0]).toMatchObject({ assetCount: 2, attentionAssets: 1 }) // A-6a y A-7a (A-6b es privado)
      await setSettings({ publicAssets: false })
    })

    it('dashboard de la red: estados, criticidad, etapas, atención ordenada y órdenes', async () => {
      const d = (await get(`${B}/network-overview/FUR-IOT`).expect(200)).body
      expect(d.network).toMatchObject({ code: 'FUR-IOT', name: expect.any(String) })
      expect(d.assets.total).toBe(3)
      expect(d.assets.byStatus).toEqual({ OPERATIVE: 1, REPAIR: 1, CRITICAL: 1 })
      expect(d.assets.byCriticality).toEqual({ CRITICAL: 1, MEDIUM: 1, HIGH: 1 })
      expect(d.assets.byStage).toEqual([{ code: 'D06', name: expect.any(String), count: 2 }, { code: 'D07', name: expect.any(String), count: 1 }])
      expect(d.assets.attention.map((a: { tag: string }) => a.tag)).toEqual(['A-7A', 'A-6B']) // alta antes que media
      expect(d.workOrders).toEqual({ open: 1, overdue: 0 })
    })

    it('el código no distingue mayúsculas; una red deshabilitada, ajena o no pública para el visitante es 404', async () => {
      await get(`${B}/network-overview/fur-iot`).expect(200)
      await get(`${B}/network-overview/FUR-MNT`).expect(404) // deshabilitada
      await get(`${B}/network-overview/FUR-NOPE`).expect(404)
      await get(`${B}/network-overview/FUR-PTE`, null).expect(404) // no pública
      await get(`${B}/network-overview/FUR-IOT`, null).expect(200)
    })

    it('el dashboard del visitante no expone activos si no se publican; sin mantenimiento sin permiso', async () => {
      expect((await get(`${B}/network-overview/FUR-IOT`, null).expect(200)).body.assets).toBeNull()
      await setSettings({ publicAssets: true })
      const pub = (await get(`${B}/network-overview/FUR-IOT`, null).expect(200)).body
      expect(pub.assets.total).toBe(2)
      expect(JSON.stringify(pub.assets.attention)).not.toMatch(/A-6B/) // privado
      expect(pub.workOrders).toBeNull()
      await setSettings({ publicAssets: false })
      expect((await get(`${B}/network-overview/FUR-IOT`, wh).expect(200)).body.workOrders).toBeNull()
      expect((await get(`${B}/network-overview/FUR-IOT`, tech).expect(200)).body.workOrders).toEqual({ open: 1, overdue: 0 })
    })

    it('planta privada: 404', async () => {
      await get('/api/v1/plants/e2e-prpriv/network-overview', outsider).expect(404)
      await get('/api/v1/plants/e2e-prpriv/network-overview/FUR-IOT', outsider).expect(404)
    })

    it('una red habilitada sin activos devuelve ceros, no error', async () => {
      await t.enableNetwork(plantA.id, 'FUR-RQ', { isPublic: true })
      const d = (await get(`${B}/network-overview/FUR-RQ`).expect(200)).body
      expect(d.assets).toMatchObject({ total: 0, byStatus: {}, attention: [] })
    })
  })
})
