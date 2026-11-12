import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { lessonPlayback, lessonVideos } from '../src/database/schema'
import { LessonVideoService } from '../src/modules/lms/lesson-video.service'
import { runVideoTool } from '../src/modules/lms/video-tools'
import { createApp, PASSWORD, TestDb } from './helpers'

describe('Private lesson videos', () => {
  let app: INestApplication
  const db = new TestDb()
  let admin: string, learner: string, stranger: string, courseId: string, lessonId: string, source: string, ticket: string
  let directory: string, file: string
  const endpoint = () => `/api/v1/courses/${courseId}/lessons/${lessonId}`
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

  beforeAll(async () => {
    app = await createApp()
    directory = await mkdtemp(path.join(tmpdir(), 'fur-video-e2e-'))
    file = path.join(directory, 'sample.mp4')
    await runVideoTool(require('ffmpeg-static') as string, ['-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10', '-t', '2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], 30_000)
    for (const name of ['video-admin', 'video-learner', 'video-stranger']) await db.user(name, { isGlobalAdmin: name === 'video-admin' })
    const login = async (name: string) => (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: `${name}@e2e.fur.local`, password: PASSWORD }).expect(200)).body.accessToken as string
    ;[admin, learner, stranger] = await Promise.all(['video-admin', 'video-learner', 'video-stranger'].map(login))
    const course = await request(app.getHttpServer()).post('/api/v1/courses').set(auth(admin)).send({ ownerType: 'ECOSYSTEM', title: 'E2E Video Private', description: 'Aprende a identificar el equipo y revisar sus procedimientos de uso y mantenimiento a través de lecciones de video.', instructorName: 'Instructor', learningObjectives: ['Identificar el equipo'], targetAudience: ['Personal'], certificate: true, stageCodes: ['D06'] }).expect(201)
    courseId = course.body.id
    const added = await request(app.getHttpServer()).post(`/api/v1/courses/${courseId}/lessons`).set(auth(admin)).send({ title: 'E2E Video Lesson', content: 'Introducción al equipo', durationMinutes: 0 }).expect(201)
    lessonId = added.body.createdLessonId
    await request(app.getHttpServer()).patch(`/api/v1/courses/${courseId}`).set(auth(admin)).send({ status: 'PUBLISHED' }).expect(200)
    await request(app.getHttpServer()).post(`/api/v1/courses/${courseId}/enrollment`).set(auth(learner)).expect(201)
  }, 60_000)

  afterAll(async () => {
    if (lessonId) {
      // Remove files through the authorized API before fixture cascade cleanup.
      await request(app.getHttpServer()).delete(`${endpoint()}/video`).set(auth(admin))
    }
    await db.cleanup()
    await db.close()
    await app?.close()
    if (directory && path.resolve(directory).startsWith(path.join(path.resolve(tmpdir()), 'fur-video-e2e-'))) await rm(directory, { recursive: true, force: true })
  })

  it('checks ownership before accepting an upload and rejects non-video content', async () => {
    await request(app.getHttpServer()).post(`${endpoint()}/video`).set(auth(stranger)).attach('file', file).expect(403)
    await request(app.getHttpServer()).post(`${endpoint()}/video`).set(auth(admin)).attach('file', Buffer.from('not a video'), 'invalid.mp4').expect(400)
    expect(await db.db.select().from(lessonVideos).where(eq(lessonVideos.lessonId, lessonId))).toHaveLength(0)
  })

  it('queues and prepares a private fast-start MP4 without exposing storage keys', async () => {
    await request(app.getHttpServer()).post(`${endpoint()}/video`).set(auth(admin)).attach('file', file).expect(201).expect((res) => expect(res.body.status).toBe('PENDING'))
    await app.get(LessonVideoService).processNext()
    const response = await request(app.getHttpServer()).get(`/api/v1/courses/${courseId}`).set(auth(learner)).expect(200)
    const lesson = response.body.lessons[0]
    expect(lesson.video).toMatchObject({ status: 'READY', originalName: 'sample.mp4', durationSeconds: 2 })
    expect(JSON.stringify(response.body)).not.toContain('source_key')
    expect(JSON.stringify(response.body)).not.toContain('lms/videos/')
    source = lesson.playbackSource
    expect(source).toMatch(/^upload:/)
    const anonymous = await request(app.getHttpServer()).get(`/api/v1/courses/${courseId}`).expect(200)
    expect(anonymous.body.lessons[0]).toMatchObject({ video: null, videoUrl: null, playbackSource: null })
  }, 60_000)

  it('serves authorized byte ranges; playback tickets are not general access tokens', async () => {
    await request(app.getHttpServer()).post(`${endpoint()}/video/session`).set(auth(stranger)).expect(403)
    const session = await request(app.getHttpServer()).post(`${endpoint()}/video/session`).set(auth(learner)).expect(201)
    ticket = new URL(`http://test${session.body.path}`).searchParams.get('ticket')!
    const streamPath = `/api/v1${session.body.path}`
    await request(app.getHttpServer()).get(streamPath).set('Range', 'bytes=0-127').expect(206).expect('Content-Length', '128').expect((res) => expect(res.headers['content-range']).toMatch(/^bytes 0-127\/\d+$/))
    await request(app.getHttpServer()).get(streamPath).set('Range', 'bytes=999999999-').expect(416)
    await request(app.getHttpServer()).get(`${endpoint()}/video/stream?ticket=invalid`).expect(401)
    await request(app.getHttpServer()).get('/api/v1/auth/me').set(auth(ticket)).expect(401)
    const otherId = '00000000-0000-4000-8000-000000000001'
    await request(app.getHttpServer()).get(`/api/v1/courses/${courseId}/lessons/${otherId}/video/stream?ticket=${ticket}`).expect(401)
  })

  it('resumes separately per student and does not award completion for seeking to the end', async () => {
    await request(app.getHttpServer()).patch(`${endpoint()}/playback`).set(auth(stranger)).send({ source, positionSeconds: 0, durationSeconds: 2 }).expect(403)
    await request(app.getHttpServer()).patch(`${endpoint()}/playback`).set(auth(learner)).send({ source, positionSeconds: 0, durationSeconds: 2 }).expect(200)
    await request(app.getHttpServer()).patch(`${endpoint()}/playback`).set(auth(learner)).send({ source, positionSeconds: 2, durationSeconds: 2, ended: true }).expect(200).expect((res) => expect(res.body.completed).toBe(false))
    const course = await request(app.getHttpServer()).get(`/api/v1/courses/${courseId}`).set(auth(learner)).expect(200)
    expect(course.body.lessons[0].playback.positionSeconds).toBe(2)
    expect(course.body.myEnrollment.status).toBe('ENROLLED')
  })

  it('rejects an existing playback ticket after the student leaves the course', async () => {
    await request(app.getHttpServer()).post(`/api/v1/courses/${courseId}/enrollment`).set(auth(stranger)).expect(201)
    const session = await request(app.getHttpServer()).post(`${endpoint()}/video/session`).set(auth(stranger)).expect(201)
    await request(app.getHttpServer()).delete(`/api/v1/courses/${courseId}/enrollment`).set(auth(stranger)).expect(204)
    await request(app.getHttpServer()).get(`/api/v1${session.body.path}`).set('Range', 'bytes=0-10').expect(403)
  })

  it('automatically completes a watched video and issues the existing course certificate', async () => {
    await db.db.update(lessonPlayback).set({ positionSeconds: '0', watchedSeconds: '0', updatedAt: new Date(Date.now() - 3000) }).where(eq(lessonPlayback.lessonId, lessonId))
    await request(app.getHttpServer()).patch(`${endpoint()}/playback`).set(auth(learner)).send({ source, positionSeconds: 2, durationSeconds: 2, ended: true }).expect(200).expect((res) => expect(res.body.completed).toBe(true))
    const course = await request(app.getHttpServer()).get(`/api/v1/courses/${courseId}`).set(auth(learner)).expect(200)
    expect(course.body.myEnrollment).toMatchObject({ status: 'COMPLETED', progressPercent: 100 })
    expect(course.body.myEnrollment.certificateCode).toMatch(/^FUR-C-/)
  })

  it('revokes the old file when switching to an external URL and rejects stale bookmarks', async () => {
    await request(app.getHttpServer()).patch(`/api/v1/courses/${courseId}/lessons/${lessonId}`).set(auth(admin)).send({ videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' }).expect(200)
    await request(app.getHttpServer()).get(`${endpoint()}/video/stream?ticket=${ticket}`).expect(404)
    await request(app.getHttpServer()).patch(`${endpoint()}/playback`).set(auth(learner)).send({ source, positionSeconds: 1, durationSeconds: 2 }).expect(409)
    const [remaining] = await db.db.select().from(lessonVideos).where(eq(lessonVideos.lessonId, lessonId))
    expect(remaining).toBeUndefined()
  })

  it('reports a corrupt file as failed rather than making it playable', async () => {
    const invalid = Buffer.alloc(32)
    invalid.writeUInt32BE(32, 0)
    invalid.write('ftypisom', 4, 'ascii')
    await request(app.getHttpServer()).post(`${endpoint()}/video`).set(auth(admin)).attach('file', invalid, 'corrupt.mp4').expect(201)
    await app.get(LessonVideoService).processNext()
    const [video] = await db.db.select().from(lessonVideos).where(eq(lessonVideos.lessonId, lessonId))
    expect(video).toMatchObject({ status: 'FAILED', playbackKey: null })
    expect(video.error).toContain('vuelve a subirlo')
    await request(app.getHttpServer()).post(`${endpoint()}/video/session`).set(auth(learner)).expect(409)
  })

  it('recovers an abandoned processing lease after a restart', async () => {
    await request(app.getHttpServer()).post(`${endpoint()}/video`).set(auth(admin)).attach('file', file).expect(201)
    await db.db.update(lessonVideos).set({ status: 'PROCESSING', leaseAt: new Date(Date.now() - 120_000) }).where(eq(lessonVideos.lessonId, lessonId))
    await app.get(LessonVideoService).processNext()
    const [video] = await db.db.select().from(lessonVideos).where(and(eq(lessonVideos.lessonId, lessonId), eq(lessonVideos.status, 'READY')))
    expect(video.playbackKey).toBeTruthy()
    expect((await stat(file)).size).toBeGreaterThan(0)
  }, 60_000)
})
