import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Structured course authoring', () => {
  let app: INestApplication, db: TestDb, admin: Session, stranger: Session
  const full = { ownerType: 'ECOSYSTEM', title: 'E2E Authoring Course', description: 'Aprende a preparar el trabajo, identificar riesgos y aplicar procedimientos de mantenimiento preventivo en equipos industriales.', instructorName: 'María Rodríguez', learningObjectives: ['Preparar un plan de trabajo'], requirements: ['Conocimientos básicos de mantenimiento'], targetAudience: ['Técnicos de mantenimiento'], category: 'Mantenimiento', subtitle: 'Procedimientos aplicados', language: 'es', price: 95, currency: 'USD' }
  const create = async (over = {}) => (await request(app.getHttpServer()).post('/api/v1/courses').set('Authorization', bearer(admin)).send({...full, ...over}).expect(201)).body
  const patch = (id: string, body: object) => request(app.getHttpServer()).patch(`/api/v1/courses/${id}`).set('Authorization', bearer(admin)).send(body)
  const add = (id: string, body: object) => request(app.getHttpServer()).post(`/api/v1/courses/${id}/lessons`).set('Authorization', bearer(admin)).send(body)

  beforeAll(async () => {
    app = await createApp(); db = new TestDb()
    await db.user('builder-admin', {isGlobalAdmin:true}); await db.user('builder-student')
    admin = await login(app, 'builder-admin'); stranger = await login(app, 'builder-student')
  })
  afterAll(async () => { await db.cleanup(); await db.close(); await app.close() })

  it('persists the landing page and publishes independently of stage parameters', async () => {
    const course = await create({stageCodes: ['NONEXISTENT'], instructorBio: 'Experiencia en mantenimiento industrial', coverUrl: 'https://media.example/course.jpg'})
    expect(course).toMatchObject({category: 'Mantenimiento', learningObjectives: full.learningObjectives, targetAudience: full.targetAudience, stages: []})
    expect(course.sections).toHaveLength(1)
    expect(course.publication.ready).toBe(false)
    await add(course.id, {title: 'Preparación', content: 'Planifica la intervención antes de empezar.', sectionId: course.sections[0].id}).expect(201)
    await patch(course.id, {price: 120}).expect(200).expect(res => {
      expect(res.body.learningObjectives).toEqual(full.learningObjectives)
      expect(res.body.category).toBe('Mantenimiento')
      expect(res.body.publication.ready).toBe(true)
    })
    await patch(course.id, {status:'PUBLISHED'}).expect(200)
    const list = await request(app.getHttpServer()).get('/api/v1/courses?category=Mantenimiento&stage=D19&search=E2E%20Authoring').expect(200)
    expect(list.body.items.map((c: {id:string}) => c.id)).toContain(course.id)
  })

  it('blocks publication until objectives, audience and actual lesson content exist', async () => {
    const course = await create({learningObjectives: [], targetAudience: [], description: 'Breve'})
    const result = await patch(course.id, {status:'PUBLISHED'}).expect(400)
    expect(JSON.stringify(result.body)).toMatch(/objetivo/)
    await add(course.id, {title: 'Vacía'}).expect(201)
    await patch(course.id, {...full, status:'PUBLISHED'}).expect(400).expect(res => expect(JSON.stringify(res.body)).toContain('contenido'))
  })

  it('orders modules and lessons, rejects foreign modules, and preserves student progress', async () => {
    const course = await create()
    const first = course.sections[0]
    const response = await request(app.getHttpServer()).post(`/api/v1/courses/${course.id}/sections`).set('Authorization', bearer(admin)).send({title:'Diagnóstico'}).expect(201)
    const second = response.body.sections[1]
    const added = await add(course.id, {title:'Primera', content:'Contenido', sectionId:first.id}).expect(201)
    const lessonId = added.body.createdLessonId
    await add(course.id, {title:'Segunda', content:'Contenido', sectionId:second.id}).expect(201)
    const other = await create({title:'E2E Another Course'})
    await add(course.id, {title:'Foreign', sectionId:other.sections[0].id}).expect(400)
    await request(app.getHttpServer()).patch(`/api/v1/courses/${course.id}/sections/${first.id}`).set('Authorization', bearer(stranger)).send({title:'Hack'}).expect(404)
    await patch(course.id, {status:'PUBLISHED'}).expect(200)
    await request(app.getHttpServer()).post(`/api/v1/courses/${course.id}/enrollment`).set('Authorization', bearer(stranger)).expect(201)
    await request(app.getHttpServer()).post(`/api/v1/courses/${course.id}/lessons/${lessonId}/complete`).set('Authorization', bearer(stranger)).expect(201)
    const moved = await request(app.getHttpServer()).patch(`/api/v1/courses/${course.id}/sections/${second.id}`).set('Authorization', bearer(admin)).send({position:0}).expect(200)
    expect(moved.body.sections.map((s: {id:string})=>s.id)).toEqual([second.id, first.id])
    expect(moved.body.lessons.map((l: {title:string})=>l.title)).toEqual(['Segunda','Primera'])
    await request(app.getHttpServer()).patch(`/api/v1/courses/${course.id}/lessons/${lessonId}`).set('Authorization', bearer(admin)).send({sectionId:second.id}).expect(200)
    await request(app.getHttpServer()).delete(`/api/v1/courses/${course.id}/sections/${second.id}`).set('Authorization', bearer(admin)).expect(409)
    await request(app.getHttpServer()).delete(`/api/v1/courses/${course.id}/sections/${first.id}`).set('Authorization', bearer(admin)).expect(200)
    const learner = await request(app.getHttpServer()).get(`/api/v1/courses/${course.id}`).set('Authorization', bearer(stranger)).expect(200)
    expect(learner.body.lessons.find((l: {id:string})=>l.id===lessonId)).toMatchObject({completed:true, sectionId:second.id})
    expect(learner.body.myEnrollment.progressPercent).toBe(50)
  })

  it('validates lists, media protocols and partial updates', async () => {
    for (const over of [{learningObjectives:['']},{requirements:Array(31).fill('x')},{coverUrl:'javascript:alert(1)'},{language:'xx'}]) await request(app.getHttpServer()).post('/api/v1/courses').set('Authorization', bearer(admin)).send({...full,...over}).expect(400)
    const course = await create()
    await patch(course.id, {title:'E2E Updated'}).expect(200).expect(res => expect(res.body).toMatchObject({learningObjectives:full.learningObjectives, requirements:full.requirements, category:full.category}))
  })

  it('serializes publication against deleting the last lesson', async () => {
    const course = await create()
    const added = await add(course.id, {title:'Única lección',content:'Contenido de la lección'}).expect(201)
    const results = await Promise.all([
      patch(course.id, {status:'PUBLISHED'}),
      request(app.getHttpServer()).delete(`/api/v1/courses/${course.id}/lessons/${added.body.createdLessonId}`).set('Authorization',bearer(admin)),
    ])
    expect(results.some(r=>r.status>=400)).toBe(true)
    const state = await request(app.getHttpServer()).get(`/api/v1/courses/${course.id}`).set('Authorization',bearer(admin)).expect(200)
    expect(state.body.status!=='PUBLISHED' || state.body.lessons.length>0).toBe(true)
  })
})
