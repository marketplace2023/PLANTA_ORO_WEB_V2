import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgSchema, text, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { pk } from './common'
import { plants } from './core'

// Arquitectura §11
export const processSchema = pgSchema('process')

/** Catálogo global de etapas (D01…D20). */
export const stageMaster = processSchema.table('stage_master', {
  id: pk(),
  code: varchar('code', { length: 10 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  sequenceDefault: integer('sequence_default').notNull(),
  description: text('description'),
  stageGroup: varchar('stage_group', { length: 40 }).notNull(),
  colorToken: varchar('color_token', { length: 40 }),
})

/** Etapas habilitadas en cada planta. */
export const plantStages = processSchema.table(
  'plant_stages',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    stageMasterId: uuid('stage_master_id')
      .notNull()
      .references(() => stageMaster.id),
    sequence: integer('sequence').notNull(),
    nameOverride: varchar('name_override', { length: 200 }),
    isEnabled: boolean('is_enabled').notNull().default(true),
    isPublic: boolean('is_public').notNull().default(false),
    configuration: jsonb('configuration').notNull().default({}),
  },
  (t) => [unique().on(t.plantId, t.stageMasterId)],
)

export const FLOW_TYPES = ['MATERIAL', 'SOLUTION', 'WATER', 'REAGENT'] as const
export type FlowType = (typeof FLOW_TYPES)[number]

/** Flujo entre etapas habilitadas de una planta (§11.3): alimenta el mapa de proceso. */
export const stageConnections = processSchema.table(
  'stage_connections',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    sourceStageId: uuid('source_stage_id')
      .notNull()
      .references(() => plantStages.id, { onDelete: 'cascade' }),
    targetStageId: uuid('target_stage_id')
      .notNull()
      .references(() => plantStages.id, { onDelete: 'cascade' }),
    flowType: varchar('flow_type', { length: 20 }).notNull().default('MATERIAL'),
    /** Recirculación (p. ej. retorno de carbón o sobretamaño): se permite cerrar ciclos solo con este indicador. */
    isReturnFlow: boolean('is_return_flow').notNull().default(false),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (t) => [
    unique('stage_connections_unique').on(t.sourceStageId, t.targetStageId, t.flowType),
    check('stage_connections_no_self_loop', sql`${t.sourceStageId} <> ${t.targetStageId}`),
    index('idx_stage_connections_plant').on(t.plantId),
  ],
)
