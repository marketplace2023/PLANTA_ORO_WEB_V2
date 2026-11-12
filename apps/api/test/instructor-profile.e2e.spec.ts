import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { bearer, createApp, login, type Session, TestDb } from './helpers'

describe('Instructor profiles',()=>{
  let app:INestApplication, db:TestDb, admin:Session, student:Session
  beforeAll(async()=>{app=await createApp();db=new TestDb();await db.user('profile-admin',{isGlobalAdmin:true});await db.user('profile-student');admin=await login(app,'profile-admin');student=await login(app,'profile-student')})
  afterAll(async()=>{await db.cleanup();await db.close();await app.close()})
  it('links a reusable profile explicitly, shares its photo through course visibility, and propagates edits',async()=>{
    const server=app.getHttpServer(), auth=bearer(admin)
    await request(server).get('/api/v1/instructors/me').set('Authorization',auth).expect(200).expect(r=>expect(r.body.profile).toBeNull())
    await request(server).patch('/api/v1/instructors/me').set('Authorization',auth).send({name:'Instructor Demo',headline:'Ingeniero',bio:'Experiencia industrial'}).expect(200)
    await request(server).post('/api/v1/instructors/me/avatar').set('Authorization',auth).attach('file',Buffer.from('<html>invalid</html>'),'photo.png').expect(415)
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBz8AAAAASUVORK5CYII=','base64')
    const profile=await request(server).post('/api/v1/instructors/me/avatar').set('Authorization',auth).attach('file',png,'photo.png').expect(201)
    const image=`/api/v1${profile.body.avatarUrl}`
    await request(server).get(image).expect(404)
    await request(server).get(image).set('Authorization',auth).expect(200)
    const course=await request(server).post('/api/v1/courses').set('Authorization',auth).send({title:'E2E Instructor Profile',ownerType:'ECOSYSTEM',instructorName:'Previous instructor'}).expect(201)
    expect(course.body.instructor).toBeNull()
    const path=`/api/v1/courses/${course.body.id}/instructor-profile`
    await request(server).post(path).set('Authorization',bearer(student)).expect(404)
    const linked=await request(server).post(path).set('Authorization',auth).expect(201)
    expect(linked.body.instructor.name).toBe('Instructor Demo')
    expect(linked.body.instructor.avatarUrl).toBe(profile.body.avatarUrl)
    await request(server).get(image).set('Authorization',bearer(student)).expect(404)
    await request(server).patch(`/api/v1/courses/${course.body.id}`).set('Authorization',auth).send({description:'Aprende a preparar la perforacion de pozos, identificar sus riesgos y ejecutar el trabajo con procedimientos seguros.',learningObjectives:['Preparar el trabajo'],targetAudience:['Personal de planta']}).expect(200)
    await request(server).post(`/api/v1/courses/${course.body.id}/lessons`).set('Authorization',auth).send({title:'Preparacion',content:'Contenido de la leccion'}).expect(201)
    await request(server).patch(`/api/v1/courses/${course.body.id}`).set('Authorization',auth).send({status:'PUBLISHED'}).expect(200)
    await request(server).get(image).expect(200)
    await request(server).patch(`/api/v1/courses/${course.body.id}`).set('Authorization',auth).send({status:'ARCHIVED'}).expect(200)
    await request(server).get(image).expect(404)
    await request(server).patch('/api/v1/instructors/me').set('Authorization',auth).send({name:'Updated instructor',bio:'New biography'}).expect(200)
    await request(server).get(`/api/v1/courses/${course.body.id}`).set('Authorization',auth).expect(200).expect(r=>expect(r.body).toMatchObject({instructorName:'Updated instructor',instructorBio:'New biography'}))
    await request(server).delete(path).set('Authorization',auth).expect(200).expect(r=>expect(r.body.instructor).toBeNull())
    await request(server).delete('/api/v1/instructors/me/avatar').set('Authorization',auth).expect(200)
    await request(server).get(image).set('Authorization',auth).expect(404)
  })
})
