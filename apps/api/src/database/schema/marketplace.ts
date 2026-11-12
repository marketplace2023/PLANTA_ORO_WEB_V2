import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, numeric, pgSchema, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { assetFamilies, assetModels } from './catalog'
import { createdAt, pk, updatedAt } from './common'
import { stageMaster } from './process'
import { users } from './iam'
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
    commercial: jsonb('commercial').$type<{brand?:string;model?:string;condition?:string;warranty?:string;leadDays?:number;saleMode?:string;specifications?:unknown[]}>().notNull().default({}),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    /** null = "a cotizar": se publica sin precio y el comprador pide cotización. Dinero siempre numeric (§46). */
    price: numeric('price', { precision: 18, scale: 2 }),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    availability: varchar('availability', { length: 20 }).notNull().default('ON_REQUEST'),
    stockText: varchar('stock_text', { length: 120 }),
    /** Lo que se muestra: URL externa o, si se subió una foto, la ruta de la API que la sirve. */
    imageUrl: text('image_url'),
    /** Foto subida: `storage_key` del objeto y su tipo (el binario vive en el almacenamiento, no aquí). */
    imageKey: text('image_key'),
    imageMime: varchar('image_mime', { length: 50 }),
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

export const productVariants = marketplaceSchema.table('product_variants', {
  id: pk(), listingId: uuid('listing_id').notNull().references(()=>listings.id,{onDelete:'cascade'}),
  providerId: uuid('provider_id').notNull().references(()=>providers.id),
  sku: varchar('sku',{length:80}).notNull(), name: varchar('name',{length:160}).notNull(),
  salesRules: jsonb('sales_rules').$type<{minQuantity?:number;tiers?:Array<{quantity:number;price:number}>;promotion?:{percent:number;startsAt:string;endsAt:string}|null}>().notNull().default({}),
  attributes: jsonb('attributes').$type<Record<string,string>>().notNull().default({}),
  price: numeric('price',{precision:18,scale:2}).notNull(), stock: integer('stock').notNull().default(0),
  reserved: integer('reserved').notNull().default(0), active: boolean('active').notNull().default(true),
},t=>[unique('product_variants_provider_sku').on(t.providerId,t.sku),check('product_variants_stock_valid',sql`${t.stock} >= 0 and ${t.reserved} >= 0 and ${t.reserved} <= ${t.stock}`),check('product_variants_price_valid',sql`${t.price} >= 0`)])
export const productImages = marketplaceSchema.table('product_images', {
  id: pk(),listingId:uuid('listing_id').notNull().references(()=>listings.id,{onDelete:'cascade'}),
  key:text('key').notNull(),mime:varchar('mime',{length:100}).notNull(),position:integer('position').notNull().default(0),
})
export const shopSettings = marketplaceSchema.table('shop_settings',{
  providerId:uuid('provider_id').primaryKey().references(()=>providers.id,{onDelete:'cascade'}),
  bank:text('bank').notNull(),beneficiary:text('beneficiary').notNull(),account:text('account').notNull(),
  instructions:text('instructions').notNull().default(''),currency:varchar('currency',{length:3}).notNull(),
  shippingZones: jsonb('shipping_zones').$type<Array<{id:string;name:string;country:string;cities:string[];fee:number;days:number;carrier:string}>>().notNull().default([]),
  shippingFee:numeric('shipping_fee',{precision:18,scale:2}).notNull().default('0'),coverage:text('coverage').notNull().default(''),
})
export const shopOrders = marketplaceSchema.table('orders',{
  id:pk(),providerId:uuid('provider_id').notNull().references(()=>providers.id),buyerId:uuid('buyer_id').notNull().references(()=>users.id),
  idempotencyKey:uuid('idempotency_key').notNull(),requestHash:text('request_hash').notNull(),
  status:varchar('status',{length:30}).notNull().default('PENDING_PAYMENT'),currency:varchar('currency',{length:3}).notNull(),
  total:numeric('total',{precision:18,scale:2}).notNull(),shippingFee:numeric('shipping_fee',{precision:18,scale:2}).notNull(),
  address:jsonb('address').$type<Record<string,string>>().notNull(),paymentInstructions:jsonb('payment_instructions').notNull(),
  paymentReference:text('payment_reference'),receiptKey:text('receipt_key'),receiptMime:text('receipt_mime'),
  quoteRevision:integer('quote_revision').notNull().default(0),
  tracking:text('tracking'),note:text('note'),createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[unique('shop_orders_buyer_key').on(t.buyerId,t.idempotencyKey),index('shop_orders_provider_status').on(t.providerId,t.status)])
export const shopOrderLines = marketplaceSchema.table('order_lines',{
  id:pk(),orderId:uuid('order_id').notNull().references(()=>shopOrders.id,{onDelete:'cascade'}),
  variantId:uuid('variant_id').notNull().references(()=>productVariants.id),listingId:uuid('listing_id').notNull().references(()=>listings.id),
  title:text('title').notNull(),sku:text('sku').notNull(),variantName:text('variant_name').notNull(),quantity:integer('quantity').notNull(),
  unitPrice:numeric('unit_price',{precision:18,scale:2}).notNull(),
})
export const shopOrderEvents = marketplaceSchema.table('order_events',{
  id:pk(),orderId:uuid('order_id').notNull().references(()=>shopOrders.id,{onDelete:'cascade'}),
  actorId:uuid('actor_id').notNull().references(()=>users.id),status:text('status').notNull(),note:text('note'),createdAt:createdAt(),
})

export const variantMovements = marketplaceSchema.table('variant_movements',{
 id:pk(),variantId:uuid('variant_id').notNull().references(()=>productVariants.id,{onDelete:'cascade'}),
 actorId:uuid('actor_id').references(()=>users.id,{onDelete:'set null'}),orderId:uuid('order_id').references(()=>shopOrders.id,{onDelete:'set null'}),
 stockDelta:integer('stock_delta').notNull().default(0),reservedDelta:integer('reserved_delta').notNull().default(0),
 reason:text('reason').notNull(),createdAt:createdAt(),
})
export const productReviews = marketplaceSchema.table('product_reviews',{
 id:pk(),listingId:uuid('listing_id').notNull().references(()=>listings.id,{onDelete:'cascade'}),
 orderId:uuid('order_id').notNull().references(()=>shopOrders.id,{onDelete:'cascade'}),buyerId:uuid('buyer_id').notNull().references(()=>users.id),
 rating:integer('rating').notNull(),comment:text('comment').notNull(),createdAt:createdAt(),
},t=>[unique('product_reviews_order_product').on(t.orderId,t.listingId),check('product_reviews_rating_valid',sql`${t.rating} between 1 and 5`)])

export const shopMessages=marketplaceSchema.table('messages',{
 id:pk(),orderId:uuid('order_id').notNull().references(()=>shopOrders.id,{onDelete:'cascade'}),
 authorId:uuid('author_id').notNull().references(()=>users.id),body:text('body').notNull(),
 fileKey:text('file_key'),fileName:text('file_name'),fileMime:text('file_mime'),createdAt:createdAt(),
})
export const shopNotifications=marketplaceSchema.table('notifications',{
 id:pk(),userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 orderId:uuid('order_id').notNull().references(()=>shopOrders.id,{onDelete:'cascade'}),title:text('title').notNull(),
 readAt:timestamp('read_at',{withTimezone:true}),createdAt:createdAt(),
},t=>[index('shop_notifications_user_date').on(t.userId,t.createdAt)])
export const shopCases=marketplaceSchema.table('cases',{
 id:pk(),orderId:uuid('order_id').notNull().references(()=>shopOrders.id,{onDelete:'cascade'}),
 openedBy:uuid('opened_by').notNull().references(()=>users.id),kind:text('kind').notNull(),
 subject:text('subject').notNull(),description:text('description').notNull(),status:text('status').notNull().default('OPEN'),
 resolution:text('resolution'),resolvedBy:uuid('resolved_by').references(()=>users.id),createdAt:createdAt(),updatedAt:updatedAt(),
})
export const shopStaffRoles=marketplaceSchema.table('staff_roles',{
 providerId:uuid('provider_id').notNull().references(()=>providers.id,{onDelete:'cascade'}),
 userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),role:text('role').notNull(),
},t=>[primaryKey({columns:[t.providerId,t.userId]})])
