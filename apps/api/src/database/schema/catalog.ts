import { jsonb, pgSchema, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { pk } from './common'
import { networkMaster } from './plant'
import { stageMaster } from './process'

// Arquitectura §10. El catálogo es global y NO representa posesión física:
// describe qué tipos/modelos existen; el activo de planta (asset.assets) es la unidad física real.
export const catalogSchema = pgSchema('catalog')

export const assetFamilies = catalogSchema.table('asset_families', {
  id: pk(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  parentId: uuid('parent_id'),
  description: text('description'),
  /** Nombre de ícono de Lucide. */
  icon: varchar('icon', { length: 40 }),
})

export const manufacturers = catalogSchema.table('manufacturers', {
  id: pk(),
  name: varchar('name', { length: 160 }).notNull().unique(),
  countryCode: varchar('country_code', { length: 2 }),
  website: text('website'),
})

export const assetTypes = catalogSchema.table('asset_types', {
  id: pk(),
  familyId: uuid('family_id')
    .notNull()
    .references(() => assetFamilies.id),
  code: varchar('code', { length: 60 }).notNull().unique(),
  name: varchar('name', { length: 160 }).notNull(),
  description: text('description'),
  defaultSpecs: jsonb('default_specs').notNull().default({}),
})

/** Etapas del proceso (D01–D20) en las que se usa un tipo de activo: el catálogo se filtra por etapa con esto. */
export const assetTypeStages = catalogSchema.table(
  'asset_type_stages',
  {
    assetTypeId: uuid('asset_type_id')
      .notNull()
      .references(() => assetTypes.id, { onDelete: 'cascade' }),
    stageMasterId: uuid('stage_master_id')
      .notNull()
      .references(() => stageMaster.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.assetTypeId, t.stageMasterId] })],
)

/** Redes transversales (potencia, IoT, procesos…) a las que pertenece un tipo de activo. */
export const assetTypeNetworks = catalogSchema.table(
  'asset_type_networks',
  {
    assetTypeId: uuid('asset_type_id')
      .notNull()
      .references(() => assetTypes.id, { onDelete: 'cascade' }),
    networkMasterId: uuid('network_master_id')
      .notNull()
      .references(() => networkMaster.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.assetTypeId, t.networkMasterId] })],
)

export const assetModels = catalogSchema.table(
  'asset_models',
  {
    id: pk(),
    assetTypeId: uuid('asset_type_id')
      .notNull()
      .references(() => assetTypes.id),
    manufacturerId: uuid('manufacturer_id').references(() => manufacturers.id),
    modelName: varchar('model_name', { length: 200 }).notNull(),
    specifications: jsonb('specifications').notNull().default({}),
    technicalData: jsonb('technical_data').notNull().default({}),
    /** Se enlazará a document.documents cuando exista el módulo de documentos. */
    datasheetDocumentId: uuid('datasheet_document_id'),
    status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
    /** Foto del modelo: `storage_key` del objeto (el binario vive en el driver de almacenamiento, no aquí). */
    imageKey: text('image_key'),
    imageMime: varchar('image_mime', { length: 50 }),
    /** Sirve de versión en la URL de la imagen: al cambiarla, los navegadores no sirven la anterior de caché. */
    imageUpdatedAt: timestamp('image_updated_at', { withTimezone: true }),
  },
  (t) => [unique().on(t.assetTypeId, t.manufacturerId, t.modelName)],
)
