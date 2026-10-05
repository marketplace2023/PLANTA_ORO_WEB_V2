import { sql } from 'drizzle-orm'
import { check, date, index, integer, numeric, pgSchema, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { assets } from './asset'
import { createdAt, pk, updatedAt } from './common'
import { plants } from './core'
import { users } from './iam'
import { items } from './inventory'
import { workOrders } from './maintenance'
import { plantStages } from './process'
import { providers } from './provider'

// Arquitectura §17. Compras es información interna de planta; el proveedor solo ve lo que se le invita a cotizar.
export const procurementSchema = pgSchema('procurement')

export const REQUISITION_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RFQ', 'ORDERED', 'RECEIVED', 'CANCELLED'] as const
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number]

export const RFQ_STATUSES = ['OPEN', 'AWARDED', 'CANCELLED'] as const
export const QUOTE_STATUSES = ['SUBMITTED', 'AWARDED', 'REJECTED', 'WITHDRAWN'] as const

export const requisitions = procurementSchema.table(
  'requisitions',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 30 }).notNull(),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    plantStageId: uuid('stage_id').references(() => plantStages.id, { onDelete: 'set null' }),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    workOrderId: uuid('work_order_id').references(() => workOrders.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 20 }).notNull().default('DRAFT'),
    priority: varchar('priority', { length: 20 }).notNull().default('MEDIUM'),
    neededBy: date('needed_by'),
    justification: text('justification').notNull(),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    /** Motivo de rechazo o cancelación. */
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('requisitions_plant_code_unique').on(t.plantId, t.code), index('idx_requisitions_plant_status').on(t.plantId, t.status)],
)

export const requisitionLines = procurementSchema.table(
  'requisition_lines',
  {
    id: pk(),
    requisitionId: uuid('requisition_id')
      .notNull()
      .references(() => requisitions.id, { onDelete: 'cascade' }),
    /** Ítem del inventario de la planta; null = servicio o compra sin control de stock. */
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    /** Orden en que se capturaron las líneas (los UUID creados en el mismo milisegundo no garantizan orden). */
    position: integer('position').notNull().default(0),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    uom: varchar('uom', { length: 10 }).notNull(),
    estimatedPrice: numeric('estimated_price', { precision: 18, scale: 2 }),
    receivedQuantity: numeric('received_quantity', { precision: 18, scale: 4 }).notNull().default('0'),
  },
  (t) => [
    check('requisition_lines_quantity_positive', sql`${t.quantity} > 0`),
    check('requisition_lines_received_range', sql`${t.receivedQuantity} >= 0 and ${t.receivedQuantity} <= ${t.quantity}`),
    index('idx_requisition_lines_req').on(t.requisitionId),
  ],
)

export const requisitionHistory = procurementSchema.table(
  'requisition_history',
  {
    id: pk(),
    requisitionId: uuid('requisition_id')
      .notNull()
      .references(() => requisitions.id, { onDelete: 'cascade' }),
    fromStatus: varchar('from_status', { length: 20 }),
    toStatus: varchar('to_status', { length: 20 }).notNull(),
    note: text('note'),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_requisition_history_req').on(t.requisitionId, t.changedAt)],
)

export const rfqs = procurementSchema.table(
  'rfqs',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    requisitionId: uuid('requisition_id')
      .notNull()
      .references(() => requisitions.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 30 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('OPEN'),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('rfqs_plant_code_unique').on(t.plantId, t.code), index('idx_rfqs_requisition').on(t.requisitionId)],
)

export const rfqInvitations = procurementSchema.table(
  'rfq_invitations',
  {
    rfqId: uuid('rfq_id')
      .notNull()
      .references(() => rfqs.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.rfqId, t.providerId] }), index('idx_rfq_invitations_provider').on(t.providerId)],
)

export const supplierQuotes = procurementSchema.table(
  'supplier_quotes',
  {
    id: pk(),
    rfqId: uuid('rfq_id')
      .notNull()
      .references(() => rfqs.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    currency: varchar('currency', { length: 3 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull(),
    deliveryDays: integer('delivery_days').notNull(),
    conditions: text('conditions'),
    status: varchar('status', { length: 20 }).notNull().default('SUBMITTED'),
    submittedBy: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Una cotización vigente por proveedor y RFQ: reenviar la reemplaza (se edita la misma fila).
    unique('supplier_quotes_rfq_provider_unique').on(t.rfqId, t.providerId),
    check('supplier_quotes_amount_positive', sql`${t.totalAmount} > 0`),
    check('supplier_quotes_delivery_range', sql`${t.deliveryDays} >= 0 and ${t.deliveryDays} <= 3650`),
  ],
)
