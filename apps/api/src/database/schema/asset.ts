import { boolean, date, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { assetFamilies, assetModels, manufacturers } from './catalog'
import { createdAt, pk, updatedAt } from './common'
import { plants } from './core'
import { users } from './iam'
import { networkMaster, plantNetworks } from './plant'
import { plantStages, stageMaster } from './process'

// Arquitectura §13: instancias físicas que una planta realmente posee/usa.
export const assetSchema = pgSchema('asset')

/** Secuencia sin reinicio anual por planta, red, etapa y familia. No depende del número de activos vivos. */
export const assetTagSequences = assetSchema.table('tag_sequences', {
  plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }),
  networkMasterId: uuid('network_master_id').notNull().references(() => networkMaster.id),
  stageMasterId: uuid('stage_master_id').notNull().references(() => stageMaster.id),
  familyId: uuid('family_id').notNull().references(() => assetFamilies.id),
  lastValue: integer('last_value').notNull(),
}, (t) => [primaryKey({ columns: [t.plantId, t.networkMasterId, t.stageMasterId, t.familyId] })])

/** Estados del activo (arquitectura §13.2, design.md §16). */
export const ASSET_STATUSES = [
  'OPERATIVE',
  'MAINTENANCE',
  'OUT_OF_SERVICE',
  'CRITICAL',
  'STANDBY',
  'COMMISSIONING',
  'STOCK',
  'REPAIR',
  'DECOMMISSIONED',
] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

export const ASSET_CRITICALITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type AssetCriticality = (typeof ASSET_CRITICALITIES)[number]

export const assets = assetSchema.table(
  'assets',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    /** Etapa habilitada de ESTA planta (se valida en el servicio). Nulo = aún sin asignar a una etapa. */
    plantStageId: uuid('plant_stage_id').references(() => plantStages.id, { onDelete: 'set null' }),
    assetModelId: uuid('asset_model_id')
      .references(() => assetModels.id),
    familyId: uuid('family_id').references(() => assetFamilies.id),
    /** Copia inicial del modelo; los cambios de la unidad física no modifican el catálogo. */
    specifications: jsonb('specifications').notNull().default({}),
    technicalData: jsonb('technical_data').notNull().default({}),
    /** Ficha Única de Registro: identificador persistente y legible, p. ej. FUR-REV-II-00042. */
    furCode: varchar('fur_code', { length: 60 }).notNull(),
    tag: varchar('tag', { length: 60 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    serialNumber: varchar('serial_number', { length: 120 }),
    manufacturerId: uuid('manufacturer_id').references(() => manufacturers.id),
    installationDate: date('installation_date'),
    commissionDate: date('commission_date'),
    status: varchar('status', { length: 30 }).notNull().default('OPERATIVE'),
    criticality: varchar('criticality', { length: 20 }).notNull().default('MEDIUM'),
    /** Texto libre hasta que exista inventory.locations (fase 2), que lo reemplazará por location_id. */
    location: varchar('location', { length: 200 }),
    parentAssetId: uuid('parent_asset_id'),
    isPublic: boolean('is_public').notNull().default(false),
    metadata: jsonb('metadata').notNull().default({}),
    /** Posición manual en las tarjetas del geoportal (orden de la planta; los nuevos van al final). */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('assets_plant_tag_unique').on(t.plantId, t.tag),
    unique('assets_plant_fur_unique').on(t.plantId, t.furCode),
    index('idx_assets_plant_stage').on(t.plantId, t.plantStageId),
    index('idx_assets_plant_status').on(t.plantId, t.status),
  ],
)

/** Un activo puede relacionarse con varias redes, siempre habilitadas en su planta (§47.3). */
export const assetCatalogReferences = assetSchema.table('catalog_references', {
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  assetModelId: uuid('asset_model_id').notNull().references(() => assetModels.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.assetId, t.assetModelId] })])

export const assetNetworks = assetSchema.table(
  'asset_networks',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    plantNetworkId: uuid('plant_network_id')
      .notNull()
      .references(() => plantNetworks.id, { onDelete: 'cascade' }),
    relationType: varchar('relation_type', { length: 40 }).notNull().default('MEMBER'),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.plantNetworkId] })],
)

/** Los registros históricos no se sobrescriben (§47.10): cada cambio de estado es una fila nueva. */
export const assetStatusHistory = assetSchema.table(
  'asset_status_history',
  {
    id: pk(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    oldStatus: varchar('old_status', { length: 30 }),
    newStatus: varchar('new_status', { length: 30 }).notNull(),
    reason: text('reason'),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_asset_status_history_asset').on(t.assetId, t.changedAt)],
)

/** Solicitud de catálogo: conserva la ficha de planta hasta su aprobación. */
export const catalogRequests = assetSchema.table('catalog_requests', {
  id: pk(),
  plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  draft: jsonb('draft').notNull(),
  status: varchar('status', { length: 12 }).notNull().default('PENDING'),
  modelId: uuid('model_id').references(() => assetModels.id),
  assetId: uuid('asset_id').references(() => assets.id),
  decisionNote: text('decision_note'),
  decidedBy: uuid('decided_by').references(() => users.id),
  createdAt: createdAt(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
})
