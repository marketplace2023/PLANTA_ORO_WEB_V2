import { sql } from 'drizzle-orm'
import { check, index, integer, numeric, pgSchema, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { assets } from './asset'
import { resources } from './budget'
import { createdAt, pk, updatedAt } from './common'
import { plants } from './core'
import { users } from './iam'
import { items, locations } from './inventory'

// Arquitectura §16. Mantenimiento es información interna de planta: no hay vista pública.
export const maintenanceSchema = pgSchema('maintenance')

export const WORK_ORDER_STATUSES = ['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED'] as const
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number]

export const WORK_ORDER_TYPES = ['CORRECTIVE', 'PREVENTIVE', 'PREDICTIVE', 'INSPECTION'] as const
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number]

export const WORK_ORDER_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number]

export const PLAN_TYPES = ['PREVENTIVE', 'PREDICTIVE', 'CONDITION'] as const
export const FREQUENCY_UNITS = ['DAYS', 'WEEKS', 'MONTHS'] as const

/** Planes de mantenimiento (§16.1). Generan órdenes de trabajo; no hay planificador automático todavía. */
export const maintenancePlans = maintenanceSchema.table(
  'plans',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    planType: varchar('plan_type', { length: 20 }).notNull().default('PREVENTIVE'),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    priority: varchar('priority', { length: 20 }).notNull().default('MEDIUM'),
    frequencyValue: integer('frequency_value').notNull(),
    frequencyUnit: varchar('frequency_unit', { length: 10 }).notNull(),
    nextDueAt: timestamp('next_due_at', { withTimezone: true }).notNull(),
    lastGeneratedAt: timestamp('last_generated_at', { withTimezone: true }),
    /** ACTIVE | PAUSED */
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_plans_plant_due').on(t.plantId, t.nextDueAt), index('idx_plans_asset').on(t.assetId)],
)

/** Órdenes de trabajo (§16.2). El código OT-AAAA-NNNNN es único por planta. */
export const workOrders = maintenanceSchema.table(
  'work_orders',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => maintenancePlans.id, { onDelete: 'set null' }),
    code: varchar('code', { length: 30 }).notNull(),
    type: varchar('type', { length: 20 }).notNull().default('CORRECTIVE'),
    priority: varchar('priority', { length: 20 }).notNull().default('MEDIUM'),
    status: varchar('status', { length: 20 }).notNull().default('REQUESTED'),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    plannedStart: timestamp('planned_start', { withTimezone: true }),
    /** Fecha límite: una OT abierta con plannedEnd vencido está atrasada. */
    plannedEnd: timestamp('planned_end', { withTimezone: true }),
    actualStart: timestamp('actual_start', { withTimezone: true }),
    actualEnd: timestamp('actual_end', { withTimezone: true }),
    completionNotes: text('completion_notes'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('work_orders_plant_code_unique').on(t.plantId, t.code),
    index('idx_work_orders_plant_status').on(t.plantId, t.status),
    index('idx_work_orders_asset').on(t.assetId),
    index('idx_work_orders_plant_assignee').on(t.plantId, t.assignedTo),
  ],
)

/** Cada transición de estado es una fila nueva: el historial no se sobrescribe (§47.10). */
export const workOrderHistory = maintenanceSchema.table(
  'work_order_history',
  {
    id: pk(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    fromStatus: varchar('from_status', { length: 20 }),
    toStatus: varchar('to_status', { length: 20 }).notNull(),
    note: text('note'),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_work_order_history_wo').on(t.workOrderId, t.changedAt)],
)

/**
 * Repuestos consumidos por una orden de trabajo. Cada fila corresponde a una salida de inventario
 * (movimiento ISSUE con referencia a la OT) y guarda el costo unitario vigente en ese momento.
 */
export const workOrderParts = maintenanceSchema.table(
  'work_order_parts',
  {
    id: pk(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 18, scale: 4 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('idx_work_order_parts_wo').on(t.workOrderId), index('idx_work_order_parts_item').on(t.itemId)],
)

export const COST_KINDS = ['LABOR', 'EQUIPMENT', 'TRANSPORT', 'SERVICE', 'OTHER'] as const
export type CostKind = (typeof COST_KINDS)[number]

/**
 * Costos de una orden distintos de los repuestos (que salen del inventario): mano de obra, equipos, transporte,
 * servicios externos y otros. El costo unitario es una FOTO en la moneda base de la planta: si viene de un recurso
 * del libro de precios de Presupuestos se convierte al registrarlo y no cambia cuando el precio del recurso cambie.
 */
export const workOrderCosts = maintenanceSchema.table(
  'work_order_costs',
  {
    id: pk(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 20 }).notNull(),
    description: varchar('description', { length: 200 }).notNull(),
    /** Recurso del libro de precios del que salió el costo (opcional; se conserva la foto si luego se borra). */
    resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'set null' }),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 18, scale: 4 }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_work_order_costs_wo').on(t.workOrderId),
    check('work_order_costs_quantity_positive', sql`${t.quantity} > 0`),
    check('work_order_costs_unit_cost_non_negative', sql`${t.unitCost} >= 0`),
  ],
)
