import { sql } from 'drizzle-orm'
import { boolean, check, index, numeric, pgSchema, primaryKey, text, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { assetFamilies } from './catalog'
import { createdAt, pk, updatedAt } from './common'
import { users } from './iam'
import { stageMaster } from './process'

// Arquitectura §18. Los proveedores son organizaciones GLOBALES (no pertenecen a una planta); quién las gestiona
// lo define la membresía (`provider_members`), no los permisos de planta.
export const providerSchema = pgSchema('provider')

/** PENDING: solicitud de registro sin aprobar · ACTIVE: visible en el ecosistema · SUSPENDED: oculto, se conserva todo. */
export const ORG_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED'] as const
export type OrgStatus = (typeof ORG_STATUSES)[number]

export const MEMBER_ROLES = ['OWNER', 'MEMBER'] as const

export const providers = providerSchema.table(
  'providers',
  {
    id: pk(),
    organizationName: varchar('organization_name', { length: 200 }).notNull(),
    /** Identificación tributaria; única por país para evitar organizaciones duplicadas. */
    taxId: varchar('tax_id', { length: 40 }),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    city: varchar('city', { length: 120 }),
    description: text('description'),
    website: text('website'),
    contactEmail: varchar('contact_email', { length: 255 }),
    /** Lo que se muestra: URL externa o, si se subió un logo, la ruta de la API que lo sirve. */
    logoUrl: text('logo_url'),
    logoKey: text('logo_key'),
    logoMime: varchar('logo_mime', { length: 50 }),
    certifications: text('certifications').array().notNull().default(sql`'{}'::text[]`),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    /** Verificada por el administrador del ecosistema (no la puede marcar la propia organización). */
    verified: boolean('verified').notNull().default(false),
    /** 0–5, asignado por el administrador; null = sin calificaciones todavía (no se inventa un valor). */
    rating: numeric('rating', { precision: 3, scale: 2 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('providers_country_tax_unique').on(t.countryCode, t.taxId),
    check('providers_rating_range', sql`${t.rating} is null or (${t.rating} >= 0 and ${t.rating} <= 5)`),
    index('idx_providers_status').on(t.status),
  ],
)

export const providerMembers = providerSchema.table(
  'provider_members',
  {
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** OWNER administra miembros; MEMBER gestiona productos y perfil. */
    role: varchar('role', { length: 20 }).notNull().default('MEMBER'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.providerId, t.userId] }), index('idx_provider_members_user').on(t.userId)],
)

/** Filtrado por etapa (§18.2). */
export const providerStageCapabilities = providerSchema.table(
  'provider_stage_capabilities',
  {
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    stageMasterId: uuid('stage_master_id')
      .notNull()
      .references(() => stageMaster.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.providerId, t.stageMasterId] })],
)

export const providerAssetFamilies = providerSchema.table(
  'provider_asset_families',
  {
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    assetFamilyId: uuid('asset_family_id')
      .notNull()
      .references(() => assetFamilies.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.providerId, t.assetFamilyId] })],
)
