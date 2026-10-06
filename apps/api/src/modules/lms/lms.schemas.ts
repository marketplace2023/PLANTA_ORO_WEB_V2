import { z } from 'zod'
import { paginationShape } from '../../common/pagination'
import { COURSE_LEVELS, COURSE_OWNER_TYPES, COURSE_STATUSES } from '../../database/schema'

const text = (max: number) => z.string().trim().min(1).max(max)
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,60}$/, 'Código inválido')
/** Solo http(s): un enlace `javascript:` en una lección sería XSS contra quien la abra. */
const url = z.url({ protocol: /^https?$/ })
/** Hasta 2 decimales: la columna es numeric(…,2). */
const money = z
  .number()
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Máximo 2 decimales')
  .pipe(z.number().min(0, 'El precio no puede ser negativo').max(1e9))
const currency = z.string().trim().length(3, 'Código de moneda de 3 letras').transform((c) => c.toUpperCase())
const nonEmpty = <T extends z.ZodRawShape>(shape: T) => z.object(shape).partial().refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export const createCourseSchema = z
  .object({
    ownerType: z.enum(COURSE_OWNER_TYPES),
    ownerId: z.uuid().optional(),
    title: text(200),
    description: z.string().trim().max(4000).optional(),
    level: z.enum(COURSE_LEVELS).default('BASIC'),
    instructorName: text(160).optional(),
    certificate: z.boolean().default(false),
    /** 0 = gratuito. */
    price: money.default(0),
    currency: currency.default('USD'),
    stageCodes: z.array(code).max(20).default([]),
  })
  .refine((v) => (v.ownerType === 'ECOSYSTEM' ? v.ownerId === undefined : v.ownerId !== undefined), {
    path: ['ownerId'],
    message: 'Indique la organización propietaria (y no se usa para cursos del ecosistema)',
  })

export const updateCourseSchema = nonEmpty({
  title: text(200),
  description: z.string().trim().max(4000).nullable(),
  level: z.enum(COURSE_LEVELS),
  instructorName: text(160).nullable(),
  certificate: z.boolean(),
  price: money,
  currency,
  stageCodes: z.array(code).max(20),
  status: z.enum(COURSE_STATUSES),
})

export const lessonSchema = z.object({
  title: text(200),
  content: z.string().trim().max(20_000).optional(),
  videoUrl: url.optional(),
  durationMinutes: z.number().int().min(0).max(1440).default(0),
})
export const updateLessonSchema = nonEmpty({
  title: text(200),
  content: z.string().trim().max(20_000).nullable(),
  videoUrl: url.nullable(),
  durationMinutes: z.number().int().min(0).max(1440),
  /** Posición 0-based dentro del curso: reordena el resto. */
  position: z.number().int().min(0).max(500),
})

export const listCoursesQuerySchema = z.object({
  ...paginationShape,
  stage: code.optional(),
  level: z.enum(COURSE_LEVELS).optional(),
  ownerType: z.enum(COURSE_OWNER_TYPES).optional(),
  providerId: z.uuid().optional(),
  contractorId: z.uuid().optional(),
  maxMinutes: z.coerce.number().int().min(1).max(100_000).optional(),
  certificate: z.enum(['0', '1']).optional(),
  /** '1' = solo gratuitos; '0' = solo de pago. */
  free: z.enum(['0', '1']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['title', 'newest', 'duration', 'price_asc', 'price_desc']).default('title'),
})

export const manageQuerySchema = z.object({
  ...paginationShape,
  ownerType: z.enum(COURSE_OWNER_TYPES),
  ownerId: z.uuid().optional(),
  status: z.enum([...COURSE_STATUSES, 'ALL']).default('ALL'),
})

export type CreateCourseDto = z.infer<typeof createCourseSchema>
export type UpdateCourseDto = z.infer<typeof updateCourseSchema>
export type LessonDto = z.infer<typeof lessonSchema>
export type UpdateLessonDto = z.infer<typeof updateLessonSchema>
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>
export type ManageQuery = z.infer<typeof manageQuerySchema>
