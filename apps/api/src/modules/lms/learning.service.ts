import { randomBytes } from 'node:crypto'
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { AppRequest, AuthUser } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { contractors, courses, enrollments, lessonProgress, lessons, providers, users } from '../../database/schema'
import { AuditService } from '../audit/audit.service'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Código público y no adivinable (Crockford base32, sin caracteres ambiguos): FUR-C-7K2M9QXD4T. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const newCertificateCode = () => `FUR-C-${Array.from(randomBytes(10), (b) => ALPHABET[b % 32]).join('')}`

const pct = (done: number, total: number) => (total === 0 ? 0 : Math.round((done / total) * 10_000) / 100)

@Injectable()
export class LearningService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Un curso se puede tomar si está publicado, su organización está activa y tiene lecciones. */
  private async takeable(courseId: string) {
    const [c] = await this.db.select().from(courses).where(eq(courses.id, courseId))
    if (!c) throw new NotFoundException('Curso no encontrado')
    const [org] =
      c.providerType === 'PROVIDER'
        ? await this.db.select({ status: providers.status }).from(providers).where(eq(providers.id, c.providerId!))
        : c.providerType === 'CONTRACTOR'
          ? await this.db.select({ status: contractors.status }).from(contractors).where(eq(contractors.id, c.contractorId!))
          : [{ status: 'ACTIVE' }]
    if (c.status !== 'PUBLISHED' || org?.status !== 'ACTIVE') throw new NotFoundException('Curso no encontrado')
    return c
  }

  async enroll(courseId: string, user: AuthUser, req: AppRequest) {
    await this.takeable(courseId)
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(lessons).where(eq(lessons.courseId, courseId))
    if (n === 0) throw new ConflictException('El curso aún no tiene lecciones')

    // Una sola inscripción por persona y curso; volver a inscribirse tras abandonar la reactiva con su progreso.
    const [row] = await this.db
      .insert(enrollments)
      .values({ courseId, userId: user.id })
      .onConflictDoUpdate({ target: [enrollments.courseId, enrollments.userId], set: { status: sql`case when ${enrollments.status} = 'DROPPED' then 'ENROLLED' else ${enrollments.status} end` } })
      .returning()
    await this.audit.record(req, { module: 'lms', entityType: 'enrollment', entityId: row.id, action: 'enrolled', newData: { courseId } })
    return this.view(row.id)
  }

  private async view(enrollmentId: string) {
    const [e] = await this.db.select().from(enrollments).where(eq(enrollments.id, enrollmentId))
    const done = await this.db.select({ n: sql<number>`count(*)::int` }).from(lessonProgress).where(eq(lessonProgress.enrollmentId, enrollmentId))
    const [{ total }] = await this.db.select({ total: sql<number>`count(*)::int` }).from(lessons).where(eq(lessons.courseId, e.courseId))
    return { id: e.id, courseId: e.courseId, status: e.status, progressPercent: pct(done[0].n, total), startedAt: e.startedAt, completedAt: e.completedAt, certificateCode: e.certificateCode }
  }

  /** Marca o desmarca una lección y recalcula progreso/finalización bajo bloqueo de la inscripción (clics simultáneos no se pisan). */
  private async setLesson(courseId: string, lessonId: string, user: AuthUser, req: AppRequest, complete: boolean) {
    const result = await this.db.transaction(async (tx) => {
      const [enr] = await tx.select().from(enrollments).where(and(eq(enrollments.courseId, courseId), eq(enrollments.userId, user.id))).for('update')
      if (!enr || enr.status === 'DROPPED') throw new ConflictException('Inscríbete en el curso para registrar tu avance')
      const [lesson] = await tx.select({ id: lessons.id }).from(lessons).where(and(eq(lessons.id, lessonId), eq(lessons.courseId, courseId)))
      if (!lesson) throw new NotFoundException('Lección no encontrada')
      if (enr.status === 'COMPLETED' && !complete) throw new ConflictException('El curso ya está completado: el avance no se puede deshacer')

      if (complete) await tx.insert(lessonProgress).values({ enrollmentId: enr.id, lessonId }).onConflictDoNothing()
      else await tx.delete(lessonProgress).where(and(eq(lessonProgress.enrollmentId, enr.id), eq(lessonProgress.lessonId, lessonId)))
      return this.refresh(tx, enr.id, courseId)
    })
    await this.audit.record(req, { module: 'lms', entityType: 'enrollment', entityId: result.id, action: complete ? 'lesson.completed' : 'lesson.undone', newData: { courseId, lessonId } })
    return result
  }

  completeLesson(courseId: string, lessonId: string, user: AuthUser, req: AppRequest) {
    return this.setLesson(courseId, lessonId, user, req, true)
  }

  undoLesson(courseId: string, lessonId: string, user: AuthUser, req: AppRequest) {
    return this.setLesson(courseId, lessonId, user, req, false)
  }

  private async refresh(tx: Tx, enrollmentId: string, courseId: string) {
    const [{ done }] = await tx.select({ done: sql<number>`count(*)::int` }).from(lessonProgress).where(eq(lessonProgress.enrollmentId, enrollmentId))
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(lessons).where(eq(lessons.courseId, courseId))
    const [course] = await tx.select({ certificate: courses.certificate }).from(courses).where(eq(courses.id, courseId))
    const [enr] = await tx.select().from(enrollments).where(eq(enrollments.id, enrollmentId))
    const finished = total > 0 && done >= total
    const patch: Partial<typeof enrollments.$inferInsert> = { progressPercent: String(pct(done, total)) }
    if (finished && enr.status !== 'COMPLETED') {
      patch.status = 'COMPLETED'
      patch.completedAt = new Date()
      if (course.certificate && !enr.certificateCode) patch.certificateCode = newCertificateCode()
    }
    await tx.update(enrollments).set(patch).where(eq(enrollments.id, enrollmentId))
    const [after] = await tx.select().from(enrollments).where(eq(enrollments.id, enrollmentId))
    return { id: after.id, courseId, status: after.status, progressPercent: pct(done, total), startedAt: after.startedAt, completedAt: after.completedAt, certificateCode: after.certificateCode }
  }

  async drop(courseId: string, user: AuthUser, req: AppRequest) {
    const [enr] = await this.db.select().from(enrollments).where(and(eq(enrollments.courseId, courseId), eq(enrollments.userId, user.id)))
    if (!enr) throw new NotFoundException('No estás inscrito en este curso')
    if (enr.status === 'COMPLETED') throw new ConflictException('Un curso completado no se puede abandonar')
    // Se conserva el progreso: si se vuelve a inscribir, continúa donde quedó.
    const updated = await this.db.update(enrollments).set({ status: 'DROPPED' }).where(and(eq(enrollments.id, enr.id), eq(enrollments.status, 'ENROLLED'))).returning({ id: enrollments.id })
    if (updated.length > 0) await this.audit.record(req, { module: 'lms', entityType: 'enrollment', entityId: enr.id, action: 'dropped', newData: { courseId } })
  }

  /** Mi aprendizaje: inscripciones activas y completadas con su curso. */
  async mine(user: AuthUser) {
    const rows = await this.db
      .select({
        id: enrollments.id,
        courseId: courses.id,
        title: courses.title,
        level: courses.level,
        courseStatus: courses.status,
        durationMinutes: courses.durationMinutes,
        status: enrollments.status,
        startedAt: enrollments.startedAt,
        completedAt: enrollments.completedAt,
        certificateCode: enrollments.certificateCode,
        done: sql<number>`(select count(*)::int from ${lessonProgress} lp where lp.enrollment_id = ${enrollments.id})`,
        total: sql<number>`(select count(*)::int from ${lessons} l where l.course_id = ${courses.id})`,
      })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(and(eq(enrollments.userId, user.id), sql`${enrollments.status} <> 'DROPPED'`))
      .orderBy(desc(enrollments.startedAt))
    return rows.map((r) => ({
      id: r.id,
      course: { id: r.courseId, title: r.title, level: r.level, status: r.courseStatus, durationMinutes: r.durationMinutes },
      status: r.status,
      progressPercent: r.status === 'COMPLETED' ? 100 : pct(r.done, r.total),
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      certificateCode: r.certificateCode,
    }))
  }

  private async certificateRow(where: ReturnType<typeof eq>) {
    const [r] = await this.db
      .select({
        code: enrollments.certificateCode,
        completedAt: enrollments.completedAt,
        first: users.firstName,
        last: users.lastName,
        title: courses.title,
        level: courses.level,
        durationMinutes: courses.durationMinutes,
        providerType: courses.providerType,
        providerId: courses.providerId,
        contractorId: courses.contractorId,
      })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .innerJoin(users, eq(users.id, enrollments.userId))
      .where(and(where, eq(enrollments.status, 'COMPLETED'), sql`${enrollments.certificateCode} is not null`))
      .orderBy(asc(enrollments.id))
      .limit(1)
    if (!r) return null
    const [org] =
      r.providerType === 'PROVIDER'
        ? await this.db.select({ n: providers.organizationName }).from(providers).where(eq(providers.id, r.providerId!))
        : r.providerType === 'CONTRACTOR'
          ? await this.db.select({ n: contractors.organizationName }).from(contractors).where(eq(contractors.id, r.contractorId!))
          : [{ n: 'Ecosistema FUR' }]
    return { code: r.code!, holder: [r.first, r.last].filter(Boolean).join(' '), course: { title: r.title, level: r.level, durationMinutes: r.durationMinutes }, issuedBy: org?.n ?? 'Ecosistema FUR', completedAt: r.completedAt }
  }

  /** Mi certificado de un curso (solo quien lo completó). */
  async myCertificate(courseId: string, user: AuthUser) {
    const cert = await this.certificateRow(and(eq(enrollments.courseId, courseId), eq(enrollments.userId, user.id)) as ReturnType<typeof eq>)
    if (!cert) throw new NotFoundException('Aún no tienes un certificado para este curso')
    return cert
  }

  /** Verificación pública: confirma que el código existe y a quién y qué certifica (solo nombre, curso y fecha). */
  async verify(code: string) {
    const cert = await this.certificateRow(eq(enrollments.certificateCode, code.toUpperCase()))
    if (!cert) throw new NotFoundException('Certificado no encontrado')
    return { valid: true, ...cert }
  }
}
