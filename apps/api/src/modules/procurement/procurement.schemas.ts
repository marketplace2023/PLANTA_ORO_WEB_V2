import { z } from 'zod'
import { paginationShape } from '../../common/pagination'
import { REQUISITION_STATUSES, WORK_ORDER_PRIORITIES } from '../../database/schema'

const csv = z
  .string()
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(z.enum(REQUISITION_STATUSES)).min(1))

const decimal4 = z.number().refine((v) => Math.abs(v * 10_000 - Math.round(v * 10_000)) < 1e-6, 'Máximo 4 decimales')
const quantity = decimal4.pipe(z.number().positive('Debe ser mayor que cero').max(1e9))
const price = z
  .number()
  .min(0)
  .max(1e12)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Máximo 2 decimales')
const date = z.iso.date()
const reason = z.string().trim().min(1, 'Indique el motivo').max(1000)

export const lineSchema = z.object({
  /** Ítem del inventario: si se indica, la unidad se toma de él y la recepción ingresa stock. */
  itemId: z.uuid().optional(),
  description: z.string().trim().min(1).max(500),
  quantity,
  uom: z.string().trim().toUpperCase().min(1).max(10).optional(),
  estimatedPrice: price.optional(),
})

export const createRequisitionSchema = z.object({
  justification: z.string().trim().min(3, 'Explique para qué se necesita').max(4000),
  priority: z.enum(WORK_ORDER_PRIORITIES).default('MEDIUM'),
  neededBy: date.optional(),
  stageCode: z.string().trim().toUpperCase().max(10).optional(),
  assetId: z.uuid().optional(),
  workOrderId: z.uuid().optional(),
  lines: z.array(lineSchema).min(1, 'Agregue al menos una línea').max(100),
})

export const updateRequisitionSchema = z
  .object({
    justification: createRequisitionSchema.shape.justification,
    priority: z.enum(WORK_ORDER_PRIORITIES),
    neededBy: date.nullable(),
    stageCode: z.string().trim().toUpperCase().max(10).nullable(),
    assetId: z.uuid().nullable(),
    workOrderId: z.uuid().nullable(),
    lines: z.array(lineSchema).min(1, 'Agregue al menos una línea').max(100),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export const listRequisitionsQuerySchema = z.object({
  ...paginationShape,
  status: csv.optional(),
  priority: z.enum(WORK_ORDER_PRIORITIES).optional(),
  assetId: z.uuid().optional(),
  mine: z.enum(['0', '1']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['createdAt', 'neededBy', 'code']).default('createdAt'),
  dir: z.enum(['asc', 'desc']).optional(),
})

export const decisionSchema = z.object({ note: reason.optional() })
export const rejectSchema = z.object({ note: reason })
export const cancelSchema = z.object({ note: reason })

export const createRfqSchema = z.object({
  providerIds: z.array(z.uuid()).min(1, 'Invite al menos a un proveedor').max(20),
  deadlineAt: z.iso.datetime({ offset: true }),
})

export const awardSchema = z.object({ quoteId: z.uuid() })

export const receiveSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        quantity,
        /** Obligatoria para líneas con ítem de inventario; sin ella no hay dónde ingresar el stock. */
        locationId: z.uuid().optional(),
        unitCost: price.optional(),
      }),
    )
    .min(1)
    .max(100),
  note: z.string().trim().max(500).optional(),
})

export const quoteSchema = z.object({
  currency: z.string().trim().length(3).transform((c) => c.toUpperCase()),
  totalAmount: price.refine((v) => v > 0, 'Debe ser mayor que cero'),
  deliveryDays: z.number().int().min(0).max(3650),
  conditions: z.string().trim().max(2000).optional(),
})

export type CreateRequisitionDto = z.infer<typeof createRequisitionSchema>
export type UpdateRequisitionDto = z.infer<typeof updateRequisitionSchema>
export type ListRequisitionsQuery = z.infer<typeof listRequisitionsQuerySchema>
export type CreateRfqDto = z.infer<typeof createRfqSchema>
export type ReceiveDto = z.infer<typeof receiveSchema>
export type QuoteDto = z.infer<typeof quoteSchema>
export type LineDto = z.infer<typeof lineSchema>
