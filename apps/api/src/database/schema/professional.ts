import { sql } from 'drizzle-orm'
import { boolean, check, index, numeric, pgSchema, primaryKey, text, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { createdAt, pk, updatedAt } from './common'
import { users } from './iam'
import { stageMaster } from './process'

// Arquitectura §20. Contratistas y servicios profesionales: organizaciones globales, gestionadas por sus miembros.
export const professionalSchema = pgSchema('professional')

export const AVAILABILITY_STATES = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE'] as const
export type ContractorAvailability = (typeof AVAILABILITY_STATES)[number]

export const contractors = professionalSchema.table(
  'contractors',
  {
    id: pk(),
    organizationName: varchar('organization_name', { length: 200 }).notNull(),
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
    /** Disponibilidad declarada por el contratista para tomar trabajos nuevos. */
    availability: varchar('availability', { length: 20 }).notNull().default('AVAILABLE'),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    verified: boolean('verified').notNull().default(false),
    rating: numeric('rating', { precision: 3, scale: 2 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('contractors_country_tax_unique').on(t.countryCode, t.taxId),
    check('contractors_rating_range', sql`${t.rating} is null or (${t.rating} >= 0 and ${t.rating} <= 5)`),
    index('idx_contractors_status').on(t.status),
  ],
)

export const contractorMembers = professionalSchema.table(
  'contractor_members',
  {
    contractorId: uuid('contractor_id')
      .notNull()
      .references(() => contractors.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull().default('MEMBER'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.contractorId, t.userId] }), index('idx_contractor_members_user').on(t.userId)],
)

export const services = professionalSchema.table(
  'services',
  {
    id: pk(),
    contractorId: uuid('contractor_id')
      .notNull()
      .references(() => contractors.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    /** Especialidad (design.md §35): MECANICA, ELECTRICA, INSTRUMENTACION, AUTOMATIZACION… texto libre normalizado. */
    serviceType: varchar('service_type', { length: 80 }).notNull(),
    /** ACTIVE | INACTIVE (se conserva el historial: no se borra). */
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_services_contractor').on(t.contractorId)],
)

export const serviceStages = professionalSchema.table(
  'service_stages',
  {
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    stageMasterId: uuid('stage_master_id')
      .notNull()
      .references(() => stageMaster.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.stageMasterId] })],
)
