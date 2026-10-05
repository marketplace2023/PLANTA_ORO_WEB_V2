import { sql } from 'drizzle-orm'
import { check, date, index, integer, jsonb, numeric, pgSchema, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { createdAt, pk, updatedAt } from './common'
import { plants } from './core'
import { users } from './iam'
import { items as inventoryItems } from './inventory'

// Arquitectura §24 (LULO). Dominio desacoplado: lo interno de la planta (budget.read / budget.edit / budget.approve).
export const budgetSchema = pgSchema('budget')

export const RESOURCE_TYPE_VALUES = ['MATERIAL', 'LABOR', 'EQUIPMENT', 'TRANSPORT'] as const
export const BUDGET_STATUSES = ['DRAFT', 'APPROVED', 'CLOSED'] as const
export type BudgetStatus = (typeof BUDGET_STATUSES)[number]

/** Libro de precios de la planta: materiales, mano de obra, equipos y transporte. */
export const resources = budgetSchema.table(
  'resources',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    resourceType: varchar('resource_type', { length: 20 }).notNull(),
    /** Mano de obra y equipo se precian por hora (hh / hm); material y transporte, por su unidad. */
    unit: varchar('unit', { length: 10 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    /** Ítem de inventario del que se importó el precio (opcional). */
    sourceItemId: uuid('source_item_id').references(() => inventoryItems.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('resources_plant_code_unique').on(t.plantId, t.code), check('resources_price_non_negative', sql`${t.unitPrice} >= 0`)],
)

export const priceHistory = budgetSchema.table(
  'price_history',
  {
    id: pk(),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    note: text('note'),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_price_history_resource').on(t.resourceId, t.changedAt)],
)

/** 1 unidad de `currency` = `rate` unidades de la moneda base de la planta. */
export const exchangeRates = budgetSchema.table(
  'exchange_rates',
  {
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    currency: varchar('currency', { length: 3 }).notNull(),
    rate: numeric('rate', { precision: 18, scale: 6 }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.plantId, t.currency] }), check('exchange_rates_positive', sql`${t.rate} > 0`)],
)

/** Análisis de precios unitarios (biblioteca de la planta). */
export const apus = budgetSchema.table(
  'apus',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    unit: varchar('unit', { length: 10 }).notNull(),
    description: text('description'),
    /** Lo que produce la cuadrilla por jornada, en `unit`. */
    yieldValue: numeric('yield_value', { precision: 18, scale: 4 }).notNull().default('1'),
    hoursPerDay: numeric('hours_per_day', { precision: 5, scale: 2 }).notNull().default('8'),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('apus_plant_code_unique').on(t.plantId, t.code),
    check('apus_yield_positive', sql`${t.yieldValue} > 0`),
    check('apus_hours_range', sql`${t.hoursPerDay} > 0 and ${t.hoursPerDay} <= 24`),
  ],
)

export const apuResources = budgetSchema.table(
  'apu_resources',
  {
    id: pk(),
    apuId: uuid('apu_id')
      .notNull()
      .references(() => apus.id, { onDelete: 'cascade' }),
    // RESTRICT: un recurso usado por algún APU no se puede borrar (se desactiva).
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id),
    position: integer('position').notNull().default(0),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    wastePct: numeric('waste_pct', { precision: 6, scale: 2 }).notNull().default('0'),
  },
  (t) => [
    unique('apu_resources_unique').on(t.apuId, t.resourceId),
    check('apu_resources_quantity_positive', sql`${t.quantity} > 0`),
    check('apu_resources_waste_range', sql`${t.wastePct} >= 0 and ${t.wastePct} <= 100`),
    index('idx_apu_resources_apu').on(t.apuId, t.position),
  ],
)

export const projects = budgetSchema.table(
  'projects',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    createdAt: createdAt(),
  },
  (t) => [unique('projects_plant_code_unique').on(t.plantId, t.code)],
)

export const budgets = budgetSchema.table(
  'budgets',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('DRAFT'),
    /** Gastos generales, utilidad e impuesto (IGV/IVA), en % sobre la base que corresponde (ver budget-engine). */
    overheadPct: numeric('overhead_pct', { precision: 6, scale: 2 }).notNull().default('0'),
    utilityPct: numeric('utility_pct', { precision: 6, scale: 2 }).notNull().default('0'),
    taxPct: numeric('tax_pct', { precision: 6, scale: 2 }).notNull().default('0'),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('budgets_plant_code_unique').on(t.plantId, t.code),
    check('budgets_rates_range', sql`${t.overheadPct} between 0 and 100 and ${t.utilityPct} between 0 and 100 and ${t.taxPct} between 0 and 100`),
    index('idx_budgets_plant_status').on(t.plantId, t.status),
  ],
)

export const chapters = budgetSchema.table(
  'chapters',
  {
    id: pk(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [unique('chapters_budget_code_unique').on(t.budgetId, t.code)],
)

export const budgetItems = budgetSchema.table(
  'items',
  {
    id: pk(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    // RESTRICT: un APU usado en un presupuesto no se borra (se desactiva).
    apuId: uuid('apu_id')
      .notNull()
      .references(() => apus.id),
    code: varchar('code', { length: 30 }).notNull(),
    description: text('description').notNull(),
    unit: varchar('unit', { length: 10 }).notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    position: integer('position').notNull().default(0),
    /** Al aprobar, el precio del APU y su desglose se congelan: el presupuesto aprobado no cambia con los precios. */
    frozenUnitPrice: numeric('frozen_unit_price', { precision: 18, scale: 4 }),
    frozenBreakdown: jsonb('frozen_breakdown'),
  },
  (t) => [unique('budget_items_code_unique').on(t.budgetId, t.code), check('budget_items_quantity_positive', sql`${t.quantity} > 0`), index('idx_budget_items_chapter').on(t.chapterId, t.position)],
)

export const scenarios = budgetSchema.table(
  'scenarios',
  {
    id: pk(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    /** % por tipo de recurso, p. ej. { "MATERIAL": 10, "LABOR": -5 }. */
    adjustments: jsonb('adjustments').notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [unique('scenarios_budget_name_unique').on(t.budgetId, t.name)],
)

export const VALUATION_STATUSES = ['DRAFT', 'APPROVED'] as const

export const valuations = budgetSchema.table(
  'valuations',
  {
    id: pk(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('DRAFT'),
    note: text('note'),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [unique('valuations_budget_number_unique').on(t.budgetId, t.number), check('valuations_period_order', sql`${t.periodEnd} >= ${t.periodStart}`)],
)

export const valuationLines = budgetSchema.table(
  'valuation_lines',
  {
    valuationId: uuid('valuation_id')
      .notNull()
      .references(() => valuations.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => budgetItems.id, { onDelete: 'cascade' }),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.valuationId, t.itemId] }), check('valuation_lines_quantity_positive', sql`${t.quantity} > 0`)],
)
