import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, numeric, pgSchema, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
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

export const instructorProfiles = lmsSchema.table('instructor_profiles', {
  id: uuid('id').primaryKey().references(() => users.id, {onDelete:'cascade'}),
  name: varchar('name', {length:160}).notNull(),
  headline: varchar('headline', {length:200}),
  bio: text('bio'),
  avatarKey: text('avatar_key'),
  avatarMime: varchar('avatar_mime', {length:100}),
  updatedAt: updatedAt(),
})

export const courses = lmsSchema.table(
  'courses',
  {
    id: pk(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    subtitle: varchar('subtitle', { length: 240 }),
    category: varchar('category', { length: 100 }).notNull().default('General'),
    language: varchar('language', { length: 10 }).notNull().default('es'),
    learningObjectives: jsonb('learning_objectives').$type<string[]>().notNull().default([]),
    requirements: jsonb('requirements').$type<string[]>().notNull().default([]),
    targetAudience: jsonb('target_audience').$type<string[]>().notNull().default([]),
    coverUrl: text('cover_url'),
    coverKey: text('cover_key'),
    coverMime: varchar('cover_mime', { length: 100 }),
    coverUpdatedAt: timestamp('cover_updated_at', { withTimezone: true }),
    promoVideoUrl: text('promo_video_url'),
    instructorBio: text('instructor_bio'),
    instructorProfileId: uuid('instructor_profile_id').references(() => instructorProfiles.id, {onDelete:'set null'}),
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
    /** Precio que fija quien ofrece el curso. 0 = gratuito. Dinero siempre numeric (§46). */
    price: numeric('price', { precision: 18, scale: 2 }).notNull().default('0'),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
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

/** Historical links retained for data compatibility; course authoring and discovery use categories. */
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

export const courseSections = lmsSchema.table('course_sections', {
  id: pk(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  position: integer('position').notNull().default(0),
}, (t) => [index('idx_course_sections_course').on(t.courseId, t.position)])

export const lessons = lmsSchema.table(
  'lessons',
  {
    id: pk(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').references(() => courseSections.id, { onDelete: 'set null' }),
    position: integer('position').notNull().default(0),
    title: varchar('title', { length: 200 }).notNull(),
    /** Texto plano: se muestra tal cual (sin HTML), así no hay XSS almacenado. */
    content: text('content'),
    /** Video externo compatible con el reproductor; excluyente con un archivo privado. */
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

/** Un archivo privado por lección; la fila también es la cola durable de procesamiento. */
export const lessonVideos = lmsSchema.table('lesson_videos', {
  id: pk(),
  lessonId: uuid('lesson_id').notNull().unique().references(() => lessons.id, { onDelete: 'cascade' }),
  sourceKey: text('source_key').notNull(),
  playbackKey: text('playback_key'),
  originalName: text('original_name').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  error: text('error'),
  durationSeconds: numeric('duration_seconds', { precision: 12, scale: 3 }),
  sizeBytes: numeric('size_bytes', { precision: 18, scale: 0 }),
  leaseToken: uuid('lease_token'),
  leaseAt: timestamp('lease_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [check('lesson_videos_status', sql`${t.status} in ('PENDING','PROCESSING','READY','FAILED')`), index('idx_lesson_videos_status').on(t.status)])

/** Posición de reproducción independiente de las lecciones ya completadas. */
export const lessonPlayback = lmsSchema.table('lesson_playback', {
  enrollmentId: uuid('enrollment_id').notNull().references(() => enrollments.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),
  positionSeconds: numeric('position_seconds', { precision: 12, scale: 3 }).notNull().default('0'),
  durationSeconds: numeric('duration_seconds', { precision: 12, scale: 3 }).notNull().default('0'),
  watchedSeconds: numeric('watched_seconds', { precision: 12, scale: 3 }).notNull().default('0'),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.enrollmentId, t.lessonId] }), check('lesson_playback_nonnegative', sql`${t.positionSeconds} >= 0 and ${t.durationSeconds} >= 0 and ${t.watchedSeconds} >= 0`)])
