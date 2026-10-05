import { boolean, index, numeric, pgSchema, primaryKey, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { assetFamilies, assetModels } from './catalog'
import { createdAt, pk, updatedAt } from './common'
import { stageMaster } from './process'
import { providers } from './provider'

// Arquitectura §19. Oferta comercial de proveedores: NO es el inventario interno de la planta (design.md §37).
export const marketplaceSchema = pgSchema('marketplace')

export const LISTING_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

export const AVAILABILITIES = ['IN_STOCK', 'ON_REQUEST', 'OUT_OF_STOCK'] as const
export type Availability = (typeof AVAILABILITIES)[number]

export const listings = marketplaceSchema.table(
  'listings',
  {
    id: pk(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    /** Modelo del catálogo global al que corresponde el producto (opcional). */
    assetModelId: uuid('asset_model_id').references(() => assetModels.id, { onDelete: 'set null' }),
    assetFamilyId: uuid('asset_family_id')
      .notNull()
      .references(() => assetFamilies.id),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    /** null = "a cotizar": se publica sin precio y el comprador pide cotización. Dinero siempre numeric (§46). */
    price: numeric('price', { precision: 18, scale: 2 }),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    availability: varchar('availability', { length: 20 }).notNull().default('ON_REQUEST'),
    stockText: varchar('stock_text', { length: 120 }),
    imageUrl: text('image_url'),
    status: varchar('status', { length: 20 }).notNull().default('DRAFT'),
    /** Destacado: solo lo decide el administrador del ecosistema. */
    isFeatured: boolean('is_featured').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_listings_provider').on(t.providerId), index('idx_listings_status_family').on(t.status, t.assetFamilyId)],
)

export const listingStages = marketplaceSchema.table(
  'listing_stages',
  {
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    stageMasterId: uuid('stage_master_id')
      .notNull()
      .references(() => stageMaster.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.listingId, t.stageMasterId] })],
)
