import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm'
import { validationError } from '../../common/errors'
import { escapeLike, pageOf } from '../../common/pagination'
import type { AppRequest, AuthUser } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { contractors, instructorProfiles, courseSections, courses, enrollments, lessonPlayback, lessonProgress, lessons, lessonVideos, providers, users } from '../../database/schema'
import { videoSource } from './video-tools'
import { coursePublication } from './course-publication'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../organizations/org-access.service'
import { StorageService } from '../documents/storage.service'
import type { ImageUpload } from '../documents/image-upload'
import type { CreateCourseDto, LessonDto, ListCoursesQuery, ManageQuery, UpdateCourseDto, UpdateLessonDto, SectionDto, UpdateSectionDto } from './lms.schemas'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type CourseRow = typeof courses.$inferSelect

@Injectable()
export class CoursesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: OrgAccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ---------- Propietario y permisos ----------

  /** Organización propietaria con su estado, para decidir visibilidad y quién gestiona. */
  private async owner(c: Pick<CourseRow, 'providerType' | 'providerId' | 'contractorId'>) {
    if (c.providerType === 'PROVIDER' && c.providerId) {
      const [p] = await this.db.select({ name: providers.organizationName, status: providers.status, verified: providers.verified }).from(providers).where(eq(providers.id, c.providerId))
      return { type: 'PROVIDER' as const, id: c.providerId, name: p?.name ?? '—', active: p?.status === 'ACTIVE', verified: p?.verified ?? false }
    }
    if (c.providerType === 'CONTRACTOR' && c.contractorId) {
      const [p] = await this.db.select({ name: contractors.organizationName, status: contractors.status, verified: contractors.verified }).from(contractors).where(eq(contractors.id, c.contractorId))
      return { type: 'CONTRACTOR' as const, id: c.contractorId, name: p?.name ?? '—', active: p?.status === 'ACTIVE', verified: p?.verified ?? false }
    }
    return { type: 'ECOSYSTEM' as const, id: null, name: 'Ecosistema FUR', active: true, verified: true }
  }

  /** ¿Gestiona este curso? Administrador del ecosistema, o miembro de la organización propietaria. */
  async canManage(c: Pick<CourseRow, 'providerType' | 'providerId' | 'contractorId'>, user: AuthUser | undefined): Promise<boolean> {
    if (!user) return false
    if (user.isGlobalAdmin) return true
    if (c.providerType === 'PROVIDER' && c.providerId) return !!(await this.access.roleOf('provider', c.providerId, user.id))
    if (c.providerType === 'CONTRACTOR' && c.contractorId) return !!(await this.access.roleOf('contractor', c.contractorId, user.id))
    return false
  }

  private async loadForManage(id: string, user: AuthUser | undefined) {
    const [course] = await this.db.select().from(courses).where(eq(courses.id, id))
    if (!course) throw new NotFoundException('Curso no encontrado')
    if (!(await this.canManage(course, user))) {
      // Quien no gestiona el curso no debe poder distinguir un borrador de un curso inexistente.
      if (course.status === 'DRAFT') throw new NotFoundException('Curso no encontrado')
      throw new ForbiddenException('No gestionas este curso')
    }
    return course
  }

  async assertManageLesson(courseId: string, lessonId: string, user: AuthUser) {
    await this.loadForManage(courseId, user)
    const [lesson] = await this.db.select().from(lessons).where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId)))
    if (!lesson) throw new NotFoundException('Lección no encontrada')
    return lesson
  }

  async assertManageCourse(id: string, user: AuthUser) { return this.loadForManage(id, user) }

  async saveCover(id: string, image: ImageUpload, version: string, user: AuthUser, req: AppRequest) {
    await this.loadForManage(id, user)
    const key = `lms/covers/${id}/${version}.${image.extension}`
    await this.storage.put(key, image.data)
    let before: CourseRow | undefined
    try {
      before = await this.db.transaction(async tx => {
        const [current] = await tx.select().from(courses).where(eq(courses.id, id)).for('update')
        if (!current) throw new NotFoundException('Curso no encontrado')
        await tx.update(courses).set({coverKey:key,coverMime:image.mimeType,coverUpdatedAt:new Date(),coverUrl:null,updatedAt:new Date()}).where(eq(courses.id,id))
        return current
      })
    } catch (error) { await this.storage.delete(key).catch(() => undefined); throw error }
    if (before?.coverKey) await this.storage.delete(before.coverKey).catch(() => undefined)
    await this.audit.record(req,{module:'lms',entityType:'course',entityId:id,action:'cover.updated',newData:{mimeType:image.mimeType,sizeBytes:image.data.length}})
    return this.get(id,user)
  }

  async openCover(id: string, user?: AuthUser) {
    await this.get(id,user)
    const [course] = await this.db.select().from(courses).where(eq(courses.id,id))
    if (!course?.coverKey || !course.coverMime) return null
    const stream = await this.storage.open(course.coverKey).catch(() => { throw new NotFoundException('Portada no disponible') })
    return {stream,mime:course.coverMime}
  }

  async assertReadLesson(courseId: string, lessonId: string, user: AuthUser) {
    const course = await this.get(courseId, user)
    if (!course.canManage && (!course.myEnrollment || course.myEnrollment.status === 'DROPPED')) throw new ForbiddenException('Inscríbete en el curso para reproducir sus videos')
    const lesson = course.lessons.find((item) => item.id === lessonId)
    if (!lesson) throw new NotFoundException('Lección no encontrada')
    return lesson
  }

  private async discardVideo(video: typeof lessonVideos.$inferSelect | undefined) {
    if (!video) return
    for (const key of [video.sourceKey, video.playbackKey]) if (key) await this.storage.delete(key).catch(() => undefined)
  }

  // ---------- Etiquetas ----------

  private async lessonCounts(ids: string[]) {
    if (ids.length === 0) return new Map<string, number>()
    const rows = await this.db.select({ courseId: lessons.courseId, n: sql<number>`count(*)::int` }).from(lessons).where(inArray(lessons.courseId, ids)).groupBy(lessons.courseId)
    return new Map(rows.map((r) => [r.courseId, r.n]))
  }

  private async myEnrollments(ids: string[], user: AuthUser | undefined) {
    if (!user || ids.length === 0) return new Map<string, { status: string; progressPercent: number }>()
    const rows = await this.db.select().from(enrollments).where(and(eq(enrollments.userId, user.id), inArray(enrollments.courseId, ids)))
    return new Map(rows.map((r) => [r.courseId, { status: r.status, progressPercent: Number(r.progressPercent) }]))
  }

  private async toCards(rows: CourseRow[], user: AuthUser | undefined) {
    const ids = rows.map((r) => r.id)
    const [counts, mine] = await Promise.all([this.lessonCounts(ids), this.myEnrollments(ids, user)])
    return Promise.all(
      rows.map(async (c) => {
        const [profile] = c.instructorProfileId ? await this.db.select().from(instructorProfiles).where(eq(instructorProfiles.id,c.instructorProfileId)) : []
        const owner = await this.owner(c)
        return {
          id: c.id,
          title: c.title,
          description: c.description,
          level: c.level,
          durationMinutes: c.durationMinutes,
          certificate: c.certificate,
          /** Precio fijado por quien ofrece el curso; 0 = gratuito. */
          price: Number(c.price),
          currency: c.currency,
          instructorName: profile?.name ?? c.instructorName,
          status: c.status,
          owner: { type: owner.type, id: owner.id, name: owner.name, verified: owner.verified },
          stages: [], // Compatibility field; stage links are historical and no longer drive courses.
          subtitle: c.subtitle, category: c.category, language: c.language,
          coverUrl: c.coverKey && c.coverUpdatedAt ? `/courses/${c.id}/cover?v=${c.coverUpdatedAt.getTime()}` : c.coverUrl,
          coverSource: c.coverKey ? 'upload' : c.coverUrl ? 'url' : null,
          promoVideoUrl: c.promoVideoUrl, instructorBio: profile?.bio ?? c.instructorBio,
          instructorProfileId: c.instructorProfileId,
          instructor: profile ? {id:profile.id,name:profile.name,headline:profile.headline,bio:profile.bio,avatarUrl:profile.avatarKey ? `/instructors/${profile.id}/avatar?v=${profile.updatedAt.getTime()}` : null} : null,
          learningObjectives: c.learningObjectives, requirements: c.requirements, targetAudience: c.targetAudience,
          lessonCount: counts.get(c.id) ?? 0,
          myEnrollment: mine.get(c.id) ?? null,
          createdAt: c.createdAt,
        }
      }),
    )
  }

  // ---------- Lectura pública ----------

  /** El catálogo solo muestra cursos PUBLICADOS de organizaciones ACTIVAS (los del ecosistema siempre). */
  async list(q: ListCoursesQuery, user: AuthUser | undefined) {
    const conditions: Array<SQL | undefined> = [
      eq(courses.status, 'PUBLISHED'),
      sql`(${courses.providerType} = 'ECOSYSTEM'
        or (${courses.providerType} = 'PROVIDER' and exists (select 1 from ${providers} p where p.id = ${courses.providerId} and p.status = 'ACTIVE'))
        or (${courses.providerType} = 'CONTRACTOR' and exists (select 1 from ${contractors} k where k.id = ${courses.contractorId} and k.status = 'ACTIVE')))`,
      q.level ? eq(courses.level, q.level) : undefined,
      q.category ? eq(courses.category, q.category) : undefined,
      q.ownerType ? eq(courses.providerType, q.ownerType) : undefined,
      q.providerId ? eq(courses.providerId, q.providerId) : undefined,
      q.contractorId ? eq(courses.contractorId, q.contractorId) : undefined,
      q.maxMinutes !== undefined ? lte(courses.durationMinutes, q.maxMinutes) : undefined,
      q.certificate === '1' ? eq(courses.certificate, true) : undefined,
      q.free === '1' ? sql`${courses.price} = 0` : q.free === '0' ? sql`${courses.price} > 0` : undefined,
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(courses.title, like), ilike(courses.description, like), ilike(courses.instructorName, like)))
    }
    const where = and(...conditions)
    const order =
      q.sort === 'newest' ? [desc(courses.createdAt)]
      : q.sort === 'duration' ? [asc(courses.durationMinutes), asc(courses.title)]
      : q.sort === 'price_asc' ? [asc(courses.price), asc(courses.title)]
      : q.sort === 'price_desc' ? [desc(courses.price), asc(courses.title)]
      : [asc(courses.title)]
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(courses)
        .where(where)
        .orderBy(...order, asc(courses.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(courses).where(where),
    ])
    return pageOf(await this.toCards(rows, user), total, q.page, q.pageSize)
  }

  /**
   * Visible para todos si está publicado y su organización está activa; además para quien lo gestiona y para quien
   * ya está inscrito (un curso archivado no se les quita a mitad de camino). Los borradores solo los ve quien gestiona.
   */
  async get(id: string, user: AuthUser | undefined) {
    const [course] = await this.db.select().from(courses).where(eq(courses.id, id))
    if (!course) throw new NotFoundException('Curso no encontrado')
    const owner = await this.owner(course)
    const manager = await this.canManage(course, user)
    const [mine] = user ? await this.db.select().from(enrollments).where(and(eq(enrollments.courseId, id), eq(enrollments.userId, user.id))) : []
    const publicVisible = course.status === 'PUBLISHED' && owner.active
    const learnerVisible = !!mine && mine.status !== 'DROPPED' && course.status !== 'DRAFT' && owner.active
    if (!publicVisible && !manager && !learnerVisible) throw new NotFoundException('Curso no encontrado')

    const rows = await this.db.select().from(lessons).where(eq(lessons.courseId, id)).orderBy(asc(lessons.position), asc(lessons.id))
    const done = mine ? new Set((await this.db.select({ lessonId: lessonProgress.lessonId }).from(lessonProgress).where(eq(lessonProgress.enrollmentId, mine.id))).map((r) => r.lessonId)) : new Set<string>()
    // El contenido es para quien lo estudia (inscrito) o lo gestiona; el público ve el temario.
    const canRead = manager || (!!mine && mine.status !== 'DROPPED')
    const media = canRead && rows.length ? await this.db.select().from(lessonVideos).where(inArray(lessonVideos.lessonId, rows.map((row) => row.id))) : []
    const playback = canRead && mine ? await this.db.select().from(lessonPlayback).where(eq(lessonPlayback.enrollmentId, mine.id)) : []

    const [card] = await this.toCards([course], user)
    return {
      ...card,
      canManage: manager,
      sections: await this.db.select().from(courseSections).where(eq(courseSections.courseId, id)).orderBy(asc(courseSections.position), asc(courseSections.id)),
      publication: manager ? coursePublication(course, rows.map(l => ({ ...l, video: media.find(v => v.lessonId === l.id) })), owner.active) : undefined,
      lessons: rows.map((l) => {
        const video = media.find((item) => item.lessonId === l.id)
        const source = videoSource(l.videoUrl, video?.id)
        const saved = playback.find((item) => item.lessonId === l.id && item.source === source)
        return {
        id: l.id,
        sectionId: l.sectionId,
        position: l.position,
        title: l.title,
        durationMinutes: l.durationMinutes,
        content: canRead ? l.content : null,
        videoUrl: canRead ? l.videoUrl : null,
        playbackSource: canRead ? source : null,
        completed: done.has(l.id),
        video: video ? { id: video.id, status: video.status, originalName: video.originalName, durationSeconds: video.durationSeconds === null ? null : Number(video.durationSeconds), error: video.error } : null,
        playback: saved ? { positionSeconds: Number(saved.positionSeconds), durationSeconds: Number(saved.durationSeconds), watchedSeconds: Number(saved.watchedSeconds) } : null,
      }}),
      myEnrollment: mine
        ? { id: mine.id, status: mine.status, progressPercent: rows.length === 0 ? 0 : Math.round((done.size / rows.length) * 10_000) / 100, startedAt: mine.startedAt, completedAt: mine.completedAt, certificateCode: mine.certificateCode }
        : null,
    }
  }

  // ---------- Gestión ----------

  async manageList(q: ManageQuery, user: AuthUser) {
    if (q.ownerType === 'ECOSYSTEM') {
      if (!user.isGlobalAdmin) throw new ForbiddenException('Solo el administrador del ecosistema gestiona los cursos del ecosistema')
    } else {
      if (!q.ownerId) throw validationError('ownerId', 'Indique la organización')
      await this.access.assertManage(q.ownerType === 'PROVIDER' ? 'provider' : 'contractor', q.ownerId, user)
    }
    const where = and(
      eq(courses.providerType, q.ownerType),
      q.ownerType === 'PROVIDER' ? eq(courses.providerId, q.ownerId!) : q.ownerType === 'CONTRACTOR' ? eq(courses.contractorId, q.ownerId!) : undefined,
      q.status === 'ALL' ? undefined : eq(courses.status, q.status),
    )
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(courses)
        .where(where)
        .orderBy(desc(courses.updatedAt), asc(courses.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(courses).where(where),
    ])
    const enrolled = rows.length
      ? await this.db.select({ courseId: enrollments.courseId, n: sql<number>`count(*)::int` }).from(enrollments).where(and(inArray(enrollments.courseId, rows.map((r) => r.id)), sql`${enrollments.status} <> 'DROPPED'`)).groupBy(enrollments.courseId)
      : []
    const cards = await this.toCards(rows, user)
    return pageOf(cards.map((c) => ({ ...c, enrolledCount: enrolled.find((e) => e.courseId === c.id)?.n ?? 0 })), total, q.page, q.pageSize)
  }

  async create(dto: CreateCourseDto, user: AuthUser, req: AppRequest) {
    let providerId: string | undefined
    let contractorId: string | undefined
    if (dto.ownerType === 'ECOSYSTEM') {
      if (!user.isGlobalAdmin) throw new ForbiddenException('Solo el administrador del ecosistema crea cursos del ecosistema')
    } else {
      const kind = dto.ownerType === 'PROVIDER' ? 'provider' : 'contractor'
      await this.access.assertManage(kind, dto.ownerId!, user)
      const [org] =
        dto.ownerType === 'PROVIDER'
          ? await this.db.select({ status: providers.status }).from(providers).where(eq(providers.id, dto.ownerId!))
          : await this.db.select({ status: contractors.status }).from(contractors).where(eq(contractors.id, dto.ownerId!))
      if (!org) throw new NotFoundException('Organización no encontrada')
      if (org.status !== 'ACTIVE') throw new ConflictException('La organización debe estar activa para crear cursos')
      if (dto.ownerType === 'PROVIDER') providerId = dto.ownerId
      else contractorId = dto.ownerId
    }
    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(courses)
        .values({ subtitle: dto.subtitle, category: dto.category, language: dto.language, learningObjectives: dto.learningObjectives, requirements: dto.requirements, targetAudience: dto.targetAudience, coverUrl: dto.coverUrl, promoVideoUrl: dto.promoVideoUrl, instructorBio: dto.instructorBio, title: dto.title, description: dto.description, providerType: dto.ownerType, providerId, contractorId, level: dto.level, instructorName: dto.instructorName, certificate: dto.certificate, price: String(dto.price), currency: dto.currency, createdBy: user.id })
        .returning({ id: courses.id })
      await tx.insert(courseSections).values({ courseId: row.id, title: 'Primer módulo', position: 0 })
      return row
    })
    await this.audit.record(req, { module: 'lms', entityType: 'course', entityId: created.id, action: 'created', newData: { title: dto.title, ownerType: dto.ownerType, ownerId: dto.ownerId ?? null } })
    return this.get(created.id, user)
  }

  async update(id: string, dto: UpdateCourseDto, user: AuthUser, req: AppRequest) {
    const before = await this.loadForManage(id, user)
    const { price, ...fields } = dto
    const removedCover = await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(courses).where(eq(courses.id, id)).for('update')
      if (!current) throw new NotFoundException('Curso no encontrado')
      if (current.instructorProfileId) {
        const [profile] = await tx.select().from(instructorProfiles).where(eq(instructorProfiles.id,current.instructorProfileId))
        if (profile) { fields.instructorName = profile.name; fields.instructorBio = profile.bio }
      }
      const owner = await this.owner(current)
      if (dto.status === 'PUBLISHED' && current.status !== 'PUBLISHED') {
        if (!owner.active) throw new ConflictException('La organización debe estar activa para publicar cursos')
        const content = await tx.select().from(lessons).where(eq(lessons.courseId, id))
        const media = content.length ? await tx.select().from(lessonVideos).where(inArray(lessonVideos.lessonId, content.map(l => l.id))) : []
        const readiness = coursePublication({ ...current, ...dto }, content.map(l => ({ ...l, video: media.find(v => v.lessonId === l.id) })), owner.active)
        const missing = readiness.checks.filter(c => !c.complete)
        if (missing.length) throw validationError('status', missing.map(c => c.label).join(' · '))
      }
      if (dto.status === 'DRAFT' && current.status !== 'DRAFT') {
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.courseId, id), sql`${enrollments.status} <> 'DROPPED'`))
        // Volver a borrador oculta el curso a quien ya lo estudia: se archiva en su lugar.
        if (n > 0) throw new ConflictException('El curso tiene inscritos: archívalo en lugar de volverlo a borrador')
      }

      const replacingCover = dto.coverUrl !== undefined
      await tx.update(courses).set({ ...fields, ...(replacingCover && {coverKey:null,coverMime:null,coverUpdatedAt:null}), ...(price !== undefined && { price: String(price) }), updatedAt: new Date() }).where(eq(courses.id, id))
      return replacingCover ? current.coverKey : null
    })
    if (removedCover) await this.storage.delete(removedCover).catch(() => undefined)
    await this.audit.record(req, {
      module: 'lms',
      entityType: 'course',
      entityId: id,
      action: dto.status && dto.status !== before.status ? 'status.changed' : 'updated',
      oldData: { title: before.title, status: before.status, level: before.level, certificate: before.certificate, price: before.price, currency: before.currency },
      newData: dto,
    })
    return this.get(id, user)
  }

  // ---------- Lecciones ----------

  private async recompute(tx: Tx, courseId: string) {
    const rows = await tx.select({ id: lessons.id }).from(lessons).leftJoin(courseSections, eq(lessons.sectionId, courseSections.id)).where(eq(lessons.courseId, courseId)).orderBy(sql`coalesce(${courseSections.position}, 2147483647)`, asc(lessons.position), asc(lessons.id))
    // Posiciones consecutivas 0..n-1 (sin huecos tras borrar o mover) y duración total del curso.
    for (const [i, r] of rows.entries()) await tx.update(lessons).set({ position: i }).where(eq(lessons.id, r.id))
    const [{ total }] = await tx.select({ total: sql<number>`coalesce(sum(${lessons.durationMinutes}), 0)::int` }).from(lessons).where(eq(lessons.courseId, courseId))
    await tx.update(courses).set({ durationMinutes: total, updatedAt: new Date() }).where(eq(courses.id, courseId))
  }

  async addLesson(courseId: string, dto: LessonDto, user: AuthUser, req: AppRequest) {
    await this.loadForManage(courseId, user)
    const lessonId = await this.db.transaction(async (tx) => {
      await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).for('update') // serializa cambios del temario
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(lessons).where(eq(lessons.courseId, courseId))
      const [firstSection] = await tx.select().from(courseSections).where(eq(courseSections.courseId, courseId)).orderBy(asc(courseSections.position)).limit(1)
      const sectionId = dto.sectionId === undefined ? firstSection?.id ?? null : dto.sectionId
      await this.assertSection(tx, courseId, sectionId)
      const [row] = await tx.insert(lessons).values({ courseId, sectionId, position: n, title: dto.title, content: dto.content, videoUrl: dto.videoUrl, durationMinutes: dto.durationMinutes }).returning({ id: lessons.id })
      await this.recompute(tx, courseId)
      return row.id
    })
    await this.audit.record(req, { module: 'lms', entityType: 'lesson', entityId: lessonId, action: 'created', newData: { courseId, title: dto.title } })
    return { ...await this.get(courseId, user), createdLessonId: lessonId }
  }

  async updateLesson(courseId: string, lessonId: string, dto: UpdateLessonDto, user: AuthUser, req: AppRequest) {
    await this.loadForManage(courseId, user)
    const removedVideo = await this.db.transaction(async (tx) => {
      await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).for('update')
      const [lesson] = await tx.select().from(lessons).where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId)))
      if (!lesson) throw new NotFoundException('Lección no encontrada')
      if (dto.sectionId !== undefined) await this.assertSection(tx, courseId, dto.sectionId)
      const { position, ...fields } = dto
      const removed = dto.videoUrl ? await tx.delete(lessonVideos).where(eq(lessonVideos.lessonId, lessonId)).returning() : []
      if (Object.keys(fields).length) await tx.update(lessons).set(fields).where(eq(lessons.id, lessonId))
      if (position !== undefined) {
        // Mover = quitarla del orden actual y reinsertarla en la nueva posición.
        const rows = await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.courseId, courseId)).orderBy(asc(lessons.position), asc(lessons.id))
        const order = rows.map((r) => r.id).filter((x) => x !== lessonId)
        order.splice(Math.min(position, order.length), 0, lessonId)
        for (const [i, id] of order.entries()) await tx.update(lessons).set({ position: i }).where(eq(lessons.id, id))
      }
      await this.recompute(tx, courseId)
      return removed[0]
    })
    await this.discardVideo(removedVideo)
    await this.audit.record(req, { module: 'lms', entityType: 'lesson', entityId: lessonId, action: 'updated', newData: dto })
    return this.get(courseId, user)
  }

  async deleteLesson(courseId: string, lessonId: string, user: AuthUser, req: AppRequest) {
    await this.loadForManage(courseId, user)
    const video = await this.db.transaction(async (tx) => {
      const [current] = await tx.select({ id: courses.id, status: courses.status }).from(courses).where(eq(courses.id, courseId)).for('update')
      const [lesson] = await tx.select({ id: lessons.id }).from(lessons).where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId)))
      if (!lesson) throw new NotFoundException('Lección no encontrada')
      // El progreso de quienes ya la completaron es historial: no se borra una lección que alguien terminó.
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(lessonProgress).where(eq(lessonProgress.lessonId, lessonId))
      if (n > 0) throw new ConflictException('Esta lección ya fue completada por alumnos; no se puede eliminar')
      const [{ left }] = await tx.select({ left: sql<number>`count(*)::int` }).from(lessons).where(eq(lessons.courseId, courseId))
      if (current?.status === 'PUBLISHED' && left <= 1) throw new ConflictException('Un curso publicado necesita al menos una lección: despublícalo antes de quitarla')
      const [video] = await tx.select().from(lessonVideos).where(eq(lessonVideos.lessonId, lessonId))
      await tx.delete(lessons).where(eq(lessons.id, lessonId))
      await this.recompute(tx, courseId)
      return video
    })
    await this.discardVideo(video)
    await this.audit.record(req, { module: 'lms', entityType: 'lesson', entityId: lessonId, action: 'deleted', oldData: { courseId } })
    return this.get(courseId, user)
  }

  private async assertSection(tx: Tx, courseId: string, sectionId: string | null) {
    if (!sectionId) return
    const [section] = await tx.select().from(courseSections).where(and(eq(courseSections.id, sectionId), eq(courseSections.courseId, courseId)))
    if (!section) throw validationError('sectionId', 'El módulo no pertenece a este curso')
  }

  async addSection(courseId: string, dto: SectionDto, user: AuthUser, req: AppRequest) {
    await this.loadForManage(courseId, user)
    const section = await this.db.transaction(async tx => {
      await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).for('update')
      const rows = await tx.select().from(courseSections).where(eq(courseSections.courseId, courseId))
      if (rows.length >= 500) throw new ConflictException('Máximo 500 módulos por curso')
      const [created] = await tx.insert(courseSections).values({ courseId, ...dto, position: rows.length }).returning()
      return created
    })
    await this.audit.record(req, { module: 'lms', entityType: 'course-section', entityId: section.id, action: 'created', newData: { courseId, ...dto } })
    return this.get(courseId, user)
  }

  async updateSection(courseId: string, sectionId: string, dto: UpdateSectionDto, user: AuthUser, req: AppRequest) {
    await this.loadForManage(courseId, user)
    await this.db.transaction(async tx => {
      await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).for('update')
      await this.assertSection(tx, courseId, sectionId)
      const { position, ...fields } = dto
      if (Object.keys(fields).length) await tx.update(courseSections).set(fields).where(eq(courseSections.id, sectionId))
      if (position !== undefined) {
        const rows = await tx.select().from(courseSections).where(eq(courseSections.courseId, courseId)).orderBy(asc(courseSections.position), asc(courseSections.id))
        const order = rows.map(r => r.id).filter(id => id !== sectionId)
        order.splice(Math.min(position, order.length), 0, sectionId)
        for (const [i, id] of order.entries()) await tx.update(courseSections).set({ position: i }).where(eq(courseSections.id, id))
        await this.recompute(tx, courseId)
      }
    })
    await this.audit.record(req, { module: 'lms', entityType: 'course-section', entityId: sectionId, action: 'updated', newData: { courseId, ...dto } })
    return this.get(courseId, user)
  }

  async deleteSection(courseId: string, sectionId: string, user: AuthUser, req: AppRequest) {
    await this.loadForManage(courseId, user)
    await this.db.transaction(async tx => {
      await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).for('update')
      await this.assertSection(tx, courseId, sectionId)
      const [lesson] = await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.sectionId, sectionId)).limit(1)
      if (lesson) throw new ConflictException('Mueve las lecciones a otro módulo antes de eliminar este')
      await tx.delete(courseSections).where(eq(courseSections.id, sectionId))
      const remaining = await tx.select().from(courseSections).where(eq(courseSections.courseId, courseId)).orderBy(asc(courseSections.position), asc(courseSections.id))
      for (const [i, row] of remaining.entries()) await tx.update(courseSections).set({ position: i }).where(eq(courseSections.id, row.id))
    })
    await this.audit.record(req, { module: 'lms', entityType: 'course-section', entityId: sectionId, action: 'deleted', oldData: { courseId } })
    return this.get(courseId, user)
  }

  // ---------- Alumnado (vista del gestor) ----------

  async roster(courseId: string, user: AuthUser) {
    await this.loadForManage(courseId, user)
    const rows = await this.db
      .select({ id: enrollments.id, status: enrollments.status, progress: enrollments.progressPercent, startedAt: enrollments.startedAt, completedAt: enrollments.completedAt, first: users.firstName, last: users.lastName, email: users.email })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.userId))
      .where(eq(enrollments.courseId, courseId))
      .orderBy(desc(enrollments.startedAt))
    return {
      total: rows.length,
      completed: rows.filter((r) => r.status === 'COMPLETED').length,
      items: rows.map((r) => ({ id: r.id, name: [r.first, r.last].filter(Boolean).join(' '), email: r.email, status: r.status, progressPercent: Number(r.progress), startedAt: r.startedAt, completedAt: r.completedAt })),
    }
  }
}
