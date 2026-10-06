import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Proveedores, marketplace y servicios profesionales (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let admin: Session
  let owner: Session // responsable del proveedor A
  let member: Session // miembro (no responsable) del proveedor A
  let owner2: Session // responsable del proveedor B
  let stranger: Session // usuario común sin organizaciones
  let cOwner: Session // responsable del contratista
  let ids: Record<string, string>
  let familyCode: string
  let familyName: string
  let otherFamilyCode: string
  let typeCode: string
  let modelId: string
  let manufacturerId: string
  let provA: string
  let provB: string
  let contr: string

  const send = (method: 'post' | 'patch' | 'delete', url: string, s: Session | null, body: object = {}) => {
    const r = http()[method](url)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  const get = (url: string, s: Session | null = null) => {
    const r = http().get(url)
    return s ? r.set('Authorization', bearer(s)) : r
  }
  const names = (res: request.Response) => res.body.items.map((i: { organizationName?: string; title?: string; name?: string }) => i.organizationName ?? i.title ?? i.name)

  const mkProvider = async (over: object = {}, s: Session = admin) =>
    (await send('post', '/api/v1/providers', s, { organizationName: 'E2E Prov', countryCode: 'PE', ...over }).expect(201)).body
  const mkListing = async (providerId: string, over: object = {}, s: Session = owner) =>
    (await send('post', `/api/v1/providers/${providerId}/listings`, s, { title: 'Rodamiento SKF', assetFamilyCode: familyCode, ...over }).expect(201)).body

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()

    const users = await Promise.all(['admin', 'owner', 'member', 'owner2', 'stranger', 'cowner'].map((n) => t.user(n, { isGlobalAdmin: n === 'admin' })))
    ids = Object.fromEntries(users.map((u) => [u.firstName, u.id]))
    ;[admin, owner, member, owner2, stranger, cOwner] = await Promise.all(['admin', 'owner', 'member', 'owner2', 'stranger', 'cowner'].map((n) => login(app, n)))

    const families = (await get('/api/v1/catalog/families').expect(200)).body as Array<{ code: string; name: string }>
    const types = (await get('/api/v1/catalog/types').expect(200)).body as Array<{ code: string; familyCode: string }>
    const type = types.find((x) => x.code === 'MOLINO_BOLAS')!
    typeCode = type.code
    familyCode = type.familyCode
    familyName = families.find((f) => f.code === familyCode)!.name
    otherFamilyCode = families.find((f) => f.code !== familyCode)!.code
    const model = await t.model(typeCode, 'E2E Bolas mkt', 'E2E Maker Mkt')
    modelId = model.id
    manufacturerId = model.manufacturerId!

    provA = (await mkProvider({ organizationName: 'E2E Alfa Repuestos', taxId: 'A-1', certifications: ['ISO 9001'], stageCodes: ['D06', 'D07'], familyCodes: [familyCode], ownerEmail: `owner@e2e.fur.local` })).id
    provB = (await mkProvider({ organizationName: 'E2E Beta Industrial', taxId: 'B-1', countryCode: 'CL', stageCodes: ['D11'], ownerEmail: 'owner2@e2e.fur.local' })).id
    await send('post', `/api/v1/providers/${provA}/members`, owner, { email: 'member@e2e.fur.local' }).expect(201)
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('proveedores: registro y visibilidad', () => {
    it('el listado y la ficha son públicos; la ficha oculta el correo de contacto a anónimos', async () => {
      await send('patch', `/api/v1/providers/${provA}`, owner, { contactEmail: 'ventas@alfa.test' }).expect(200)
      const anon = (await get(`/api/v1/providers/${provA}`).expect(200)).body
      expect(anon.contactEmail).toBeNull()
      expect(anon.taxId).toBeNull()
      expect(anon.canManage).toBe(false)
      const logged = (await get(`/api/v1/providers/${provA}`, stranger).expect(200)).body
      expect(logged.contactEmail).toBe('ventas@alfa.test')
      expect(logged.taxId).toBeNull() // el dato tributario es solo para quien gestiona
      const mgr = (await get(`/api/v1/providers/${provA}`, owner).expect(200)).body
      expect(mgr).toMatchObject({ taxId: 'A-1', canManage: true, myRole: 'OWNER' })
      expect(names(await get('/api/v1/providers').expect(200))).toEqual(expect.arrayContaining(['E2E Alfa Repuestos', 'E2E Beta Industrial']))
    })

    it('un usuario con sesión solicita el registro: queda PENDING, no aparece en el público y él es el responsable', async () => {
      const p = await mkProvider({ organizationName: 'E2E Solicitante', taxId: 'S-1' }, stranger)
      expect(p).toMatchObject({ status: 'PENDING', verified: false, rating: null, myRole: 'OWNER' })
      expect(names(await get('/api/v1/providers?search=Solicitante').expect(200))).toEqual([])
      await get(`/api/v1/providers/${p.id}`).expect(404)
      await get(`/api/v1/providers/${p.id}`, owner).expect(404) // otro usuario: tampoco existe
      await get(`/api/v1/providers/${p.id}`, stranger).expect(200)
      await get(`/api/v1/providers/${p.id}`, admin).expect(200)
      // "status" en el listado solo lo respeta el administrador
      expect(names(await get('/api/v1/providers?search=Solicitante&status=ALL', stranger).expect(200))).toEqual([])
      expect(names(await get('/api/v1/providers?search=Solicitante&status=PENDING', admin).expect(200))).toEqual(['E2E Solicitante'])
    })

    it('registro: sesión obligatoria, validaciones y duplicados', async () => {
      await send('post', '/api/v1/providers', null, { organizationName: 'E2E X', countryCode: 'PE' }).expect(401)
      await send('post', '/api/v1/providers', stranger, { organizationName: 'E2E X', countryCode: 'PERU' }).expect(400)
      await send('post', '/api/v1/providers', stranger, { organizationName: 'E2E X', countryCode: 'PE', website: 'javascript:alert(1)' }).expect(400)
      await send('post', '/api/v1/providers', stranger, { organizationName: 'E2E X', countryCode: 'PE', contactEmail: 'no-es-correo' }).expect(400)
      await send('post', '/api/v1/providers', stranger, { organizationName: 'E2E X', countryCode: 'PE', stageCodes: ['ZZZ'] }).expect(400)
      await send('post', '/api/v1/providers', stranger, { organizationName: 'E2E X', countryCode: 'PE', familyCodes: ['NOPE'] }).expect(400)
      await send('post', '/api/v1/providers', stranger, { organizationName: 'E2E Dup', countryCode: 'PE', taxId: 'A-1' }).expect(409) // mismo tax id y país que Alfa
      await mkProvider({ organizationName: 'E2E Mismo tax otro país', countryCode: 'AR', taxId: 'A-1' }) // otro país: sí
    })

    it('un autorregistro (también de un administrador) queda PENDIENTE y quien lo hace es el responsable', async () => {
      const mine = await send('post', '/api/v1/providers', admin, { organizationName: 'E2E Autorregistro Admin', taxId: 'AR-1', countryCode: 'PE', selfRegistration: true }).expect(201)
      expect(mine.body.status).toBe('PENDING')
      // no es pública hasta que se apruebe, pero el administrador la ve entre sus empresas
      expect(names(await get('/api/v1/providers?search=Autorregistro').expect(200))).not.toContain('E2E Autorregistro Admin')
      const own = (await get('/api/v1/providers/mine', admin).expect(200)).body as Array<{ organizationName: string; myRole: string }>
      expect(own.find((o) => o.organizationName === 'E2E Autorregistro Admin')?.myRole).toBe('OWNER')
      // y la aprueba desde el panel de administración
      await send('patch', `/api/v1/providers/${mine.body.id}`, admin, { status: 'ACTIVE' }).expect(200)
      expect(names(await get('/api/v1/providers?search=Autorregistro').expect(200))).toContain('E2E Autorregistro Admin')
    })

    it('un autorregistro no puede asignar a otra persona como responsable', async () => {
      await send('post', '/api/v1/providers', admin, { organizationName: 'E2E Autorregistro Otro', countryCode: 'PE', selfRegistration: true, ownerEmail: 'owner@e2e.fur.local' }).expect(400)
    })

    it('solo el administrador asigna el responsable y crea organizaciones ya activas', async () => {
      await send('post', '/api/v1/providers', stranger, { organizationName: 'E2E Y', countryCode: 'PE', ownerEmail: 'owner@e2e.fur.local' }).expect(403)
      await send('post', '/api/v1/providers', admin, { organizationName: 'E2E Y', countryCode: 'PE', ownerEmail: 'nadie@e2e.fur.local' }).expect(400)
      const p = await mkProvider({ organizationName: 'E2E Admin crea' })
      expect(p.status).toBe('ACTIVE')
    })
  })

  describe('proveedores: edición y confianza', () => {
    it('los miembros editan su perfil, etapas y familias', async () => {
      const res = await send('patch', `/api/v1/providers/${provA}`, member, { description: 'Repuestos para molienda', city: 'Lima', stageCodes: ['D06'], familyCodes: [familyCode], certifications: ['ISO 9001', 'ISO 14001'] }).expect(200)
      expect(res.body).toMatchObject({ description: 'Repuestos para molienda', city: 'Lima', certifications: ['ISO 9001', 'ISO 14001'] })
      expect(res.body.stages.map((s: { code: string }) => s.code)).toEqual(['D06'])
      await send('patch', `/api/v1/providers/${provA}`, member, { stageCodes: ['D06', 'D07'] }).expect(200)
    })

    it('un usuario ajeno o anónimo no edita', async () => {
      await send('patch', `/api/v1/providers/${provA}`, stranger, { description: 'x' }).expect(403)
      await send('patch', `/api/v1/providers/${provA}`, owner2, { description: 'x' }).expect(403)
      await send('patch', `/api/v1/providers/${provA}`, null, { description: 'x' }).expect(401)
    })

    it('identidad y confianza (nombre, tax id, país, estado, verificado, rating) solo las cambia el administrador', async () => {
      for (const body of [{ organizationName: 'E2E Otro' }, { taxId: 'Z' }, { countryCode: 'CL' }, { status: 'SUSPENDED' }, { verified: true }, { rating: 5 }]) {
        const res = await send('patch', `/api/v1/providers/${provA}`, owner, body).expect(403)
        expect(res.body.message).toMatch(/administrador/)
      }
      // y mezclar un campo permitido con uno prohibido tampoco pasa a medias
      await send('patch', `/api/v1/providers/${provA}`, owner, { description: 'cambio', verified: true }).expect(403)
      expect((await get(`/api/v1/providers/${provA}`).expect(200)).body.description).not.toBe('cambio')
    })

    it('el administrador aprueba, verifica y califica; el rating es 0–5 con 2 decimales', async () => {
      const p = await mkProvider({ organizationName: 'E2E A aprobar', taxId: 'AP-1' }, stranger)
      await get(`/api/v1/providers/${p.id}`).expect(404)
      const ok = await send('patch', `/api/v1/providers/${p.id}`, admin, { status: 'ACTIVE', verified: true, rating: 4.5 }).expect(200)
      expect(ok.body).toMatchObject({ status: 'ACTIVE', verified: true, rating: 4.5 })
      await get(`/api/v1/providers/${p.id}`).expect(200)
      for (const rating of [5.5, -1, 3.456]) await send('patch', `/api/v1/providers/${p.id}`, admin, { rating }).expect(400)
      await send('patch', `/api/v1/providers/${p.id}`, admin, { rating: null }).expect(200)
      await send('patch', `/api/v1/providers/${p.id}`, admin, {}).expect(400)
    })

    it('suspender oculta al proveedor del público; sus miembros aún lo ven pero no lo editan', async () => {
      const p = await mkProvider({ organizationName: 'E2E Suspendible', ownerEmail: 'owner2@e2e.fur.local' })
      await send('patch', `/api/v1/providers/${p.id}`, admin, { status: 'SUSPENDED' }).expect(200)
      await get(`/api/v1/providers/${p.id}`).expect(404)
      await get(`/api/v1/providers/${p.id}`, owner2).expect(200)
      await send('patch', `/api/v1/providers/${p.id}`, owner2, { description: 'x' }).expect(409)
      await send('patch', `/api/v1/providers/${p.id}`, admin, { status: 'ACTIVE' }).expect(200)
    })

    it('los cambios quedan auditados', async () => {
      const ev = await t.db.select().from(auditEvents).where(and(eq(auditEvents.module, 'provider'), eq(auditEvents.entityId, provA)))
      expect(ev.map((e) => e.action)).toEqual(expect.arrayContaining(['created', 'updated']))
    })
  })

  describe('proveedores: filtros del listado', () => {
    beforeAll(async () => {
      await send('patch', `/api/v1/providers/${provA}`, admin, { verified: true, rating: 4.8 }).expect(200)
      await send('patch', `/api/v1/providers/${provB}`, admin, { rating: 3.2 }).expect(200)
    })
    const q = async (qs: string) => names(await get(`/api/v1/providers?${qs}`).expect(200)).filter((n: string) => /Alfa|Beta/.test(n))

    it('por etapa, familia, país, certificación (sin distinguir mayúsculas), verificado y rating mínimo', async () => {
      expect(await q('stage=D07')).toEqual(['E2E Alfa Repuestos'])
      expect(await q('stage=D11')).toEqual(['E2E Beta Industrial'])
      expect(await q(`family=${familyCode}`)).toEqual(['E2E Alfa Repuestos'])
      expect(await q('country=CL')).toEqual(['E2E Beta Industrial'])
      expect(await q('certification=iso%209001')).toEqual(['E2E Alfa Repuestos'])
      expect(await q('verified=1')).toEqual(['E2E Alfa Repuestos'])
      expect(await q('ratingMin=4')).toEqual(['E2E Alfa Repuestos'])
      expect(await q('ratingMin=3')).toEqual(['E2E Alfa Repuestos', 'E2E Beta Industrial'])
    })

    it('búsqueda, orden por rating y paginación; parámetros inválidos → 400', async () => {
      expect(await q('search=beta')).toEqual(['E2E Beta Industrial'])
      expect((await get('/api/v1/providers?search=' + encodeURIComponent('%')).expect(200)).body.items).toEqual([])
      expect(await q('sort=rating')).toEqual(['E2E Alfa Repuestos', 'E2E Beta Industrial'])
      const p1 = (await get('/api/v1/providers?pageSize=1&page=1').expect(200)).body
      expect(p1.items).toHaveLength(1)
      expect(p1.total).toBeGreaterThan(1)
      for (const bad of ['ratingMin=9', 'country=PERU', 'sort=chaos', 'pageSize=1000', 'verified=yes']) await get(`/api/v1/providers?${bad}`).expect(400)
    })

    it('"mine" lista mis organizaciones, también las pendientes', async () => {
      expect((await get('/api/v1/providers/mine', owner).expect(200)).body.map((p: { id: string }) => p.id)).toEqual([provA])
      expect((await get('/api/v1/providers/mine', stranger).expect(200)).body.some((p: { status: string }) => p.status === 'PENDING')).toBe(true)
      await get('/api/v1/providers/mine').expect(401)
    })
  })

  describe('proveedores: miembros', () => {
    it('solo el responsable (o el administrador) gestiona miembros; ver la lista exige gestionar', async () => {
      await get(`/api/v1/providers/${provA}/members`, stranger).expect(403)
      await get(`/api/v1/providers/${provA}/members`).expect(401)
      const list = (await get(`/api/v1/providers/${provA}/members`, member).expect(200)).body
      expect(list.map((m: { role: string }) => m.role).sort()).toEqual(['MEMBER', 'OWNER'])
      await send('post', `/api/v1/providers/${provA}/members`, member, { email: 'stranger@e2e.fur.local' }).expect(403)
      await send('post', `/api/v1/providers/${provA}/members`, stranger, { email: 'stranger@e2e.fur.local' }).expect(403)
    })

    it('agregar: correo inexistente 404, repetido 409, rol inválido 400', async () => {
      await send('post', `/api/v1/providers/${provA}/members`, owner, { email: 'nadie@e2e.fur.local' }).expect(404)
      await send('post', `/api/v1/providers/${provA}/members`, owner, { email: 'member@e2e.fur.local' }).expect(409)
      await send('post', `/api/v1/providers/${provA}/members`, owner, { email: 'stranger@e2e.fur.local', role: 'GOD' }).expect(400)
    })

    it('quitar: no se deja la organización sin responsable; el miembro quitado pierde el acceso', async () => {
      await send('delete', `/api/v1/providers/${provA}/members/${ids.owner}`, owner).expect(409)
      await send('delete', `/api/v1/providers/${provA}/members/${ids.member}`, member).expect(403)
      await send('post', `/api/v1/providers/${provA}/members`, owner, { email: 'stranger@e2e.fur.local' }).expect(201)
      await send('patch', `/api/v1/providers/${provA}`, stranger, { city: 'Cusco' }).expect(200)
      await send('delete', `/api/v1/providers/${provA}/members/${ids.stranger}`, owner).expect(204)
      await send('patch', `/api/v1/providers/${provA}`, stranger, { city: 'Cusco' }).expect(403)
      await send('delete', `/api/v1/providers/${provA}/members/${ids.stranger}`, owner).expect(404)
    })

    it('quitar al responsable en paralelo: siempre queda al menos uno', async () => {
      const p = await mkProvider({ organizationName: 'E2E Carrera', ownerEmail: 'owner@e2e.fur.local' })
      await send('post', `/api/v1/providers/${p.id}/members`, owner, { email: 'owner2@e2e.fur.local', role: 'OWNER' }).expect(201)
      const results = await Promise.all([
        send('delete', `/api/v1/providers/${p.id}/members/${ids.owner}`, owner2),
        send('delete', `/api/v1/providers/${p.id}/members/${ids.owner2}`, owner),
      ])
      const left = (await get(`/api/v1/providers/${p.id}/members`, admin).expect(200)).body.filter((m: { role: string }) => m.role === 'OWNER')
      expect(results.filter((r) => r.status === 204)).toHaveLength(1)
      expect(results.filter((r) => r.status === 403 || r.status === 409)).toHaveLength(1)
      expect(left).toHaveLength(1)
    })
  })

  describe('marketplace: productos del proveedor', () => {
    it('crear exige gestionar la organización; un proveedor pendiente no publica', async () => {
      await send('post', `/api/v1/providers/${provA}/listings`, null, { title: 'x', assetFamilyCode: familyCode }).expect(401)
      await send('post', `/api/v1/providers/${provA}/listings`, stranger, { title: 'x', assetFamilyCode: familyCode }).expect(403)
      await send('post', `/api/v1/providers/${provA}/listings`, owner2, { title: 'x', assetFamilyCode: familyCode }).expect(403)
      const pending = await mkProvider({ organizationName: 'E2E Pendiente listing', taxId: 'PL-1' }, stranger)
      await send('post', `/api/v1/providers/${pending.id}/listings`, stranger, { title: 'x', assetFamilyCode: familyCode }).expect(409)
    })

    it('la familia se deduce del modelo; debe coincidir si se indica; y se exige alguna de las dos', async () => {
      const fromModel = await mkListing(provA, { assetFamilyCode: undefined, assetModelId: modelId, title: 'Molino de bolas usado' })
      expect(fromModel.family.code).toBe(familyCode)
      expect(fromModel.model).toMatchObject({ id: modelId, manufacturer: { id: manufacturerId } })
      expect(fromModel.type.code).toBe(typeCode)
      await send('post', `/api/v1/providers/${provA}/listings`, owner, { title: 'x', assetModelId: modelId, assetFamilyCode: otherFamilyCode }).expect(400)
      await send('post', `/api/v1/providers/${provA}/listings`, owner, { title: 'x' }).expect(400)
      await send('post', `/api/v1/providers/${provA}/listings`, owner, { title: 'x', assetFamilyCode: 'NOPE' }).expect(400)
      await send('post', `/api/v1/providers/${provA}/listings`, owner, { title: 'x', assetModelId: '00000000-0000-4000-8000-000000000000' }).expect(400)
    })

    it('valida precio (≥0, 2 decimales), moneda, imagen http(s) y etapas', async () => {
      for (const body of [{ price: -1 }, { price: 10.123 }, { currency: 'US' }, { imageUrl: 'javascript:alert(1)' }, { stageCodes: ['ZZZ'] }, { title: '' }, { availability: 'MAYBE' }]) {
        await send('post', `/api/v1/providers/${provA}/listings`, owner, { title: 'x', assetFamilyCode: familyCode, ...body }).expect(400)
      }
    })

    it('se crea en borrador; para publicar exige al menos una etapa; un borrador no es público', async () => {
      const l = await mkListing(provA, { title: 'Borrador E2E', price: 100.5, currency: 'usd' })
      expect(l).toMatchObject({ status: 'DRAFT', price: 100.5, currency: 'USD', isFeatured: false })
      await get(`/api/v1/marketplace/listings/${l.id}`).expect(404)
      await get(`/api/v1/marketplace/listings/${l.id}`, stranger).expect(404)
      await get(`/api/v1/marketplace/listings/${l.id}`, member).expect(200)
      await get(`/api/v1/marketplace/listings/${l.id}`, admin).expect(200)
      expect(names(await get('/api/v1/marketplace/listings?search=Borrador%20E2E').expect(200))).toEqual([])

      const res = await send('patch', `/api/v1/providers/${provA}/listings/${l.id}`, owner, { status: 'ACTIVE' }).expect(400)
      expect(JSON.stringify(res.body)).toMatch(/etapa/)
      const published = await send('patch', `/api/v1/providers/${provA}/listings/${l.id}`, owner, { status: 'ACTIVE', stageCodes: ['D06'] }).expect(200)
      expect(published.body.status).toBe('ACTIVE')
      expect(names(await get('/api/v1/marketplace/listings?search=Borrador%20E2E').expect(200))).toEqual(['Borrador E2E'])
      await send('patch', `/api/v1/providers/${provA}/listings/${l.id}`, owner, { status: 'ARCHIVED' }).expect(200)
      await get(`/api/v1/marketplace/listings/${l.id}`).expect(404)
    })

    it('destacar es solo del administrador', async () => {
      const l = await mkListing(provA, { title: 'Destacable E2E', stageCodes: ['D06'] })
      await send('patch', `/api/v1/providers/${provA}/listings/${l.id}`, owner, { isFeatured: true }).expect(403)
      await send('patch', `/api/v1/providers/${provA}/listings/${l.id}`, admin, { isFeatured: true, status: 'ACTIVE' }).expect(200)
      const list = (await get('/api/v1/marketplace/listings?featured=1').expect(200)).body
      expect(names({ body: list } as request.Response)).toContain('Destacable E2E')
      // los destacados salen primero en el orden por defecto
      expect((await get('/api/v1/marketplace/listings?pageSize=1').expect(200)).body.items[0].isFeatured).toBe(true)
    })

    it('otro proveedor no toca estos productos, ni se alcanzan por un proveedor equivocado', async () => {
      const l = await mkListing(provA, { title: 'Ajeno E2E' })
      await send('patch', `/api/v1/providers/${provA}/listings/${l.id}`, owner2, { title: 'hack' }).expect(403)
      await send('patch', `/api/v1/providers/${provB}/listings/${l.id}`, owner2, { title: 'hack' }).expect(404)
      await get(`/api/v1/providers/${provA}/listings`, owner2).expect(403)
      await get(`/api/v1/providers/${provA}/listings`).expect(401)
      const mine = (await get(`/api/v1/providers/${provA}/listings?status=DRAFT&search=Ajeno`, owner).expect(200)).body
      expect(mine.items.map((i: { title: string }) => i.title)).toEqual(['Ajeno E2E'])
    })

    it('panel del proveedor: cuenta productos por estado', async () => {
      const d = (await get(`/api/v1/providers/${provA}/dashboard`, owner).expect(200)).body
      expect(d.listingsActive).toBeGreaterThanOrEqual(1)
      expect(d.listingsDraft).toBeGreaterThanOrEqual(1)
      expect(d.featured).toBeGreaterThanOrEqual(1)
      await get(`/api/v1/providers/${provA}/dashboard`, stranger).expect(403)
    })
  })

  describe('marketplace: filtros públicos', () => {
    let cheap: string
    beforeAll(async () => {
      cheap = (await mkListing(provA, { title: 'Filtro Barato FLT', price: 10, currency: 'USD', availability: 'IN_STOCK', stockText: '40 unidades', stageCodes: ['D06'], assetModelId: modelId, assetFamilyCode: undefined })).id
      const dear = (await mkListing(provA, { title: 'Filtro Caro FLT', price: 900.99, currency: 'USD', availability: 'ON_REQUEST', stageCodes: ['D07'] })).id
      const quote = (await mkListing(provB, { title: 'Filtro A Cotizar FLT', stageCodes: ['D11'] }, owner2)).id
      for (const [p, l, s] of [[provA, cheap, owner], [provA, dear, owner], [provB, quote, owner2]] as const) {
        await send('patch', `/api/v1/providers/${p}/listings/${l}`, s, { status: 'ACTIVE' }).expect(200)
      }
    })
    const q = async (qs: string) => names(await get(`/api/v1/marketplace/listings?search=FLT&${qs}`).expect(200))

    it('por etapa, familia, tipo, fabricante, proveedor y disponibilidad', async () => {
      expect(await q('stage=D07')).toEqual(['Filtro Caro FLT'])
      expect(await q('stage=D11')).toEqual(['Filtro A Cotizar FLT'])
      expect(await q(`type=${typeCode}`)).toEqual(['Filtro Barato FLT'])
      expect(await q(`manufacturerId=${manufacturerId}`)).toEqual(['Filtro Barato FLT'])
      expect(await q(`providerId=${provB}`)).toEqual(['Filtro A Cotizar FLT'])
      expect(await q('availability=IN_STOCK')).toEqual(['Filtro Barato FLT'])
      expect((await q(`family=${familyCode}`)).sort()).toEqual(['Filtro A Cotizar FLT', 'Filtro Barato FLT', 'Filtro Caro FLT'])
    })

    it('por precio: el filtro excluye las ofertas "a cotizar"; el orden por precio las deja al final', async () => {
      expect(await q('priceMin=100')).toEqual(['Filtro Caro FLT'])
      expect(await q('priceMax=100')).toEqual(['Filtro Barato FLT'])
      expect(await q('priceMin=10&priceMax=900.99&currency=usd')).toEqual(['Filtro Caro FLT', 'Filtro Barato FLT'])
      expect(await q('sort=price_asc')).toEqual(['Filtro Barato FLT', 'Filtro Caro FLT', 'Filtro A Cotizar FLT'])
      expect(await q('sort=price_desc')).toEqual(['Filtro Caro FLT', 'Filtro Barato FLT', 'Filtro A Cotizar FLT'])
      expect(await q('sort=title')).toEqual(['Filtro A Cotizar FLT', 'Filtro Barato FLT', 'Filtro Caro FLT'])
    })

    it('el producto muestra proveedor, etapas y precio numérico; valida parámetros', async () => {
      const item = (await get(`/api/v1/marketplace/listings/${cheap}`).expect(200)).body
      expect(item).toMatchObject({ title: 'Filtro Barato FLT', price: 10, currency: 'USD', stockText: '40 unidades', provider: { id: provA, name: 'E2E Alfa Repuestos', verified: true, rating: 4.8, countryCode: 'PE' } })
      expect(item.stages.map((s: { code: string }) => s.code)).toEqual(['D06'])
      for (const bad of ['priceMin=-1', 'availability=NOPE', 'sort=nope', 'providerId=x', 'currency=EURO', 'featured=2']) await get(`/api/v1/marketplace/listings?${bad}`).expect(400)
      await get('/api/v1/marketplace/listings/no-uuid').expect(400)
      await get('/api/v1/marketplace/listings/00000000-0000-4000-8000-000000000000').expect(404)
    })

    it('suspender al proveedor oculta sus productos (lista y ficha) sin tocar los datos', async () => {
      await send('patch', `/api/v1/providers/${provB}`, admin, { status: 'SUSPENDED' }).expect(200)
      expect(await q('providerId=' + provB)).toEqual([])
      const quoted = (await get(`/api/v1/providers/${provB}/listings?search=Cotizar`, owner2).expect(200)).body.items[0]
      await get(`/api/v1/marketplace/listings/${quoted.id}`).expect(404)
      await get(`/api/v1/marketplace/listings/${quoted.id}`, owner2).expect(200)
      await send('patch', `/api/v1/providers/${provB}`, admin, { status: 'ACTIVE' }).expect(200)
      expect(await q('providerId=' + provB)).toEqual(['Filtro A Cotizar FLT'])
    })

    it('la ficha pública del proveedor cuenta solo sus productos activos', async () => {
      const p = (await get(`/api/v1/providers/${provB}`).expect(200)).body
      expect(p.activeListings).toBe(1)
    })
  })

  describe('servicios profesionales', () => {
    let svcMech: string
    const mkService = async (over: object = {}, s: Session = cOwner) =>
      (await send('post', `/api/v1/contractors/${contr}/services`, s, { name: 'Servicio', serviceType: 'mecanica', ...over }).expect(201)).body

    beforeAll(async () => {
      contr = (
        await send('post', '/api/v1/contractors', admin, {
          organizationName: 'E2E Servicios Andinos',
          countryCode: 'PE',
          city: 'Arequipa',
          certifications: ['OSHA'],
          availability: 'AVAILABLE',
          ownerEmail: 'cowner@e2e.fur.local',
        }).expect(201)
      ).body.id
      svcMech = (await mkService({ name: 'Alineación láser SVC', serviceType: 'mecanica', stageCodes: ['D06', 'D07'] })).services[0].id
      await mkService({ name: 'Calibración de instrumentos SVC', serviceType: 'Instrumentación', stageCodes: ['D11'] })
    })
    const q = async (qs: string) => names(await get(`/api/v1/professional-services?search=SVC&${qs}`).expect(200))

    it('lista pública con contratista, etapas y especialidad normalizada', async () => {
      const res = (await get('/api/v1/professional-services?search=Alineaci').expect(200)).body
      expect(res.items[0]).toMatchObject({ name: 'Alineación láser SVC', serviceType: 'MECANICA', contractor: { name: 'E2E Servicios Andinos', city: 'Arequipa', availability: 'AVAILABLE' } })
      expect(res.items[0].stages.map((s: { code: string }) => s.code)).toEqual(['D06', 'D07'])
    })

    it('filtros: etapa, especialidad, ubicación, certificación, disponibilidad, país', async () => {
      expect(await q('stage=D11')).toEqual(['Calibración de instrumentos SVC'])
      expect(await q('specialty=mecanica')).toEqual(['Alineación láser SVC'])
      expect(await q('location=arequi')).toHaveLength(2)
      expect(await q('location=cusco')).toEqual([])
      expect(await q('certification=osha')).toHaveLength(2)
      expect(await q('certification=ISO')).toEqual([])
      expect(await q('country=CL')).toEqual([])
      expect(await q('availability=UNAVAILABLE')).toEqual([])
      for (const bad of ['availability=X', 'stage=d 11!', 'ratingMin=7']) await get(`/api/v1/professional-services?${bad}`).expect(400)
    })

    it('especialidades disponibles para el filtro', async () => {
      const list = (await get('/api/v1/professional-services/specialties').expect(200)).body as string[]
      expect(list).toEqual(expect.arrayContaining(['INSTRUMENTACIÓN', 'MECANICA'].map((s) => s)))
    })

    it('disponibilidad: la edita el contratista; si no está disponible, el filtro lo refleja', async () => {
      await send('patch', `/api/v1/contractors/${contr}`, cOwner, { availability: 'UNAVAILABLE' }).expect(200)
      expect(await q('availability=UNAVAILABLE')).toHaveLength(2)
      expect(await q('availability=AVAILABLE')).toEqual([])
      await send('patch', `/api/v1/contractors/${contr}`, cOwner, { availability: 'AVAILABLE' }).expect(200)
    })

    it('registro como solicitud, aprobación y campos de confianza solo del administrador', async () => {
      const c = (await send('post', '/api/v1/contractors', stranger, { organizationName: 'E2E Contratista Nuevo', countryCode: 'PE', taxId: 'C-9' }).expect(201)).body
      expect(c).toMatchObject({ status: 'PENDING', myRole: 'OWNER' })
      await get(`/api/v1/contractors/${c.id}`).expect(404)
      await send('patch', `/api/v1/contractors/${c.id}`, stranger, { verified: true }).expect(403)
      await send('patch', `/api/v1/contractors/${c.id}`, stranger, { status: 'ACTIVE' }).expect(403)
      await send('post', `/api/v1/contractors/${c.id}/services`, stranger, { name: 'x', serviceType: 'MECANICA' }).expect(409) // aún no activo
      await send('patch', `/api/v1/contractors/${c.id}`, admin, { status: 'ACTIVE', verified: true, rating: 4 }).expect(200)
      await send('post', '/api/v1/contractors', stranger, { organizationName: 'E2E Dup C', countryCode: 'PE', taxId: 'C-9' }).expect(409)
      await send('post', `/api/v1/contractors/${c.id}/services`, stranger, { name: 'Soldadura SVC2', serviceType: 'SOLDADURA' }).expect(201)
    })

    it('un servicio inactivo deja de ser público pero se conserva; ajenos no editan', async () => {
      await send('patch', `/api/v1/contractors/${contr}/services/${svcMech}`, stranger, { name: 'x' }).expect(403)
      await send('patch', `/api/v1/contractors/${contr}/services/${svcMech}`, cOwner, { status: 'INACTIVE' }).expect(200)
      expect(await q('specialty=mecanica')).toEqual([])
      const detail = (await get(`/api/v1/contractors/${contr}`).expect(200)).body
      expect(detail.services.map((s: { name: string }) => s.name)).not.toContain('Alineación láser SVC')
      const managed = (await get(`/api/v1/contractors/${contr}`, cOwner).expect(200)).body
      expect(managed.services.map((s: { name: string }) => s.name)).toContain('Alineación láser SVC')
      await send('patch', `/api/v1/contractors/${contr}/services/${svcMech}`, cOwner, { status: 'ACTIVE' }).expect(200)
      await send('patch', `/api/v1/contractors/${contr}/services/00000000-0000-4000-8000-000000000000`, cOwner, { name: 'x' }).expect(404)
    })

    it('la ficha del contratista resume etapas y especialidades atendidas', async () => {
      const d = (await get(`/api/v1/contractors/${contr}`).expect(200)).body
      expect(d.stages.map((s: { code: string }) => s.code)).toEqual(['D06', 'D07', 'D11'])
      expect(d.specialties).toEqual(expect.arrayContaining(['MECANICA']))
      expect(d.contactEmail).toBeNull()
    })

    it('miembros del contratista: mismas reglas que proveedores', async () => {
      await send('post', `/api/v1/contractors/${contr}/members`, stranger, { email: 'stranger@e2e.fur.local' }).expect(403)
      await send('post', `/api/v1/contractors/${contr}/members`, cOwner, { email: 'stranger@e2e.fur.local' }).expect(201)
      await send('delete', `/api/v1/contractors/${contr}/members/${ids.cowner}`, cOwner).expect(409)
      expect((await get('/api/v1/contractors/mine', stranger).expect(200)).body.some((c: { id: string }) => c.id === contr)).toBe(true)
    })
  })

  describe('fotos: producto y logo del proveedor', () => {
    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('foto-png-de-prueba')])
    const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('foto-jpg-de-prueba')])
    const attach = (url: string, s: Session | null, file: Buffer | null, filename = 'foto.png') => {
      const r = http().post(url)
      const authed = s ? r.set('Authorization', bearer(s)) : r
      return file ? authed.attach('file', file, { filename }) : authed
    }
    const raw = (url: string) =>
      http()
        .get(url)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = []
          r.on('data', (c: Buffer) => chunks.push(c))
          r.on('end', () => cb(null, Buffer.concat(chunks)))
        })
    let listingId: string
    const photo = () => `/api/v1/providers/${provA}/listings/${listingId}/image`
    const publicPhoto = () => `/api/v1/marketplace/listings/${listingId}/image`

    beforeAll(async () => {
      listingId = (await mkListing(provA, { title: 'E2E Producto con foto' })).id
    })

    it('un producto sin foto no tiene imageUrl y su foto pública responde 404', async () => {
      const mine = await get(`/api/v1/providers/${provA}/listings?search=E2E%20Producto%20con%20foto`, owner).expect(200)
      expect(mine.body.items[0].imageUrl).toBeNull()
      await get(publicPhoto()).expect(404)
    })

    it('exige ser miembro de la organización: anónimo 401; ajenos 403', async () => {
      await attach(photo(), null, PNG).expect(401)
      await attach(photo(), stranger, PNG).expect(403)
      await attach(photo(), owner2, PNG).expect(403) // responsable de OTRO proveedor
      await send('delete', photo(), stranger).expect(403)
    })

    it('rechaza lo que no es una imagen válida: sin archivo, SVG, PDF, vacío, contenido falso, >5 MB y producto ajeno', async () => {
      await attach(photo(), owner, null).expect(400)
      await attach(photo(), owner, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'x.svg').expect(415)
      await attach(photo(), owner, Buffer.from('%PDF-1.4 contenido'), 'x.pdf').expect(415)
      await attach(photo(), owner, Buffer.alloc(0), 'vacia.png').expect(400)
      await attach(photo(), owner, JPG, 'mentira.png').expect(415) // extensión png, contenido jpeg
      await attach(photo(), owner, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 1)])).expect(413)
      await attach(`/api/v1/providers/${provB}/listings/${listingId}/image`, owner2, PNG).expect(404) // producto de otro proveedor
      await get(publicPhoto()).expect(404)
    })

    it('un miembro sube la foto: queda en el producto, se sirve pública y con cabeceras seguras', async () => {
      const res = await attach(photo(), member, PNG).expect(201)
      expect(res.body.id).toBe(listingId)
      expect(res.body.imageUrl).toMatch(new RegExp(`^/marketplace/listings/${listingId}/image\\?v=\\d+$`))

      const img = await raw(publicPhoto()).expect(200) // sin sesión
      expect(img.headers['content-type']).toBe('image/png')
      expect(img.headers['x-content-type-options']).toBe('nosniff')
      expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin')
      expect(img.headers['content-security-policy']).toContain('sandbox')
      expect((img.body as Buffer).equals(PNG)).toBe(true)
    })

    it('reemplazar la foto cambia el tipo servido y la versión de la URL', async () => {
      const before = (await get(`/api/v1/providers/${provA}/listings?search=E2E%20Producto%20con%20foto`, owner)).body.items[0].imageUrl
      await new Promise((r) => setTimeout(r, 15))
      await attach(photo(), owner, JPG, 'otra.jpeg').expect(201)
      const after = (await get(`/api/v1/providers/${provA}/listings?search=E2E%20Producto%20con%20foto`, owner)).body.items[0].imageUrl
      expect(after).not.toBe(before)
      expect((await get(publicPhoto()).expect(200)).headers['content-type']).toBe('image/jpeg')
    })

    it('poner una URL externa descarta la foto subida', async () => {
      const res = await send('patch', `/api/v1/providers/${provA}/listings/${listingId}`, owner, { imageUrl: 'https://cdn.example.com/producto.png' }).expect(200)
      expect(res.body.imageUrl).toBe('https://cdn.example.com/producto.png')
      await get(publicPhoto()).expect(404)
    })

    it('quitar la foto la elimina (204) y quitarla de nuevo es inocuo; todo queda auditado', async () => {
      await attach(photo(), owner, PNG).expect(201)
      await send('delete', photo(), owner).expect(204)
      expect((await get(`/api/v1/providers/${provA}/listings?search=E2E%20Producto%20con%20foto`, owner)).body.items[0].imageUrl).toBeNull()
      await get(publicPhoto()).expect(404)
      await send('delete', photo(), owner).expect(204)

      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.module, 'marketplace'), eq(auditEvents.entityId, listingId)))
      const actions = events.map((e) => e.action)
      expect(actions.filter((a) => a === 'image.updated').length).toBeGreaterThanOrEqual(3)
      expect(actions).toContain('image.removed')
    })

    describe('logo', () => {
      const logo = (id = () => provA) => `/api/v1/providers/${id()}/logo`

      it('un miembro sube el logo: queda en el perfil y se sirve público', async () => {
        await attach(logo(), null, PNG).expect(401)
        await attach(logo(), stranger, PNG).expect(403)
        await attach(logo(), owner, Buffer.from('<svg/>'), 'logo.svg').expect(415)

        const res = await attach(logo(), member, PNG, 'logo.png').expect(201)
        expect(res.body.logoUrl).toMatch(new RegExp(`^/providers/${provA}/logo\\?v=\\d+$`))
        const img = await raw(logo()).expect(200)
        expect(img.headers['content-type']).toBe('image/png')
        expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin')
        expect((img.body as Buffer).equals(PNG)).toBe(true)
      })

      it('poner una URL externa descarta el logo subido; quitarlo deja el perfil sin logo', async () => {
        await send('patch', `/api/v1/providers/${provA}`, owner, { logoUrl: 'https://cdn.example.com/logo.png' }).expect(200)
        await get(logo()).expect(404)

        await attach(logo(), owner, JPG, 'logo.jpg').expect(201)
        await send('delete', logo(), owner).expect(204)
        expect((await get(`/api/v1/providers/${provA}`, owner).expect(200)).body.logoUrl).toBeNull()
        await get(logo()).expect(404)
        await send('delete', logo(), owner).expect(204)
      })

      it('una empresa pendiente puede subir su logo mientras espera, pero no es público hasta que se aprueba', async () => {
        const pending = await mkProvider({ organizationName: 'E2E Pendiente Logo', taxId: 'P-LOGO' }, stranger)
        expect(pending.status).toBe('PENDING')
        await attach(logo(() => pending.id), stranger, PNG).expect(201)
        await get(logo(() => pending.id)).expect(404) // aún no activa
        await send('patch', `/api/v1/providers/${pending.id}`, admin, { status: 'ACTIVE' }).expect(200)
        await get(logo(() => pending.id)).expect(200)
      })

      it('una empresa suspendida no puede cambiar su logo (salvo el administrador)', async () => {
        const susp = await mkProvider({ organizationName: 'E2E Suspendida Logo', taxId: 'S-LOGO', ownerEmail: 'owner2@e2e.fur.local' })
        await send('patch', `/api/v1/providers/${susp.id}`, admin, { status: 'SUSPENDED' }).expect(200)
        await attach(logo(() => susp.id), owner2, PNG).expect(409)
        await attach(logo(() => susp.id), admin, PNG).expect(201)
      })
    })
  })

  describe('contratistas: autorregistro y logo', () => {
    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('logo-png-de-prueba')])
    const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('logo-jpg-de-prueba')])
    const attach = (url: string, s: Session | null, file: Buffer | null, filename = 'logo.png') => {
      const r = http().post(url)
      const authed = s ? r.set('Authorization', bearer(s)) : r
      return file ? authed.attach('file', file, { filename }) : authed
    }
    const raw = (url: string) =>
      http()
        .get(url)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = []
          r.on('data', (c: Buffer) => chunks.push(c))
          r.on('end', () => cb(null, Buffer.concat(chunks)))
        })
    const logo = (id: () => string = () => contr) => `/api/v1/contractors/${id()}/logo`

    it('un autorregistro (también de un administrador) queda PENDIENTE y quien lo hace es el responsable', async () => {
      const mine = await send('post', '/api/v1/contractors', admin, { organizationName: 'E2E Contratista Autorregistro', taxId: 'CAR-1', countryCode: 'PE', selfRegistration: true }).expect(201)
      expect(mine.body.status).toBe('PENDING')
      expect(names(await get('/api/v1/contractors?search=Autorregistro').expect(200))).not.toContain('E2E Contratista Autorregistro')
      const own = (await get('/api/v1/contractors/mine', admin).expect(200)).body as Array<{ organizationName: string; myRole: string }>
      expect(own.find((o) => o.organizationName === 'E2E Contratista Autorregistro')?.myRole).toBe('OWNER')
      await send('patch', `/api/v1/contractors/${mine.body.id}`, admin, { status: 'ACTIVE' }).expect(200)
      expect(names(await get('/api/v1/contractors?search=Autorregistro').expect(200))).toContain('E2E Contratista Autorregistro')
    })

    it('un autorregistro no puede asignar a otra persona como responsable', async () => {
      await send('post', '/api/v1/contractors', admin, { organizationName: 'E2E Contratista Otro', countryCode: 'PE', selfRegistration: true, ownerEmail: 'cowner@e2e.fur.local' }).expect(400)
    })

    it('el responsable sube el logo: queda en el perfil y se sirve público con cabeceras seguras', async () => {
      await attach(logo(), null, PNG).expect(401)
      await attach(logo(), owner2, PNG).expect(403) // responsable de OTRA organización, no miembro de este contratista
      await attach(logo(), cOwner, Buffer.from('<svg/>'), 'logo.svg').expect(415)
      await attach(logo(), cOwner, JPG, 'mentira.png').expect(415)
      await attach(logo(), cOwner, null).expect(400)

      const res = await attach(logo(), cOwner, PNG).expect(201)
      expect(res.body.logoUrl).toMatch(new RegExp(`^/contractors/${contr}/logo\\?v=\\d+$`))
      const img = await raw(logo()).expect(200) // sin sesión
      expect(img.headers['content-type']).toBe('image/png')
      expect(img.headers['x-content-type-options']).toBe('nosniff')
      expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin')
      expect((img.body as Buffer).equals(PNG)).toBe(true)
    })

    it('reemplazar cambia el tipo; una URL externa descarta el logo subido; quitarlo deja el perfil sin logo', async () => {
      await attach(logo(), cOwner, JPG, 'otro.jpg').expect(201)
      expect((await get(logo()).expect(200)).headers['content-type']).toBe('image/jpeg')

      await send('patch', `/api/v1/contractors/${contr}`, cOwner, { logoUrl: 'https://cdn.example.com/logo.png' }).expect(200)
      await get(logo()).expect(404)

      await attach(logo(), cOwner, PNG).expect(201)
      await send('delete', logo(), cOwner).expect(204)
      expect((await get(`/api/v1/contractors/${contr}`, cOwner).expect(200)).body.logoUrl).toBeNull()
      await get(logo()).expect(404)
      await send('delete', logo(), cOwner).expect(204)
    })

    it('una empresa pendiente puede subir su logo mientras espera, pero no es público hasta que se aprueba', async () => {
      const pending = (await send('post', '/api/v1/contractors', stranger, { organizationName: 'E2E Contratista Pendiente Logo', taxId: 'CP-LOGO', countryCode: 'PE' }).expect(201)).body
      expect(pending.status).toBe('PENDING')
      await attach(logo(() => pending.id), stranger, PNG).expect(201)
      await get(logo(() => pending.id)).expect(404)
      await send('patch', `/api/v1/contractors/${pending.id}`, admin, { status: 'ACTIVE' }).expect(200)
      await get(logo(() => pending.id)).expect(200)
    })

    it('una empresa suspendida no puede cambiar su logo (salvo el administrador); los cambios quedan auditados', async () => {
      const susp = (await send('post', '/api/v1/contractors', admin, { organizationName: 'E2E Contratista Suspendido Logo', taxId: 'CS-LOGO', countryCode: 'PE', ownerEmail: 'cowner@e2e.fur.local' }).expect(201)).body
      await send('patch', `/api/v1/contractors/${susp.id}`, admin, { status: 'SUSPENDED' }).expect(200)
      await attach(logo(() => susp.id), cOwner, PNG).expect(409)
      await attach(logo(() => susp.id), admin, PNG).expect(201)

      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.module, 'professional'), eq(auditEvents.entityId, contr)))
      const actions = events.map((e) => e.action)
      expect(actions).toContain('logo.updated')
      expect(actions).toContain('logo.removed')
    })
  })

  it('el catálogo no puede borrarse si hay productos que lo usan (familia con listings)', async () => {
    // La familia usada por un producto no se elimina por accidente (FK sin cascada).
    expect(familyName).toBeTruthy()
    await expect(t.pool.query('delete from catalog.asset_families where code = $1', [familyCode])).rejects.toThrow()
  })
})
