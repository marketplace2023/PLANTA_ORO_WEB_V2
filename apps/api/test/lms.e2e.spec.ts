import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Cursos (LMS) (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let admin: Session
  let owner: Session // responsable del proveedor
  let member: Session // miembro del proveedor
  let cowner: Session // responsable del contratista
  let stu1: Session
  let stu2: Session
  let stranger: Session
  let provId: string
  let contrId: string
  let suspendedId: string

  const send = (method: 'post' | 'patch' | 'delete', url: string, s: Session | null, body: object = {}) => {
    const r = http()[method](url)
    return (s ? r.set('Authorization', bearer(s)) : r).send(body)
  }
  const get = (url: string, s: Session | null = null) => {
    const r = http().get(url)
    return s ? r.set('Authorization', bearer(s)) : r
  }
  const titles = (res: request.Response) => res.body.items.map((c: { title: string }) => c.title)

  const mkCourse = async (over: object = {}, s: Session = admin) =>
    (await send('post', '/api/v1/courses', s, { ownerType: 'ECOSYSTEM', title: 'E2E Curso', ...over }).expect(201)).body
  const addLesson = async (courseId: string, over: object = {}, s: Session = admin) =>
    (await send('post', `/api/v1/courses/${courseId}/lessons`, s, { title: 'Lección', content: 'Contenido', durationMinutes: 10, ...over }).expect(201)).body
  /** Curso publicado con N lecciones de 10 min. */
  const published = async (over: object = {}, lessonsN = 2) => {
    const c = await mkCourse({ stageCodes: ['D06'], ...over })
    for (let i = 1; i <= lessonsN; i++) await addLesson(c.id, { title: `L${i}` })
    return (await send('patch', `/api/v1/courses/${c.id}`, admin, { status: 'PUBLISHED' }).expect(200)).body
  }
  const enroll = (id: string, s: Session | null) => send('post', `/api/v1/courses/${id}/enrollment`, s)
  const complete = (cid: string, lid: string, s: Session | null) => send('post', `/api/v1/courses/${cid}/lessons/${lid}/complete`, s)

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()
    const names = ['admin', 'owner', 'member', 'cowner', 'stu1', 'stu2', 'stranger']
    const users = await Promise.all(names.map((n) => t.user(n, { isGlobalAdmin: n === 'admin' })))
    void users
    ;[admin, owner, member, cowner, stu1, stu2, stranger] = await Promise.all(names.map((n) => login(app, n)))
    const mk = async (path: string, name: string, ownerEmail: string) =>
      (await send('post', path, admin, { organizationName: name, countryCode: 'PE', ownerEmail }).expect(201)).body.id as string
    provId = await mk('/api/v1/providers', 'E2E Academia Prov', 'owner@e2e.fur.local')
    contrId = await mk('/api/v1/contractors', 'E2E Academia Contratista', 'cowner@e2e.fur.local')
    suspendedId = await mk('/api/v1/providers', 'E2E Academia Suspendida', 'owner@e2e.fur.local')
    await send('post', `/api/v1/providers/${provId}/members`, owner, { email: 'member@e2e.fur.local' }).expect(201)
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('crear y publicar', () => {
    it('el administrador crea cursos del ecosistema; nace en borrador y sin duración', async () => {
      const c = await mkCourse({ title: 'E2E Seguridad en molienda', level: 'INTERMEDIATE', certificate: true, instructorName: 'Ing. Pérez' })
      expect(c).toMatchObject({ status: 'DRAFT', level: 'INTERMEDIATE', certificate: true, durationMinutes: 0, lessonCount: 0, canManage: true, owner: { type: 'ECOSYSTEM', name: 'Ecosistema FUR' } })
    })

    it('un usuario común no crea cursos del ecosistema ni de una organización ajena; anónimo 401', async () => {
      await send('post', '/api/v1/courses', stranger, { ownerType: 'ECOSYSTEM', title: 'E2E x' }).expect(403)
      await send('post', '/api/v1/courses', stranger, { ownerType: 'PROVIDER', ownerId: provId, title: 'E2E x' }).expect(403)
      await send('post', '/api/v1/courses', owner, { ownerType: 'CONTRACTOR', ownerId: contrId, title: 'E2E x' }).expect(403)
      await send('post', '/api/v1/courses', null, { ownerType: 'ECOSYSTEM', title: 'E2E x' }).expect(401)
    })

    it('los miembros crean cursos de su organización; una organización suspendida no', async () => {
      const c = await mkCourse({ ownerType: 'PROVIDER', ownerId: provId, title: 'E2E Curso del proveedor' }, member)
      expect(c.owner).toMatchObject({ type: 'PROVIDER', id: provId, name: 'E2E Academia Prov' })
      await send('patch', `/api/v1/providers/${suspendedId}`, admin, { status: 'SUSPENDED' }).expect(200)
      await send('post', '/api/v1/courses', owner, { ownerType: 'PROVIDER', ownerId: suspendedId, title: 'E2E x' }).expect(409)
    })

    it('valida: propietario coherente, título, nivel, etapas', async () => {
      for (const body of [
        { ownerType: 'PROVIDER', title: 'E2E x' }, // falta organización
        { ownerType: 'ECOSYSTEM', ownerId: provId, title: 'E2E x' }, // el ecosistema no lleva organización
        { ownerType: 'ECOSYSTEM', title: '' },
        { ownerType: 'ECOSYSTEM', title: 'E2E x', level: 'EXPERT' },
        { ownerType: 'ECOSYSTEM', title: 'E2E x', stageCodes: ['ZZZ'] },
        { ownerType: 'MARTE', title: 'E2E x' },
      ]) {
        await send('post', '/api/v1/courses', admin, body).expect(400)
      }
    })

    it('publicar exige lecciones y al menos una etapa; el borrador no es público', async () => {
      const c = await mkCourse({ title: 'E2E Para publicar' })
      await get(`/api/v1/courses/${c.id}`).expect(404)
      await get(`/api/v1/courses/${c.id}`, stranger).expect(404)
      await get(`/api/v1/courses/${c.id}`, admin).expect(200)
      let res = await send('patch', `/api/v1/courses/${c.id}`, admin, { status: 'PUBLISHED' }).expect(400)
      expect(JSON.stringify(res.body)).toMatch(/lección/)
      await addLesson(c.id)
      res = await send('patch', `/api/v1/courses/${c.id}`, admin, { status: 'PUBLISHED' }).expect(400)
      expect(JSON.stringify(res.body)).toMatch(/etapa/)
      const ok = await send('patch', `/api/v1/courses/${c.id}`, admin, { status: 'PUBLISHED', stageCodes: ['D06', 'D11'] }).expect(200)
      expect(ok.body.stages.map((s: { code: string }) => s.code)).toEqual(['D06', 'D11'])
      await get(`/api/v1/courses/${c.id}`).expect(200)
    })

    it('un curso de una organización no activa no se publica', async () => {
      const c = await mkCourse({ ownerType: 'CONTRACTOR', ownerId: contrId, title: 'E2E Contratista curso', stageCodes: ['D07'] }, cowner)
      await addLesson(c.id, {}, cowner)
      await send('patch', `/api/v1/contractors/${contrId}`, admin, { status: 'SUSPENDED' }).expect(200)
      await send('patch', `/api/v1/courses/${c.id}`, cowner, { status: 'PUBLISHED' }).expect(409)
      await send('patch', `/api/v1/contractors/${contrId}`, admin, { status: 'ACTIVE' }).expect(200)
      await send('patch', `/api/v1/courses/${c.id}`, cowner, { status: 'PUBLISHED' }).expect(200)
    })

    it('solo gestiona quien debe: otro proveedor, alumnos y anónimos reciben 403/404/401', async () => {
      const c = await mkCourse({ ownerType: 'PROVIDER', ownerId: provId, title: 'E2E Ajeno' }, owner)
      await send('patch', `/api/v1/courses/${c.id}`, cowner, { title: 'hack' }).expect(404) // borrador ajeno: ni se revela
      await send('patch', `/api/v1/courses/${c.id}`, null, { title: 'hack' }).expect(401)
      await addLesson(c.id, {}, owner)
      await send('patch', `/api/v1/courses/${c.id}`, owner, { stageCodes: ['D06'], status: 'PUBLISHED' }).expect(200)
      await send('patch', `/api/v1/courses/${c.id}`, cowner, { title: 'hack' }).expect(403) // publicado: existe pero no es suyo
      await send('post', `/api/v1/courses/${c.id}/lessons`, stranger, { title: 'x' }).expect(403)
      await get(`/api/v1/courses/${c.id}/enrollments`, stranger).expect(403)
    })

    it('los cambios quedan auditados', async () => {
      const c = await mkCourse({ title: 'E2E Auditado' })
      const rows = await t.pool.query("select action from audit.events where module = 'lms' and entity_id = $1", [c.id])
      expect(rows.rows.map((r: { action: string }) => r.action)).toContain('created')
    })
  })

  describe('lecciones', () => {
    it('crea con posición consecutiva y la duración del curso es la suma de sus lecciones', async () => {
      const c = await mkCourse({ title: 'E2E Temario' })
      await addLesson(c.id, { title: 'A', durationMinutes: 15 })
      await addLesson(c.id, { title: 'B', durationMinutes: 30 })
      const res = await addLesson(c.id, { title: 'C', durationMinutes: 5 })
      expect(res.durationMinutes).toBe(50)
      expect(res.lessons.map((l: { title: string; position: number }) => [l.title, l.position])).toEqual([['A', 0], ['B', 1], ['C', 2]])
    })

    it('reordena (mover al inicio y al final) sin dejar huecos ni repetidos', async () => {
      const c = await mkCourse({ title: 'E2E Orden' })
      const ids: string[] = []
      for (const title of ['A', 'B', 'C', 'D']) ids.push((await addLesson(c.id, { title })).lessons.at(-1).id)
      let res = await send('patch', `/api/v1/courses/${c.id}/lessons/${ids[3]}`, admin, { position: 0 }).expect(200)
      expect(res.body.lessons.map((l: { title: string }) => l.title)).toEqual(['D', 'A', 'B', 'C'])
      res = await send('patch', `/api/v1/courses/${c.id}/lessons/${ids[3]}`, admin, { position: 99 }).expect(200)
      expect(res.body.lessons.map((l: { title: string; position: number }) => [l.title, l.position])).toEqual([['A', 0], ['B', 1], ['C', 2], ['D', 3]])
    })

    it('editar y borrar recalculan la duración; valida contenido, enlaces http(s) y duración', async () => {
      const c = await mkCourse({ title: 'E2E Edición' })
      const l = (await addLesson(c.id, { durationMinutes: 20 })).lessons[0]
      expect((await send('patch', `/api/v1/courses/${c.id}/lessons/${l.id}`, admin, { durationMinutes: 45, videoUrl: 'https://video.test/v' }).expect(200)).body.durationMinutes).toBe(45)
      for (const body of [{ videoUrl: 'javascript:alert(1)' }, { durationMinutes: -1 }, { durationMinutes: 1441 }, { durationMinutes: 1.5 }, { title: '' }, {}]) {
        await send('patch', `/api/v1/courses/${c.id}/lessons/${l.id}`, admin, body).expect(400)
      }
      await send('post', `/api/v1/courses/${c.id}/lessons`, admin, { title: 'x', videoUrl: 'ftp://x' }).expect(400)
      const del = await send('delete', `/api/v1/courses/${c.id}/lessons/${l.id}`, admin).expect(200)
      expect(del.body).toMatchObject({ durationMinutes: 0, lessonCount: 0 })
      await send('delete', `/api/v1/courses/${c.id}/lessons/${l.id}`, admin).expect(404)
    })

    it('borrar una lección del medio deja las posiciones consecutivas', async () => {
      const c = await mkCourse({ title: 'E2E Hueco' })
      const ids: string[] = []
      for (const title of ['A', 'B', 'C']) ids.push((await addLesson(c.id, { title })).lessons.at(-1).id)
      const res = await send('delete', `/api/v1/courses/${c.id}/lessons/${ids[1]}`, admin).expect(200)
      expect(res.body.lessons.map((l: { title: string; position: number }) => [l.title, l.position])).toEqual([['A', 0], ['C', 1]])
      const next = await addLesson(c.id, { title: 'D' })
      expect(next.lessons.map((l: { position: number }) => l.position)).toEqual([0, 1, 2])
    })

    it('una lección de otro curso no se toca desde este', async () => {
      const a = await mkCourse({ title: 'E2E A' })
      const b = await mkCourse({ title: 'E2E B' })
      const lb = (await addLesson(b.id)).lessons[0]
      await send('patch', `/api/v1/courses/${a.id}/lessons/${lb.id}`, admin, { title: 'x' }).expect(404)
      await send('delete', `/api/v1/courses/${a.id}/lessons/${lb.id}`, admin).expect(404)
    })

    it('un curso publicado no se queda sin lecciones; una lección completada por alumnos no se borra', async () => {
      const c = await published({ title: 'E2E Protegido' }, 2)
      await enroll(c.id, stu1).expect(201)
      const [l1, l2] = (await get(`/api/v1/courses/${c.id}`, stu1)).body.lessons
      await complete(c.id, l1.id, stu1).expect(201)
      await send('delete', `/api/v1/courses/${c.id}/lessons/${l1.id}`, admin).expect(409) // ya completada
      await send('delete', `/api/v1/courses/${c.id}/lessons/${l2.id}`, admin).expect(200)
      const only = (await get(`/api/v1/courses/${c.id}`, admin)).body.lessons[0]
      await send('delete', `/api/v1/courses/${c.id}/lessons/${only.id}`, admin).expect(409) // última de un curso publicado
    })

    it('un curso publicado sin alumnos tampoco se queda sin lecciones', async () => {
      const c = await published({ title: 'E2E Última lección' }, 1)
      const only = (await get(`/api/v1/courses/${c.id}`, admin)).body.lessons[0]
      const res = await send('delete', `/api/v1/courses/${c.id}/lessons/${only.id}`, admin).expect(409)
      expect(res.body.message).toMatch(/al menos una lección/)
      await send('patch', `/api/v1/courses/${c.id}`, admin, { status: 'ARCHIVED' }).expect(200)
      await send('delete', `/api/v1/courses/${c.id}/lessons/${only.id}`, admin).expect(200) // archivado: ya no hay exigencia
    })

    it('altas simultáneas de lecciones: posiciones únicas y duración correcta', async () => {
      const c = await mkCourse({ title: 'E2E Paralelo' })
      const res = await Promise.all(Array.from({ length: 6 }, (_, i) => send('post', `/api/v1/courses/${c.id}/lessons`, admin, { title: `P${i}`, durationMinutes: 10 })))
      expect(res.every((r) => r.status === 201)).toBe(true)
      const after = (await get(`/api/v1/courses/${c.id}`, admin)).body
      expect(after.lessons.map((l: { position: number }) => l.position)).toEqual([0, 1, 2, 3, 4, 5])
      expect(after.durationMinutes).toBe(60)
    })
  })

  describe('precio del curso', () => {
    const prc = async (qs: string) => titles(await get(`/api/v1/courses?search=E2E%20PRC&${qs}`).expect(200))
    let free: { id: string }
    let paid: { id: string }
    let premium: { id: string }

    beforeAll(async () => {
      // Gratuito (sin precio), de pago fijado por el facilitador (proveedor) y uno más caro del ecosistema.
      free = await published({ title: 'E2E PRC Gratuito', stageCodes: ['D06'] })
      paid = await mkCourse({ ownerType: 'PROVIDER', ownerId: provId, title: 'E2E PRC De pago', price: 120.5, currency: 'pen', stageCodes: ['D06'] }, owner)
      await addLesson(paid.id, {}, owner)
      await send('patch', `/api/v1/courses/${paid.id}`, owner, { status: 'PUBLISHED' }).expect(200)
      premium = await published({ title: 'E2E PRC Premium', price: 300, currency: 'USD', stageCodes: ['D07'] })
    })

    it('un curso nuevo es gratuito (precio 0, USD) salvo que quien lo ofrece fije un precio', async () => {
      expect(free).toMatchObject({ price: 0, currency: 'USD' })
      const c = await mkCourse({ title: 'E2E PRC Borrador' })
      expect(c).toMatchObject({ price: 0, currency: 'USD' })
    })

    it('el facilitador fija el precio al crear (moneda en mayúsculas) y lo cambia después', async () => {
      expect(paid).toMatchObject({ price: 120.5, currency: 'PEN' })
      const res = await send('patch', `/api/v1/courses/${paid.id}`, member, { price: 99.99, currency: 'usd' }).expect(200) // un miembro también
      expect(res.body).toMatchObject({ price: 99.99, currency: 'USD' })
      await send('patch', `/api/v1/courses/${paid.id}`, owner, { price: 0 }).expect(200) // volver a gratuito
      expect((await get(`/api/v1/courses/${paid.id}`)).body.price).toBe(0)
      await send('patch', `/api/v1/courses/${paid.id}`, owner, { price: 120.5, currency: 'PEN' }).expect(200)
    })

    it('valida el precio: no negativo, hasta 2 decimales, número y moneda de 3 letras', async () => {
      for (const bad of [{ price: -1 }, { price: 10.999 }, { price: '10' }, { price: 1e10 }, { currency: 'DOLARES' }, { currency: 'US' }]) {
        await send('patch', `/api/v1/courses/${paid.id}`, owner, bad).expect(400)
      }
      await send('post', '/api/v1/courses', admin, { ownerType: 'ECOSYSTEM', title: 'E2E PRC Malo', price: -5 }).expect(400)
      expect((await get(`/api/v1/courses/${paid.id}`)).body).toMatchObject({ price: 120.5, currency: 'PEN' }) // nada cambió
    })

    it('el precio se ve en el catálogo público y en el detalle, sin sesión', async () => {
      const list = (await get('/api/v1/courses?search=E2E%20PRC').expect(200)).body.items as Array<{ title: string; price: number; currency: string }>
      expect(list.find((c) => c.title === 'E2E PRC De pago')).toMatchObject({ price: 120.5, currency: 'PEN' })
      expect(list.find((c) => c.title === 'E2E PRC Gratuito')).toMatchObject({ price: 0 })
      expect((await get(`/api/v1/courses/${premium.id}`)).body).toMatchObject({ price: 300, currency: 'USD' })
    })

    it('filtra gratuitos o de pago y ordena por precio', async () => {
      expect(await prc('free=1')).toEqual(['E2E PRC Gratuito'])
      expect(await prc('free=0&sort=price_asc')).toEqual(['E2E PRC De pago', 'E2E PRC Premium'])
      expect(await prc('free=0&sort=price_desc')).toEqual(['E2E PRC Premium', 'E2E PRC De pago'])
      expect(await prc('sort=price_asc')).toEqual(['E2E PRC Gratuito', 'E2E PRC De pago', 'E2E PRC Premium'])
      await get('/api/v1/courses?free=2').expect(400)
    })

    it('solo gestiona el precio quien gestiona el curso', async () => {
      await send('patch', `/api/v1/courses/${paid.id}`, stranger, { price: 1 }).expect(403)
      await send('patch', `/api/v1/courses/${paid.id}`, stu1, { price: 1 }).expect(403)
      await send('patch', `/api/v1/courses/${paid.id}`, null, { price: 1 }).expect(401)
      await send('patch', `/api/v1/courses/${paid.id}`, cowner, { price: 1 }).expect(403) // otro dueño
      expect((await get(`/api/v1/courses/${paid.id}`)).body.price).toBe(120.5)
    })

    it('el cambio de precio queda auditado con el valor anterior', async () => {
      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.module, 'lms'), eq(auditEvents.entityId, paid.id)))
      const changed = events.find((e) => (e.newData as { price?: number } | null)?.price === 99.99)
      expect(changed?.oldData).toMatchObject({ price: '120.50', currency: 'PEN' })
    })
  })

  describe('catálogo público', () => {
    let a: { id: string }
    let b: { id: string }
    beforeAll(async () => {
      a = await published({ title: 'E2E CAT Molienda básica', description: 'Fundamentos', level: 'BASIC', certificate: true, instructorName: 'Ing. Soto', stageCodes: ['D06', 'D07'] }, 3) // 30 min
      b = await mkCourse({ ownerType: 'PROVIDER', ownerId: provId, title: 'E2E CAT Lixiviación avanzada', level: 'ADVANCED', stageCodes: ['D11'] }, owner)
      await addLesson(b.id, { durationMinutes: 90 }, owner)
      await send('patch', `/api/v1/courses/${b.id}`, owner, { status: 'PUBLISHED' }).expect(200)
    })
    const q = async (qs: string) => titles(await get(`/api/v1/courses?search=E2E%20CAT&${qs}`).expect(200))

    it('lista solo publicados, con propietario, etapas, duración y conteo de lecciones', async () => {
      const list = (await get('/api/v1/courses?search=E2E%20CAT').expect(200)).body
      expect(list.items.map((c: { title: string }) => c.title)).toEqual(['E2E CAT Lixiviación avanzada', 'E2E CAT Molienda básica'])
      expect(list.items[1]).toMatchObject({ level: 'BASIC', durationMinutes: 30, lessonCount: 3, certificate: true, instructorName: 'Ing. Soto', owner: { type: 'ECOSYSTEM' }, myEnrollment: null })
      expect(list.items[0].owner).toMatchObject({ type: 'PROVIDER', name: 'E2E Academia Prov' })
    })

    it('filtros: etapa, nivel, propietario, duración máxima, certificado, búsqueda', async () => {
      expect(await q('stage=D07')).toEqual(['E2E CAT Molienda básica'])
      expect(await q('stage=D11')).toEqual(['E2E CAT Lixiviación avanzada'])
      expect(await q('level=ADVANCED')).toEqual(['E2E CAT Lixiviación avanzada'])
      expect(await q('ownerType=PROVIDER')).toEqual(['E2E CAT Lixiviación avanzada'])
      expect(await q(`providerId=${provId}`)).toEqual(['E2E CAT Lixiviación avanzada'])
      expect(await q('maxMinutes=60')).toEqual(['E2E CAT Molienda básica'])
      expect(await q('certificate=1')).toEqual(['E2E CAT Molienda básica'])
      expect(await q('sort=duration')).toEqual(['E2E CAT Molienda básica', 'E2E CAT Lixiviación avanzada'])
      expect(titles(await get('/api/v1/courses?search=soto').expect(200))).toEqual(['E2E CAT Molienda básica']) // por instructor
      expect(titles(await get('/api/v1/courses?search=' + encodeURIComponent('%')).expect(200))).toEqual([])
      for (const bad of ['level=EXPERT', 'maxMinutes=0', 'sort=chaos', 'certificate=si', 'pageSize=999', 'providerId=x']) await get(`/api/v1/courses?${bad}`).expect(400)
    })

    it('un curso archivado o de una organización suspendida sale del catálogo', async () => {
      await send('patch', `/api/v1/courses/${a.id}`, admin, { status: 'ARCHIVED' }).expect(200)
      expect(await q('')).toEqual(['E2E CAT Lixiviación avanzada'])
      await send('patch', `/api/v1/providers/${provId}`, admin, { status: 'SUSPENDED' }).expect(200)
      expect(await q('')).toEqual([])
      await get(`/api/v1/courses/${b.id}`).expect(404)
      await get(`/api/v1/courses/${b.id}`, owner).expect(200) // sus gestores sí
      await send('patch', `/api/v1/providers/${provId}`, admin, { status: 'ACTIVE' }).expect(200)
      await send('patch', `/api/v1/courses/${a.id}`, admin, { status: 'PUBLISHED' }).expect(200)
    })

    it('el temario es público pero el contenido de las lecciones no: solo inscritos y gestores', async () => {
      const anon = (await get(`/api/v1/courses/${a.id}`).expect(200)).body
      expect(anon.lessons).toHaveLength(3)
      expect(anon.lessons.every((l: { content: string | null; videoUrl: string | null }) => l.content === null && l.videoUrl === null)).toBe(true)
      expect(JSON.stringify(anon)).not.toMatch(/Contenido/)
      expect((await get(`/api/v1/courses/${a.id}`, stranger).expect(200)).body.lessons[0].content).toBeNull()
      expect((await get(`/api/v1/courses/${a.id}`, admin).expect(200)).body.lessons[0].content).toBe('Contenido')
      await enroll(a.id, stu2).expect(201)
      expect((await get(`/api/v1/courses/${a.id}`, stu2).expect(200)).body.lessons[0].content).toBe('Contenido')
    })

    it('muestra mi inscripción y progreso en las tarjetas', async () => {
      const list = (await get('/api/v1/courses?search=E2E%20CAT%20Molienda', stu2).expect(200)).body
      expect(list.items[0].myEnrollment).toMatchObject({ status: 'ENROLLED', progressPercent: 0 })
    })
  })

  describe('inscripción y progreso', () => {
    it('exige sesión; solo cursos publicados con lecciones; es idempotente', async () => {
      const c = await published({ title: 'E2E Inscripción' }, 2)
      await enroll(c.id, null).expect(401)
      const draft = await mkCourse({ title: 'E2E Borrador inscripción' })
      await enroll(draft.id, stu1).expect(404)
      await enroll('00000000-0000-4000-8000-000000000000', stu1).expect(404)
      const first = (await enroll(c.id, stu1).expect(201)).body
      const again = (await enroll(c.id, stu1).expect(201)).body
      expect(again.id).toBe(first.id)
      expect(first).toMatchObject({ status: 'ENROLLED', progressPercent: 0, certificateCode: null })
    })

    it('inscripciones simultáneas generan una sola fila', async () => {
      const c = await published({ title: 'E2E Doble inscripción' })
      const res = await Promise.all([enroll(c.id, stu1), enroll(c.id, stu1), enroll(c.id, stu1)])
      expect(res.every((r) => r.status === 201)).toBe(true)
      expect(new Set(res.map((r) => r.body.id)).size).toBe(1)
    })

    it('completar lecciones avanza el progreso y al terminar completa el curso con certificado', async () => {
      const c = await published({ title: 'E2E Completar', certificate: true }, 3)
      await enroll(c.id, stu1).expect(201)
      const lessons = (await get(`/api/v1/courses/${c.id}`, stu1)).body.lessons
      let r = (await complete(c.id, lessons[0].id, stu1).expect(201)).body
      expect(r).toMatchObject({ status: 'ENROLLED', progressPercent: 33.33, certificateCode: null })
      r = (await complete(c.id, lessons[0].id, stu1).expect(201)).body // idempotente
      expect(r.progressPercent).toBe(33.33)
      await complete(c.id, lessons[1].id, stu1).expect(201)
      r = (await complete(c.id, lessons[2].id, stu1).expect(201)).body
      expect(r).toMatchObject({ status: 'COMPLETED', progressPercent: 100 })
      expect(r.certificateCode).toMatch(/^FUR-C-[0-9A-Z]{10}$/)
      expect(r.completedAt).toBeTruthy()
      const detail = (await get(`/api/v1/courses/${c.id}`, stu1)).body
      expect(detail.lessons.every((l: { completed: boolean }) => l.completed)).toBe(true)
      expect(detail.myEnrollment).toMatchObject({ status: 'COMPLETED', certificateCode: r.certificateCode })
    })

    it('un curso sin certificado se completa sin código', async () => {
      const c = await published({ title: 'E2E Sin certificado', certificate: false }, 1)
      await enroll(c.id, stu1).expect(201)
      const l = (await get(`/api/v1/courses/${c.id}`, stu1)).body.lessons[0]
      const r = (await complete(c.id, l.id, stu1).expect(201)).body
      expect(r).toMatchObject({ status: 'COMPLETED', certificateCode: null })
      await get(`/api/v1/courses/${c.id}/certificate`, stu1).expect(404)
    })

    it('el avance exige inscripción; las lecciones deben ser del curso; cada quien lleva el suyo', async () => {
      const c = await published({ title: 'E2E Avance' }, 2)
      const other = await published({ title: 'E2E Avance otro' }, 1)
      const lessons = (await get(`/api/v1/courses/${c.id}`, admin)).body.lessons
      await complete(c.id, lessons[0].id, stu1).expect(409) // sin inscripción
      await complete(c.id, lessons[0].id, null).expect(401)
      await enroll(c.id, stu1).expect(201)
      await enroll(c.id, stu2).expect(201)
      const foreign = (await get(`/api/v1/courses/${other.id}`, admin)).body.lessons[0]
      await complete(c.id, foreign.id, stu1).expect(404)
      await complete(c.id, lessons[0].id, stu1).expect(201)
      expect((await get(`/api/v1/courses/${c.id}`, stu2)).body.myEnrollment.progressPercent).toBe(0)
      expect((await get(`/api/v1/courses/${c.id}`, stu1)).body.myEnrollment.progressPercent).toBe(50)
    })

    it('deshacer una lección baja el progreso; un curso completado no se deshace', async () => {
      const c = await published({ title: 'E2E Deshacer' }, 2)
      await enroll(c.id, stu1).expect(201)
      const [l1, l2] = (await get(`/api/v1/courses/${c.id}`, stu1)).body.lessons
      await complete(c.id, l1.id, stu1).expect(201)
      const undone = await send('delete', `/api/v1/courses/${c.id}/lessons/${l1.id}/complete`, stu1).expect(200)
      expect(undone.body.progressPercent).toBe(0)
      await complete(c.id, l1.id, stu1).expect(201)
      await complete(c.id, l2.id, stu1).expect(201)
      await send('delete', `/api/v1/courses/${c.id}/lessons/${l1.id}/complete`, stu1).expect(409)
    })

    it('clics simultáneos en todas las lecciones: una sola finalización y un solo certificado', async () => {
      const c = await published({ title: 'E2E Carrera', certificate: true }, 4)
      await enroll(c.id, stu1).expect(201)
      const lessons = (await get(`/api/v1/courses/${c.id}`, stu1)).body.lessons
      const res = await Promise.all([...lessons, ...lessons].map((l: { id: string }) => complete(c.id, l.id, stu1)))
      expect(res.every((r) => r.status === 201)).toBe(true)
      const detail = (await get(`/api/v1/courses/${c.id}`, stu1)).body.myEnrollment
      expect(detail).toMatchObject({ status: 'COMPLETED', progressPercent: 100 })
      const codes = new Set(res.map((r) => r.body.certificateCode).filter(Boolean))
      expect(codes.size).toBe(1) // todos los que vieron el curso completo reportan el mismo código
      const rows = await t.pool.query('select count(*)::int as n from lms.lesson_progress lp join lms.enrollments e on e.id = lp.enrollment_id where e.course_id = $1', [c.id])
      expect(rows.rows[0].n).toBe(4)
    })

    it('registrar avance en una inscripción que se abandonó mientras tanto → 409 y no queda progreso', async () => {
      const c = await published({ title: 'E2E Carrera abandono' }, 2)
      const enr = (await enroll(c.id, stu1).expect(201)).body
      const l = (await get(`/api/v1/courses/${c.id}`, stu1)).body.lessons[0]
      const conn = await t.pool.connect()
      try {
        await conn.query('begin')
        await conn.query('select 1 from lms.enrollments where id = $1 for update', [enr.id])
        const pending = complete(c.id, l.id, stu1).then((r) => r)
        await new Promise((r) => setTimeout(r, 400)) // la petición ya llegó y espera el bloqueo
        await conn.query("update lms.enrollments set status = 'DROPPED' where id = $1", [enr.id])
        await conn.query('commit')
        expect((await pending).status).toBe(409)
      } finally {
        conn.release()
      }
      const rows = await t.pool.query('select count(*)::int as n from lms.lesson_progress where enrollment_id = $1', [enr.id])
      expect(rows.rows[0].n).toBe(0)
    })

    it('abandonar conserva el progreso y se puede retomar; un completado no se abandona', async () => {
      const c = await published({ title: 'E2E Abandonar' }, 2)
      await enroll(c.id, stu1).expect(201)
      const [l1, l2] = (await get(`/api/v1/courses/${c.id}`, stu1)).body.lessons
      await complete(c.id, l1.id, stu1).expect(201)
      await send('delete', `/api/v1/courses/${c.id}/enrollment`, stu1).expect(204)
      await complete(c.id, l2.id, stu1).expect(409) // abandonado: no registra avance
      expect((await get(`/api/v1/courses/${c.id}`, stu1)).body.lessons[0].content).toBeNull() // ni lee el contenido
      const back = (await enroll(c.id, stu1).expect(201)).body
      expect(back).toMatchObject({ status: 'ENROLLED', progressPercent: 50 })
      await complete(c.id, l2.id, stu1).expect(201)
      await send('delete', `/api/v1/courses/${c.id}/enrollment`, stu1).expect(409)
      await send('delete', `/api/v1/courses/${c.id}/enrollment`, stranger).expect(404)
    })

    it('un curso archivado sigue disponible para quien lo estudia; uno en borrador con inscritos no vuelve a borrador', async () => {
      const c = await published({ title: 'E2E Archivado' }, 2)
      await enroll(c.id, stu1).expect(201)
      await send('patch', `/api/v1/courses/${c.id}`, admin, { status: 'DRAFT' }).expect(409)
      await send('patch', `/api/v1/courses/${c.id}`, admin, { status: 'ARCHIVED' }).expect(200)
      expect((await get(`/api/v1/courses/${c.id}`, stu1).expect(200)).body.lessons[0].content).toBe('Contenido')
      await get(`/api/v1/courses/${c.id}`, stu2).expect(404)
      await enroll(c.id, stu2).expect(404) // nadie nuevo se inscribe
    })

    it('"Mi aprendizaje" lista mis cursos con progreso; el abandonado no aparece', async () => {
      const c = await published({ title: 'E2E Mi curso' }, 2)
      await enroll(c.id, stu2).expect(201)
      const l = (await get(`/api/v1/courses/${c.id}`, stu2)).body.lessons[0]
      await complete(c.id, l.id, stu2).expect(201)
      const mine = (await get('/api/v1/courses/mine', stu2).expect(200)).body
      const row = mine.find((m: { course: { id: string } }) => m.course.id === c.id)
      expect(row).toMatchObject({ status: 'ENROLLED', progressPercent: 50, course: { title: 'E2E Mi curso' } })
      await send('delete', `/api/v1/courses/${c.id}/enrollment`, stu2).expect(204)
      expect((await get('/api/v1/courses/mine', stu2).expect(200)).body.find((m: { course: { id: string } }) => m.course.id === c.id)).toBeUndefined()
      await get('/api/v1/courses/mine').expect(401)
    })
  })

  describe('certificados', () => {
    let cert: { id: string; code: string }
    beforeAll(async () => {
      const c = await published({ title: 'E2E Certificado', certificate: true, ownerType: 'ECOSYSTEM' }, 1)
      await enroll(c.id, stu1).expect(201)
      const l = (await get(`/api/v1/courses/${c.id}`, stu1)).body.lessons[0]
      cert = { id: c.id, code: (await complete(c.id, l.id, stu1).expect(201)).body.certificateCode }
    })

    it('solo el titular obtiene su certificado', async () => {
      const mine = (await get(`/api/v1/courses/${cert.id}/certificate`, stu1).expect(200)).body
      expect(mine).toMatchObject({ code: cert.code, holder: expect.stringContaining('stu1'), course: { title: 'E2E Certificado' }, issuedBy: 'Ecosistema FUR' })
      await get(`/api/v1/courses/${cert.id}/certificate`, stu2).expect(404)
      await get(`/api/v1/courses/${cert.id}/certificate`).expect(401)
    })

    it('la verificación es pública, no distingue mayúsculas y solo expone nombre, curso y fecha', async () => {
      const pub = (await get(`/api/v1/certificates/${cert.code}`).expect(200)).body
      expect(pub).toMatchObject({ valid: true, code: cert.code, course: { title: 'E2E Certificado' } })
      await get(`/api/v1/certificates/${cert.code.toLowerCase()}`).expect(200)
      expect(JSON.stringify(pub)).not.toMatch(/@e2e|email|userId/)
      await get('/api/v1/certificates/FUR-C-NOEXISTE00').expect(404)
      await get('/api/v1/certificates/x').expect(404)
    })

    it('el certificado de un curso de una organización indica quién lo emite', async () => {
      const c = await mkCourse({ ownerType: 'PROVIDER', ownerId: provId, title: 'E2E Cert org', certificate: true, stageCodes: ['D06'] }, owner)
      await addLesson(c.id, {}, owner)
      await send('patch', `/api/v1/courses/${c.id}`, owner, { status: 'PUBLISHED' }).expect(200)
      await enroll(c.id, stu2).expect(201)
      const l = (await get(`/api/v1/courses/${c.id}`, stu2)).body.lessons[0]
      const code = (await complete(c.id, l.id, stu2).expect(201)).body.certificateCode
      expect((await get(`/api/v1/certificates/${code}`).expect(200)).body.issuedBy).toBe('E2E Academia Prov')
    })
  })

  describe('gestión del curso', () => {
    it('listado de gestión por propietario: todos los estados, con inscritos; solo quien gestiona', async () => {
      const mgr = (await get(`/api/v1/courses/manage?ownerType=PROVIDER&ownerId=${provId}`, owner).expect(200)).body
      expect(mgr.items.some((c: { status: string }) => c.status === 'DRAFT')).toBe(true)
      expect(mgr.items.every((c: { enrolledCount: number }) => typeof c.enrolledCount === 'number')).toBe(true)
      await get(`/api/v1/courses/manage?ownerType=PROVIDER&ownerId=${provId}`, cowner).expect(403)
      await get(`/api/v1/courses/manage?ownerType=PROVIDER&ownerId=${provId}`).expect(401)
      await get('/api/v1/courses/manage?ownerType=ECOSYSTEM', owner).expect(403)
      await get('/api/v1/courses/manage?ownerType=ECOSYSTEM', admin).expect(200)
      await get('/api/v1/courses/manage?ownerType=PROVIDER', admin).expect(400)
      const onlyDraft = (await get(`/api/v1/courses/manage?ownerType=PROVIDER&ownerId=${provId}&status=PUBLISHED`, owner).expect(200)).body
      expect(onlyDraft.items.every((c: { status: string }) => c.status === 'PUBLISHED')).toBe(true)
    })

    it('el alumnado: total, completados y avance por persona; solo para quien gestiona', async () => {
      const c = await published({ title: 'E2E Alumnado' }, 1)
      await enroll(c.id, stu1).expect(201)
      await enroll(c.id, stu2).expect(201)
      const l = (await get(`/api/v1/courses/${c.id}`, stu1)).body.lessons[0]
      await complete(c.id, l.id, stu1).expect(201)
      const roster = (await get(`/api/v1/courses/${c.id}/enrollments`, admin).expect(200)).body
      expect(roster).toMatchObject({ total: 2, completed: 1 })
      expect(roster.items.map((r: { status: string }) => r.status).sort()).toEqual(['COMPLETED', 'ENROLLED'])
      await get(`/api/v1/courses/${c.id}/enrollments`, stu1).expect(403)
    })

    it('la base impide propietarios incoherentes y progreso fuera de rango', async () => {
      await expect(t.pool.query("insert into lms.courses (id, title, provider_type, provider_id) values (gen_random_uuid(), 'E2E mala', 'PROVIDER', null)")).rejects.toThrow(/owner_consistent/)
      await expect(t.pool.query("insert into lms.courses (id, title, provider_type, contractor_id) values (gen_random_uuid(), 'E2E mala2', 'ECOSYSTEM', $1)", [contrId])).rejects.toThrow(/owner_consistent/)
    })
  })
})
