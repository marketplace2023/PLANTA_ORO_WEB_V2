import { boolean, integer, jsonb, pgSchema, primaryKey, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { createdAt, pk, updatedAt } from './common'

// Arquitectura §9
export const coreSchema = pgSchema('core')

export const ecosystems = coreSchema.table('ecosystems', {
  id: pk(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const plants = coreSchema.table('plants', {
  id: pk(),
  ecosystemId: uuid('ecosystem_id')
    .notNull()
    .references(() => ecosystems.id),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 120 }).notNull().unique(),
  description: text('description'),
  countryCode: varchar('country_code', { length: 2 }),
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
  /** PUBLIC | AUTHENTICATED | PRIVATE */
  visibility: varchar('visibility', { length: 20 }).notNull().default('PRIVATE'),
  logoUrl: text('logo_url'),
  heroImageUrl: text('hero_image_url'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const plantSettings = coreSchema.table('plant_settings', {
  plantId: uuid('plant_id')
    .primaryKey()
    .references(() => plants.id, { onDelete: 'cascade' }),
  currencyCode: varchar('currency_code', { length: 3 }).notNull().default('USD'),
  locale: varchar('locale', { length: 10 }).notNull().default('es'),
  unitsSystem: varchar('units_system', { length: 20 }).notNull().default('METRIC'),
  publicDashboard: boolean('public_dashboard').notNull().default(false),
  publicAssets: boolean('public_assets').notNull().default(false),
  publicProcesses: boolean('public_processes').notNull().default(false),
  publicDocuments: boolean('public_documents').notNull().default(false),
  metadata: jsonb('metadata').notNull().default({}),
  /** Contador atómico para generar códigos FUR de activos (FUR-<planta>-00001). */
  assetSeq: integer('asset_seq').notNull().default(0),
})

/**
 * Contadores atómicos de códigos legibles por planta, tipo y año (OT-2026-00418, RQ-2026-00102…).
 * Se incrementan con INSERT … ON CONFLICT DO UPDATE dentro de la misma transacción que crea el registro.
 */
export const codeSequences = coreSchema.table(
  'code_sequences',
  {
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 20 }).notNull(),
    year: integer('year').notNull(),
    lastValue: integer('last_value').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.plantId, t.kind, t.year] })],
)
