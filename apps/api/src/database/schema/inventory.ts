import { boolean, check, index, numeric, pgSchema, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { assetModels } from './catalog'
import { createdAt, pk, updatedAt } from './common'
import { plants } from './core'
import { users } from './iam'

// Arquitectura §15. El inventario de planta NO es inventario de proveedor (marketplace): dominios separados.
export const inventorySchema = pgSchema('inventory')

export const ITEM_TYPES = ['SPARE', 'CONSUMABLE', 'TOOL'] as const
export type ItemType = (typeof ITEM_TYPES)[number]

export const LOCATION_TYPES = ['ZONE', 'RACK', 'SHELF', 'BIN'] as const

export const MOVEMENT_TYPES = ['RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT'] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

export const REFERENCE_TYPES = ['MANUAL', 'WORK_ORDER', 'REQUISITION'] as const

export const warehouses = inventorySchema.table(
  'warehouses',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    /** ACTIVE | INACTIVE */
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    createdAt: createdAt(),
  },
  (t) => [unique('warehouses_plant_code_unique').on(t.plantId, t.code)],
)

export const locations = inventorySchema.table(
  'locations',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'cascade' }),
    /** Jerarquía (zona → rack → estante → bin). El padre debe ser del mismo almacén (se valida en el servicio). */
    parentId: uuid('parent_id'),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    locationType: varchar('location_type', { length: 20 }).notNull().default('ZONE'),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  },
  (t) => [unique('locations_warehouse_code_unique').on(t.warehouseId, t.code)],
)

/** Ítems controlados por la planta: repuestos, consumibles y herramientas. */
export const items = inventorySchema.table(
  'items',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    /** Modelo del catálogo global al que corresponde (opcional). */
    assetModelId: uuid('catalog_item_id').references(() => assetModels.id),
    sku: varchar('sku', { length: 60 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    itemType: varchar('item_type', { length: 20 }).notNull().default('SPARE'),
    /** Unidad de medida: no cambia después de crear (hay stock y movimientos expresados en ella). */
    uom: varchar('uom', { length: 10 }).notNull().default('UND'),
    minStock: numeric('min_stock', { precision: 18, scale: 4 }).notNull().default('0'),
    maxStock: numeric('max_stock', { precision: 18, scale: 4 }),
    /** Repuesto crítico: su falta detiene o pone en riesgo la operación. */
    isCritical: boolean('is_critical').notNull().default(false),
    /** Costo unitario promedio ponderado (se recalcula en cada ingreso con costo). Dinero: numeric, nunca float (§46). */
    unitCost: numeric('unit_cost', { precision: 18, scale: 4 }),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('items_plant_sku_unique').on(t.plantId, t.sku), index('idx_items_plant_type').on(t.plantId, t.itemType)],
)

/** Existencias por ítem y ubicación. La base garantiza que nunca sean negativas. */
export const stock = inventorySchema.table(
  'stock',
  {
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    quantityOnHand: numeric('quantity_on_hand', { precision: 18, scale: 4 }).notNull().default('0'),
    quantityReserved: numeric('quantity_reserved', { precision: 18, scale: 4 }).notNull().default('0'),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.locationId] }),
    check('stock_on_hand_non_negative', sql`${t.quantityOnHand} >= 0`),
    index('idx_stock_location').on(t.locationId, t.itemId),
  ],
)

/** Libro de movimientos: inmutable. Cada cambio de stock deja una fila (§47.10). */
export const movements = inventorySchema.table(
  'movements',
  {
    id: pk(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    /** RECEIPT: solo `to`. ISSUE: solo `from`. TRANSFER: ambas. ADJUSTMENT: `to` si suma, `from` si resta. */
    fromLocationId: uuid('from_location_id').references(() => locations.id, { onDelete: 'set null' }),
    toLocationId: uuid('to_location_id').references(() => locations.id, { onDelete: 'set null' }),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    movementType: varchar('movement_type', { length: 20 }).notNull(),
    /** Costo unitario vigente al momento del movimiento (para valorizar consumos). */
    unitCost: numeric('unit_cost', { precision: 18, scale: 4 }),
    referenceType: varchar('reference_type', { length: 20 }).notNull().default('MANUAL'),
    referenceId: uuid('reference_id'),
    note: text('note'),
    performedBy: uuid('performed_by').references(() => users.id, { onDelete: 'set null' }),
    performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('movements_quantity_positive', sql`${t.quantity} > 0`),
    index('idx_movements_plant_time').on(t.plantId, t.performedAt),
    index('idx_movements_item').on(t.itemId, t.performedAt),
  ],
)
