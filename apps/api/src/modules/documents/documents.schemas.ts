import { z } from 'zod'
import { paginationShape } from '../../common/pagination'
import { DOCUMENT_TYPES, DOCUMENT_VISIBILITIES } from '../../database/schema'

const stageCode = z.string().regex(/^D\d{2}$/, 'Código de etapa inválido (D01…D20)')

/** En multipart los valores llegan como texto: "id1,id2" → ['id1','id2']. */
const csv = (item: z.ZodType<string, string>) =>
  z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(item).max(50))

export const listDocumentsQuerySchema = z.object({
  ...paginationShape,
  type: z.enum(DOCUMENT_TYPES).optional(),
  assetId: z.uuid().optional(),
  stage: stageCode.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  /** Solo para personal con document.read; los visitantes siempre ven únicamente documentos activos. */
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
  sort: z.enum(['updatedAt', 'title']).default('updatedAt'),
  dir: z.enum(['asc', 'desc']).optional(),
})

const title = z.string().trim().min(1, 'Requerido').max(200)

/** Cuerpo multipart de la subida inicial (el archivo va en el campo `file`). */
export const createDocumentSchema = z.object({
  title,
  documentType: z.enum(DOCUMENT_TYPES).default('OTRO'),
  // Interno por defecto: publicar un documento debe ser una decisión explícita.
  visibility: z.enum(DOCUMENT_VISIBILITIES).default('INTERNAL'),
  assetIds: csv(z.uuid()).default([]),
  stageCodes: csv(stageCode).default([]),
  note: z.string().trim().max(500).optional(),
})

export const addVersionSchema = z.object({ note: z.string().trim().max(500).optional() })

export const updateDocumentSchema = z
  .object({
    title,
    documentType: z.enum(DOCUMENT_TYPES),
    visibility: z.enum(DOCUMENT_VISIBILITIES),
    assetIds: z.array(z.uuid()).max(50),
    stageCodes: z.array(stageCode).max(50),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export const downloadQuerySchema = z.object({
  /** inline=1 pide vista previa (solo PDF e imágenes); en el resto se descarga siempre. */
  inline: z.enum(['0', '1']).default('0'),
  version: z.coerce.number().int().min(1).optional(),
})

export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>
export type CreateDocumentDto = z.infer<typeof createDocumentSchema>
export type UpdateDocumentDto = z.infer<typeof updateDocumentSchema>
export type DownloadQuery = z.infer<typeof downloadQuerySchema>
