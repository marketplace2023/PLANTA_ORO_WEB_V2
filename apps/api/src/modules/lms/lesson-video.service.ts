import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, mkdtemp, open, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { and, eq, sql } from 'drizzle-orm'
import type { AppRequest, AuthUser } from '../../common/types'
import type { Env } from '../../config/env'
import { DB, type Database } from '../../database/database.module'
import { courses, lessons, lessonVideos, users } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { StorageService } from '../documents/storage.service'
import { CoursesService } from './courses.service'
import { parseVideoProbe, runVideoTool } from './video-tools'

// Native executables are installed with the API, never downloaded during an upload.
const ffmpegDefault: string | null = require('ffmpeg-static')
const ffprobeDefault: { path: string } = require('ffprobe-static')

@Injectable()
export class LessonVideoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LessonVideoService.name)
  private readonly tickets: JwtService
  private timer?: NodeJS.Timeout
  private active?: Promise<void>
  private stopped = false
  constructor(@Inject(DB) private readonly db: Database, private readonly storage: StorageService,
    private readonly courseService: CoursesService, private readonly config: ConfigService<Env, true>, private readonly audit: AuditService) {
    // Different signing key: a playback ticket MUST NOT be accepted as a normal access token.
    const secret = createHash('sha256').update(`fur:lesson-video:${config.get('JWT_ACCESS_SECRET', { infer: true })}`).digest('hex')
    this.tickets = new JwtService({ secret, signOptions: { algorithm: 'HS256', audience: 'fur-lesson-video' } })
  }

  onModuleInit() {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return
    this.timer = setInterval(() => {
      if (!this.active && !this.stopped) {
        this.active = this.processNext().catch((error: unknown) => this.logger.error(error instanceof Error ? error.message : 'Error de procesamiento')).finally(() => { this.active = undefined })
      }
    }, 2000)
    this.timer.unref()
  }
  async onModuleDestroy() { this.stopped = true; clearInterval(this.timer); await this.active }

  async authorizeUpload(courseId: string, lessonId: string, user: AuthUser) {
    await this.courseService.assertManageLesson(courseId, lessonId, user)
  }

  async upload(courseId: string, lessonId: string, file: Express.Multer.File, user: AuthUser, req: AppRequest) {
    const id = randomUUID()
    const key = `lms/videos/${id}/source`
    let stored = false
    try {
      await this.authorizeUpload(courseId, lessonId, user)
      const ffmpeg = this.config.get('FFMPEG_PATH', { infer: true }) || ffmpegDefault
      const ffprobe = this.config.get('FFPROBE_PATH', { infer: true }) || ffprobeDefault.path
      try { if (!ffmpeg) throw new Error(); await Promise.all([access(ffmpeg), access(ffprobe)]) } catch { throw new ServiceUnavailableException('El procesador de video no está instalado en el servidor') }
      const handle = await open(file.path, 'r')
      const header = Buffer.alloc(16)
      try { await handle.read(header, 0, 16, 0) } finally { await handle.close() }
      const mp4 = header.toString('ascii', 4, 8) === 'ftyp'
      const webm = header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      if (!mp4 && !webm) throw new BadRequestException('Sube un archivo MP4, MOV o WebM válido')
      await this.storage.putFile(key, file.path)
      stored = true
      const old = await this.db.transaction(async (tx) => {
        await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).for('update')
        await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.id, lessonId)).for('update')
        const [before] = await tx.select().from(lessonVideos).where(eq(lessonVideos.lessonId, lessonId))
        if (before) await tx.delete(lessonVideos).where(eq(lessonVideos.id, before.id))
        await tx.insert(lessonVideos).values({ id, lessonId, sourceKey: key, originalName: path.basename(file.originalname).slice(0, 250), status: 'PENDING' })
        await tx.update(lessons).set({ videoUrl: null }).where(eq(lessons.id, lessonId))
        return before
      })
      if (old) await this.cleanup(old.sourceKey, old.playbackKey)
      await this.audit.record(req, { module: 'lms', entityType: 'lesson', entityId: lessonId, action: 'video.uploaded', newData: { courseId, videoId: id, size: file.size } })
      return { id, status: 'PENDING' }
    } catch (error) {
      if (stored) {
        const [saved] = await this.db.select({ id: lessonVideos.id }).from(lessonVideos).where(eq(lessonVideos.id, id))
        if (!saved) await this.cleanup(key)
      }
      throw error
    } finally { await rm(file.path, { force: true }).catch(() => undefined) }
  }

  private async cleanup(...keys: Array<string | null | undefined>) {
    for (const key of keys) if (key) await this.storage.delete(key).catch(() => this.logger.warn('No se pudo eliminar un archivo de video sustituido'))
  }

  async remove(courseId: string, lessonId: string, user: AuthUser, req: AppRequest) {
    await this.authorizeUpload(courseId, lessonId, user)
    const [old] = await this.db.delete(lessonVideos).where(eq(lessonVideos.lessonId, lessonId)).returning()
    if (old) await this.cleanup(old.sourceKey, old.playbackKey)
    await this.audit.record(req, { module: 'lms', entityType: 'lesson', entityId: lessonId, action: 'video.removed', oldData: { videoId: old?.id } })
  }

  /** Claim with a renewable lease. Restarted/abandoned jobs become available after one minute. */
  async processNext() {
    const lease = randomUUID()
    const row = await this.db.transaction(async (tx) => {
      const [candidate] = await tx.select().from(lessonVideos)
        .where(sql`${lessonVideos.status} = 'PENDING' or (${lessonVideos.status} = 'PROCESSING' and ${lessonVideos.leaseAt} < now() - interval '1 minute')`)
        .orderBy(lessonVideos.createdAt).limit(1).for('update', { skipLocked: true })
      if (!candidate) return null
      await tx.update(lessonVideos).set({ status: 'PROCESSING', leaseToken: lease, leaseAt: new Date(), error: null }).where(eq(lessonVideos.id, candidate.id))
      return candidate
    })
    if (!row) return
    const owns = and(eq(lessonVideos.id, row.id), eq(lessonVideos.leaseToken, lease))
    const heartbeat = setInterval(() => { void this.db.update(lessonVideos).set({ leaseAt: new Date() }).where(owns).catch(() => undefined) }, 15_000)
    let directory: string | undefined
    const outputKey = `lms/videos/${row.id}/${lease}.mp4`
    try {
      directory = await mkdtemp(path.join(tmpdir(), 'fur-video-process-'))
      const input = path.join(directory, 'input')
      const output = path.join(directory, 'playback.mp4')
      await pipeline(await this.storage.open(row.sourceKey), createWriteStream(input, { flags: 'wx' }))
      const probe = this.config.get('FFPROBE_PATH', { infer: true }) || ffprobeDefault.path
      const encoder = this.config.get('FFMPEG_PATH', { infer: true }) || ffmpegDefault!
      const duration = parseVideoProbe(await runVideoTool(probe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', input], 60_000))
      await runVideoTool(encoder, ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn', '-vf', "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', output], 30 * 60_000)
      await this.storage.putFile(outputKey, output)
      const size = (await stat(output)).size
      const saved = await this.db.transaction(async (tx) => {
        const [lesson] = await tx.select({ courseId: lessons.courseId }).from(lessons).where(eq(lessons.id, row.lessonId))
        if (!lesson) return false
        await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, lesson.courseId)).for('update')
        const [updated] = await tx.update(lessonVideos).set({ status: 'READY', playbackKey: outputKey, durationSeconds: String(duration), sizeBytes: String(size), leaseToken: null, leaseAt: null }).where(owns).returning({ id: lessonVideos.id })
        if (!updated) return false
        await tx.update(lessons).set({ durationMinutes: Math.ceil(duration / 60) }).where(eq(lessons.id, row.lessonId))
        await tx.update(courses).set({ durationMinutes: sql`(select coalesce(sum(duration_minutes),0)::int from lms.lessons where course_id = ${lesson.courseId})` }).where(eq(courses.id, lesson.courseId))
        return true
      })
      if (!saved) await this.cleanup(outputKey)
    } catch (error) {
      this.logger.warn(`Video ${row.id}: ${error instanceof Error ? error.message : 'error'}`)
      await this.db.update(lessonVideos).set({ status: 'FAILED', error: 'No se pudo preparar el video. Comprueba el archivo y vuelve a subirlo.', leaseToken: null, leaseAt: null }).where(owns)
      await this.cleanup(outputKey)
    } finally {
      clearInterval(heartbeat)
      if (directory) {
        const resolved = path.resolve(directory)
        if (!resolved.startsWith(path.join(path.resolve(tmpdir()), 'fur-video-process-'))) throw new Error('Carpeta temporal inesperada')
        await rm(resolved, { recursive: true, force: true })
      }
    }
  }

  async session(courseId: string, lessonId: string, user: AuthUser) {
    await this.courseService.assertReadLesson(courseId, lessonId, user)
    const [video] = await this.db.select().from(lessonVideos).where(eq(lessonVideos.lessonId, lessonId))
    if (!video || video.status !== 'READY') throw new ConflictException('El video todavía no está disponible')
    const ticket = await this.tickets.signAsync({ sub: user.id, courseId, lessonId, videoId: video.id, kind: 'lesson-video' }, { expiresIn: '4h' })
    return { path: `/courses/${courseId}/lessons/${lessonId}/video/stream?ticket=${encodeURIComponent(ticket)}`, expiresAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString() }
  }

  async stream(courseId: string, lessonId: string, ticket: string) {
    let claims: { sub: string; courseId: string; lessonId: string; videoId: string; kind: string }
    try { claims = await this.tickets.verifyAsync(ticket, { algorithms: ['HS256'], audience: 'fur-lesson-video' }) } catch { throw new UnauthorizedException('Acceso de reproducción vencido o inválido') }
    if (claims.kind !== 'lesson-video' || claims.courseId !== courseId || claims.lessonId !== lessonId) throw new UnauthorizedException('Acceso de reproducción inválido')
    const [user] = await this.db.select().from(users).where(and(eq(users.id, claims.sub), eq(users.status, 'ACTIVE')))
    if (!user) throw new UnauthorizedException('Usuario no disponible')
    await this.courseService.assertReadLesson(courseId, lessonId, user)
    const [video] = await this.db.select().from(lessonVideos).where(and(eq(lessonVideos.lessonId, lessonId), eq(lessonVideos.id, claims.videoId), eq(lessonVideos.status, 'READY')))
    if (!video?.playbackKey) throw new NotFoundException('Video no disponible')
    return { key: video.playbackKey, size: Number(video.sizeBytes) }
  }
}
