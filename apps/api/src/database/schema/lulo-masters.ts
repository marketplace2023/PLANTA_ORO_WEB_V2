import { boolean, index, integer, jsonb, numeric, text, unique, uuid } from 'drizzle-orm/pg-core'
import { budgetSchema } from './budget'
import { budgetMasterBatches, budgetMasterEntries } from './budget-catalog'
import { plants } from './core'
import { createdAt, pk } from './common'

export const luloMasterCatalogs = budgetSchema.table('lulo_master_catalogs', {
  id: uuid('id').primaryKey().references(() => budgetMasterBatches.id),
  name: text('name').notNull(), sourceHash: text('source_hash').notNull(), active: boolean('active').notNull().default(true),
  counts: jsonb('counts').$type<Record<string, number>>().notNull(), createdAt: createdAt(),
})
export const luloMasterFamilies = budgetSchema.table('lulo_master_families', {
  plantId: uuid('plant_id').references(() => plants.id, { onDelete: 'cascade' }), active: boolean('active').notNull().default(true),
  id: uuid('id').primaryKey().references(() => budgetMasterEntries.id), catalogId: uuid('catalog_id').notNull().references(() => luloMasterCatalogs.id, { onDelete: 'cascade' }),
  code: text('code').notNull(), name: text('name').notNull(), resourceType: text('resource_type').notNull(),
}, t => [unique('lulo_family_origin').on(t.catalogId, t.plantId, t.resourceType, t.code).nullsNotDistinct()])
export const luloMasterResources = budgetSchema.table('lulo_master_resources', {
  plantId: uuid('plant_id').references(() => plants.id, { onDelete: 'cascade' }), active: boolean('active').notNull().default(true),
  id: uuid('id').primaryKey().references(() => budgetMasterEntries.id), catalogId: uuid('catalog_id').notNull().references(() => luloMasterCatalogs.id, { onDelete: 'cascade' }),
  familyId: uuid('family_id').references(() => luloMasterFamilies.id), code: text('code').notNull(), name: text('name').notNull(), resourceType: text('resource_type').notNull(),
  unit: text('unit'), originalUnit: text('original_unit'), historicalPrice: numeric('historical_price', { precision: 30, scale: 8 }).notNull(),
  dailyCost: numeric('daily_cost', { precision: 30, scale: 8 }), depreciation: numeric('depreciation', { precision: 20, scale: 10 }),
  wastePct: numeric('waste_pct', { precision: 18, scale: 8 }), sourceDate: text('source_date'),
  currency: text('currency'), priceStatus: text('price_status').notNull().default('HISTORICAL'),
  sourceFields: jsonb('source_fields').$type<Record<string, unknown>>().notNull().default({}),
}, t => [unique('lulo_resource_origin').on(t.catalogId, t.plantId, t.resourceType, t.code).nullsNotDistinct(), index('lulo_resource_listing').on(t.catalogId, t.resourceType, t.familyId, t.code)])
export const luloMasterItems = budgetSchema.table('lulo_master_items', {
  plantId: uuid('plant_id').references(() => plants.id, { onDelete: 'cascade' }), active: boolean('active').notNull().default(true),
  id: uuid('id').primaryKey().references(() => budgetMasterEntries.id), catalogId: uuid('catalog_id').notNull().references(() => luloMasterCatalogs.id, { onDelete: 'cascade' }),
  code: text('code').notNull(), name: text('name').notNull(), unit: text('unit'), yieldValue: numeric('yield_value', { precision: 30, scale: 8 }).notNull(),
  originalUnitPrice: numeric('original_unit_price', { precision: 30, scale: 8 }).notNull(), issues: jsonb('issues').$type<string[]>().notNull(),
  standardCode: text('standard_code'), sourceFields: jsonb('source_fields').$type<Record<string, unknown>>().notNull().default({}),
}, t => [unique('lulo_item_origin').on(t.catalogId, t.plantId, t.code).nullsNotDistinct(), index('lulo_item_listing').on(t.catalogId, t.code)])
export const luloMasterComponents = budgetSchema.table('lulo_master_components', {
  id: pk(), itemId: uuid('item_id').notNull().references(() => luloMasterItems.id, { onDelete: 'cascade' }), position: integer('position').notNull(),
  resourceId: uuid('resource_id').references(() => luloMasterResources.id), resourceType: text('resource_type').notNull(), originalCode: text('original_code').notNull(),
  quantity: numeric('quantity', { precision: 30, scale: 8 }).notNull(), wastePct: numeric('waste_pct', { precision: 18, scale: 8 }), depreciation: numeric('depreciation', { precision: 20, scale: 10 }),
  sourceFields: jsonb('source_fields').$type<Record<string, unknown>>().notNull().default({}),
}, t => [unique('lulo_component_position').on(t.itemId, t.position), index('lulo_component_resource').on(t.resourceId)])
/** Plant work never rewrites the common imported catalog. */
export const luloPlantMasterValues = budgetSchema.table('lulo_plant_master_values', {
  id: pk(), plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }),
  entryId: uuid('entry_id').notNull().references(() => budgetMasterEntries.id), revision: integer('revision').notNull().default(1),
  value: jsonb('value').$type<{ name: string; unit: string | null; amount: string | null; currency: string | null; baseDate: string | null; validUntil: string | null; evidence: string; verified: boolean; zeroReason?: string; yieldValue?: string; components?: { resourceId: string; quantity: string; wastePct: string }[] }>().notNull(),
  actorId: uuid('actor_id').notNull(), updatedAt: createdAt(),
}, t => [unique('lulo_plant_master_value').on(t.plantId, t.entryId)])
