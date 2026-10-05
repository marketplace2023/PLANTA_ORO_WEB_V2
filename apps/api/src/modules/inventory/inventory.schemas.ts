import { z } from 'zod'
import { paginationShape } from '../../common/pagination'
import { ITEM_TYPES, LOCATION_TYPES, MOVEMENT_TYPES, REFERENCE_TYPES } from '../../database/schema'

const csv = <const T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1))

const text = (max: number) => z.string().trim().min(1).max(max)
const code = (max: number) => z.string().trim().toUpperCase().regex(new RegExp(`^[A-Z0-9][A-Z0-9._-]{0,${max - 1}}$`), 'Solo letras, números, punto, guion y guion bajo')

/** Cantidades con hasta 4 decimales (la columna es numeric(18,4)): evita redondeos silenciosos. */
const decimal4 = z.number().refine((v) => Math.abs(v * 10_000 - Math.round(v * 10_000)) < 1e-6, 'Máximo 4 decimales')
const quantity = decimal4.pipe(z.number().positive('Debe ser mayor que cero').max(1e9))
const nonNegative = decimal4.pipe(z.number().min(0, 'No puede ser negativo').max(1e9))

// ----- Almacenes y ubicaciones -----
export const createWarehouseSchema = z.object({ code: code(30), name: text(160) })
export const updateWarehouseSchema = z
  .object({ name: text(160), status: z.enum(['ACTIVE', 'INACTIVE']) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export const createLocationSchema = z.object({
  warehouseId: z.uuid(),
  parentId: z.uuid().optional(),
  code: code(40),
  name: text(160),
  locationType: z.enum(LOCATION_TYPES).default('ZONE'),
})
export const updateLocationSchema = z
  .object({ name: text(160), locationType: z.enum(LOCATION_TYPES), status: z.enum(['ACTIVE', 'INACTIVE']) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')
export const listLocationsQuerySchema = z.object({ warehouseId: z.uuid().optional() })

// ----- Ítems -----
export const listItemsQuerySchema = z.object({
  ...paginationShape,
  type: csv(ITEM_TYPES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  critical: z.enum(['0', '1']).optional(),
  /** Por debajo del mínimo configurado. */
  low: z.enum(['0', '1']).optional(),
  warehouseId: z.uuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
  sort: z.enum(['name', 'sku', 'onHand']).default('name'),
  dir: z.enum(['asc', 'desc']).optional(),
})

export const createItemSchema = z
  .object({
    sku: code(60),
    name: text(200),
    description: z.string().trim().max(2000).optional(),
    itemType: z.enum(ITEM_TYPES).default('SPARE'),
    uom: code(10).default('UND'),
    minStock: nonNegative.default(0),
    maxStock: nonNegative.optional(),
    isCritical: z.boolean().default(false),
    unitCost: nonNegative.optional(),
    assetModelId: z.uuid().optional(),
  })
  .refine((v) => v.maxStock === undefined || v.maxStock >= v.minStock, { path: ['maxStock'], message: 'El máximo no puede ser menor que el mínimo' })

export const updateItemSchema = z
  .object({
    name: text(200),
    description: z.string().trim().max(2000).nullable(),
    itemType: z.enum(ITEM_TYPES),
    minStock: nonNegative,
    maxStock: nonNegative.nullable(),
    isCritical: z.boolean(),
    unitCost: nonNegative.nullable(),
    assetModelId: z.uuid().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

// ----- Movimientos -----
export const receiptSchema = z.object({
  itemId: z.uuid(),
  locationId: z.uuid(),
  quantity,
  /** Si se indica, actualiza el costo promedio ponderado del ítem. */
  unitCost: nonNegative.optional(),
  note: z.string().trim().max(500).optional(),
})
export const issueSchema = z.object({ itemId: z.uuid(), locationId: z.uuid(), quantity, note: z.string().trim().max(500).optional() })
export const transferSchema = z.object({ itemId: z.uuid(), fromLocationId: z.uuid(), toLocationId: z.uuid(), quantity, note: z.string().trim().max(500).optional() })
export const adjustSchema = z.object({ itemId: z.uuid(), locationId: z.uuid(), newQuantity: nonNegative, reason: text(500) })

export const listMovementsQuerySchema = z.object({
  ...paginationShape,
  itemId: z.uuid().optional(),
  locationId: z.uuid().optional(),
  type: csv(MOVEMENT_TYPES).optional(),
  referenceType: z.enum(REFERENCE_TYPES).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})

export type CreateWarehouseDto = z.infer<typeof createWarehouseSchema>
export type UpdateWarehouseDto = z.infer<typeof updateWarehouseSchema>
export type CreateLocationDto = z.infer<typeof createLocationSchema>
export type UpdateLocationDto = z.infer<typeof updateLocationSchema>
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>
export type CreateItemDto = z.infer<typeof createItemSchema>
export type UpdateItemDto = z.infer<typeof updateItemSchema>
export type ReceiptDto = z.infer<typeof receiptSchema>
export type IssueDto = z.infer<typeof issueSchema>
export type TransferDto = z.infer<typeof transferSchema>
export type AdjustDto = z.infer<typeof adjustSchema>
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>
