import type { INestApplication } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { assetFamilies, assetModels, assetTypes, auditEvents } from '../src/database/schema'
import { StorageService } from '../src/modules/documents/storage.service'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Imágenes masivas por TAG (e2e)', () => {
  let app: INestApplication, t: TestDb, admin: Session, consumer: Session, modelId: string
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('imagen de prueba')])
  const http = () => request(app.getHttpServer())
  const preview = (names: string[]) => http().post('/api/v1/catalog/image-imports/preview').set('Authorization', bearer(admin))
    .send({ files: names.map(name => ({ name, size: PNG.length })) })
  const upload = (imageVersion: string, replaceExisting = false, file = PNG, name = 'e2e-img-01.png', id = modelId) =>
    http().post('/api/v1/catalog/image-imports').set('Authorization', bearer(admin))
      .field('modelId', id).field('imageVersion', imageVersion).field('replaceExisting', String(replaceExisting)).attach('file', file, name)

  beforeAll(async () => {
    app = await createApp(); t = new TestDb(); await t.cleanup()
    await t.user('img-admin', { isGlobalAdmin: true }); await t.user('img-consumer')
    admin = await login(app, 'img-admin'); consumer = await login(app, 'img-consumer')
    const [family] = await t.db.insert(assetFamilies).values({ code: 'E2E_IMG', name: 'E2E Imágenes' }).returning()
    const [type] = await t.db.insert(assetTypes).values({ familyId: family.id, code: 'E2E_IMG', name: 'E2E Tipo imágenes' }).returning()
    const [model] = await t.db.insert(assetModels).values({ assetTypeId: type.id, catalogTag: 'E2E-IMG-01', modelName: 'E2E Modelo imágenes' }).returning()
    modelId = model.id
  })
  afterAll(async () => {
    if (modelId) await http().delete(`/api/v1/catalog/models/${modelId}`).set('Authorization', bearer(admin))
    await t.cleanup(); await t.close(); await app.close()
  })

  it('exige administrador global tanto para analizar como para subir', async () => {
    for (const path of ['/api/v1/catalog/image-imports/preview', '/api/v1/catalog/image-imports']) {
      await http().post(path).send({}).expect(401)
      await http().post(path).set('Authorization', bearer(consumer)).send({}).expect(403)
    }
  })
  it('analiza coincidencias exactas ignorando mayúsculas y reporta desconocidos, duplicados e inválidos', async () => {
    const result = await preview(['e2e-img-01.PNG', 'E2E-IMG-0.png', 'sin-tag.svg', 'OTRO.png', 'otro.jpg']).expect(201)
    expect(result.body.rows.map((row: { state: string }) => row.state)).toEqual(['READY', 'NOT_FOUND', 'INVALID', 'DUPLICATE', 'DUPLICATE'])
    expect(result.body.rows[0]).toMatchObject({ modelId, tag: 'E2E-IMG-01', imageVersion: 'NONE', imageUrl: null })
    const [model] = await t.db.select().from(assetModels).where(eq(assetModels.id, modelId))
    expect(model.imageKey).toBeNull()
  })
  it('rechaza metadatos vacíos, demasiados archivos y nombres con rutas', async () => {
    await preview([]).expect(400)
    await preview(Array.from({ length: 501 }, (_, i) => `${i}.png`)).expect(400)
    const result = await preview(['../e2e-img-01.png', 'folder\\e2e-img-01.png']).expect(201)
    expect(result.body.rows.every((row: { state: string }) => row.state === 'INVALID')).toBe(true)
    const oversized = await http().post('/api/v1/catalog/image-imports/preview').set('Authorization', bearer(admin))
      .send({ files: [{ name: 'E2E-IMG-01.png', size: 6 * 1024 * 1024 }] }).expect(201)
    expect(oversized.body.rows[0].state).toBe('INVALID')
  })
  it('no confía en el modelo enviado ni en los metadatos y valida el contenido real', async () => {
    await upload('NONE', false, PNG, 'e2e-img-01.png', '018f0000-0000-7000-8000-000000000000').expect(409)
    await upload('NONE', false, Buffer.from('<svg>no es PNG</svg>')).expect(415)
    await upload('NONE', false, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)])).expect(413)
  })
  it('no elige un modelo arbitrario si dos TAG difieren solo en mayúsculas', async () => {
    const [original] = await t.db.select().from(assetModels).where(eq(assetModels.id, modelId))
    const [duplicate] = await t.db.insert(assetModels).values({ assetTypeId: original.assetTypeId, catalogTag: 'e2e-img-01', modelName: 'E2E Duplicado imágenes' }).returning()
    try {
      const result = await preview(['E2E-IMG-01.png']).expect(201)
      expect(result.body.rows[0].state).toBe('AMBIGUOUS')
      await upload('NONE').expect(409)
    } finally { await t.db.delete(assetModels).where(eq(assetModels.id, duplicate.id)) }
  })
  it('un fallo del almacenamiento no modifica la ficha ni registra una imagen adjunta', async () => {
    const put = jest.spyOn(app.get(StorageService), 'put').mockRejectedValueOnce(new Error('fallo simulado de almacenamiento'))
    try {
      await upload('NONE').expect(500)
      const [model] = await t.db.select().from(assetModels).where(eq(assetModels.id, modelId))
      expect(model.imageKey).toBeNull()
      expect(await t.db.select().from(auditEvents).where(eq(auditEvents.entityId, modelId))).toHaveLength(0)
    } finally { put.mockRestore() }
  })
  it('adjunta al modelo, sirve la foto y rechaza reutilizar un análisis antiguo', async () => {
    const result = await upload('NONE').expect(201)
    expect(result.body).toMatchObject({ id: modelId, tag: 'E2E-IMG-01' })
    await http().get(`/api/v1/catalog/models/${modelId}/image`).expect('Content-Type', /image\/png/).expect(200)
    await upload('NONE', true).expect(409)
    const current = await preview(['E2E-IMG-01.png']).expect(201)
    expect(current.body.rows[0].state).toBe('EXISTING')
    await upload(current.body.rows[0].imageVersion).expect(409)
    const replaced = await upload(current.body.rows[0].imageVersion, true).expect(201)
    expect(replaced.body.imageUrl).not.toBe(result.body.imageUrl)
    const events = await t.db.select().from(auditEvents).where(eq(auditEvents.entityId, modelId))
    expect(events.filter(event => (event.newData as { source?: string })?.source === 'bulk-tag')).toHaveLength(2)
  })
  it('dos cargas simultáneas desde el mismo análisis no se sobrescriben', async () => {
    const current = await preview(['E2E-IMG-01.png']).expect(201)
    const results = await Promise.all([upload(current.body.rows[0].imageVersion, true), upload(current.body.rows[0].imageVersion, true)])
    expect(results.map(result => result.status).sort()).toEqual([201, 409])
  })
})
