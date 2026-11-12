import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Course cover uploads', () => {
  let app: INestApplication, db: TestDb, admin: Session, student: Session
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBz8AAAAASUVORK5CYII=', 'base64')
  const upload = (id: string, file = image, filename = 'cover.png', session = admin) => request(app.getHttpServer()).post(`/api/v1/courses/${id}/cover`).set('Authorization', bearer(session)).attach('file', file, filename)
  const create = async () => (await request(app.getHttpServer()).post('/api/v1/courses').set('Authorization', bearer(admin)).send({ownerType:'ECOSYSTEM',title:'E2E Cover Course',level:'BASIC',description:'Aprende a identificar y preparar los equipos industriales para realizar su mantenimiento de forma segura.',instructorName:'Instructor',learningObjectives:['Preparar equipos'],targetAudience:['Personal de planta']}).expect(201)).body
  const patch = (id: string, body: object) => request(app.getHttpServer()).patch(`/api/v1/courses/${id}`).set('Authorization', bearer(admin)).send(body)

  beforeAll(async () => {
    app = await createApp(); db = new TestDb()
    await db.user('cover-admin',{isGlobalAdmin:true}); await db.user('cover-student')
    admin = await login(app,'cover-admin'); student = await login(app,'cover-student')
  })
  afterAll(async () => { await db.cleanup(); await db.close(); await app.close() })

  it('shares actual image bytes after publication and preserves a cover on metadata updates', async () => {
    const course = await create()
    const saved = await upload(course.id).expect(201)
    expect(saved.body.coverSource).toBe('upload')
    expect(saved.body.coverUrl).toMatch(new RegExp(`^/courses/${course.id}/cover\\?v=\\d+$`))
    expect(saved.body).not.toHaveProperty('coverKey')
    const path = `/api/v1${saved.body.coverUrl}`
    await request(app.getHttpServer()).get(path).expect(404)
    const draftImage = await request(app.getHttpServer()).get(path).set('Authorization',bearer(admin)).expect(200)
    expect(draftImage.headers['content-type']).toContain('image/png')
    expect(draftImage.headers['cache-control']).toBe('private, no-store')
    expect(draftImage.body.equals(image)).toBe(true)
    await patch(course.id,{subtitle:'A new subtitle'}).expect(200).expect(r=>expect(r.body.coverUrl).toBe(saved.body.coverUrl))
    await request(app.getHttpServer()).post(`/api/v1/courses/${course.id}/lessons`).set('Authorization',bearer(admin)).send({title:'Introduction',content:'Course content'}).expect(201)
    await patch(course.id,{status:'PUBLISHED'}).expect(200)
    await request(app.getHttpServer()).get(path).expect(200)
    await patch(course.id,{status:'ARCHIVED'}).expect(200)
    await request(app.getHttpServer()).get(path).expect(404)
    await patch(course.id,{coverUrl:'https://example.com/cover.jpg'}).expect(200).expect(r=>expect(r.body.coverSource).toBe('url'))
    await request(app.getHttpServer()).get(path).set('Authorization',bearer(admin)).expect(404)
  })

  it('authorizes before accepting files and rejects invalid or oversized images', async () => {
    const course = await create()
    await upload(course.id,image,'cover.png',student).expect(404)
    await upload('invalid-id').expect(400)
    await upload(course.id,Buffer.from('<html>download page</html>')).expect(415)
    await upload(course.id,Buffer.from('<svg></svg>'),'cover.svg').expect(415)
    await upload(course.id,Buffer.alloc(5*1024*1024+1)).expect(413)
    await upload(course.id).expect(201)
    await patch(course.id,{coverUrl:null}).expect(200).expect(r=>expect(r.body.coverUrl).toBeNull())
    await request(app.getHttpServer()).get(`/api/v1/courses/${course.id}/cover`).set('Authorization',bearer(admin)).expect(404)
  })
})
