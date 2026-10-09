import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { assets, assetStatusHistory, auditEvents, plantSettings, plants } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Plant = typeof plants.$inferSelect

describe('Activos físicos y ficha FUR (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let plantA: Plant // pública; código E2E-A1
  let plantB: Plant // otra planta, para comprobar el aislamiento
  let privPlant: Plant
  let admin: Session
  let pa: Session // administrador de planta A: todos los permisos
  let maint: Session // jefe de mantenimiento A: asset.read + asset.update, sin create/delete
  let consumer: Session // sin rol en ninguna planta
  let modelId: string
  let motorModelId: string

  const A = '/api/v1/plants/e2e-a1/assets'
  const post = (body: object, s: Session = pa, base = A) => http().post(base).set('Authorization', bearer(s)).send(body)
  const patch = (id: string, body: object, s: Session = pa) => http().patch(`${A}/${id}`).set('Authorization', bearer(s)).send(body)
  const base = () => ({ tag: 'MB-301', name: 'Molino de bolas 1', assetModelId: modelId })

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()

    plantA = await t.plant('a1', 'PUBLIC')
    plantB = await t.plant('b1', 'PUBLIC')
    privPlant = await t.plant('priv', 'PRIVATE')
    for (const p of [plantA, plantB]) {
      await t.enableStage(p.id, 'D06')
      await t.enableStage(p.id, 'D07')
      await t.enableNetwork(p.id, 'FUR-IOT')
      await t.enableNetwork(p.id, 'FUR-PTE')
    }
    await t.enableStage(plantA.id, 'D11', { isEnabled: false }) // existe pero deshabilitada
    await t.enableNetwork(plantA.id, 'FUR-MNT', { isEnabled: false })

    modelId = (await t.model('MOLINO_BOLAS', 'E2E Bolas 16.5x24', 'E2E Metso')).id
    motorModelId = (await t.model('MOTOR_ELECTRICO', 'E2E Motor 4 MW', 'E2E WEG')).id

    const [adminU, paU, maintU] = await Promise.all([
      t.user('admin', { isGlobalAdmin: true }),
      t.user('pa'),
      t.user('maint'),
      t.user('consumer'),
    ])
    await t.assign(paU.id, plantA.id, 'PLANT_ADMIN')
    await t.assign(paU.id, privPlant.id, 'PLANT_ADMIN')
    await t.assign(maintU.id, plantA.id, 'MAINTENANCE_LEAD')
    void adminU
    ;[admin, pa, maint, consumer] = await Promise.all(['admin', 'pa', 'maint', 'consumer'].map((n) => login(app, n)))
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('alta de activos', () => {
    it('exige sesión y el permiso asset.create en ESA planta', async () => {
      await http().post(A).send(base()).expect(401)
      await post(base(), maint).expect(403) // jefe de mantenimiento: puede editar, no crear
      await post(base(), consumer).expect(403)
      await post(base(), pa, '/api/v1/plants/e2e-b1/assets').expect(403) // administrador de A en la planta B (pública)
      await post(base(), pa, '/api/v1/plants/e2e-priv/assets').expect(201) // en la privada sí es administrador
    })

    it('crea con FUR consecutivo, etapa, redes e historial inicial', async () => {
      const res = await post({
        ...base(),
        tag: 'mb-301',
        stageCode: 'D06',
        networkCodes: ['FUR-IOT', 'FUR-PTE'],
        criticality: 'CRITICAL',
        location: 'Nave de molienda',
        serialNumber: 'SN-0001',
      }).expect(201)

      expect(res.body).toMatchObject({
        furCode: 'FUR-E2E-A1-00001',
        tag: 'MB-301', // el tag se normaliza a mayúsculas
        status: 'OPERATIVE',
        criticality: 'CRITICAL',
        isPublic: false, // privado por defecto
        serialNumber: 'SN-0001',
        stage: { code: 'D06', name: 'Molienda secundaria' },
        type: { code: 'MOLINO_BOLAS' },
        family: { code: 'MOLINOS' },
        manufacturer: 'E2E Metso', // fabricante heredado del modelo
      })
      expect(res.body.networks.map((n: { code: string }) => n.code)).toEqual(['FUR-IOT', 'FUR-PTE'])

      const history = await t.db.select().from(assetStatusHistory).where(eq(assetStatusHistory.assetId, res.body.id))
      expect(history).toMatchObject([{ oldStatus: null, newStatus: 'OPERATIVE', reason: 'Alta del activo' }])
      const [audit] = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, res.body.id), eq(auditEvents.action, 'created')))
      expect(audit).toMatchObject({ module: 'assets', plantId: plantA.id })
    })

    it('el siguiente activo toma el FUR siguiente y un tag repetido da 409 sin quemar números', async () => {
      const second = await post({ tag: 'MT-301', name: 'Motor del molino', assetModelId: motorModelId }).expect(201)
      expect(second.body.furCode).toBe('FUR-E2E-A1-00002')

      await post(base()).expect(409) // MB-301 ya existe
      const third = await post({ tag: 'MT-302', name: 'Motor 2', assetModelId: motorModelId }).expect(201)
      expect(third.body.furCode).toBe('FUR-E2E-A1-00003') // la transacción revertida no consumió el 3

      // El mismo tag en OTRA planta sí es válido: el tag es único por planta.
      const other = await post(base(), admin, '/api/v1/plants/e2e-b1/assets').expect(201)
      expect(other.body.furCode).toBe('FUR-E2E-B1-00001')
    })

    it('altas simultáneas nunca repiten el código FUR', async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => post({ tag: `PAR-${i}`, name: `Paralelo ${i}`, assetModelId: motorModelId })),
      )
      expect(results.map((r) => r.status)).toEqual(Array(6).fill(201))
      const codes = results.map((r) => r.body.furCode as string)
      expect(new Set(codes).size).toBe(6)
    })

    it('rechaza una etapa deshabilitada o inexistente en la planta (§47.2)', async () => {
      const disabled = await post({ ...base(), tag: 'X1', stageCode: 'D11' }).expect(400)
      expect(disabled.body.message).toContain('D11')
      await post({ ...base(), tag: 'X2', stageCode: 'D01' }).expect(400) // nunca habilitada
      await post({ ...base(), tag: 'X3', stageCode: 'd06' }).expect(400) // formato inválido
    })

    it('rechaza redes no habilitadas en la planta (§47.3)', async () => {
      const res = await post({ ...base(), tag: 'X4', networkCodes: ['FUR-IOT', 'FUR-CAM', 'FUR-MNT'] }).expect(400)
      expect(res.body.message).toMatch(/FUR-CAM.*FUR-MNT|FUR-MNT.*FUR-CAM/)
    })

    it('valida modelo, padre y datos', async () => {
      await post({ ...base(), tag: 'X5', assetModelId: '018f0000-0000-7000-8000-000000000000' }).expect(400)
      await post({ ...base(), tag: 'X6', assetModelId: 'no-uuid' }).expect(400)

      const inB = await http().get('/api/v1/plants/e2e-b1/assets').set('Authorization', bearer(admin)).expect(200)
      await post({ ...base(), tag: 'X7', parentAssetId: inB.body.items[0].id }).expect(400) // padre de otra planta

      const bad = await post({ tag: '', name: '', assetModelId: modelId, status: 'ROTO', criticality: 'ALTA', installationDate: '15/03/2022' }).expect(400)
      expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['criticality', 'installationDate', 'name', 'status', 'tag'])
    })

    it('un activo no puede crearse ya dado de baja', async () => {
      await post({ ...base(), tag: 'X8', status: 'DECOMMISSIONED' }).expect(400)
    })
  })

  describe('listado y filtros', () => {
    let boot: string // id de un activo para otras pruebas

    beforeAll(async () => {
      const mk = (tag: string, extra: object) => post({ tag, name: `Activo ${tag}`, assetModelId: modelId, ...extra }).expect(201)
      await mk('LST-A', { stageCode: 'D07', status: 'MAINTENANCE', criticality: 'HIGH', location: 'Nave sur', isPublic: true, networkCodes: ['FUR-IOT'] })
      await mk('LST-B', { stageCode: 'D07', status: 'STANDBY', criticality: 'LOW', location: 'Nave norte', isPublic: true })
      await mk('LST-C', { status: 'STOCK', criticality: 'LOW', location: 'Almacén central' })
      boot = (await http().get(A).query({ search: 'LST-A' }).set('Authorization', bearer(pa))).body.items[0].id
    })

    const list = (query: Record<string, string | number>, s: Session | null = pa) => {
      const r = http().get(A).query(query)
      return (s ? r.set('Authorization', bearer(s)) : r).expect(200)
    }
    const tags = (res: request.Response) => res.body.items.map((a: { tag: string }) => a.tag)

    it('filtra por etapa, red, estado (varios), criticidad, ubicación y texto', async () => {
      expect(tags(await list({ stage: 'D07', search: 'LST' })).sort()).toEqual(['LST-A', 'LST-B'])
      expect(tags(await list({ network: 'FUR-IOT', search: 'LST' }))).toEqual(['LST-A'])
      expect(tags(await list({ status: 'MAINTENANCE,STANDBY', search: 'LST' })).sort()).toEqual(['LST-A', 'LST-B'])
      expect(tags(await list({ criticality: 'LOW', search: 'LST' })).sort()).toEqual(['LST-B', 'LST-C'])
      expect(tags(await list({ location: 'norte' }))).toEqual(['LST-B'])
      expect(tags(await list({ search: 'bolas 16' }))).toEqual(expect.arrayContaining(['MB-301', 'LST-A', 'LST-B', 'LST-C'])) // por nombre de modelo
      expect(tags(await list({ search: 'FUR-E2E-A1-00001' }))).toEqual(['MB-301']) // por código FUR
    })

    it('filtra por familia y tipo del catálogo', async () => {
      expect(tags(await list({ type: 'MOTOR_ELECTRICO', search: 'MT-30' })).sort()).toEqual(['MT-301', 'MT-302'])
      expect((await list({ family: 'MOTORES' })).body.total).toBeGreaterThan(0)
      expect((await list({ family: 'BOMBAS' })).body.total).toBe(0)
    })

    it('ordena y pagina', async () => {
      const asc = await list({ search: 'LST', sort: 'tag', dir: 'asc' })
      const desc = await list({ search: 'LST', sort: 'tag', dir: 'desc' })
      expect(tags(asc)).toEqual(['LST-A', 'LST-B', 'LST-C'])
      expect(tags(desc)).toEqual(['LST-C', 'LST-B', 'LST-A'])

      const p2 = await list({ search: 'LST', pageSize: 2, page: 2 })
      expect(p2.body).toMatchObject({ total: 3, page: 2, pageSize: 2 })
      expect(tags(p2)).toEqual(['LST-C'])
    })

    it('valida los parámetros del listado', async () => {
      await http().get(A).query({ sort: 'password' }).set('Authorization', bearer(pa)).expect(400)
      await http().get(A).query({ status: 'ROTO' }).set('Authorization', bearer(pa)).expect(400)
      await http().get(A).query({ stage: 'molienda' }).set('Authorization', bearer(pa)).expect(400)
      await http().get(A).query({ pageSize: 101 }).set('Authorization', bearer(pa)).expect(400)
    })

    it('un filtro con comodines SQL se trata como texto', async () => {
      expect((await list({ search: '%' })).body.total).toBe(0)
      expect((await list({ location: '_' })).body.total).toBe(0)
    })

    it('visitantes: nada hasta que la planta publique sus activos; luego, solo los públicos', async () => {
      expect((await list({ search: 'LST' }, null)).body).toMatchObject({ total: 0, items: [] })
      expect((await list({ search: 'LST' }, consumer)).body.total).toBe(0)

      await t.db.update(plantSettings).set({ publicAssets: true }).where(eq(plantSettings.plantId, plantA.id))
      const anon = await list({ search: 'LST' }, null)
      expect(tags(anon).sort()).toEqual(['LST-A', 'LST-B']) // LST-C es privado
      expect(tags(await list({ search: 'LST' }, consumer)).sort()).toEqual(['LST-A', 'LST-B'])
      // Quien tiene asset.read sigue viendo todo.
      expect((await list({ search: 'LST' }, maint)).body.total).toBe(3)
    })

    it('los visitantes no pueden usar filtros para sacar activos privados', async () => {
      const res = await list({ search: 'MB-301' }, null)
      expect(res.body.total).toBe(0)
      expect((await list({ status: 'STOCK' }, null)).body.total).toBe(0)
    })

    it('planta privada: 404 para quien no es miembro (no revela que existe)', async () => {
      await http().get('/api/v1/plants/e2e-priv/assets').expect(404)
      await http().get('/api/v1/plants/e2e-priv/assets').set('Authorization', bearer(consumer)).expect(404)
      await http().get('/api/v1/plants/e2e-priv/assets').set('Authorization', bearer(pa)).expect(200)
    })

    it('aísla plantas: no lista ni lee activos de otra planta', async () => {
      const b = await http().get('/api/v1/plants/e2e-b1/assets').set('Authorization', bearer(admin)).expect(200)
      expect(b.body.items.some((a: { tag: string }) => a.tag === 'LST-A')).toBe(false)
      const idInB = b.body.items[0].id
      await http().get(`${A}/${idInB}`).set('Authorization', bearer(pa)).expect(404)
      await patch(idInB, { name: 'x' }).expect(404)
    })

    it('el detalle público omite datos internos; el interno los incluye', async () => {
      const pub = await http().get(`${A}/${boot}`).expect(200)
      expect(pub.body).toMatchObject({ tag: 'LST-A', stage: { code: 'D07' } })
      for (const field of ['serialNumber', 'metadata', 'parentAssetId', 'technicalData']) expect(pub.body).not.toHaveProperty(field)

      const internal = await http().get(`${A}/${boot}`).set('Authorization', bearer(maint)).expect(200)
      for (const field of ['serialNumber', 'metadata', 'parentAssetId', 'technicalData']) expect(internal.body).toHaveProperty(field)
    })

    it('un activo no público es indistinguible de uno inexistente para un visitante', async () => {
      const all = await http().get(A).query({ search: 'LST-C' }).set('Authorization', bearer(pa))
      const privateId = all.body.items[0].id
      await http().get(`${A}/${privateId}`).expect(404)
      await http().get(`${A}/${privateId}/fur`).expect(404)
      await http().get(`${A}/018f0000-0000-7000-8000-000000000000`).expect(404)
      await http().get(`${A}/no-uuid`).expect(400)
    })
  })

  describe('ficha FUR consolidada (§14.2)', () => {
    it('devuelve la estructura completa para un miembro', async () => {
      const [asset] = (await http().get(A).query({ search: 'MB-301' }).set('Authorization', bearer(pa))).body.items
      const res = await http().get(`${A}/${asset.id}/fur`).set('Authorization', bearer(pa)).expect(200)

      expect(Object.keys(res.body).sort()).toEqual(
        ['asset', 'documents', 'history', 'inventory', 'kpis', 'maintenance', 'networks', 'plant', 'stage', 'telemetry'].sort(),
      )
      expect(res.body.asset).toMatchObject({ furCode: 'FUR-E2E-A1-00001', tag: 'MB-301', serialNumber: 'SN-0001' })
      expect(res.body.plant).toMatchObject({ slug: 'e2e-a1', code: 'E2E-A1' })
      expect(res.body.stage).toMatchObject({ code: 'D06' })
      expect(res.body.networks).toHaveLength(2)
      expect(res.body.history).toHaveLength(1)
      expect(res.body.history[0]).toMatchObject({ newStatus: 'OPERATIVE', reason: 'Alta del activo', changedBy: expect.stringContaining('pa') })
      // Módulos de fases futuras: presentes pero vacíos.
      expect(res.body.documents).toEqual([])
      expect(res.body.kpis).toEqual([])
    })

    it('la versión pública no incluye historial ni datos internos', async () => {
      const [pub] = (await http().get(A).query({ search: 'LST-A' }).set('Authorization', bearer(pa))).body.items
      const res = await http().get(`${A}/${pub.id}/fur`).expect(200)
      expect(res.body.history).toEqual([])
      expect(res.body.asset).not.toHaveProperty('serialNumber')
    })
  })

  describe('edición', () => {
    let id: string
    beforeAll(async () => {
      id = (await post({ tag: 'ED-1', name: 'Para editar', assetModelId: modelId, stageCode: 'D06', networkCodes: ['FUR-IOT'] }).expect(201)).body.id
    })

    it('exige asset.update en la planta: mantenimiento sí, usuario común no', async () => {
      await http().patch(`${A}/${id}`).send({ name: 'x' }).expect(401)
      await patch(id, { name: 'x' }, consumer).expect(403)
      const res = await patch(id, { name: 'Editado por mantenimiento', location: 'Taller' }, maint).expect(200)
      expect(res.body).toMatchObject({ name: 'Editado por mantenimiento', location: 'Taller' })
    })

    it('un cambio de estado queda en el historial con su motivo y se audita', async () => {
      await patch(id, { status: 'MAINTENANCE', statusReason: 'Cambio de rodamientos' }).expect(200)
      await patch(id, { status: 'OPERATIVE' }).expect(200)

      const history = await t.db.select().from(assetStatusHistory).where(eq(assetStatusHistory.assetId, id)).orderBy(assetStatusHistory.changedAt, assetStatusHistory.id)
      expect(history.map((h) => [h.oldStatus, h.newStatus, h.reason])).toEqual([
        [null, 'OPERATIVE', 'Alta del activo'],
        ['OPERATIVE', 'MAINTENANCE', 'Cambio de rodamientos'],
        ['MAINTENANCE', 'OPERATIVE', null],
      ])
      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, id), eq(auditEvents.action, 'status.changed'))).orderBy(auditEvents.occurredAt, auditEvents.id)
      expect(events).toHaveLength(2)
      expect(events[0].oldData).toMatchObject({ status: 'OPERATIVE' })
    })

    it('guardar el mismo estado no genera historial', async () => {
      const before = await t.db.select().from(assetStatusHistory).where(eq(assetStatusHistory.assetId, id))
      await patch(id, { status: 'OPERATIVE', name: 'Mismo estado' }).expect(200)
      expect(await t.db.select().from(assetStatusHistory).where(eq(assetStatusHistory.assetId, id))).toHaveLength(before.length)
    })

    it('cambia de etapa (solo habilitadas), la desasigna y reemplaza las redes', async () => {
      expect((await patch(id, { stageCode: 'D07' }).expect(200)).body.stage.code).toBe('D07')
      await patch(id, { stageCode: 'D11' }).expect(400) // deshabilitada
      expect((await patch(id, { stageCode: null }).expect(200)).body.stage).toBeNull()

      const nets = await patch(id, { networkCodes: ['FUR-PTE'] }).expect(200)
      expect(nets.body.networks.map((n: { code: string }) => n.code)).toEqual(['FUR-PTE'])
      await patch(id, { networkCodes: ['FUR-MNT'] }).expect(400) // deshabilitada en la planta
      expect((await patch(id, { networkCodes: [] }).expect(200)).body.networks).toEqual([])
    })

    it('el tag puede cambiar pero no chocar con otro; el FUR nunca cambia', async () => {
      await patch(id, { tag: 'MB-301' }).expect(409)
      const res = await patch(id, { tag: 'ed-1b', furCode: 'FUR-HACK-1' }).expect(200)
      expect(res.body.tag).toBe('ED-1B')
      expect(res.body.furCode).toMatch(/^FUR-E2E-A1-\d{5}$/)
    })

    it('jerarquía: padre válido, sin ciclos ni autorreferencia', async () => {
      const child = (await post({ tag: 'ED-CHILD', name: 'Hijo', assetModelId: modelId, parentAssetId: id }).expect(201)).body.id
      await patch(id, { parentAssetId: id }).expect(400) // sí mismo
      await patch(id, { parentAssetId: child }).expect(400) // ciclo: hijo → padre
      expect((await patch(child, { parentAssetId: null }).expect(200)).body.parentAssetId).toBeNull()
    })

    it('no permite la baja por PATCH, cuerpos vacíos ni campos inválidos', async () => {
      await patch(id, { status: 'DECOMMISSIONED' }).expect(400)
      await patch(id, {}).expect(400)
      await patch(id, { criticality: 'ALTISIMA' }).expect(400)
      await patch(id, { assetModelId: '018f0000-0000-7000-8000-000000000000' }).expect(400)
    })
  })

  describe('baja lógica', () => {
    let id: string
    beforeAll(async () => {
      id = (await post({ tag: 'BAJA-1', name: 'Para dar de baja', assetModelId: modelId, isPublic: true }).expect(201)).body.id
    })

    it('exige asset.delete: solo el administrador de planta', async () => {
      await http().delete(`${A}/${id}`).expect(401)
      await http().delete(`${A}/${id}`).set('Authorization', bearer(maint)).expect(403)
      await http().delete(`${A}/${id}`).set('Authorization', bearer(consumer)).expect(403)
    })

    it('da de baja conservando el activo y su historial', async () => {
      await http().delete(`${A}/${id}`).set('Authorization', bearer(pa)).expect(204)

      const [row] = await t.db.select().from(assets).where(eq(assets.id, id))
      expect(row.status).toBe('DECOMMISSIONED') // sigue existiendo
      const history = await t.db.select().from(assetStatusHistory).where(eq(assetStatusHistory.assetId, id))
      expect(history.map((h) => h.newStatus).sort()).toEqual(['DECOMMISSIONED', 'OPERATIVE'])
      const [audit] = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, id), eq(auditEvents.action, 'decommissioned')))
      expect(audit).toBeDefined()
    })

    it('desaparece del listado normal y de la vista pública, pero se puede consultar explícitamente', async () => {
      const normal = await http().get(A).query({ search: 'BAJA-1' }).set('Authorization', bearer(pa)).expect(200)
      expect(normal.body.total).toBe(0)
      const explicit = await http().get(A).query({ search: 'BAJA-1', status: 'DECOMMISSIONED' }).set('Authorization', bearer(pa)).expect(200)
      expect(explicit.body.total).toBe(1)

      await http().get(`${A}/${id}`).expect(404) // ya no es visible al público aunque isPublic=true
      await http().get(`${A}/${id}`).set('Authorization', bearer(pa)).expect(200) // el equipo interno sí
    })

    it('un activo dado de baja no se puede modificar y la baja es idempotente', async () => {
      await patch(id, { name: 'resucitado' }).expect(409)
      await http().delete(`${A}/${id}`).set('Authorization', bearer(pa)).expect(204)
    })
  })

  describe('integridad con la configuración de la planta (§47)', () => {
    it('no se puede deshabilitar una etapa o red que todavía tiene activos', async () => {
      const stages = await http().get('/api/v1/plants/e2e-a1/stages').set('Authorization', bearer(pa)).expect(200)
      const d06 = stages.body.find((s: { code: string }) => s.code === 'D06')
      const res = await http().patch(`/api/v1/plants/e2e-a1/stages/${d06.id}`).set('Authorization', bearer(pa)).send({ isEnabled: false }).expect(409)
      expect(res.body.message).toMatch(/activo\(s\) asignado\(s\)/)

      const nets = await http().get('/api/v1/plants/e2e-a1/networks').set('Authorization', bearer(pa)).expect(200)
      const iot = nets.body.find((n: { code: string }) => n.code === 'FUR-IOT')
      await http().patch(`/api/v1/plants/e2e-a1/networks/${iot.id}`).set('Authorization', bearer(pa)).send({ isEnabled: false }).expect(409)
    })

    it('sí se puede si los activos ya fueron dados de baja o reasignados', async () => {
      const tmp = await t.plant('tmp', 'PUBLIC')
      const stage = await t.enableStage(tmp.id, 'D06')
      const net = await t.enableNetwork(tmp.id, 'FUR-IOT')
      const created = await post({ ...base(), stageCode: 'D06', networkCodes: ['FUR-IOT'] }, admin, '/api/v1/plants/e2e-tmp/assets').expect(201)

      await http().patch(`/api/v1/plants/e2e-tmp/stages/${stage.id}`).set('Authorization', bearer(admin)).send({ isEnabled: false }).expect(409)
      await http().delete(`/api/v1/plants/e2e-tmp/assets/${created.body.id}`).set('Authorization', bearer(admin)).expect(204)
      await http().patch(`/api/v1/plants/e2e-tmp/stages/${stage.id}`).set('Authorization', bearer(admin)).send({ isEnabled: false }).expect(200)
      await http().patch(`/api/v1/plants/e2e-tmp/networks/${net.id}`).set('Authorization', bearer(admin)).send({ isEnabled: false }).expect(200)
    })
  })
})
