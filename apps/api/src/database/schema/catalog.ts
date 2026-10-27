import { boolean, integer, jsonb, pgSchema, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { createdAt, pk, updatedAt } from './common'
import { networkMaster } from './plant'
import { stageMaster } from './process'

// Arquitectura §10. El catálogo es global y NO representa posesión física:
// describe qué tipos/modelos existen; el activo de planta (asset.assets) es la unidad física real.
export const catalogSchema = pgSchema('catalog')

export const assetFamilies = catalogSchema.table('asset_families', {
  id: pk(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  /** Código CA del maestro Excel; permite actualizar el nombre sin duplicar la familia. */
  categoryCode: varchar('category_code', { length: 20 }).unique(),
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

/** Etapas del proceso (D01–D19) en las que se usa un tipo de activo: el catálogo se filtra por etapa con esto. */
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

/**
 * Etapas en las que participa realmente un MODELO. Las del tipo (`asset_type_stages`) solo son las posibles: un modelo
 * puede declarar un subconjunto. Sin filas aquí, el modelo hereda todas las del tipo.
 */
export const assetModelStages = catalogSchema.table(
  'asset_model_stages',
  {
    assetModelId: uuid('asset_model_id')
      .notNull()
      .references(() => assetModels.id, { onDelete: 'cascade' }),
    stageMasterId: uuid('stage_master_id')
      .notNull()
      .references(() => stageMaster.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.assetModelId, t.stageMasterId] })],
)

/** Redes transversales propias de cada modelo. Vacío = sin redes; no se heredan del tipo. */
export const assetModelNetworks = catalogSchema.table(
  'asset_model_networks',
  {
    assetModelId: uuid('asset_model_id')
      .notNull()
      .references(() => assetModels.id, { onDelete: 'cascade' }),
    networkMasterId: uuid('network_master_id')
      .notNull()
      .references(() => networkMaster.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.assetModelId, t.networkMasterId] })],
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
    /** Identificador del registro del catálogo importado; no es el TAG de un activo de planta. */
    catalogTag: varchar('catalog_tag', { length: 100 }).unique(),
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
)

/**
 * Claves efectivas por etapa, mantenidas por triggers diferidos de PostgreSQL. Incluyen las etapas heredadas del tipo;
 * la etapa UUID cero representa un modelo sin etapas. No se editan desde la aplicación.
 */
export const assetModelStageKeys = catalogSchema.table(
  'asset_model_stage_keys',
  {
    assetModelId: uuid('asset_model_id').notNull().references(() => assetModels.id, { onDelete: 'cascade' }),
    assetTypeId: uuid('asset_type_id').notNull(),
    manufacturerId: uuid('manufacturer_id').notNull(),
    modelName: varchar('model_name', { length: 200 }).notNull(),
    stageMasterId: uuid('stage_master_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.assetModelId, t.stageMasterId] }),
    unique('asset_model_stage_keys_identity_unique').on(t.assetTypeId, t.manufacturerId, t.modelName, t.stageMasterId),
  ],
)

export const VARIABLE_TYPES = ['NUMBER', 'RANGE', 'TEXT', 'LIST', 'BOOLEAN'] as const
export type VariableType = (typeof VARIABLE_TYPES)[number]

/**
 * Variables de la ficha técnica de un modelo (datos del fabricante). Cada una se define una vez y puede compartirse entre
 * muchos equipos: su alcance son listas de redes, etapas y tipos de activo (varias a la vez); una lista vacía significa
 * «todas». Una variable sin ninguna lista es general: aplica a todos los equipos.
 */
export const variableDefinitions = catalogSchema.table('variable_definitions', {
  id: pk(),
  code: varchar('code', { length: 60 }).notNull().unique(),
  label: varchar('label', { length: 160 }).notNull(),
  unit: varchar('unit', { length: 30 }),
  /** NUMBER (un valor), RANGE (mínimo y/o máximo), TEXT, LIST (varios textos) o BOOLEAN. */
  valueType: varchar('value_type', { length: 20 }).notNull(),
  /** Valor general: lo que muestran los modelos que no registraron uno propio. */
  defaultValue: jsonb('default_value'),
  /** Título de la sección donde se muestra (p. ej. «Variables críticas del proceso»). */
  groupLabel: varchar('group_label', { length: 120 }),
  /** Variable clave: se destaca en la ficha. */
  isKey: boolean('is_key').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
})

/** Redes a las que aplica una variable (varias; ninguna = todas). */
export const variableNetworks = catalogSchema.table(
  'variable_networks',
  {
    variableId: uuid('variable_id')
      .notNull()
      .references(() => variableDefinitions.id, { onDelete: 'cascade' }),
    networkMasterId: uuid('network_master_id')
      .notNull()
      .references(() => networkMaster.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.variableId, t.networkMasterId] })],
)

/** Etapas a las que aplica una variable (varias; ninguna = todas). */
export const variableStages = catalogSchema.table(
  'variable_stages',
  {
    variableId: uuid('variable_id')
      .notNull()
      .references(() => variableDefinitions.id, { onDelete: 'cascade' }),
    stageMasterId: uuid('stage_master_id')
      .notNull()
      .references(() => stageMaster.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.variableId, t.stageMasterId] })],
)

/** Tipos de activo a los que aplica una variable (varios; ninguno = todos). */
export const variableTypes = catalogSchema.table(
  'variable_types',
  {
    variableId: uuid('variable_id')
      .notNull()
      .references(() => variableDefinitions.id, { onDelete: 'cascade' }),
    assetTypeId: uuid('asset_type_id')
      .notNull()
      .references(() => assetTypes.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.variableId, t.assetTypeId] })],
)

/** Valor de una variable para un modelo: lo que dice el fabricante. El jsonb depende del tipo de la variable. */
export const modelVariableValues = catalogSchema.table(
  'model_variable_values',
  {
    assetModelId: uuid('asset_model_id')
      .notNull()
      .references(() => assetModels.id, { onDelete: 'cascade' }),
    variableId: uuid('variable_id')
      .notNull()
      .references(() => variableDefinitions.id, { onDelete: 'cascade' }),
    value: jsonb('value').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.assetModelId, t.variableId] })],
)
