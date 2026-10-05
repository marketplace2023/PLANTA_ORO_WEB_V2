import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, numeric, pgSchema, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { createdAt, pk, updatedAt } from './common'
import { plants } from './core'
import { users } from './iam'
import { stageMaster } from './process'
import { providers } from './provider'
import { contractors } from './professional'

// Arquitectura §21. Los cursos son globales (no de una planta). Los publica el ecosistema, un proveedor o un contratista;
// quien los gestiona lo define la membresía de esa organización (o el administrador del ecosistema, para los del ecosistema).
export const lmsSchema = pgSchema('lms')

export const COURSE_OWNER_TYPES = ['ECOSYSTEM', 'PROVIDER', 'CONTRACTOR'] as const
export type CourseOwnerType = (typeof COURSE_OWNER_TYPES)[number]
export const COURSE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
export const COURSE_LEVELS = ['BASIC', 'INTERMEDIATE', 'ADVANCED'] as const
export const ENROLLMENT_STATUSES = ['ENROLLED', 'COMPLETED', 'DROPPED'] as const

export const courses = lmsSchema.table(
  'courses',
  {
    id: pk(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    /** Quién publica el curso. El FK que corresponde se rellena y el otro queda en null (ver CHECK). */
    providerType: varchar('provider_type', { length: 20 }).notNull().default('ECOSYSTEM'),
    providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'cascade' }),
    contractorId: uuid('contractor_id').references(() => contractors.id, { onDelete: 'cascade' }),
    level: varchar('level', { length: 20 }).notNull().default('BASIC'),
    instructorName: varchar('instructor_name', { length: 160 }),
    /** Emite certificado verificable al completarlo. */
    certificate: boolean('certificate').notNull().default(false),
    status: varchar('status', { length: 20 }).notNull().default('DRAFT'),
    /** Suma de la duración de sus lecciones: se recalcula al cambiarlas (no se edita a mano). */
    durationMinutes: integer('duration_minutes').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'courses_owner_consistent',
      sql`(${t.providerType} = 'ECOSYSTEM' and ${t.providerId} is null and ${t.contractorId} is null)
        or (${t.providerType} = 'PROVIDER' and ${t.providerId} is not null and ${t.contractorId} is null)
        or (${t.providerType} = 'CONTRACTOR' and ${t.contractorId} is not null and ${t.providerId} is null)`,
    ),
    index('idx_courses_status').on(t.status),
  ],
)

export const courseStages = lmsSchema.table(
  'course_stages',
  {
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    stageMasterId: uuid('stage_master_id')
      .notNull()
      .references(() => stageMaster.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.stageMasterId] })],
)

export const lessons = lmsSchema.table(
  'lessons',
  {
    id: pk(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    title: varchar('title', { length: 200 }).notNull(),
    /** Texto plano: se muestra tal cual (sin HTML), así no hay XSS almacenado. */
    content: text('content'),
    /** Enlace externo a un video (http/https); se muestra como enlace, nunca se incrusta. */
    videoUrl: text('video_url'),
    durationMinutes: integer('duration_minutes').notNull().default(0),
  },
  (t) => [check('lessons_duration_range', sql`${t.durationMinutes} >= 0 and ${t.durationMinutes} <= 1440`), index('idx_lessons_course').on(t.courseId, t.position)],
)

export const enrollments = lmsSchema.table(
  'enrollments',
  {
    id: pk(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Planta en cuyo contexto se toma el curso (opcional; el aprendizaje es personal). */
    plantId: uuid('plant_id').references(() => plants.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 20 }).notNull().default('ENROLLED'),
    progressPercent: numeric('progress_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Código público para verificar el certificado; solo existe si el curso lo emite y se completó. */
    certificateCode: varchar('certificate_code', { length: 30 }).unique(),
  },
  (t) => [
    unique('enrollments_course_user_unique').on(t.courseId, t.userId),
    check('enrollments_progress_range', sql`${t.progressPercent} >= 0 and ${t.progressPercent} <= 100`),
    index('idx_enrollments_user').on(t.userId),
  ],
)

export const lessonProgress = lmsSchema.table(
  'lesson_progress',
  {
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.enrollmentId, t.lessonId] })],
)
