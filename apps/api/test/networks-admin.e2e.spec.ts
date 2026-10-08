import type { INestApplication } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, plantNetworks } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Network = { id: string; code: string; name: string; description: string | null; icon: string | null; colorToken: string | null }

describe('Administración de redes transversales (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())
  let admin: Session
  let pa: Session
  let consumer: Session
  let plantId: string
  let aguaId: string

  const send = (method: 'post' | 'patch' | 'delete', url: string, s: Session | null, body: object = {}) => {
    const r = http()[method](url)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  const catalog = async () => (await http().get('/api/v1/networks/catalog').expect(200)).body as Network[]

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const plant = await t.plant('netadm', 'PUBLIC')
    plantId = plant.id
    const [, paU] = await Promise.all([t.user('admin', { isGlobalAdmin: true }), t.user('pa'), t.user('consumer')])
    await t.assign(paU.id, plant.id, 'PLANT_ADMIN')
    ;[admin, pa, consumer] = await Promise.all(['admin', 'pa', 'consumer'].map((n) => login(app, n)))
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  it('solo el administrador del ecosistema administra las redes; la lectura sigue siendo pública', async () => {
    const body = { code: 'FUR-TSTX', name: 'Red X' }
    await send('post', '/api/v1/networks/catalog', null, body).expect(401)
    await send('post', '/api/v1/networks/catalog', pa, body).expect(403)
    await send('post', '/api/v1/networks/catalog', consumer, body).expect(403)
    await send('patch', '/api/v1/networks/catalog/018f0000-0000-7000-8000-000000000000', pa, { name: 'x' }).expect(403)
    await send('delete', '/api/v1/networks/catalog/018f0000-0000-7000-8000-000000000000', pa).expect(403)
    await http().get('/api/v1/networks/catalog/usage').set('Authorization', bearer(pa)).expect(403)
    expect((await catalog()).length).toBeGreaterThanOrEqual(10)
  })

  describe('crear', () => {
    it('crea una red (código en mayúsculas) y aparece en el maestro público', async () => {
      const res = await send('post', '/api/v1/networks/catalog', admin, { code: 'fur-tstagua', name: 'Agua industrial', description: 'Red de agua de proceso', icon: 'droplets', colorToken: 'network-iot' }).expect(201)
      aguaId = res.body.id
      expect(res.body).toMatchObject({ code: 'FUR-TSTAGUA', name: 'Agua industrial', icon: 'droplets', colorToken: 'network-iot' })
      expect((await catalog()).some((n) => n.code === 'FUR-TSTAGUA')).toBe(true)
    })

    it('rechaza códigos repetidos y formatos inválidos', async () => {
      await send('post', '/api/v1/networks/catalog', admin, { code: 'FUR-TSTAGUA', name: 'Otra' }).expect(409)
      await send('post', '/api/v1/networks/catalog', admin, { code: 'FUR-PROC', name: 'Procesos duplicada' }).expect(409)
      for (const code of ['AGUA', 'FUR-', 'FUR-A', 'FUR-agua 1', 'FUR-TST1']) {
        await send('post', '/api/v1/networks/catalog', admin, { code, name: 'Mal formada' }).expect(400)
      }
      await send('post', '/api/v1/networks/catalog', admin, { code: 'FUR-TSTMAL', name: 'x' }).expect(400)
      await send('post', '/api/v1/networks/catalog', admin, { code: 'FUR-TSTMAL', name: 'Color malo', colorToken: 'rojo' }).expect(400)
    })

    it('se puede asignar a un tipo del catálogo y habilitar en una planta', async () => {
      const type = await send('post', '/api/v1/catalog/types', admin, { familyCode: 'BOMBAS', code: 'E2E_NETADM', name: 'E2E tipo de red', networkCodes: ['FUR-TSTAGUA'] }).expect(201)
      expect(type.body.networkCodes).toEqual(['FUR-TSTAGUA'])
      await send('post', `/api/v1/plants/e2e-netadm/networks`, admin, { networkCode: 'FUR-TSTAGUA' }).expect((r) => expect([200, 201]).toContain(r.status))
    })
  })

  describe('actualizar', () => {
    it('cambia nombre, descripción, ícono y color; el código no se puede cambiar', async () => {
      const res = await send('patch', `/api/v1/networks/catalog/${aguaId}`, admin, { name: 'Agua de proceso', description: null, icon: 'waves', colorToken: 'network-lab' }).expect(200)
      expect(res.body).toMatchObject({ code: 'FUR-TSTAGUA', name: 'Agua de proceso', description: null, icon: 'waves', colorToken: 'network-lab' })
      // el código no es un campo editable: un cuerpo que solo lo trae queda vacío y se rechaza
      await send('patch', `/api/v1/networks/catalog/${aguaId}`, admin, { code: 'FUR-TSTOTRA' }).expect(400)
      expect((await catalog()).find((n) => n.id === aguaId)?.code).toBe('FUR-TSTAGUA')
    })

    it('valida el cuerpo y la existencia de la red', async () => {
      await send('patch', `/api/v1/networks/catalog/${aguaId}`, admin, {}).expect(400)
      await send('patch', `/api/v1/networks/catalog/${aguaId}`, admin, { name: 'x' }).expect(400)
      await send('patch', '/api/v1/networks/catalog/018f0000-0000-7000-8000-000000000000', admin, { name: 'Nombre válido' }).expect(404)
    })
  })

  describe('uso y eliminar', () => {
    it('el uso cuenta plantas que la habilitan y tipos del catálogo', async () => {
      const usage = (await http().get('/api/v1/networks/catalog/usage').set('Authorization', bearer(admin)).expect(200)).body as Array<{ id: string; plants: number; assets: number; types: number }>
      expect(usage.find((u) => u.id === aguaId)).toEqual({ id: aguaId, plants: 1, assets: 0, types: 1 })
    })

    it('si una planta la habilita, eliminarla se rechaza explicando dónde se usa', async () => {
      const res = await send('delete', `/api/v1/networks/catalog/${aguaId}`, admin).expect(409)
      expect(res.body.message).toContain('1 planta')
      expect((await catalog()).some((n) => n.id === aguaId)).toBe(true)
    })

    it('con confirmación (force) la quita de las plantas y de los tipos y la elimina', async () => {
      await send('delete', `/api/v1/networks/catalog/${aguaId}?force=true`, admin).expect(204)
      expect((await catalog()).some((n) => n.id === aguaId)).toBe(false)
      expect(await t.db.select().from(plantNetworks).where(eq(plantNetworks.plantId, plantId))).toEqual([])
      const types = (await http().get('/api/v1/catalog/types').expect(200)).body as Array<{ code: string; networkCodes: string[] }>
      expect(types.find((x) => x.code === 'E2E_NETADM')?.networkCodes).toEqual([])
      await send('delete', `/api/v1/networks/catalog/${aguaId}`, admin).expect(404)
    })

    it('una red sin uso se elimina directamente', async () => {
      const r = await send('post', '/api/v1/networks/catalog', admin, { code: 'FUR-TSTAIRE', name: 'Aire comprimido' }).expect(201)
      await send('delete', `/api/v1/networks/catalog/${r.body.id}`, admin).expect(204)
      expect((await catalog()).some((n) => n.code === 'FUR-TSTAIRE')).toBe(false)
    })
  })

  it('audita la creación, la edición y la eliminación', async () => {
    const events = (await t.db.select().from(auditEvents).where(eq(auditEvents.module, 'networks'))).map((e) => e.action)
    expect(events).toEqual(expect.arrayContaining(['created', 'updated', 'deleted']))
  })
})
