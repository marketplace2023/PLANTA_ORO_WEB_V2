import { bigint, index, integer, pgSchema, primaryKey, text, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { assets } from './asset'
import { createdAt, pk, updatedAt } from './common'
import { plants } from './core'
import { users } from './iam'
import { plantStages } from './process'

// Arquitectura §22. Un documento es lógico (título, tipo, visibilidad); cada archivo subido es una versión.
// La base de datos guarda metadata, checksum y storage_key: nunca el binario (§45).
export const documentSchema = pgSchema('document')

export const DOCUMENT_TYPES = ['MANUAL', 'PLANO', 'SOP', 'PROCEDIMIENTO', 'DATASHEET', 'CERTIFICADO', 'INFORME', 'FOTO', 'OTRO'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

/** PUBLIC: visible a visitantes si la planta publica sus documentos. INTERNAL: solo quien tiene document.read. */
export const DOCUMENT_VISIBILITIES = ['PUBLIC', 'INTERNAL'] as const
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number]

export const documents = documentSchema.table(
  'documents',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    documentType: varchar('document_type', { length: 30 }).notNull().default('OTRO'),
    visibility: varchar('visibility', { length: 20 }).notNull().default('INTERNAL'),
    /** ACTIVE | ARCHIVED. Archivar oculta el documento sin borrar archivos ni historial (§47.10). */
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    currentVersion: integer('current_version').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_documents_plant_status').on(t.plantId, t.status), index('idx_documents_plant_type').on(t.plantId, t.documentType)],
)

export const documentVersions = documentSchema.table(
  'document_versions',
  {
    id: pk(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    /** Tipo canónico derivado de la extensión y verificado contra el contenido; nunca el que declara el cliente. */
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    checksum: varchar('checksum', { length: 64 }).notNull(),
    storageKey: text('storage_key').notNull(),
    note: text('note'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.documentId, t.version)],
)

export const assetDocuments = documentSchema.table(
  'asset_documents',
  {
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    relationType: varchar('relation_type', { length: 40 }).notNull().default('GENERAL'),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.assetId] }), index('idx_asset_documents_asset').on(t.assetId)],
)

export const stageDocuments = documentSchema.table(
  'stage_documents',
  {
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    plantStageId: uuid('plant_stage_id')
      .notNull()
      .references(() => plantStages.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.plantStageId] })],
)
