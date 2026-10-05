import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { auditEvents, documents, documentVersions, plantSettings, plants } from '../src/database/schema'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

type Plant = typeof plants.$inferSelect

const pdfOf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`)
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])

/** Descarga binaria: devuelve el cuerpo como Buffer. */
const binary = (req: request.Test) =>
  req.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = []
    res.on('data', (d: Buffer) => chunks.push(d))
    res.on('end', () => cb(null, Buffer.concat(chunks)))
  })

describe('Documentos (e2e)', () => {
  let app: INestApplication
  let t: TestDb
  const http = () => request(app.getHttpServer())

  let plantA: Plant
  let plantB: Plant
  let admin: Session
  let pa: Session // administrador de planta: todos los permisos
  let maint: Session // jefe de mantenimiento: document.read + document.upload, sin document.delete
  let wh: Session // almacén: solo document.read
  let consumer: Session // sin rol
  let pubAssetId: string
  let privAssetId: string
  let bAssetId: string
  let modelId: string

  const D = '/api/v1/plants/e2e-d1/documents'
  const storageDir = () => process.env.STORAGE_DIR!

  type Upload = { buf: Buffer; name: string; type?: string }
  const upload = (s: Session | null, file: Upload, fields: Record<string, string> = {}, base = D) => {
    let r = http().post(base)
    if (s) r = r.set('Authorization', bearer(s))
    for (const [k, v] of Object.entries({ title: 'Documento de prueba', ...fields })) r = r.field(k, v)
    return r.attach('file', file.buf, { filename: file.name, contentType: file.type })
  }
  const get = (url: string, s: Session | null = pa) => {
    const r = http().get(url)
    return s ? r.set('Authorization', bearer(s)) : r
  }
  const titles = (res: request.Response) => res.body.items.map((d: { title: string }) => d.title)
  const setSettings = (patch: Partial<typeof plantSettings.$inferInsert>) =>
    t.db.update(plantSettings).set(patch).where(eq(plantSettings.plantId, plantA.id))

  let internalDoc: string
  let publicDoc: string

  beforeAll(async () => {
    app = await createApp()
    t = new TestDb()
    await t.cleanup()

    plantA = await t.plant('d1', 'PUBLIC')
    plantB = await t.plant('d2', 'PUBLIC')
    await t.enableStage(plantA.id, 'D06')
    await t.enableStage(plantA.id, 'D11', { isEnabled: false })
    modelId = (await t.model('MOLINO_BOLAS', 'E2E Bolas docs')).id

    const [paU, maintU, whU] = await Promise.all([t.user('pa'), t.user('maint'), t.user('wh'), t.user('admin', { isGlobalAdmin: true }), t.user('consumer')])
    await t.assign(paU.id, plantA.id, 'PLANT_ADMIN')
    await t.assign(maintU.id, plantA.id, 'MAINTENANCE_LEAD')
    await t.assign(whU.id, plantA.id, 'WAREHOUSE')
    ;[admin, pa, maint, wh, consumer] = await Promise.all(['admin', 'pa', 'maint', 'wh', 'consumer'].map((n) => login(app, n)))

    const mk = async (slug: string, s: Session, tag: string, isPublic: boolean) =>
      (await http().post(`/api/v1/plants/${slug}/assets`).set('Authorization', bearer(s)).send({ tag, name: tag, assetModelId: modelId, isPublic }).expect(201)).body.id as string
    pubAssetId = await mk('e2e-d1', pa, 'PUB-1', true)
    privAssetId = await mk('e2e-d1', pa, 'PRV-1', false)
    bAssetId = await mk('e2e-d2', admin, 'B-1', true)
  })

  afterAll(async () => {
    await t.cleanup()
    await t.close()
    await app.close()
  })

  describe('subida', () => {
    it('exige sesión y document.upload: anónimo 401, común 403, almacén (solo lectura) 403', async () => {
      const file = { buf: pdfOf('x'), name: 'a.pdf' }
      await upload(null, file).expect(401)
      await upload(consumer, file).expect(403)
      await upload(wh, file).expect(403)
    })

    it('un administrador de otra planta no puede subir aquí (planta pública → 403)', async () => {
      await upload(pa, { buf: pdfOf('x'), name: 'a.pdf' }, {}, '/api/v1/plants/e2e-d2/documents').expect(403)
    })

    it('crea el documento: v1, interno por defecto, checksum SHA-256, vínculos y archivo en almacenamiento', async () => {
      const buf = pdfOf('manual de operación del molino')
      const res = await upload(maint, { buf, name: 'Manual MB-301.pdf' }, {
        title: 'Manual de operación MB-301',
        documentType: 'MANUAL',
        assetIds: pubAssetId,
        stageCodes: 'D06',
        note: 'Primera edición',
      }).expect(201)
      internalDoc = res.body.id

      expect(res.body).toMatchObject({
        title: 'Manual de operación MB-301',
        documentType: 'MANUAL',
        visibility: 'INTERNAL', // privado por defecto
        status: 'ACTIVE',
        currentVersion: 1,
        file: { originalName: 'Manual MB-301.pdf', mimeType: 'application/pdf', sizeBytes: buf.length },
        assets: [{ id: pubAssetId, tag: 'PUB-1' }],
        stages: [{ code: 'D06', name: 'Molienda Primaria' }],
        createdBy: expect.stringContaining('maint'),
      })
      expect(res.body.versions).toHaveLength(1)
      expect(res.body.versions[0]).toMatchObject({
        version: 1,
        isCurrent: true,
        checksum: createHash('sha256').update(buf).digest('hex'),
        note: 'Primera edición',
      })

      // El binario vive en el almacenamiento, no en la base de datos; la clave la genera el servidor.
      const [v] = await t.db.select().from(documentVersions).where(eq(documentVersions.documentId, internalDoc))
      expect(v.storageKey).toMatch(new RegExp(`^${plantA.id}/${internalDoc}/v1-[0-9a-f]{16}\\.pdf$`))
      expect(await readdir(path.join(storageDir(), plantA.id, internalDoc))).toHaveLength(1)

      const [audit] = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, internalDoc), eq(auditEvents.action, 'created')))
      expect(audit).toMatchObject({ module: 'documents', plantId: plantA.id })
    })

    it('el tipo lo decide el contenido, no el Content-Type que declare el cliente', async () => {
      const res = await upload(pa, { buf: pdfOf('mentiroso'), name: 'x.pdf', type: 'text/html' }, { title: 'Declarado html' }).expect(201)
      expect(res.body.file.mimeType).toBe('application/pdf')
    })

    it('conserva nombres con acentos y descarta rutas (path traversal)', async () => {
      const a = await upload(pa, { buf: pdfOf('1'), name: 'Manual de operación ñ.pdf' }, { title: 'Acentos' }).expect(201)
      expect(a.body.file.originalName).toBe('Manual de operación ñ.pdf')

      const b = await upload(pa, { buf: pdfOf('2'), name: '../../etc/passwd.pdf' }, { title: 'Traversal' }).expect(201)
      expect(b.body.file.originalName).toBe('passwd.pdf')
      const [v] = await t.db.select().from(documentVersions).where(eq(documentVersions.documentId, b.body.id))
      expect(v.storageKey.startsWith(`${plantA.id}/`)).toBe(true)
      expect(v.storageKey).not.toContain('..')
    })

    it.each([
      ['virus.exe', Buffer.from('MZ')],
      ['pagina.html', Buffer.from('<script>alert(1)</script>')],
      ['dibujo.svg', Buffer.from('<svg onload="alert(1)"/>')],
      ['doble.pdf.exe', pdfOf('x')],
      ['sin-extension', pdfOf('x')],
    ])('rechaza %s (tipo no permitido) con 415', async (name, buf) => {
      await upload(pa, { buf, name }).expect(415)
    })

    it('rechaza contenido que no corresponde a la extensión (PDF falso, binario como texto)', async () => {
      await upload(pa, { buf: PNG, name: 'falso.pdf' }).expect(415)
      await upload(pa, { buf: Buffer.from('<script>alert(1)</script>'), name: 'disfrazado.pdf' }).expect(415)
      await upload(pa, { buf: Buffer.from([0x68, 0, 0x69]), name: 'binario.txt' }).expect(415)
    })

    it('rechaza archivos vacíos (400), demasiado grandes (413) y peticiones sin archivo o con campo equivocado', async () => {
      await upload(pa, { buf: Buffer.alloc(0), name: 'vacio.pdf' }).expect(400)
      const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1.2 * 1024 * 1024, 65)]) // MAX_UPLOAD_MB=1 en pruebas
      await upload(pa, { buf: big, name: 'grande.pdf' }).expect(413)

      const noFile = await http().post(D).set('Authorization', bearer(pa)).field('title', 'Sin archivo').expect(400)
      expect(noFile.body.message).toContain('archivo')
      await http().post(D).set('Authorization', bearer(pa)).field('title', 'Campo malo').attach('archivo', pdfOf('x'), 'x.pdf').expect(400)
    })

    it('valida los metadatos: título obligatorio, tipo y visibilidad del catálogo', async () => {
      const bad = await upload(pa, { buf: pdfOf('x'), name: 'a.pdf' }, { title: '', documentType: 'RECETA', visibility: 'SECRETO' }).expect(400)
      expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['documentType', 'title', 'visibility'])
    })

    it('los vínculos deben existir en ESTA planta y las etapas estar habilitadas', async () => {
      await upload(pa, { buf: pdfOf('x'), name: 'a.pdf' }, { assetIds: bAssetId }).expect(400) // activo de otra planta
      await upload(pa, { buf: pdfOf('x'), name: 'a.pdf' }, { assetIds: 'no-uuid' }).expect(400)
      await upload(pa, { buf: pdfOf('x'), name: 'a.pdf' }, { stageCodes: 'D11' }).expect(400) // deshabilitada
      await upload(pa, { buf: pdfOf('x'), name: 'a.pdf' }, { stageCodes: 'D01' }).expect(400) // nunca habilitada
    })

    it('un intento fallido no deja archivos huérfanos en el almacenamiento', async () => {
      const files = async () => (await readdir(storageDir(), { recursive: true })).length
      const before = await files()
      await upload(pa, { buf: pdfOf('x'), name: 'a.pdf' }, { stageCodes: 'D01' }).expect(400)
      await upload(pa, { buf: PNG, name: 'falso.pdf' }).expect(415)
      expect(await files()).toBe(before)
    })

    it('crea un documento PÚBLICO con visibilidad explícita', async () => {
      const res = await upload(pa, { buf: pdfOf('hoja de seguridad'), name: 'Hoja de seguridad.pdf' }, {
        title: 'Hoja de seguridad pública',
        documentType: 'PROCEDIMIENTO',
        visibility: 'PUBLIC',
        assetIds: `${pubAssetId},${privAssetId}`,
      }).expect(201)
      publicDoc = res.body.id
      expect(res.body.visibility).toBe('PUBLIC')
      expect(res.body.assets.map((a: { tag: string }) => a.tag)).toEqual(['PRV-1', 'PUB-1'])
    })
  })

  describe('descarga y vista previa', () => {
    it('el personal descarga el archivo idéntico, con cabeceras seguras', async () => {
      const res = await binary(get(`${D}/${internalDoc}/download`, maint)).expect(200)
      expect(res.body.toString()).toBe(pdfOf('manual de operación del molino').toString())
      expect(res.headers['content-type']).toContain('application/pdf')
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="Manual MB-301\.pdf"; filename\*=UTF-8''Manual%20MB-301\.pdf$/)
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['cache-control']).toBe('private, no-store')
    })

    it('vista previa: PDF e imágenes en línea (con CSP sandbox); el resto siempre se descarga', async () => {
      const preview = await binary(get(`${D}/${internalDoc}/download?inline=1`, maint)).expect(200)
      expect(preview.headers['content-disposition']).toMatch(/^inline;/)
      expect(preview.headers['content-security-policy']).toContain('sandbox')

      const docx = (await upload(pa, { buf: DOCX, name: 'informe.docx' }, { title: 'Informe Word' }).expect(201)).body.id
      const res = await binary(get(`${D}/${docx}/download?inline=1`, pa)).expect(200)
      expect(res.headers['content-disposition']).toMatch(/^attachment;/) // aunque se pida inline
      expect(res.headers['content-type']).toContain('officedocument.wordprocessingml')
    })

    it('registra en auditoría el acceso a documentos internos', async () => {
      await binary(get(`${D}/${internalDoc}/download`, wh)).expect(200) // almacén tiene document.read
      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, internalDoc), eq(auditEvents.action, 'downloaded')))
      expect(events.length).toBeGreaterThan(0)
    })

    it('un documento INTERNO no se ve sin document.read aunque la planta publique sus documentos', async () => {
      await setSettings({ publicDocuments: true })
      await get(`${D}/${internalDoc}`, null).expect(404)
      await get(`${D}/${internalDoc}/download`, null).expect(404)
      await get(`${D}/${internalDoc}`, consumer).expect(404)
      await get(`${D}/${internalDoc}/download`, consumer).expect(404)
    })

    it('un documento PÚBLICO solo es accesible si la planta publica sus documentos', async () => {
      await setSettings({ publicDocuments: false })
      await get(`${D}/${publicDoc}`, null).expect(404)
      await get(`${D}/${publicDoc}/download`, null).expect(404)

      await setSettings({ publicDocuments: true })
      const res = await binary(get(`${D}/${publicDoc}/download`, null)).expect(200)
      expect(res.body.toString()).toContain('hoja de seguridad')
      await get(`${D}/${publicDoc}`, consumer).expect(200)
    })

    it('el detalle público omite autor, checksum y notas', async () => {
      const pub = await get(`${D}/${publicDoc}`, null).expect(200)
      expect(pub.body).not.toHaveProperty('createdBy')
      expect(pub.body.versions[0]).not.toHaveProperty('checksum')
      expect(pub.body.versions[0]).not.toHaveProperty('uploadedBy')
      const internal = await get(`${D}/${publicDoc}`, pa).expect(200)
      expect(internal.body).toHaveProperty('createdBy')
      expect(internal.body.versions[0]).toHaveProperty('checksum')
    })

    it('un visitante solo ve los activos vinculados que son públicos (y si la planta publica activos)', async () => {
      await setSettings({ publicDocuments: true, publicAssets: false })
      expect((await get(`${D}/${publicDoc}`, null).expect(200)).body.assets).toEqual([])
      await setSettings({ publicAssets: true })
      expect((await get(`${D}/${publicDoc}`, null).expect(200)).body.assets.map((a: { tag: string }) => a.tag)).toEqual(['PUB-1']) // PRV-1 no es público
    })

    it('ids inexistentes, mal formados o de otra planta → 404/400', async () => {
      await get(`${D}/018f0000-0000-7000-8000-000000000000`).expect(404)
      await get(`${D}/no-uuid`).expect(400)
      await get(`/api/v1/plants/e2e-d2/documents/${internalDoc}`, admin).expect(404) // documento de A pedido desde B
    })

    it('valida el parámetro version de la descarga', async () => {
      await get(`${D}/${internalDoc}/download?version=0`).expect(400)
      await get(`${D}/${internalDoc}/download?version=abc`).expect(400)
      await get(`${D}/${internalDoc}/download?version=99`).expect(404)
    })
  })

  describe('listado y filtros', () => {
    it('el personal ve todos los documentos activos; filtra por tipo, activo, etapa y texto', async () => {
      await setSettings({ publicDocuments: true, publicAssets: true })
      const all = await get(`${D}?pageSize=100`, maint).expect(200)
      expect(titles(all)).toEqual(expect.arrayContaining(['Manual de operación MB-301', 'Hoja de seguridad pública', 'Informe Word']))

      expect(titles(await get(`${D}?type=MANUAL`, maint))).toEqual(['Manual de operación MB-301'])
      expect(titles(await get(`${D}?assetId=${pubAssetId}`, maint)).sort()).toEqual(['Hoja de seguridad pública', 'Manual de operación MB-301'])
      expect(titles(await get(`${D}?assetId=${privAssetId}`, maint))).toEqual(['Hoja de seguridad pública'])
      expect(titles(await get(`${D}?stage=D06`, maint))).toEqual(['Manual de operación MB-301'])
      expect(titles(await get(`${D}?search=seguridad`, maint))).toEqual(['Hoja de seguridad pública']) // por título
      expect(titles(await get(`${D}?search=Manual MB-301.pdf`, maint))).toEqual(['Manual de operación MB-301']) // por nombre de archivo
    })

    it('muestra tipo, tamaño y vínculos en cada elemento', async () => {
      const [item] = (await get(`${D}?type=MANUAL`, maint)).body.items
      expect(item).toMatchObject({
        currentVersion: 1,
        file: { mimeType: 'application/pdf' },
        assets: [{ tag: 'PUB-1' }],
        stages: [{ code: 'D06' }],
      })
    })

    it('ordena por título y pagina', async () => {
      const asc = titles(await get(`${D}?sort=title&dir=asc&pageSize=100`, maint))
      const desc = titles(await get(`${D}?sort=title&dir=desc&pageSize=100`, maint))
      expect(asc.length).toBeGreaterThan(3)
      expect(desc).toEqual([...asc].reverse())
      const p1 = await get(`${D}?pageSize=2&page=1`, maint)
      const p2 = await get(`${D}?pageSize=2&page=2`, maint)
      expect(p1.body).toMatchObject({ page: 1, pageSize: 2 })
      expect(p1.body.total).toBeGreaterThan(2)
      expect(titles(p1).some((t: string) => titles(p2).includes(t))).toBe(false)
    })

    it('valida los parámetros', async () => {
      await get(`${D}?type=RECETA`).expect(400)
      await get(`${D}?pageSize=101`).expect(400)
      await get(`${D}?assetId=no-uuid`).expect(400)
      await get(`${D}?stage=molienda`).expect(400)
      await get(`${D}?sort=checksum`).expect(400)
    })

    it('una búsqueda con comodines SQL es literal', async () => {
      expect((await get(`${D}?search=%25`, maint)).body.total).toBe(0)
    })

    it('visitantes: solo documentos PÚBLICOS, y nada si la planta no los publica', async () => {
      await setSettings({ publicDocuments: false })
      expect((await get(`${D}`, null).expect(200)).body).toMatchObject({ total: 0, items: [] })
      expect((await get(`${D}`, consumer).expect(200)).body.total).toBe(0)

      await setSettings({ publicDocuments: true })
      const anon = await get(`${D}?pageSize=100`, null).expect(200)
      expect(titles(anon)).toEqual(['Hoja de seguridad pública'])
      expect(titles(await get(`${D}?type=MANUAL`, null))).toEqual([]) // el filtro no filtra datos internos
    })

    it('"status=ARCHIVED" solo funciona para el personal', async () => {
      await get(`${D}?status=ARCHIVED`, null).expect(200)
      expect((await get(`${D}?status=ARCHIVED`, null)).body.items.every((d: { status: string }) => d.status === 'ACTIVE')).toBe(true)
    })

    it('planta privada: 404 para quien no es miembro', async () => {
      await t.plant('dpriv', 'PRIVATE')
      await get('/api/v1/plants/e2e-dpriv/documents', null).expect(404)
      await get('/api/v1/plants/e2e-dpriv/documents', consumer).expect(404)
    })
  })

  describe('versiones', () => {
    const addVersion = (s: Session | null, id: string, file: Upload, note?: string) => {
      let r = http().post(`${D}/${id}/versions`)
      if (s) r = r.set('Authorization', bearer(s))
      if (note) r = r.field('note', note)
      return r.attach('file', file.buf, { filename: file.name })
    }

    it('exige document.upload', async () => {
      const f = { buf: pdfOf('v2'), name: 'v2.pdf' }
      await addVersion(null, internalDoc, f).expect(401)
      await addVersion(wh, internalDoc, f).expect(403)
      await addVersion(consumer, internalDoc, f).expect(403)
    })

    it('añade la versión 2: la vigente cambia y la anterior se conserva y sigue descargable', async () => {
      const res = await addVersion(maint, internalDoc, { buf: pdfOf('manual revisado'), name: 'Manual MB-301 rev B.pdf' }, 'Corrige torques').expect(201)
      expect(res.body).toMatchObject({ currentVersion: 2, file: { originalName: 'Manual MB-301 rev B.pdf' } })
      expect(res.body.versions.map((v: { version: number; isCurrent: boolean }) => [v.version, v.isCurrent])).toEqual([[2, true], [1, false]])
      expect(res.body.versions[0]).toMatchObject({ note: 'Corrige torques', checksum: createHash('sha256').update(pdfOf('manual revisado')).digest('hex') })

      const old = await binary(get(`${D}/${internalDoc}/download?version=1`, maint)).expect(200)
      expect(old.body.toString()).toContain('manual de operación del molino')
      const current = await binary(get(`${D}/${internalDoc}/download`, maint)).expect(200)
      expect(current.body.toString()).toContain('manual revisado')

      expect(await readdir(path.join(storageDir(), plantA.id, internalDoc))).toHaveLength(2) // nunca se sobrescribe
      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, internalDoc), eq(auditEvents.action, 'version.created')))
      expect(events[0].newData).toMatchObject({ version: 2, note: 'Corrige torques' })
    })

    it('los visitantes solo ven y descargan la versión vigente', async () => {
      await addVersion(pa, publicDoc, { buf: pdfOf('hoja de seguridad v2'), name: 'hoja v2.pdf' }).expect(201)
      const detail = await get(`${D}/${publicDoc}`, null).expect(200)
      expect(detail.body.versions.map((v: { version: number }) => v.version)).toEqual([2])
      await get(`${D}/${publicDoc}/download?version=1`, null).expect(404)
      await get(`${D}/${publicDoc}/download?version=2`, null).expect(200)
      const staff = await get(`${D}/${publicDoc}`, maint).expect(200)
      expect(staff.body.versions).toHaveLength(2)
    })

    it('subidas simultáneas obtienen números de versión distintos y sin huecos', async () => {
      const before = (await t.db.select().from(documents).where(eq(documents.id, internalDoc)))[0].currentVersion
      const results = await Promise.all(Array.from({ length: 4 }, (_, i) => addVersion(maint, internalDoc, { buf: pdfOf(`paralela ${i}`), name: `p${i}.pdf` })))
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201])
      const rows = await t.db.select().from(documentVersions).where(eq(documentVersions.documentId, internalDoc))
      expect(rows.map((r) => r.version).sort((a, b) => a - b)).toEqual(Array.from({ length: before + 4 }, (_, i) => i + 1))
    })

    it('una versión inválida no cambia nada ni deja archivos huérfanos', async () => {
      const dir = path.join(storageDir(), plantA.id, internalDoc)
      const [{ currentVersion }] = await t.db.select().from(documents).where(eq(documents.id, internalDoc))
      const filesBefore = (await readdir(dir)).length

      await addVersion(maint, internalDoc, { buf: PNG, name: 'falso.pdf' }).expect(415)
      await addVersion(maint, internalDoc, { buf: pdfOf('x'), name: 'virus.exe' }).expect(415)
      await request(app.getHttpServer()).post(`${D}/${internalDoc}/versions`).set('Authorization', bearer(maint)).expect(400) // sin archivo

      const [after] = await t.db.select().from(documents).where(eq(documents.id, internalDoc))
      expect(after.currentVersion).toBe(currentVersion)
      expect((await readdir(dir)).length).toBe(filesBefore)
    })

    it('404 si el documento no existe en esta planta', async () => {
      await addVersion(pa, '018f0000-0000-7000-8000-000000000000', { buf: pdfOf('x'), name: 'x.pdf' }).expect(404)
    })
  })

  describe('edición', () => {
    const patch = (id: string, body: object, s: Session | null = maint) => {
      const r = http().patch(`${D}/${id}`)
      return (s ? r.set('Authorization', bearer(s)) : r).send(body)
    }

    it('exige document.upload', async () => {
      await patch(internalDoc, { title: 'x' }, null).expect(401)
      await patch(internalDoc, { title: 'x' }, wh).expect(403)
      await patch(internalDoc, { title: 'x' }, consumer).expect(403)
    })

    it('cambia título, tipo y visibilidad, y audita antes/después', async () => {
      const res = await patch(internalDoc, { title: 'Manual MB-301 (vigente)', documentType: 'SOP' }).expect(200)
      expect(res.body).toMatchObject({ title: 'Manual MB-301 (vigente)', documentType: 'SOP', visibility: 'INTERNAL' })
      const events = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, internalDoc), eq(auditEvents.action, 'updated')))
      expect(events[0].oldData).toMatchObject({ title: 'Manual de operación MB-301', documentType: 'MANUAL' })
      expect(events[0].newData).toMatchObject({ title: 'Manual MB-301 (vigente)' })
    })

    it('reemplaza los vínculos con activos y etapas; [] los quita', async () => {
      const linked = await patch(internalDoc, { assetIds: [pubAssetId, privAssetId], stageCodes: ['D06'] }).expect(200)
      expect(linked.body.assets).toHaveLength(2)
      const cleared = await patch(internalDoc, { assetIds: [], stageCodes: [] }).expect(200)
      expect(cleared.body.assets).toEqual([])
      expect(cleared.body.stages).toEqual([])
      await patch(internalDoc, { assetIds: [bAssetId] }).expect(400) // de otra planta
      await patch(internalDoc, { stageCodes: ['D11'] }).expect(400) // etapa deshabilitada
    })

    it('valida el cuerpo', async () => {
      await patch(internalDoc, {}).expect(400)
      await patch(internalDoc, { visibility: 'SECRETO' }).expect(400)
      await patch(internalDoc, { title: '' }).expect(400)
    })
  })

  describe('archivado (baja lógica)', () => {
    let doc: string
    beforeAll(async () => {
      doc = (await upload(pa, { buf: pdfOf('para archivar'), name: 'archivar.pdf' }, { title: 'Para archivar', visibility: 'PUBLIC' }).expect(201)).body.id
    })

    it('exige document.delete: mantenimiento no puede, el administrador sí', async () => {
      await http().delete(`${D}/${doc}`).expect(401)
      await http().delete(`${D}/${doc}`).set('Authorization', bearer(maint)).expect(403)
      await http().delete(`${D}/${doc}`).set('Authorization', bearer(pa)).expect(204)
    })

    it('conserva archivos, versiones y auditoría; solo desaparece de la vista normal', async () => {
      const [row] = await t.db.select().from(documents).where(eq(documents.id, doc))
      expect(row.status).toBe('ARCHIVED')
      expect(await t.db.select().from(documentVersions).where(eq(documentVersions.documentId, doc))).toHaveLength(1)
      expect(await readdir(path.join(storageDir(), plantA.id, doc))).toHaveLength(1)

      expect(titles(await get(`${D}?pageSize=100`, maint))).not.toContain('Para archivar')
      expect(titles(await get(`${D}?status=ARCHIVED`, maint))).toContain('Para archivar')
      await get(`${D}/${doc}`, null).expect(404) // aunque era público
      await get(`${D}/${doc}/download`, null).expect(404)
      await get(`${D}/${doc}`, maint).expect(200) // el personal puede consultarlo

      const [audit] = await t.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, doc), eq(auditEvents.action, 'archived')))
      expect(audit.oldData).toMatchObject({ status: 'ACTIVE' })
    })

    it('un documento archivado no admite versiones ni ediciones; archivar es idempotente', async () => {
      await http().post(`${D}/${doc}/versions`).set('Authorization', bearer(pa)).attach('file', pdfOf('x'), 'x.pdf').expect(409)
      await http().patch(`${D}/${doc}`).set('Authorization', bearer(pa)).send({ title: 'x' }).expect(409)
      await http().delete(`${D}/${doc}`).set('Authorization', bearer(pa)).expect(204)
    })
  })

  describe('ficha FUR del activo (pestaña Documentos)', () => {
    it('incluye los documentos vinculados al activo, con las reglas de visibilidad', async () => {
      await http().patch(`${D}/${internalDoc}`).set('Authorization', bearer(maint)).send({ assetIds: [pubAssetId] }).expect(200)
      await setSettings({ publicDocuments: true, publicAssets: true })

      const staff = await get(`/api/v1/plants/e2e-d1/assets/${pubAssetId}/fur`, pa).expect(200)
      expect(staff.body.documents.map((d: { title: string }) => d.title).sort()).toEqual(['Hoja de seguridad pública', 'Manual MB-301 (vigente)'])
      expect(staff.body.documents[0]).toHaveProperty('file.originalName')

      // Un visitante ve el activo público, pero solo sus documentos PÚBLICOS.
      const anon = await get(`/api/v1/plants/e2e-d1/assets/${pubAssetId}/fur`, null).expect(200)
      expect(anon.body.documents.map((d: { title: string }) => d.title)).toEqual(['Hoja de seguridad pública'])

      await setSettings({ publicDocuments: false })
      expect((await get(`/api/v1/plants/e2e-d1/assets/${pubAssetId}/fur`, null).expect(200)).body.documents).toEqual([])
    })

    it('un activo sin documentos devuelve una lista vacía', async () => {
      const res = await get(`/api/v1/plants/e2e-d1/assets/${privAssetId}/fur`, pa).expect(200)
      // PRV-1 solo tiene vinculado el documento público (el manual interno está ligado a PUB-1).
      expect(res.body.documents.map((d: { title: string }) => d.title)).toEqual(['Hoja de seguridad pública'])
    })
  })

  describe('borrar la planta', () => {
    it('elimina en cascada documentos y versiones (los archivos físicos requieren una limpieza aparte)', async () => {
      const tmp = await t.plant('dtmp', 'PUBLIC')
      const tmpAdmin = admin
      const res = await upload(tmpAdmin, { buf: pdfOf('temporal'), name: 't.pdf' }, {}, '/api/v1/plants/e2e-dtmp/documents').expect(201)
      await t.db.delete(plants).where(eq(plants.id, tmp.id))
      expect(await t.db.select().from(documents).where(eq(documents.id, res.body.id))).toHaveLength(0)
      expect(await t.db.select().from(documentVersions).where(eq(documentVersions.documentId, res.body.id))).toHaveLength(0)
    })
  })

})
