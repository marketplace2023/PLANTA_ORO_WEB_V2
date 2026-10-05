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

  it('el catálogo no puede borrarse si hay productos que lo usan (familia con listings)', async () => {
    // La familia usada por un producto no se elimina por accidente (FK sin cascada).
    expect(familyName).toBeTruthy()
    await expect(t.pool.query('delete from catalog.asset_families where code = $1', [familyCode])).rejects.toThrow()
  })
})
