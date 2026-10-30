import type { INestApplication } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { assetModels, manufacturers } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Fabricantes de referencia como única fuente del catálogo', () => {
  let app: INestApplication, t: TestDb, admin: Session, first: string, second: string, blank: string
  const http = () => request(app.getHttpServer())
  beforeAll(async () => {
    t = new TestDb()
    await t.cleanup()
    app = await createApp()
    await t.user('references-admin', { isGlobalAdmin: true })
    admin = await login(app, 'references-admin')
    first = (await t.model('MOLINO_BOLAS', 'E2E Ref modelo uno')).id
    second = (await t.model('MOLINO_BOLAS', 'E2E Ref modelo dos')).id
    blank = (await t.model('MOLINO_BOLAS', 'E2E Ref sin referencias')).id
    await t.db.update(assetModels).set({ technicalData: { componentes: ['Motor'], fabricantesReferencia: [{ nombre: '  E2E   Siemens ', alcance: 'Motor', sitioWeb: 'https://example.com' }, { nombre: 'E2E ABB' }, { nombre: 'e2e siemens' }] } }).where(eq(assetModels.id, first))
    await t.db.update(assetModels).set({ technicalData: { fabricantesReferencia: [{ nombre: 'e2e siemens' }] } }).where(eq(assetModels.id, second))
    await t.db.insert(manufacturers).values({ name: 'E2E Referencia basura de columna F' })
  })
  afterAll(async () => { await t.cleanup(); await t.close(); await app.close() })

  it('lista cada nombre una sola vez e ignora marcas del maestro antiguo', async () => {
    const list = (await http().get('/api/v1/catalog/manufacturers').expect(200)).body as Array<{ id: string; name: string }>
    expect(list.filter(m => m.name.toLowerCase() === 'e2e siemens')).toHaveLength(1)
    expect(list.some(m => m.name.includes('basura de columna F'))).toBe(false)
    expect(list.find(m => m.name === 'E2E ABB')?.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('filtra por cualquiera de las referencias sin duplicar modelos, totales ni páginas', async () => {
    const list = (await http().get('/api/v1/catalog/manufacturers').expect(200)).body as Array<{ id: string; name: string }>
    const siemens = list.find(m => m.name.toLowerCase() === 'e2e siemens')!
    const p1 = (await http().get('/api/v1/catalog/assets').query({ manufacturerId: siemens.id, pageSize: 1 }).expect(200)).body
    const p2 = (await http().get('/api/v1/catalog/assets').query({ manufacturerId: siemens.id, pageSize: 1, page: 2 }).expect(200)).body
    expect(p1.total).toBe(2)
    expect(new Set([...p1.items, ...p2.items].map((m: { id: string }) => m.id))).toEqual(new Set([first, second]))
    const abb = list.find(m => m.name === 'E2E ABB')!
    const result = (await http().get('/api/v1/catalog/assets').query({ manufacturerId: abb.id, family: 'MOLINOS', search: 'E2E Ref' }).expect(200)).body
    expect(result.items.map((m: { id: string }) => m.id)).toEqual([first])
    expect(result.total).toBe(1)
  })

  it('busca por referencias y permite una ficha sin ningún fabricante asignado', async () => {
    const found = (await http().get('/api/v1/catalog/assets').query({ search: 'E2E ABB' }).expect(200)).body
    expect(found.items.map((m: { id: string }) => m.id)).toEqual([first])
    const detail = (await http().get(`/api/v1/catalog/assets/${blank}`).expect(200)).body
    expect(detail.referenceManufacturers).toEqual([])
    expect(detail).not.toHaveProperty('manufacturer')
    expect(detail).not.toHaveProperty('manufacturerId')
  })

  it('actualiza los filtros inmediatamente al editar o quitar referencias', async () => {
    const oldList = (await http().get('/api/v1/catalog/manufacturers').expect(200)).body as Array<{ id: string; name: string }>
    const abb = oldList.find(m => m.name === 'E2E ABB')!
    await http().patch(`/api/v1/catalog/models/${first}`).set('Authorization', bearer(admin)).send({ technicalData: { componentes: ['Motor'], fabricantesReferencia: [{ nombre: 'E2E WEG', alcance: null, sitioWeb: 'https://www.weg.net/' }] } }).expect(200)
    const list = (await http().get('/api/v1/catalog/manufacturers').expect(200)).body as Array<{ id: string; name: string }>
    expect(list.some(m => m.id === abb.id)).toBe(false)
    const weg = list.find(m => m.name === 'E2E WEG')!
    expect((await http().get('/api/v1/catalog/assets').query({ manufacturerId: weg.id }).expect(200)).body.items.map((m: { id: string }) => m.id)).toEqual([first])
    expect((await http().get('/api/v1/catalog/assets').query({ manufacturerId: abb.id }).expect(200)).body.total).toBe(0)
  })

  it('rechaza el fabricante directo y las webs inválidas al guardar', async () => {
    const patch = () => http().patch(`/api/v1/catalog/models/${blank}`).set('Authorization', bearer(admin))
    await patch().send({ manufacturerId: '00000000-0000-0000-0000-000000000000' }).expect(400)
    await patch().send({ technicalData: { fabricantesReferencia: [{ nombre: 'E2E WEG', sitioWeb: 'javascript:alert(1)' }] } }).expect(400)
    expect((await http().get(`/api/v1/catalog/assets/${blank}`).expect(200)).body.referenceManufacturers).toEqual([])
  })
  it('no ofrece referencias de modelos inactivos al público, pero sí al administrador', async () => {
    await http().patch(`/api/v1/catalog/models/${blank}`).set('Authorization', bearer(admin)).send({ status: 'INACTIVE', technicalData: { fabricantesReferencia: [{ nombre: 'E2E Solo inactivo' }] } }).expect(200)
    const publicList = (await http().get('/api/v1/catalog/manufacturers').expect(200)).body as Array<{ name: string }>
    expect(publicList.some(m => m.name === 'E2E Solo inactivo')).toBe(false)
    const adminList = (await http().get('/api/v1/catalog/manufacturers').set('Authorization', bearer(admin)).expect(200)).body as Array<{ name: string }>
    expect(adminList.some(m => m.name === 'E2E Solo inactivo')).toBe(true)
  })

})
