import { boolean, index, integer, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { createdAt, pk } from './common'
import { budgetSchema } from './budget'
import { budgetCatalogReleases } from './budget-catalog'
import { plants } from './core'
import { users } from './iam'
import type { LuloInput } from '../../modules/budget/lulo.schemas'
import type { LuloCatalog, LuloResult } from '../../modules/budget/lulo-engine'

export const budgetPublications = budgetSchema.table('catalog_publications', {
  id: pk(), releaseId: uuid('release_id').notNull().unique().references(() => budgetCatalogReleases.id, { onDelete: 'cascade' }),
  label: text('label').notNull(), profile: text('profile').notNull(), demo: boolean('demo').notNull().default(false),
  active: boolean('active').notNull().default(true), createdBy: uuid('created_by'), createdAt: createdAt(),
})

/** Frozen catalog and calculations survive publication changes. Legacy budgets keep their original engine/tables. */
export const luloDocuments = budgetSchema.table('lulo_documents', {
  id: pk(), plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull(), version: integer('version').notNull(), predecessorId: uuid('predecessor_id'),
  code: text('code').notNull(), title: text('title').notNull(), status: text('status').notNull().default('DRAFT'), revision: integer('revision').notNull().default(1),
  requestId: uuid('request_id').notNull(), requestHash: text('request_hash').notNull(),
  input: jsonb('input').$type<LuloInput>().notNull(), catalog: jsonb('catalog').$type<LuloCatalog>().notNull(), result: jsonb('result').$type<LuloResult>().notNull(),
  contentHash: text('content_hash').notNull(), createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  issuedBy: uuid('issued_by').references(() => users.id, { onDelete: 'set null' }), issuedAt: timestamp('issued_at', { withTimezone: true }),
  createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('lulo_document_request').on(t.plantId, t.requestId), unique('lulo_document_version').on(t.groupId, t.version), unique('lulo_document_code').on(t.plantId, t.code), index('lulo_document_plant').on(t.plantId, t.createdAt)])

export const luloRecalculationProposals = budgetSchema.table('lulo_recalculation_proposals', {
  id: pk(), plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }), documentId: uuid('document_id').notNull().references(() => luloDocuments.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(), hash: text('hash').notNull(), input: jsonb('input').$type<LuloInput>().notNull(), catalog: jsonb('catalog').$type<LuloCatalog>().notNull(), result: jsonb('result').$type<LuloResult>().notNull(),
  warnings: jsonb('warnings').$type<string[]>().notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), committedRevision: integer('committed_revision'), createdAt: createdAt(),
}, t => [unique('lulo_recalculation_hash').on(t.documentId, t.hash)])
