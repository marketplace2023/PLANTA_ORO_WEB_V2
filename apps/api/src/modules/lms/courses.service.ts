import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm'
import { validationError } from '../../common/errors'
import { escapeLike, pageOf } from '../../common/pagination'
import type { AppRequest, AuthUser } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { contractors, courseStages, courses, enrollments, lessonProgress, lessons, providers, stageMaster, users } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../organizations/org-access.service'
import type { CreateCourseDto, LessonDto, ListCoursesQuery, ManageQuery, UpdateCourseDto, UpdateLessonDto } from './lms.schemas'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type CourseRow = typeof courses.$inferSelect
type Tag = { code: string; name: string }

@Injectable()
export class CoursesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: OrgAccessService,
    private readonly audit: AuditService,
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

  // ---------- Etiquetas ----------

  private async stagesFor(ids: string[]) {
    const map = new Map<string, Tag[]>()
    if (ids.length === 0) return map
    const rows = await this.db
      .select({ courseId: courseStages.courseId, code: stageMaster.code, name: stageMaster.name })
      .from(courseStages)
      .innerJoin(stageMaster, eq(stageMaster.id, courseStages.stageMasterId))
      .where(inArray(courseStages.courseId, ids))
      .orderBy(asc(stageMaster.sequenceDefault))
    for (const r of rows) map.set(r.courseId, [...(map.get(r.courseId) ?? []), { code: r.code, name: r.name }])
    return map
  }

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
    const [stages, counts, mine] = await Promise.all([this.stagesFor(ids), this.lessonCounts(ids), this.myEnrollments(ids, user)])
    return Promise.all(
      rows.map(async (c) => {
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
          instructorName: c.instructorName,
          status: c.status,
          owner: { type: owner.type, id: owner.id, name: owner.name, verified: owner.verified },
          stages: stages.get(c.id) ?? [],
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
      q.ownerType ? eq(courses.providerType, q.ownerType) : undefined,
      q.providerId ? eq(courses.providerId, q.providerId) : undefined,
      q.contractorId ? eq(courses.contractorId, q.contractorId) : undefined,
      q.maxMinutes !== undefined ? lte(courses.durationMinutes, q.maxMinutes) : undefined,
      q.certificate === '1' ? eq(courses.certificate, true) : undefined,
      q.free === '1' ? sql`${courses.price} = 0` : q.free === '0' ? sql`${courses.price} > 0` : undefined,
      q.stage ? sql`exists (select 1 from ${courseStages} cs inner join ${stageMaster} sm on sm.id = cs.stage_master_id where cs.course_id = ${courses.id} and sm.code = ${q.stage})` : undefined,
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

    const [card] = await this.toCards([course], user)
    return {
      ...card,
      canManage: manager,
      lessons: rows.map((l) => ({
        id: l.id,
        position: l.position,
        title: l.title,
        durationMinutes: l.durationMinutes,
        content: canRead ? l.content : null,
        videoUrl: canRead ? l.videoUrl : null,
        completed: done.has(l.id),
      })),
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

  private async resolveStageIds(tx: Tx | Database, codes: string[]) {
    if (codes.length === 0) return []
    const rows = await tx.select({ id: stageMaster.id, code: stageMaster.code }).from(stageMaster).where(inArray(stageMaster.code, codes))
    const missing = codes.filter((c) => !rows.some((r) => r.code === c))
    if (missing.length) throw validationError('stageCodes', `Etapas inexistentes: ${missing.join(', ')}`)
    return rows.map((r) => r.id)
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
    const stageIds = await this.resolveStageIds(this.db, dto.stageCodes)
    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(courses)
        .values({ title: dto.title, description: dto.description, providerType: dto.ownerType, providerId, contractorId, level: dto.level, instructorName: dto.instructorName, certificate: dto.certificate, price: String(dto.price), currency: dto.currency, createdBy: user.id })
        .returning({ id: courses.id })
      if (stageIds.length) await tx.insert(courseStages).values([...new Set(stageIds)].map((stageMasterId) => ({ courseId: row.id, stageMasterId })))
      return row
    })
    await this.audit.record(req, { module: 'lms', entityType: 'course', entityId: created.id, action: 'created', newData: { title: dto.title, ownerType: dto.ownerType, ownerId: dto.ownerId ?? null } })
    return this.get(created.id, user)
  }

  async update(id: string, dto: UpdateCourseDto, user: AuthUser, req: AppRequest) {
    const before = await this.loadForManage(id, user)
    const owner = await this.owner(before)
    const stageIds = dto.stageCodes ? await this.resolveStageIds(this.db, dto.stageCodes) : undefined

    if (dto.status === 'PUBLISHED' && before.status !== 'PUBLISHED') {
      if (!owner.active) throw new ConflictException('La organización debe estar activa para publicar cursos')
      const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(lessons).where(eq(lessons.courseId, id))
      if (n === 0) throw validationError('status', 'Agregue al menos una lección para publicar el curso')
      const stageCount = stageIds ? new Set(stageIds).size : (await this.db.select({ n: sql<number>`count(*)::int` }).from(courseStages).where(eq(courseStages.courseId, id)))[0].n
      // Sin etapa no aparecería en el filtro principal del catálogo.
      if (stageCount === 0) throw validationError('stageCodes', 'Indique al menos una etapa para publicar el curso')
    }
    if (dto.status === 'DRAFT' && before.status !== 'DRAFT') {
      const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.courseId, id), sql`${enrollments.status} <> 'DROPPED'`))
      // Volver a borrador oculta el curso a quien ya lo estudia: se archiva en su lugar.
      if (n > 0) throw new ConflictException('El curso tiene inscritos: archívalo en lugar de volverlo a borrador')
    }

    const { stageCodes: _s, price, ...fields } = dto
    await this.db.transaction(async (tx) => {
      await tx.update(courses).set({ ...fields, ...(price !== undefined && { price: String(price) }), updatedAt: new Date() }).where(eq(courses.id, id))
      if (stageIds) {
        await tx.delete(courseStages).where(eq(courseStages.courseId, id))
        if (stageIds.length) await tx.insert(courseStages).values([...new Set(stageIds)].map((stageMasterId) => ({ courseId: id, stageMasterId })))
      }
    })
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
    const rows = await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.courseId, courseId)).orderBy(asc(lessons.position), asc(lessons.id))
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
      const [row] = await tx.insert(lessons).values({ courseId, position: n, title: dto.title, content: dto.content, videoUrl: dto.videoUrl, durationMinutes: dto.durationMinutes }).returning({ id: lessons.id })
      await this.recompute(tx, courseId)
      return row.id
    })
    await this.audit.record(req, { module: 'lms', entityType: 'lesson', entityId: lessonId, action: 'created', newData: { courseId, title: dto.title } })
    return this.get(courseId, user)
  }

  async updateLesson(courseId: string, lessonId: string, dto: UpdateLessonDto, user: AuthUser, req: AppRequest) {
    await this.loadForManage(courseId, user)
    await this.db.transaction(async (tx) => {
      await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).for('update')
      const [lesson] = await tx.select().from(lessons).where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId)))
      if (!lesson) throw new NotFoundException('Lección no encontrada')
      const { position, ...fields } = dto
      if (Object.keys(fields).length) await tx.update(lessons).set(fields).where(eq(lessons.id, lessonId))
      if (position !== undefined) {
        // Mover = quitarla del orden actual y reinsertarla en la nueva posición.
        const rows = await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.courseId, courseId)).orderBy(asc(lessons.position), asc(lessons.id))
        const order = rows.map((r) => r.id).filter((x) => x !== lessonId)
        order.splice(Math.min(position, order.length), 0, lessonId)
        for (const [i, id] of order.entries()) await tx.update(lessons).set({ position: i }).where(eq(lessons.id, id))
      }
      await this.recompute(tx, courseId)
    })
    await this.audit.record(req, { module: 'lms', entityType: 'lesson', entityId: lessonId, action: 'updated', newData: dto })
    return this.get(courseId, user)
  }

  async deleteLesson(courseId: string, lessonId: string, user: AuthUser, req: AppRequest) {
    const course = await this.loadForManage(courseId, user)
    await this.db.transaction(async (tx) => {
      await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).for('update')
      const [lesson] = await tx.select({ id: lessons.id }).from(lessons).where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId)))
      if (!lesson) throw new NotFoundException('Lección no encontrada')
      // El progreso de quienes ya la completaron es historial: no se borra una lección que alguien terminó.
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(lessonProgress).where(eq(lessonProgress.lessonId, lessonId))
      if (n > 0) throw new ConflictException('Esta lección ya fue completada por alumnos; no se puede eliminar')
      const [{ left }] = await tx.select({ left: sql<number>`count(*)::int` }).from(lessons).where(eq(lessons.courseId, courseId))
      if (course.status === 'PUBLISHED' && left <= 1) throw new ConflictException('Un curso publicado necesita al menos una lección: despublícalo antes de quitarla')
      await tx.delete(lessons).where(eq(lessons.id, lessonId))
      await this.recompute(tx, courseId)
    })
    await this.audit.record(req, { module: 'lms', entityType: 'lesson', entityId: lessonId, action: 'deleted', oldData: { courseId } })
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
