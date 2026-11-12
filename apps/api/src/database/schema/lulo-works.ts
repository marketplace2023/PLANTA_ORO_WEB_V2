import { boolean, index, integer, jsonb, numeric, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { budgetSchema } from './budget'
import { plants } from './core'
import { createdAt, pk } from './common'
import { luloDocuments } from './budget-lulo'
import type { ContractInput, WorkRecordInput } from '../../modules/budget/lulo-works.schemas'

export const luloClients = budgetSchema.table('lulo_clients', {
  id: pk(), plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }), code: text('code').notNull(), name: text('name').notNull(),
  taxId: text('tax_id').notNull(), contact: text('contact').notNull(), address: text('address').notNull(), status: text('status').notNull().default('ACTIVE'), revision: integer('revision').notNull().default(1), createdAt: createdAt(),
}, t => [unique('lulo_client_code').on(t.plantId, t.code)])
export const luloWorks = budgetSchema.table('lulo_works', {
  id: pk(), plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }), clientId: uuid('client_id').notNull().references(() => luloClients.id),
  code: text('code').notNull(), name: text('name').notNull(), location: text('location').notNull(), contractReference: text('contract_reference').notNull(), status: text('status').notNull().default('ACTIVE'), revision: integer('revision').notNull().default(1), createdAt: createdAt(),
}, t => [unique('lulo_work_code').on(t.plantId, t.code)])
export const luloContracts = budgetSchema.table('lulo_contracts', {
  id: pk(), plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }), workId: uuid('work_id').notNull().references(() => luloWorks.id),
  documentId: uuid('document_id').notNull().references(() => luloDocuments.id), code: text('code').notNull(), name: text('name').notNull(), currency: text('currency').notNull(),
  status: text('status').notNull().default('ACTIVE'), revision: integer('revision').notNull().default(1), input: jsonb('input').$type<ContractInput>().notNull(),
  baseline: jsonb('baseline').$type<Record<string, unknown>>().notNull(), createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('lulo_contract_code').on(t.plantId, t.code), index('lulo_contract_work').on(t.plantId, t.workId)])
export const luloContractItems = budgetSchema.table('lulo_contract_items', {
  id: pk(), contractId: uuid('contract_id').notNull().references(() => luloContracts.id, { onDelete: 'cascade' }), sourceLineId: text('source_line_id'),
  code: text('code').notNull(), name: text('name').notNull(), unit: text('unit').notNull(), chapter: text('chapter').notNull(),
  quantity: numeric('quantity', { precision: 30, scale: 8 }).notNull(), price: numeric('price', { precision: 30, scale: 8 }).notNull(), assetId: uuid('asset_id'),
  taxable: boolean('taxable').notNull().default(true),
}, t => [unique('lulo_contract_item_code').on(t.contractId, t.code)])
/** Typed payloads, shared lifecycle and immutable issue snapshots; every record belongs to one contract. */
export const luloWorkRecords = budgetSchema.table('lulo_work_records', {
  id: pk(), contractId: uuid('contract_id').notNull().references(() => luloContracts.id, { onDelete: 'cascade' }), kind: text('kind').notNull(),
  code: text('code').notNull(), title: text('title').notNull(), reference: text('reference'), status: text('status').notNull().default('DRAFT'), revision: integer('revision').notNull().default(1),
  predecessorId: uuid('predecessor_id'), payload: jsonb('payload').$type<WorkRecordInput>().notNull(), result: jsonb('result').$type<Record<string, unknown>>().notNull().default({}),
  contentHash: text('content_hash').notNull(), createdBy: uuid('created_by').notNull(), approvedBy: uuid('approved_by'), issuedAt: timestamp('issued_at', { withTimezone: true }),
  createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('lulo_work_record_code').on(t.contractId, t.code), unique('lulo_work_record_reference').on(t.contractId, t.kind, t.reference), index('lulo_work_record_query').on(t.contractId, t.kind, t.status)])
export const luloMeasurementAssignments = budgetSchema.table('lulo_measurement_assignments', {
  id: pk(), contractId: uuid('contract_id').notNull().references(() => luloContracts.id, { onDelete: 'cascade' }),
  measurementId: uuid('measurement_id').notNull().references(() => luloWorkRecords.id), valuationId: uuid('valuation_id').notNull().references(() => luloWorkRecords.id),
  itemId: uuid('item_id').notNull().references(() => luloContractItems.id), quantity: numeric('quantity', { precision: 30, scale: 8 }).notNull(),
}, t => [unique('lulo_measurement_valuation').on(t.measurementId, t.valuationId), index('lulo_measurement_consumption').on(t.contractId, t.measurementId)])
export const luloOperationRequests = budgetSchema.table('lulo_operation_requests', {
  id: pk(), plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }), requestId: uuid('request_id').notNull(), operation: text('operation').notNull(),
  inputHash: text('input_hash').notNull(), resultId: uuid('result_id').notNull(), createdAt: createdAt(),
}, t => [unique('lulo_operation_request').on(t.plantId, t.requestId)])
export const luloPriceLists = budgetSchema.table('lulo_price_lists', {
  id: pk(), plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }), code: text('code').notNull(), name: text('name').notNull(), currency: text('currency').notNull(),
  status: text('status').notNull().default('ACTIVE'), revision: integer('revision').notNull().default(1),
}, t => [unique('lulo_price_list_code').on(t.plantId, t.code)])
export const luloResourcePrices = budgetSchema.table('lulo_resource_prices', {
  id: pk(), plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }), listId: uuid('list_id').notNull().references(() => luloPriceLists.id),
  resourceId: uuid('resource_id').notNull(), amount: numeric('amount', { precision: 30, scale: 8 }).notNull(), baseDate: text('base_date').notNull(), validUntil: text('valid_until').notNull(),
  unit: text('unit').notNull(), costBasis: text('cost_basis').notNull(), evidence: text('evidence').notNull(), supplier: text('supplier').notNull(), zeroReason: text('zero_reason').notNull(),
  revision: integer('revision').notNull(), createdBy: uuid('created_by').notNull(), createdAt: createdAt(),
}, t => [unique('lulo_resource_price_version').on(t.listId, t.resourceId, t.baseDate, t.revision), index('lulo_price_resolution').on(t.listId, t.resourceId, t.baseDate)])
export const luloMasterImports = budgetSchema.table('lulo_master_imports', {
  id: pk(), plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }), hash: text('hash').notNull(), status: text('status').notNull().default('PREVIEW'),
  input: jsonb('input').$type<Record<string, unknown>>().notNull(), result: jsonb('result').$type<Record<string, unknown>>().notNull(), createdBy: uuid('created_by').notNull(), createdAt: createdAt(),
}, t => [unique('lulo_import_fingerprint').on(t.plantId, t.hash)])
export const luloReferences = budgetSchema.table('lulo_references', {
  id: pk(), plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }), kind: text('kind').notNull(), code: text('code').notNull(), name: text('name').notNull(),
  dimension: text('dimension').notNull(), notes: text('notes').notNull(), status: text('status').notNull().default('ACTIVE'), revision: integer('revision').notNull().default(1), createdAt: createdAt(),
}, t => [unique('lulo_reference_code').on(t.plantId, t.kind, t.code)])
