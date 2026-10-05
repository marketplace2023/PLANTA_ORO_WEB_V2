import { z } from 'zod'
import { paginationShape } from '../../common/pagination'
import { BUDGET_STATUSES, RESOURCE_TYPE_VALUES } from '../../database/schema'

const text = (max: number) => z.string().trim().min(1).max(max)
const code = (max: number) => z.string().trim().toUpperCase().regex(new RegExp(`^[A-Z0-9][A-Z0-9._-]{0,${max - 1}}$`), 'Solo letras, números, punto, guion y guion bajo')
const decimal = (places: number) => (v: number) => Math.abs(v * 10 ** places - Math.round(v * 10 ** places)) < 1e-6
const money4 = z.number().min(0).max(1e12).refine(decimal(4), 'Máximo 4 decimales')
const qty = z.number().positive('Debe ser mayor que cero').max(1e9).refine(decimal(4), 'Máximo 4 decimales')
const pct = z.number().min(0, 'Entre 0 y 100').max(100, 'Entre 0 y 100').refine(decimal(2), 'Máximo 2 decimales')
const currency = z.string().trim().length(3).transform((c) => c.toUpperCase())
const nonEmpty = <T extends z.ZodRawShape>(shape: T) => z.object(shape).partial().refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')
const isoDate = z.iso.date()
const activeStatus = z.enum(['ACTIVE', 'INACTIVE'])

// ----- Recursos y precios -----
export const createResourceSchema = z.object({
  code: code(40),
  name: text(200),
  resourceType: z.enum(RESOURCE_TYPE_VALUES),
  unit: code(10),
  unitPrice: money4,
  currency: currency.optional(),
})
export const updateResourceSchema = nonEmpty({
  name: text(200),
  unitPrice: money4,
  currency,
  status: activeStatus,
  /** Nota del cambio de precio (queda en el historial). */
  note: z.string().trim().max(300),
})
export const listResourcesQuerySchema = z.object({
  ...paginationShape,
  type: z.enum(RESOURCE_TYPE_VALUES).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
  search: z.string().trim().min(1).max(100).optional(),
})
export const importInventorySchema = z.object({ itemId: z.uuid(), resourceType: z.enum(['MATERIAL', 'EQUIPMENT', 'TRANSPORT']).default('MATERIAL'), code: code(40).optional() })
export const exchangeRateSchema = z.object({ currency, rate: z.number().positive().max(1e9).refine(decimal(6), 'Máximo 6 decimales') })

// ----- APU -----
export const createApuSchema = z.object({
  code: code(40),
  name: text(200),
  unit: code(10),
  description: z.string().trim().max(2000).optional(),
  yieldValue: qty.default(1),
  hoursPerDay: z.number().positive().max(24).refine(decimal(2), 'Máximo 2 decimales').default(8),
})
export const updateApuSchema = nonEmpty({
  name: text(200),
  description: z.string().trim().max(2000).nullable(),
  yieldValue: qty,
  hoursPerDay: z.number().positive().max(24).refine(decimal(2), 'Máximo 2 decimales'),
  status: activeStatus,
})
export const apuLineSchema = z.object({ resourceId: z.uuid(), quantity: qty, wastePct: pct.default(0) })
export const updateApuLineSchema = nonEmpty({ quantity: qty, wastePct: pct })
export const listApusQuerySchema = z.object({
  ...paginationShape,
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
  search: z.string().trim().min(1).max(100).optional(),
})

// ----- Proyectos y presupuestos -----
export const createProjectSchema = z.object({ code: code(30), name: text(200), description: z.string().trim().max(2000).optional() })
export const updateProjectSchema = nonEmpty({ name: text(200), description: z.string().trim().max(2000).nullable(), status: z.enum(['ACTIVE', 'CLOSED']) })

export const createBudgetSchema = z.object({
  projectId: z.uuid(),
  name: text(200),
  overheadPct: pct.default(0),
  utilityPct: pct.default(0),
  taxPct: pct.default(0),
})
export const updateBudgetSchema = nonEmpty({ name: text(200), overheadPct: pct, utilityPct: pct, taxPct: pct })
export const listBudgetsQuerySchema = z.object({
  ...paginationShape,
  status: z.enum([...BUDGET_STATUSES, 'ALL']).default('ALL'),
  projectId: z.uuid().optional(),
  search: z.string().trim().min(1).max(100).optional(),
})

export const chapterSchema = z.object({ code: code(20), name: text(200) })
export const updateChapterSchema = nonEmpty({ name: text(200), position: z.number().int().min(0).max(500) })

export const itemSchema = z.object({ chapterId: z.uuid(), apuId: z.uuid(), code: code(30), description: text(2000).optional(), quantity: qty })
export const updateItemSchema = nonEmpty({ apuId: z.uuid(), description: text(2000), quantity: qty, chapterId: z.uuid() })

// ----- Escenarios -----
export const scenarioSchema = z.object({
  name: text(120),
  adjustments: z.partialRecord(z.enum(RESOURCE_TYPE_VALUES), z.number().min(-100, 'Entre -100 y 1000').max(1000, 'Entre -100 y 1000').refine(decimal(2), 'Máximo 2 decimales')).default({}),
})

// ----- Valorizaciones -----
export const valuationSchema = z
  .object({
    periodStart: isoDate,
    periodEnd: isoDate,
    note: z.string().trim().max(500).optional(),
    lines: z.array(z.object({ itemId: z.uuid(), quantity: qty })).min(1, 'Agregue al menos una partida').max(500),
  })
  .refine((v) => v.periodEnd >= v.periodStart, { path: ['periodEnd'], message: 'El fin del periodo no puede ser anterior al inicio' })

export type CreateResourceDto = z.infer<typeof createResourceSchema>
export type UpdateResourceDto = z.infer<typeof updateResourceSchema>
export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>
export type CreateApuDto = z.infer<typeof createApuSchema>
export type UpdateApuDto = z.infer<typeof updateApuSchema>
export type ApuLineDto = z.infer<typeof apuLineSchema>
export type UpdateApuLineDto = z.infer<typeof updateApuLineSchema>
export type ListApusQuery = z.infer<typeof listApusQuerySchema>
export type CreateProjectDto = z.infer<typeof createProjectSchema>
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>
export type CreateBudgetDto = z.infer<typeof createBudgetSchema>
export type UpdateBudgetDto = z.infer<typeof updateBudgetSchema>
export type ListBudgetsQuery = z.infer<typeof listBudgetsQuerySchema>
export type ChapterDto = z.infer<typeof chapterSchema>
export type UpdateChapterDto = z.infer<typeof updateChapterSchema>
export type ItemDto = z.infer<typeof itemSchema>
export type UpdateItemDto = z.infer<typeof updateItemSchema>
export type ScenarioDto = z.infer<typeof scenarioSchema>
export type ValuationDto = z.infer<typeof valuationSchema>
