import { index, integer, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { createdAt, pk } from './common'
import { budgetSchema } from './budget'
import type { RecoveryReport } from '../../modules/budget/legacy-masters'
import type { CatalogDraft } from '../../modules/budget/catalog-review.rules'

/** Recovery batches are private staging. A recovered row is NOT a published/approved price. */
export const budgetMasterBatches=budgetSchema.table('master_batches',{
  id:pk(),fingerprint:text('fingerprint').notNull().unique(),source:text('source').notNull(),
  recoveryVersion:integer('recovery_version').notNull().default(1),status:text('status').notNull().default('STAGED'),
  report:jsonb('report').$type<RecoveryReport>().notNull(),createdAt:createdAt(),
})
export const budgetMasterEntries=budgetSchema.table('master_entries',{
  id:pk(),batchId:uuid('batch_id').notNull().references(()=>budgetMasterBatches.id,{onDelete:'cascade'}),
  kind:text('kind').notNull(),resourceType:text('resource_type').notNull(),sourceId:text('source_id').notNull(),
  code:text('code').notNull(),name:text('name').notNull(),unit:text('unit'),sourceContext:text('source_context').notNull(),
  status:text('status').notNull(),issues:jsonb('issues').$type<string[]>().notNull(),data:jsonb('data').$type<Record<string,unknown>>().notNull(),createdAt:createdAt(),
},t=>[unique('budget_master_entry_origin').on(t.batchId,t.kind,t.resourceType,t.code,t.sourceContext),index('budget_master_entry_search').on(t.batchId,t.kind,t.resourceType,t.code),index('budget_master_entry_status').on(t.batchId,t.status)])

/** Working copies preserve the imported source row. Every mutation has an audit event. */
export const budgetMasterReviews = budgetSchema.table('master_reviews', {
  entryId: uuid('entry_id').primaryKey().references(() => budgetMasterEntries.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(),
  state: text('state').notNull(),
  draft: jsonb('draft').$type<CatalogDraft>().notNull(),
  dependencies: jsonb('dependencies').$type<Record<string, number>>().notNull(),
  actorId: uuid('actor_id').notNull(),
  actorName: text('actor_name').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** A version is a fixed selection with all dependencies, not a live view of editable rows. */
export const budgetCatalogReleases = budgetSchema.table('catalog_releases', {
  id: pk(),
  batchId: uuid('batch_id').notNull().references(() => budgetMasterBatches.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  name: text('name').notNull(),
  state: text('state').notNull().default('DRAFT'),
  usage: text('usage').notNull().default('REFERENCE_ONLY'),
  contentHash: text('content_hash').notNull(),
  rootIds: jsonb('root_ids').$type<string[]>().notNull(),
  entryCount: integer('entry_count').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: createdAt(),
  publishedBy: uuid('published_by'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, t => [unique('budget_catalog_release_version').on(t.batchId, t.version)])

export const budgetCatalogReleaseEntries = budgetSchema.table('catalog_release_entries', {
  id: pk(),
  releaseId: uuid('release_id').notNull().references(() => budgetCatalogReleases.id, { onDelete: 'cascade' }),
  entryId: uuid('entry_id').notNull(),
  revision: integer('revision').notNull(),
  kind: text('kind').notNull(),
  resourceType: text('resource_type').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  snapshot: jsonb('snapshot').$type<{ sourceId: string; sourceContext: string; draft: CatalogDraft; dependencies: Record<string, number> }>().notNull(),
}, t => [unique('budget_catalog_release_entry').on(t.releaseId, t.entryId), index('budget_catalog_release_search').on(t.releaseId, t.code)])
