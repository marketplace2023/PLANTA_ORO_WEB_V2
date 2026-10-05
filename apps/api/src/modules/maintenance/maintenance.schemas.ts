import { z } from 'zod'
import { paginationShape } from '../../common/pagination'
import { COST_KINDS, FREQUENCY_UNITS, PLAN_TYPES, WORK_ORDER_PRIORITIES, WORK_ORDER_STATUSES, WORK_ORDER_TYPES } from '../../database/schema'

const csv = <const T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1))

/** Instante ISO con zona (p. ej. 2026-10-05T14:00:00Z) → Date. */
const instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s))
const text = (max: number) => z.string().trim().min(1).max(max)

export const listWorkOrdersQuerySchema = z.object({
  ...paginationShape,
  status: csv(WORK_ORDER_STATUSES).optional(),
  type: csv(WORK_ORDER_TYPES).optional(),
  priority: csv(WORK_ORDER_PRIORITIES).optional(),
  assetId: z.uuid().optional(),
  /** `me` = las asignadas a quien consulta. */
  assignedTo: z.union([z.literal('me'), z.uuid()]).optional(),
  overdue: z.enum(['0', '1']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['createdAt', 'plannedEnd', 'priority', 'code']).default('createdAt'),
  dir: z.enum(['asc', 'desc']).optional(),
})

export const createWorkOrderSchema = z
  .object({
    assetId: z.uuid(),
    title: text(200),
    description: z.string().trim().max(4000).optional(),
    type: z.enum(WORK_ORDER_TYPES).default('CORRECTIVE'),
    priority: z.enum(WORK_ORDER_PRIORITIES).default('MEDIUM'),
    plannedStart: instant.optional(),
    plannedEnd: instant.optional(),
  })
  .refine((v) => !v.plannedStart || !v.plannedEnd || v.plannedEnd >= v.plannedStart, {
    path: ['plannedEnd'],
    message: 'La fecha límite no puede ser anterior al inicio planificado',
  })

export const updateWorkOrderSchema = z
  .object({
    title: text(200),
    description: z.string().trim().max(4000).nullable(),
    type: z.enum(WORK_ORDER_TYPES),
    priority: z.enum(WORK_ORDER_PRIORITIES),
    plannedStart: instant.nullable(),
    plannedEnd: instant.nullable(),
    assignedTo: z.uuid().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export const transitionSchema = z.object({
  to: z.enum(WORK_ORDER_STATUSES),
  note: z.string().trim().max(1000).optional(),
  /** Obligatorio al asignar si la OT aún no tiene responsable. */
  assignedTo: z.uuid().optional(),
  /** Obligatorio al completar: qué se hizo. */
  completionNotes: z.string().trim().max(4000).optional(),
})

export const listPlansQuerySchema = z.object({
  ...paginationShape,
  assetId: z.uuid().optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
})

export const createPlanSchema = z.object({
  assetId: z.uuid(),
  name: text(200),
  description: z.string().trim().max(4000).optional(),
  planType: z.enum(PLAN_TYPES).default('PREVENTIVE'),
  priority: z.enum(WORK_ORDER_PRIORITIES).default('MEDIUM'),
  frequencyValue: z.number().int().min(1).max(1000),
  frequencyUnit: z.enum(FREQUENCY_UNITS),
  firstDueAt: instant,
})

export const updatePlanSchema = z
  .object({
    name: text(200),
    description: z.string().trim().max(4000).nullable(),
    priority: z.enum(WORK_ORDER_PRIORITIES),
    frequencyValue: z.number().int().min(1).max(1000),
    frequencyUnit: z.enum(FREQUENCY_UNITS),
    nextDueAt: instant,
    status: z.enum(['ACTIVE', 'PAUSED']),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export type ListWorkOrdersQuery = z.infer<typeof listWorkOrdersQuerySchema>
export type CreateWorkOrderDto = z.infer<typeof createWorkOrderSchema>
export type UpdateWorkOrderDto = z.infer<typeof updateWorkOrderSchema>
export type TransitionDto = z.infer<typeof transitionSchema>
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>
export type CreatePlanDto = z.infer<typeof createPlanSchema>
export type UpdatePlanDto = z.infer<typeof updatePlanSchema>

/** Repuesto consumido por una orden: sale del stock de una ubicación (hasta 4 decimales, como la columna). */
export const addPartSchema = z.object({
  itemId: z.uuid(),
  locationId: z.uuid(),
  quantity: z
    .number()
    .positive('Debe ser mayor que cero')
    .max(1e9)
    .refine((v) => Math.abs(v * 10_000 - Math.round(v * 10_000)) < 1e-6, 'Máximo 4 decimales'),
  note: z.string().trim().max(500).optional(),
})
export type AddPartDto = z.infer<typeof addPartSchema>

const decimals4 = (v: number) => Math.abs(v * 10_000 - Math.round(v * 10_000)) < 1e-6

/**
 * Costo de una orden que no es un repuesto. Con `resourceId` el costo unitario sale del libro de precios de Presupuestos
 * (convertido a la moneda de la planta); sin recurso hay que describirlo y dar su costo unitario.
 */
export const addCostSchema = z
  .object({
    kind: z.enum(COST_KINDS),
    resourceId: z.uuid().optional(),
    description: z.string().trim().min(1).max(200).optional(),
    quantity: z.number().positive('Debe ser mayor que cero').max(1e9).refine(decimals4, 'Máximo 4 decimales'),
    unitCost: z.number().min(0, 'No puede ser negativo').max(1e12).refine(decimals4, 'Máximo 4 decimales').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.resourceId) {
      if (v.unitCost !== undefined) ctx.addIssue({ code: 'custom', path: ['unitCost'], message: 'No indiques el costo unitario: sale del libro de precios' })
    } else {
      if (!v.description) ctx.addIssue({ code: 'custom', path: ['description'], message: 'Requerido si no eliges un recurso' })
      if (v.unitCost === undefined) ctx.addIssue({ code: 'custom', path: ['unitCost'], message: 'Requerido si no eliges un recurso' })
    }
  })
export type AddCostDto = z.infer<typeof addCostSchema>
