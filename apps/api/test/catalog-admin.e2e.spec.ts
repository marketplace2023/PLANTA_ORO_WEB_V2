import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { assetFamilies, assetModels, assetTypes, auditEvents } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Administración del catálogo y roles asignables (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())
  let admin: Session
  let pa: Session
  let maint: Session
  let consumer: Session

  const post = (url: string, s: Session | null, body: object) => {
    const r = http().post(url)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  const patch = (url: string, s: Session | null, body: object) => {
    const r = http().patch(url)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  let famId: string
  let typeId: string
  let makerId: string
  let modelId: string

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const plant = await t.plant('cat1', 'PUBLIC')
    const [adminU, paU, maintU] = await Promise.all([t.user('admin', { isGlobalAdmin: true }), t.user('pa'), t.user('maint'), t.user('consumer')])
    void adminU
    await t.assign(paU.id, plant.id, 'PLANT_ADMIN')
    await t.assign(maintU.id, plant.id, 'MAINTENANCE_LEAD')
    ;[admin, pa, maint, consumer] = await Promise.all(['admin', 'pa', 'maint', 'consumer'].map((n) => login(app, n)))
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('acceso', () => {
    it('solo el administrador del ecosistema: anónimo 401; administrador de planta y común 403', async () => {
      const body = { code: 'E2E_X', name: 'Familia X' }
      await post('/api/v1/catalog/families', null, body).expect(401)
      await post('/api/v1/catalog/families', pa, body).expect(403)
      await post('/api/v1/catalog/families', consumer, body).expect(403)
      await post('/api/v1/catalog/types', pa, { familyCode: 'MOLINOS', code: 'E2E_T', name: 'T' }).expect(403)
      await post('/api/v1/catalog/manufacturers', pa, { name: 'E2E Maker' }).expect(403)
      await post('/api/v1/catalog/models', pa, { typeCode: 'MOLINO_BOLAS', modelName: 'E2E M' }).expect(403)
      await patch('/api/v1/catalog/families/018f0000-0000-7000-8000-000000000000', pa, { name: 'x' }).expect(403)
    })

    it('la lectura sigue siendo pública', async () => {
      await http().get('/api/v1/catalog/families').expect(200)
    })
  })

  describe('familias', () => {
    it('crea (código en mayúsculas), rechaza duplicados y códigos inválidos', async () => {
      const res = await post('/api/v1/catalog/families', admin, { code: 'e2e_fam', name: 'Familia de prueba', icon: 'cog' }).expect(201)
      famId = res.body.id
      expect(res.body).toMatchObject({ code: 'E2E_FAM', name: 'Familia de prueba', icon: 'cog' })
      await post('/api/v1/catalog/families', admin, { code: 'E2E_FAM', name: 'Otra' }).expect(409)
      const bad = await post('/api/v1/catalog/families', admin, { code: 'con espacios', name: 'x' }).expect(400)
      expect(bad.body.errors[0].path).toBe('code')
      await post('/api/v1/catalog/families', admin, { code: 'E2E_OK', name: '' }).expect(400)
    })

    it('edita nombre/ícono; el código es inmutable', async () => {
      const res = await patch(`/api/v1/catalog/families/${famId}`, admin, { name: 'Familia renombrada', icon: null }).expect(200)
      expect(res.body).toMatchObject({ name: 'Familia renombrada', icon: null, code: 'E2E_FAM' })
      await patch(`/api/v1/catalog/families/${famId}`, admin, { code: 'E2E_OTRO' }).expect(400) // solo campo desconocido → vacío
      await patch(`/api/v1/catalog/families/${famId}`, admin, {}).expect(400)
      await patch('/api/v1/catalog/families/018f0000-0000-7000-8000-000000000000', admin, { name: 'xx' }).expect(404)
      await patch('/api/v1/catalog/families/no-uuid', admin, { name: 'x' }).expect(400)
    })
  })

  describe('tipos', () => {
    it('crea con familia existente; rechaza familia inexistente y código repetido', async () => {
      const res = await post('/api/v1/catalog/types', admin, { familyCode: 'E2E_FAM', code: 'E2E_TIPO', name: 'Tipo de prueba' }).expect(201)
      typeId = res.body.id
      const [row] = await t.db.select().from(assetTypes).where(eq(assetTypes.id, typeId))
      expect(row.familyId).toBe(famId)
      const bad = await post('/api/v1/catalog/types', admin, { familyCode: 'NO_EXISTE', code: 'E2E_T2', name: 'xx' }).expect(400)
      expect(bad.body.errors[0].path).toBe('familyCode')
      await post('/api/v1/catalog/types', admin, { familyCode: 'E2E_FAM', code: 'E2E_TIPO', name: 'dup' }).expect(409)
    })

    it('mueve un tipo a otra familia y edita su nombre', async () => {
      const res = await patch(`/api/v1/catalog/types/${typeId}`, admin, { familyCode: 'MOLINOS', name: 'Tipo movido' }).expect(200)
      expect(res.body.name).toBe('Tipo movido')
      const molinos = (await t.db.select().from(assetFamilies).where(eq(assetFamilies.code, 'MOLINOS')))[0]
      expect((await t.db.select().from(assetTypes).where(eq(assetTypes.id, typeId)))[0].familyId).toBe(molinos.id)
      await patch(`/api/v1/catalog/types/${typeId}`, admin, { familyCode: 'NO_EXISTE' }).expect(400)
    })
  })

  describe('fabricantes', () => {
    it('crea normalizando el país; valida web y duplicados', async () => {
      const res = await post('/api/v1/catalog/manufacturers', admin, { name: 'E2E Fabricante', countryCode: 'pe', website: 'https://fabricante.example' }).expect(201)
      makerId = res.body.id
      expect(res.body).toMatchObject({ countryCode: 'PE', website: 'https://fabricante.example' })
      await post('/api/v1/catalog/manufacturers', admin, { name: 'E2E Fabricante' }).expect(409)
      await post('/api/v1/catalog/manufacturers', admin, { name: 'E2E Otro', website: 'javascript:alert(1)' }).expect(400)
      await post('/api/v1/catalog/manufacturers', admin, { name: 'E2E Otro', countryCode: 'PER' }).expect(400)
    })

    it('edita y limpia campos opcionales', async () => {
      const res = await patch(`/api/v1/catalog/manufacturers/${makerId}`, admin, { website: null, countryCode: 'cl' }).expect(200)
      expect(res.body).toMatchObject({ website: null, countryCode: 'CL' })
    })
  })

  describe('modelos', () => {
    it('crea un modelo con tipo, fabricante y especificaciones', async () => {
      const res = await post('/api/v1/catalog/models', admin, { typeCode: 'E2E_TIPO'.replace('E2E_TIPO', 'MOLINO_BOLAS'), manufacturerId: makerId, modelName: 'E2E Modelo A', specifications: { powerKw: 500 } }).expect(201)
      modelId = res.body.id
      expect(res.body).toMatchObject({ modelName: 'E2E Modelo A', specifications: { powerKw: 500 }, status: 'ACTIVE' })
    })

    it('valida tipo, fabricante y duplicados', async () => {
      const bad1 = await post('/api/v1/catalog/models', admin, { typeCode: 'NO_EXISTE', modelName: 'E2E x' }).expect(400)
      expect(bad1.body.errors[0].path).toBe('typeCode')
      const bad2 = await post('/api/v1/catalog/models', admin, { typeCode: 'MOLINO_BOLAS', manufacturerId: '018f0000-0000-7000-8000-000000000000', modelName: 'E2E x' }).expect(400)
      expect(bad2.body.errors[0].path).toBe('manufacturerId')
      await post('/api/v1/catalog/models', admin, { typeCode: 'MOLINO_BOLAS', manufacturerId: makerId, modelName: 'E2E Modelo A' }).expect(409)
      await post('/api/v1/catalog/models', admin, { typeCode: 'MOLINO_BOLAS', modelName: '' }).expect(400)
    })

    it('edita especificaciones y fabricante', async () => {
      const res = await patch(`/api/v1/catalog/models/${modelId}`, admin, { specifications: { powerKw: 600, poles: 6 }, manufacturerId: null }).expect(200)
      expect(res.body).toMatchObject({ specifications: { powerKw: 600, poles: 6 }, manufacturerId: null })
    })

    it('desactivar oculta el modelo del catálogo público pero lo conserva para el administrador', async () => {
      await patch(`/api/v1/catalog/models/${modelId}`, admin, { status: 'INACTIVE' }).expect(200)

      const search = (s: Session | null, status?: string) => {
        const r = http().get('/api/v1/catalog/assets').query({ search: 'E2E Modelo A', ...(status && { status }) })
        return s ? r.set('Authorization', bearer(s)) : r
      }
      expect((await search(null)).body.total).toBe(0) // público: solo activos
      expect((await search(null, 'ALL')).body.total).toBe(0) // el parámetro no sirve a un visitante
      expect((await search(pa, 'ALL')).body.total).toBe(0) // ni a un administrador de planta
      expect((await search(admin)).body.total).toBe(0) // por defecto, solo activos
      expect((await search(admin, 'INACTIVE')).body.total).toBe(1)
      expect((await search(admin, 'ALL')).body.total).toBe(1)

      await patch(`/api/v1/catalog/models/${modelId}`, admin, { status: 'ACTIVE' }).expect(200)
      expect((await search(null)).body.total).toBe(1)
    })

    it('un modelo inactivo no se puede usar para crear activos nuevos', async () => {
      const plant = (await t.db.select().from(assetFamilies).limit(1), await t.plant('cat2', 'PUBLIC'))
      await patch(`/api/v1/catalog/models/${modelId}`, admin, { status: 'INACTIVE' }).expect(200)
      const res = await post(`/api/v1/plants/${plant.slug}/assets`, admin, { tag: 'X-1', name: 'x', assetModelId: modelId }).expect(400)
      expect(res.body.message).toContain('inactivo')
    })

    it('valida estado y cuerpo; 404 para modelos inexistentes', async () => {
      await patch(`/api/v1/catalog/models/${modelId}`, admin, { status: 'BORRADO' }).expect(400)
      await patch(`/api/v1/catalog/models/${modelId}`, admin, {}).expect(400)
      await patch('/api/v1/catalog/models/018f0000-0000-7000-8000-000000000000', admin, { modelName: 'x' }).expect(404)
    })
  })

  it('audita las acciones de catálogo con valor anterior/nuevo y sin planta', async () => {
    const events = await t.db.select().from(auditEvents).where(eq(auditEvents.module, 'catalog'))
    const mine = events.filter((e) => e.entityId === modelId)
    expect(mine.map((e) => e.action)).toEqual(expect.arrayContaining(['created', 'updated', 'status.inactive', 'status.active']))
    expect(mine.every((e) => e.plantId === null)).toBe(true)
    const inactive = mine.find((e) => e.action === 'status.inactive')!
    expect(inactive.oldData).toMatchObject({ status: 'ACTIVE' })
    expect(events.some((e) => e.entityType === 'asset_family' && e.action === 'created')).toBe(true)
    // sanity: el modelo existe en la base
    expect((await t.db.select().from(assetModels).where(and(eq(assetModels.id, modelId)))).length).toBe(1)
  })

  describe('foto del modelo', () => {
    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('imagen-png-de-prueba')])
    const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('imagen-jpg-de-prueba')])
    const upload = (s: Session | null, file: Buffer | null, filename = 'foto.png', id = () => modelId) => {
      const r = http().post(`/api/v1/catalog/models/${id()}/image`)
      const authed = s ? r.set('Authorization', bearer(s)) : r
      return file ? authed.attach('file', file, { filename }) : authed
    }
    const listed = async () => {
      const res = await http().get('/api/v1/catalog/assets').query({ search: 'E2E', status: 'ALL', pageSize: 100 }).set('Authorization', bearer(admin)).expect(200)
      return (res.body.items as Array<{ id: string; imageUrl: string | null }>).find((m) => m.id === modelId)!
    }

    it('un modelo sin foto no tiene imageUrl y su imagen responde 404 (pública)', async () => {
      expect((await listed()).imageUrl).toBeNull()
      await http().get(`/api/v1/catalog/models/${modelId}/image`).expect(404)
    })

    it('solo el administrador del ecosistema sube o quita fotos', async () => {
      await upload(null, PNG).expect(401)
      await upload(pa, PNG).expect(403)
      await upload(consumer, PNG).expect(403)
      await http().delete(`/api/v1/catalog/models/${modelId}/image`).set('Authorization', bearer(pa)).expect(403)
    })

    it('rechaza lo que no es una imagen válida: sin archivo, SVG, PDF, vacío y contenido que no corresponde a la extensión', async () => {
      await upload(admin, null).expect(400)
      await upload(admin, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg').expect(415)
      await upload(admin, Buffer.from('%PDF-1.4 contenido'), 'x.pdf').expect(415)
      await upload(admin, Buffer.alloc(0), 'vacia.png').expect(400)
      await upload(admin, JPG, 'mentira.png').expect(415) // extensión png, contenido jpeg
      await upload(admin, PNG, 'x.png', () => '018f0000-0000-7000-8000-000000000000').expect(404) // modelo inexistente
      expect((await listed()).imageUrl).toBeNull()
    })

    it('rechaza una imagen de más de 5 MB', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 1)])
      await upload(admin, big).expect(413)
    })

    it('el administrador sube una foto: queda en el catálogo, se sirve pública y con cabeceras seguras', async () => {
      const res = await upload(admin, PNG).expect(201)
      expect(res.body.id).toBe(modelId)
      expect(res.body.imageUrl).toMatch(new RegExp(`^/catalog/models/${modelId}/image\\?v=\\d+$`))

      expect((await listed()).imageUrl).toMatch(/\/image\?v=\d+$/)

      const img = await http().get(`/api/v1/catalog/models/${modelId}/image`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = []
        r.on('data', (c: Buffer) => chunks.push(c))
        r.on('end', () => cb(null, Buffer.concat(chunks)))
      }).expect(200)
      expect(img.headers['content-type']).toBe('image/png')
      expect(img.headers['x-content-type-options']).toBe('nosniff')
      expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin')
      expect(img.headers['content-security-policy']).toContain('sandbox')
      expect((img.body as Buffer).equals(PNG)).toBe(true)
    })

    it('reemplazar la foto cambia el tipo servido y la versión de la URL', async () => {
      const before = (await listed()).imageUrl
      await new Promise((r) => setTimeout(r, 15))
      await upload(admin, JPG, 'otra.jpeg').expect(201)
      const after = (await listed()).imageUrl
      expect(after).not.toBe(before)
      const img = await http().get(`/api/v1/catalog/models/${modelId}/image`).expect(200)
      expect(img.headers['content-type']).toBe('image/jpeg')
    })

    it('quitar la foto la elimina del catálogo (204) y deja de servirse; quitarla de nuevo es inocuo', async () => {
      await http().delete(`/api/v1/catalog/models/${modelId}/image`).set('Authorization', bearer(admin)).expect(204)
      expect((await listed()).imageUrl).toBeNull()
      await http().get(`/api/v1/catalog/models/${modelId}/image`).expect(404)
      await http().delete(`/api/v1/catalog/models/${modelId}/image`).set('Authorization', bearer(admin)).expect(204)
    })

    it('audita la subida, el reemplazo y la baja de la foto', async () => {
      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.module, 'catalog'), eq(auditEvents.entityId, modelId)))
      const actions = events.map((e) => e.action)
      expect(actions.filter((a) => a === 'image.updated')).toHaveLength(2)
      expect(actions).toContain('image.removed')
      const replaced = events.filter((e) => e.action === 'image.updated').find((e) => (e.oldData as { hadImage?: boolean } | null)?.hadImage)
      expect(replaced).toBeDefined()
    })
  })

  describe('roles asignables a una planta', () => {
    it('solo quien puede asignar (user.assign) los ve: roles de planta + común; nunca globales ni externos', async () => {
      const res = await http().get('/api/v1/plants/e2e-cat1/members/roles').set('Authorization', bearer(pa)).expect(200)
      const codes = res.body.map((r: { code: string }) => r.code)
      expect(codes).toEqual(expect.arrayContaining(['PLANT_ADMIN', 'MAINTENANCE_LEAD', 'WAREHOUSE', 'OPERATOR', 'CONSUMER']))
      for (const forbidden of ['ECOSYSTEM_ADMIN', 'PROVIDER', 'CONTRACTOR', 'INSTRUCTOR']) expect(codes).not.toContain(forbidden)

      await http().get('/api/v1/plants/e2e-cat1/members/roles').set('Authorization', bearer(maint)).expect(403)
      await http().get('/api/v1/plants/e2e-cat1/members/roles').expect(401)
    })
  })
})
