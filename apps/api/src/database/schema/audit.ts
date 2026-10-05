import { index, inet, jsonb, pgSchema, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { pk } from './common'

// Arquitectura §25. No se eliminan eventos de auditoría salvo política regulatoria explícita,
// por eso no hay claves foráneas: el evento sobrevive al borrado de usuarios o plantas.
export const auditSchema = pgSchema('audit')

export const auditEvents = auditSchema.table(
  'events',
  {
    id: pk(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    userId: uuid('user_id'),
    plantId: uuid('plant_id'),
    module: varchar('module', { length: 60 }).notNull(),
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: uuid('entity_id'),
    action: varchar('action', { length: 60 }).notNull(),
    oldData: jsonb('old_data'),
    newData: jsonb('new_data'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    correlationId: uuid('correlation_id'),
  },
  (t) => [index('idx_audit_plant_time').on(t.plantId, t.occurredAt.desc())],
)
