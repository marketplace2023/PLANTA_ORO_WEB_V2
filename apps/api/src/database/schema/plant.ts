import { boolean, integer, jsonb, pgSchema, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { pk } from './common'
import { plants } from './core'

// Arquitectura §12: redes transversales (catálogo maestro + habilitación por planta).
export const plantSchema = pgSchema('plant')

export const networkMaster = plantSchema.table('network_master', {
  id: pk(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  icon: varchar('icon', { length: 40 }),
  /** Token CSS del frontend, p. ej. `network-proc` → var(--network-proc). */
  colorToken: varchar('color_token', { length: 40 }),
  /** Orden en que se listan las redes (menor primero); a igualdad, por código. */
  sequence: integer('sequence').notNull().default(0),
  /** Imagen de la red (clave en el almacenamiento de objetos); la sube el administrador. */
  layoutImageKey: text('layout_image_key'),
  layoutImageMime: varchar('layout_image_mime', { length: 50 }),
  layoutImageUpdatedAt: timestamp('layout_image_updated_at', { withTimezone: true }),
})

export const plantNetworks = plantSchema.table(
  'plant_networks',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    networkMasterId: uuid('network_master_id')
      .notNull()
      .references(() => networkMaster.id),
    isEnabled: boolean('is_enabled').notNull().default(true),
    isPublic: boolean('is_public').notNull().default(false),
    configuration: jsonb('configuration').notNull().default({}),
  },
  (t) => [unique().on(t.plantId, t.networkMasterId)],
)
