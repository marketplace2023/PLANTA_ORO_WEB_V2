import { z } from 'zod'
import { mapPositionSchema } from '../../common/map-position'
import { paginationShape } from '../../common/pagination'
import { ASSET_CRITICALITIES, ASSET_STATUSES } from '../../database/schema'

/** "A,B" → ['A', 'B'], validando cada valor contra el enum. */
const csv = <const T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1))

const stageCode = z.string().regex(/^D\d{2}$/, 'Código de etapa inválido (D01…D19)')
const networkCode = z.string().regex(/^FUR-[A-Z]+$/, 'Código de red inválido (p. ej. FUR-IOT)')

export const ASSET_SORTS = ['tag', 'name', 'status', 'criticality', 'updatedAt'] as const

/** Filtros del listado (arquitectura §29.4); se reflejan en la URL del frontend (design.md §13). */
export const listAssetsQuerySchema = z.object({
  ...paginationShape,
  search: z.string().trim().min(1).max(100).optional(),
  stage: stageCode.optional(),
  network: networkCode.optional(),
  family: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  status: csv(ASSET_STATUSES).optional(),
  criticality: csv(ASSET_CRITICALITIES).optional(),
  location: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(ASSET_SORTS).default('tag'),
  dir: z.enum(['asc', 'desc']).default('asc'),
})

const text = (max: number) => z.string().trim().min(1).max(max)

export const createAssetSchema = z.object({
  tag: text(60).transform((t) => t.toUpperCase()),
  name: text(200),
  assetModelId: z.uuid(),
  stageCode: stageCode.optional(),
  serialNumber: text(120).optional(),
  installationDate: z.iso.date().optional(),
  commissionDate: z.iso.date().optional(),
  // La baja es una acción propia (DELETE); un activo no nace dado de baja.
  status: z.enum(ASSET_STATUSES).exclude(['DECOMMISSIONED']).default('OPERATIVE'),
  criticality: z.enum(ASSET_CRITICALITIES).default('MEDIUM'),
  location: text(200).optional(),
  parentAssetId: z.uuid().optional(),
  // Privado por defecto: exponer un activo públicamente debe ser explícito.
  isPublic: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
  networkCodes: z.array(networkCode).max(20).default([]),
})

export const updateAssetSchema = z
  .object({
    tag: text(60).transform((t) => t.toUpperCase()),
    name: text(200),
    assetModelId: z.uuid(),
    stageCode: stageCode.nullable(),
    serialNumber: text(120).nullable(),
    installationDate: z.iso.date().nullable(),
    commissionDate: z.iso.date().nullable(),
    status: z.enum(ASSET_STATUSES),
    /** Motivo del cambio de estado; queda en el historial. */
    statusReason: text(500),
    criticality: z.enum(ASSET_CRITICALITIES),
    location: text(200).nullable(),
    parentAssetId: z.uuid().nullable(),
    isPublic: z.boolean(),
    metadata: z.record(z.string(), z.unknown()),
    /** Posición del activo sobre el mapa de la planta; null la quita. */
    mapPosition: mapPositionSchema.nullable(),
    networkCodes: z.array(networkCode).max(20),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>
export type CreateAssetDto = z.infer<typeof createAssetSchema>
export type UpdateAssetDto = z.infer<typeof updateAssetSchema>
