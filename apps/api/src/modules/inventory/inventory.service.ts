import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, gt, gte, ilike, inArray, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { isUniqueViolation } from '../../common/db-errors'
import { validationError } from '../../common/errors'
import { escapeLike, pageOf } from '../../common/pagination'
import type { AppRequest, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { assetModels, assets, items, locations, movements, plantSettings, stock, users, warehouses, workOrderParts, workOrders } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import type {
  AdjustDto,
  CreateItemDto,
  CreateLocationDto,
  CreateWarehouseDto,
  IssueDto,
  ListItemsQuery,
  ListMovementsQuery,
  ReceiptDto,
  TransferDto,
  UpdateItemDto,
  UpdateLocationDto,
  UpdateWarehouseDto,
} from './inventory.schemas'

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type ItemRow = typeof items.$inferSelect

const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(' ') || null
const num = (v: string | null) => (v === null ? null : Number(v))
const money = (v: number) => Math.round(v * 10_000) / 10_000

/** Existencias totales de un ítem (suma de todas sus ubicaciones), como expresión SQL reutilizable. */
const onHandSql = sql<number>`coalesce((select sum(${stock.quantityOnHand}) from ${stock} where ${stock.itemId} = ${items.id}), 0)::float8`

type MovementCtx = { plantId: string; itemId: string; userId?: string; note?: string; referenceType?: 'MANUAL' | 'WORK_ORDER' | 'REQUISITION'; referenceId?: string }

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  // ---------- Almacenes y ubicaciones ----------

  listWarehouses(plant: PlantRow) {
    return this.db.select().from(warehouses).where(eq(warehouses.plantId, plant.id)).orderBy(asc(warehouses.code))
  }

  async createWarehouse(plant: PlantRow, dto: CreateWarehouseDto, req: AppRequest) {
    const [row] = await this.db
      .insert(warehouses)
      .values({ plantId: plant.id, code: dto.code, name: dto.name })
      .returning()
      .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException(`Ya existe un almacén con el código ${dto.code}`)) : Promise.reject(e)))
    await this.audit.record(req, { module: 'inventory', entityType: 'warehouse', entityId: row.id, plantId: plant.id, action: 'created', newData: dto })
    return row
  }

  async updateWarehouse(plant: PlantRow, id: string, dto: UpdateWarehouseDto, req: AppRequest) {
    const [before] = await this.db.select().from(warehouses).where(and(eq(warehouses.id, id), eq(warehouses.plantId, plant.id)))
    if (!before) throw new NotFoundException('Almacén no encontrado')
    if (dto.status === 'INACTIVE' && before.status !== 'INACTIVE') {
      const [{ n }] = await this.db
        .select({ n: sql<number>`coalesce(sum(${stock.quantityOnHand}), 0)::float8` })
        .from(stock)
        .innerJoin(locations, eq(locations.id, stock.locationId))
        .where(eq(locations.warehouseId, id))
      if (n > 0) throw new ConflictException('No se puede desactivar un almacén que todavía tiene existencias')
    }
    const [row] = await this.db.update(warehouses).set(dto).where(eq(warehouses.id, id)).returning()
    await this.audit.record(req, { module: 'inventory', entityType: 'warehouse', entityId: id, plantId: plant.id, action: 'updated', oldData: { name: before.name, status: before.status }, newData: dto })
    return row
  }

  listLocations(plant: PlantRow, warehouseId?: string) {
    return this.db
      .select({
        id: locations.id,
        warehouseId: locations.warehouseId,
        warehouseCode: warehouses.code,
        warehouseName: warehouses.name,
        parentId: locations.parentId,
        code: locations.code,
        name: locations.name,
        locationType: locations.locationType,
        status: locations.status,
      })
      .from(locations)
      .innerJoin(warehouses, eq(warehouses.id, locations.warehouseId))
      .where(and(eq(locations.plantId, plant.id), warehouseId ? eq(locations.warehouseId, warehouseId) : undefined))
      .orderBy(asc(warehouses.code), asc(locations.code))
  }

  async createLocation(plant: PlantRow, dto: CreateLocationDto, req: AppRequest) {
    const [wh] = await this.db.select({ status: warehouses.status }).from(warehouses).where(and(eq(warehouses.id, dto.warehouseId), eq(warehouses.plantId, plant.id)))
    if (!wh) throw validationError('warehouseId', 'El almacén no existe en esta planta')
    if (wh.status !== 'ACTIVE') throw validationError('warehouseId', 'El almacén está inactivo')
    if (dto.parentId) {
      const [parent] = await this.db.select({ warehouseId: locations.warehouseId }).from(locations).where(and(eq(locations.id, dto.parentId), eq(locations.plantId, plant.id)))
      if (!parent || parent.warehouseId !== dto.warehouseId) throw validationError('parentId', 'La ubicación padre debe existir y ser del mismo almacén')
    }
    const [row] = await this.db
      .insert(locations)
      .values({ plantId: plant.id, ...dto })
      .returning()
      .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException(`Ya existe una ubicación con el código ${dto.code} en ese almacén`)) : Promise.reject(e)))
    await this.audit.record(req, { module: 'inventory', entityType: 'location', entityId: row.id, plantId: plant.id, action: 'created', newData: dto })
    return row
  }

  async updateLocation(plant: PlantRow, id: string, dto: UpdateLocationDto, req: AppRequest) {
    const [before] = await this.db.select().from(locations).where(and(eq(locations.id, id), eq(locations.plantId, plant.id)))
    if (!before) throw new NotFoundException('Ubicación no encontrada')
    if (dto.status === 'INACTIVE' && before.status !== 'INACTIVE') {
      const [{ n }] = await this.db.select({ n: sql<number>`coalesce(sum(${stock.quantityOnHand}), 0)::float8` }).from(stock).where(eq(stock.locationId, id))
      if (n > 0) throw new ConflictException('No se puede desactivar una ubicación que todavía tiene existencias')
    }
    const [row] = await this.db.update(locations).set(dto).where(eq(locations.id, id)).returning()
    await this.audit.record(req, { module: 'inventory', entityType: 'location', entityId: id, plantId: plant.id, action: 'updated', oldData: { name: before.name, status: before.status }, newData: dto })
    return row
  }

  // ---------- Ítems ----------

  private toItem(r: ItemRow & { onHand: number }) {
    const minStock = Number(r.minStock)
    const unitCost = num(r.unitCost)
    return {
      id: r.id,
      sku: r.sku,
      name: r.name,
      description: r.description,
      itemType: r.itemType,
      uom: r.uom,
      minStock,
      maxStock: num(r.maxStock),
      isCritical: r.isCritical,
      unitCost,
      status: r.status,
      assetModelId: r.assetModelId,
      onHand: r.onHand,
      belowMin: r.onHand < minStock,
      value: unitCost === null ? null : money(r.onHand * unitCost),
    }
  }

  private itemSelect() {
    return this.db.select({ ...itemColumns(), onHand: onHandSql }).from(items)
  }

  async listItems(plant: PlantRow, q: ListItemsQuery) {
    const conditions: Array<SQL | undefined> = [
      eq(items.plantId, plant.id),
      q.status === 'ALL' ? undefined : eq(items.status, q.status),
      q.type ? inArray(items.itemType, q.type) : undefined,
      q.critical === '1' ? eq(items.isCritical, true) : undefined,
      q.low === '1' ? sql`${onHandSql} < ${items.minStock}` : undefined,
      q.warehouseId
        ? sql`exists (select 1 from ${stock} inner join ${locations} on ${locations.id} = ${stock.locationId}
            where ${stock.itemId} = ${items.id} and ${locations.warehouseId} = ${q.warehouseId} and ${stock.quantityOnHand} > 0)`
        : undefined,
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(items.sku, like), ilike(items.name, like)))
    }
    const where = and(...conditions)
    const dir = q.dir ?? (q.sort === 'onHand' ? 'desc' : 'asc')
    const column = q.sort === 'sku' ? items.sku : q.sort === 'onHand' ? onHandSql : items.name

    const [rows, [{ total }]] = await Promise.all([
      this.itemSelect()
        .where(where)
        .orderBy(dir === 'asc' ? asc(column) : desc(column), asc(items.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(items).where(where),
    ])
    return pageOf(rows.map((r) => this.toItem(r)), total, q.page, q.pageSize)
  }

  async getItem(plant: PlantRow, id: string) {
    const [row] = await this.itemSelect().where(and(eq(items.id, id), eq(items.plantId, plant.id))).limit(1)
    if (!row) throw new NotFoundException('Ítem no encontrado')

    const stockRows = await this.db
      .select({
        locationId: locations.id,
        locationCode: locations.code,
        locationName: locations.name,
        warehouseCode: warehouses.code,
        warehouseName: warehouses.name,
        quantity: stock.quantityOnHand,
      })
      .from(stock)
      .innerJoin(locations, eq(locations.id, stock.locationId))
      .innerJoin(warehouses, eq(warehouses.id, locations.warehouseId))
      .where(and(eq(stock.itemId, id), gt(stock.quantityOnHand, '0')))
      .orderBy(asc(warehouses.code), asc(locations.code))

    const [model] = row.assetModelId ? await this.db.select({ id: assetModels.id, name: assetModels.modelName }).from(assetModels).where(eq(assetModels.id, row.assetModelId)) : []
    return {
      ...this.toItem(row),
      model: model ?? null,
      stock: stockRows.map((s) => ({ ...s, quantity: Number(s.quantity) })),
      recentMovements: (await this.listMovements(plant, { page: 1, pageSize: 10, itemId: id })).items,
    }
  }

  async createItem(plant: PlantRow, dto: CreateItemDto, req: AppRequest) {
    if (dto.assetModelId) await this.assertModel(dto.assetModelId)
    const [row] = await this.db
      .insert(items)
      .values({
        plantId: plant.id,
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        itemType: dto.itemType,
        uom: dto.uom,
        minStock: String(dto.minStock),
        maxStock: dto.maxStock === undefined ? undefined : String(dto.maxStock),
        isCritical: dto.isCritical,
        unitCost: dto.unitCost === undefined ? undefined : String(dto.unitCost),
        assetModelId: dto.assetModelId,
      })
      .returning()
      .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException(`Ya existe un ítem con el SKU ${dto.sku} en esta planta`)) : Promise.reject(e)))
    await this.audit.record(req, { module: 'inventory', entityType: 'item', entityId: row.id, plantId: plant.id, action: 'created', newData: { sku: dto.sku, name: dto.name, itemType: dto.itemType } })
    return this.getItem(plant, row.id)
  }

  private async assertModel(modelId: string) {
    const [m] = await this.db.select({ id: assetModels.id }).from(assetModels).where(eq(assetModels.id, modelId))
    if (!m) throw validationError('assetModelId', 'El modelo de catálogo no existe')
  }

  async updateItem(plant: PlantRow, id: string, dto: UpdateItemDto, req: AppRequest) {
    const [before] = await this.db.select().from(items).where(and(eq(items.id, id), eq(items.plantId, plant.id)))
    if (!before) throw new NotFoundException('Ítem no encontrado')
    if (dto.assetModelId) await this.assertModel(dto.assetModelId)

    const min = dto.minStock ?? Number(before.minStock)
    const max = dto.maxStock === undefined ? num(before.maxStock) : dto.maxStock
    if (max !== null && max < min) throw validationError('maxStock', 'El máximo no puede ser menor que el mínimo')

    await this.db
      .update(items)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.itemType !== undefined && { itemType: dto.itemType }),
        ...(dto.minStock !== undefined && { minStock: String(dto.minStock) }),
        ...(dto.maxStock !== undefined && { maxStock: dto.maxStock === null ? null : String(dto.maxStock) }),
        ...(dto.isCritical !== undefined && { isCritical: dto.isCritical }),
        ...(dto.unitCost !== undefined && { unitCost: dto.unitCost === null ? null : String(dto.unitCost) }),
        ...(dto.assetModelId !== undefined && { assetModelId: dto.assetModelId }),
        ...(dto.status !== undefined && { status: dto.status }),
      })
      .where(eq(items.id, id))
    await this.audit.record(req, {
      module: 'inventory',
      entityType: 'item',
      entityId: id,
      plantId: plant.id,
      action: 'updated',
      oldData: { name: before.name, itemType: before.itemType, minStock: before.minStock, unitCost: before.unitCost, status: before.status, isCritical: before.isCritical },
      newData: dto,
    })
    return this.getItem(plant, id)
  }

  // ---------- Movimientos (núcleo transaccional) ----------

  private async lockItem(tx: Tx, plantId: string, itemId: string): Promise<ItemRow> {
    // FOR UPDATE: serializa los movimientos del mismo ítem (costo promedio y saldos consistentes).
    const [item] = await tx.select().from(items).where(and(eq(items.id, itemId), eq(items.plantId, plantId))).for('update')
    if (!item) throw validationError('itemId', 'El ítem no existe en esta planta')
    return item
  }

  private async getLocation(tx: Tx, plantId: string, locationId: string, field: string, opts: { active: boolean }) {
    const [loc] = await tx.select().from(locations).where(and(eq(locations.id, locationId), eq(locations.plantId, plantId)))
    if (!loc) throw validationError(field, 'La ubicación no existe en esta planta')
    if (opts.active && loc.status !== 'ACTIVE') throw validationError(field, 'La ubicación está inactiva')
    return loc
  }

  private async addStock(tx: Tx, itemId: string, locationId: string, quantity: number) {
    await tx
      .insert(stock)
      .values({ itemId, locationId, quantityOnHand: String(quantity) })
      .onConflictDoUpdate({ target: [stock.itemId, stock.locationId], set: { quantityOnHand: sql`${stock.quantityOnHand} + ${String(quantity)}::numeric` } })
  }

  /** Resta existencias solo si alcanzan: el UPDATE condicional impide saldos negativos incluso con salidas simultáneas. */
  private async takeStock(tx: Tx, item: ItemRow, locationId: string, quantity: number) {
    const updated = await tx
      .update(stock)
      .set({ quantityOnHand: sql`${stock.quantityOnHand} - ${String(quantity)}::numeric` })
      .where(and(eq(stock.itemId, item.id), eq(stock.locationId, locationId), gte(stock.quantityOnHand, String(quantity))))
      .returning({ id: stock.itemId })
    if (updated.length === 0) {
      const [row] = await tx.select({ q: stock.quantityOnHand }).from(stock).where(and(eq(stock.itemId, item.id), eq(stock.locationId, locationId)))
      throw new ConflictException(`Stock insuficiente de ${item.sku} en la ubicación (disponible: ${Number(row?.q ?? 0)} ${item.uom}, solicitado: ${quantity})`)
    }
  }

  /** Ingreso. `revalue=false` (devoluciones) conserva el costo promedio. */
  async applyReceipt(tx: Tx, ctx: MovementCtx, locationId: string, quantity: number, opts: { unitCost?: number; revalue?: boolean } = {}) {
    const item = await this.lockItem(tx, ctx.plantId, ctx.itemId)
    if (item.status !== 'ACTIVE') throw new ConflictException('El ítem está inactivo')
    await this.getLocation(tx, ctx.plantId, locationId, 'locationId', { active: true })

    let cost = num(item.unitCost)
    const incoming = opts.unitCost
    if (incoming !== undefined && opts.revalue !== false) {
      const [{ n: onHand }] = await tx.select({ n: sql<number>`coalesce(sum(${stock.quantityOnHand}), 0)::float8` }).from(stock).where(eq(stock.itemId, item.id))
      // Costo promedio ponderado: (existencias × costo actual + ingreso × costo nuevo) / total.
      cost = cost === null || onHand <= 0 ? incoming : money((onHand * cost + quantity * incoming) / (onHand + quantity))
      await tx.update(items).set({ unitCost: String(cost) }).where(eq(items.id, item.id))
    }
    await this.addStock(tx, item.id, locationId, quantity)
    const snapshot = opts.revalue === false ? (incoming ?? cost) : cost
    return this.record(tx, ctx, 'RECEIPT', quantity, snapshot, { to: locationId })
  }

  async applyIssue(tx: Tx, ctx: MovementCtx, locationId: string, quantity: number) {
    const item = await this.lockItem(tx, ctx.plantId, ctx.itemId)
    await this.getLocation(tx, ctx.plantId, locationId, 'locationId', { active: false })
    await this.takeStock(tx, item, locationId, quantity)
    return this.record(tx, ctx, 'ISSUE', quantity, num(item.unitCost), { from: locationId })
  }

  private async applyTransfer(tx: Tx, ctx: MovementCtx, fromId: string, toId: string, quantity: number) {
    if (fromId === toId) throw validationError('toLocationId', 'El origen y el destino deben ser distintos')
    const item = await this.lockItem(tx, ctx.plantId, ctx.itemId)
    if (item.status !== 'ACTIVE') throw new ConflictException('El ítem está inactivo')
    await this.getLocation(tx, ctx.plantId, fromId, 'fromLocationId', { active: false })
    await this.getLocation(tx, ctx.plantId, toId, 'toLocationId', { active: true })
    await this.takeStock(tx, item, fromId, quantity)
    await this.addStock(tx, item.id, toId, quantity)
    return this.record(tx, ctx, 'TRANSFER', quantity, num(item.unitCost), { from: fromId, to: toId })
  }

  private async applyAdjust(tx: Tx, ctx: MovementCtx, locationId: string, newQuantity: number) {
    const item = await this.lockItem(tx, ctx.plantId, ctx.itemId)
    await this.getLocation(tx, ctx.plantId, locationId, 'locationId', { active: false })
    const [row] = await tx.select({ q: stock.quantityOnHand }).from(stock).where(and(eq(stock.itemId, item.id), eq(stock.locationId, locationId)))
    const current = Number(row?.q ?? 0)
    const delta = money(newQuantity - current)
    if (delta === 0) throw validationError('newQuantity', 'La cantidad coincide con el saldo actual: no hay nada que ajustar')

    await tx
      .insert(stock)
      .values({ itemId: item.id, locationId, quantityOnHand: String(newQuantity) })
      .onConflictDoUpdate({ target: [stock.itemId, stock.locationId], set: { quantityOnHand: String(newQuantity) } })
    return this.record(tx, ctx, 'ADJUSTMENT', Math.abs(delta), num(item.unitCost), delta > 0 ? { to: locationId } : { from: locationId })
  }

  private async record(tx: Tx, ctx: MovementCtx, type: string, quantity: number, unitCost: number | null, loc: { from?: string; to?: string }) {
    const [m] = await tx
      .insert(movements)
      .values({
        plantId: ctx.plantId,
        itemId: ctx.itemId,
        fromLocationId: loc.from,
        toLocationId: loc.to,
        quantity: String(quantity),
        movementType: type,
        unitCost: unitCost === null ? null : String(unitCost),
        referenceType: ctx.referenceType ?? 'MANUAL',
        referenceId: ctx.referenceId,
        note: ctx.note,
        performedBy: ctx.userId,
      })
      .returning({ id: movements.id })
    return { movementId: m.id, unitCost }
  }

  private async run<T>(plant: PlantRow, req: AppRequest, action: string, data: Record<string, unknown>, work: (tx: Tx) => Promise<T>) {
    const result = await this.db.transaction(work)
    await this.audit.record(req, { module: 'inventory', entityType: 'movement', entityId: (result as { movementId?: string })?.movementId, plantId: plant.id, action, newData: data })
    return result
  }

  receipt(plant: PlantRow, dto: ReceiptDto, req: AppRequest) {
    return this.run(plant, req, 'receipt', dto, (tx) => this.applyReceipt(tx, { plantId: plant.id, itemId: dto.itemId, userId: req.user?.id, note: dto.note }, dto.locationId, dto.quantity, { unitCost: dto.unitCost }))
  }

  issue(plant: PlantRow, dto: IssueDto, req: AppRequest) {
    return this.run(plant, req, 'issue', dto, (tx) => this.applyIssue(tx, { plantId: plant.id, itemId: dto.itemId, userId: req.user?.id, note: dto.note }, dto.locationId, dto.quantity))
  }

  transfer(plant: PlantRow, dto: TransferDto, req: AppRequest) {
    return this.run(plant, req, 'transfer', dto, (tx) => this.applyTransfer(tx, { plantId: plant.id, itemId: dto.itemId, userId: req.user?.id, note: dto.note }, dto.fromLocationId, dto.toLocationId, dto.quantity))
  }

  adjust(plant: PlantRow, dto: AdjustDto, req: AppRequest) {
    return this.run(plant, req, 'adjustment', dto, (tx) => this.applyAdjust(tx, { plantId: plant.id, itemId: dto.itemId, userId: req.user?.id, note: dto.reason }, dto.locationId, dto.newQuantity))
  }

  async listMovements(plant: PlantRow, q: ListMovementsQuery) {
    const fromLoc = alias(locations, 'from_loc')
    const toLoc = alias(locations, 'to_loc')
    const where = and(
      eq(movements.plantId, plant.id),
      q.itemId ? eq(movements.itemId, q.itemId) : undefined,
      q.type ? inArray(movements.movementType, q.type) : undefined,
      q.referenceType ? eq(movements.referenceType, q.referenceType) : undefined,
      q.locationId ? or(eq(movements.fromLocationId, q.locationId), eq(movements.toLocationId, q.locationId)) : undefined,
      q.from ? gte(movements.performedAt, new Date(`${q.from}T00:00:00.000Z`)) : undefined,
      q.to ? lte(movements.performedAt, new Date(`${q.to}T23:59:59.999Z`)) : undefined,
    )
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: movements.id,
          itemId: items.id,
          sku: items.sku,
          itemName: items.name,
          uom: items.uom,
          movementType: movements.movementType,
          quantity: movements.quantity,
          unitCost: movements.unitCost,
          referenceType: movements.referenceType,
          referenceId: movements.referenceId,
          note: movements.note,
          performedAt: movements.performedAt,
          fromCode: fromLoc.code,
          toCode: toLoc.code,
          first: users.firstName,
          last: users.lastName,
        })
        .from(movements)
        .innerJoin(items, eq(items.id, movements.itemId))
        .leftJoin(fromLoc, eq(fromLoc.id, movements.fromLocationId))
        .leftJoin(toLoc, eq(toLoc.id, movements.toLocationId))
        .leftJoin(users, eq(users.id, movements.performedBy))
        .where(where)
        .orderBy(desc(movements.performedAt), desc(movements.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(movements).where(where),
    ])
    return pageOf(
      rows.map((r) => ({
        id: r.id,
        item: { id: r.itemId, sku: r.sku, name: r.itemName, uom: r.uom },
        type: r.movementType,
        quantity: Number(r.quantity),
        unitCost: num(r.unitCost),
        referenceType: r.referenceType,
        referenceId: r.referenceId,
        note: r.note,
        performedAt: r.performedAt,
        from: r.fromCode,
        to: r.toCode,
        performedBy: fullName(r.first, r.last),
      })),
      total,
      q.page,
      q.pageSize,
    )
  }

  // ---------- Indicadores (design.md §27) ----------

  async dashboard(plant: PlantRow) {
    const active = await this.db
      .select({ id: items.id, sku: items.sku, name: items.name, uom: items.uom, minStock: items.minStock, isCritical: items.isCritical, unitCost: items.unitCost, onHand: onHandSql })
      .from(items)
      .where(and(eq(items.plantId, plant.id), eq(items.status, 'ACTIVE')))

    const low = active.filter((i) => i.onHand < Number(i.minStock))
    const stockValue = active.reduce((sum, i) => sum + (i.unitCost === null ? 0 : i.onHand * Number(i.unitCost)), 0)

    const since = new Date(Date.now() - 30 * 86_400_000)
    const moved = await this.db
      .select({ type: movements.movementType, n: sql<number>`count(*)::int`, qty: sql<number>`coalesce(sum(${movements.quantity}), 0)::float8` })
      .from(movements)
      .where(and(eq(movements.plantId, plant.id), gte(movements.performedAt, since)))
      .groupBy(movements.movementType)
    const countOf = (type: string) => moved.find((m) => m.type === type)?.n ?? 0

    const assetStates = await this.db
      .select({ status: assets.status, n: sql<number>`count(*)::int` })
      .from(assets)
      .where(and(eq(assets.plantId, plant.id), inArray(assets.status, ['STOCK', 'REPAIR'])))
      .groupBy(assets.status)

    const [settings] = await this.db.select({ currency: plantSettings.currencyCode }).from(plantSettings).where(eq(plantSettings.plantId, plant.id))

    return {
      currency: settings?.currency ?? 'USD',
      itemCount: active.length,
      stockValue: money(stockValue),
      lowStockCount: low.length,
      criticalLowCount: low.filter((i) => i.isCritical).length,
      movementsLast30Days: moved.reduce((s, m) => s + m.n, 0),
      receiptsLast30Days: countOf('RECEIPT'),
      issuesLast30Days: countOf('ISSUE'),
      assetsInStock: assetStates.find((a) => a.status === 'STOCK')?.n ?? 0,
      assetsInRepair: assetStates.find((a) => a.status === 'REPAIR')?.n ?? 0,
      // Las reservas de stock llegan con la planificación de OT/requisiciones; no se inventa un valor.
      reservations: null,
      lowStock: low
        .map((i) => ({ id: i.id, sku: i.sku, name: i.name, uom: i.uom, onHand: i.onHand, minStock: Number(i.minStock), isCritical: i.isCritical, deficit: money(Number(i.minStock) - i.onHand) }))
        .sort((a, b) => Number(b.isCritical) - Number(a.isCritical) || b.deficit - a.deficit)
        .slice(0, 10),
      recentMovements: (await this.listMovements(plant, { page: 1, pageSize: 8 })).items,
    }
  }

  /** Pestaña Inventario de la FUR: repuestos del mismo modelo del catálogo y lo que ya consumió el activo. */
  async assetSummary(plantId: string, assetModelId: string, assetId: string) {
    const compatible = await this.db
      .select({ id: items.id, sku: items.sku, name: items.name, uom: items.uom, minStock: items.minStock, isCritical: items.isCritical, onHand: onHandSql })
      .from(items)
      .where(and(eq(items.plantId, plantId), eq(items.assetModelId, assetModelId), eq(items.status, 'ACTIVE')))
      .orderBy(desc(items.isCritical), asc(items.name))
      .limit(20)
    const used = await this.db
      .select({
        id: items.id,
        sku: items.sku,
        name: items.name,
        uom: items.uom,
        quantity: sql<number>`sum(${workOrderParts.quantity})::float8`,
        cost: sql<number>`coalesce(sum(${workOrderParts.quantity} * ${workOrderParts.unitCost}), 0)::float8`,
      })
      .from(workOrderParts)
      .innerJoin(workOrders, eq(workOrders.id, workOrderParts.workOrderId))
      .innerJoin(items, eq(items.id, workOrderParts.itemId))
      .where(and(eq(workOrders.plantId, plantId), eq(workOrders.assetId, assetId), ne(workOrders.status, 'CANCELLED')))
      .groupBy(items.id)
      .orderBy(desc(sql`sum(${workOrderParts.quantity} * coalesce(${workOrderParts.unitCost}, 0))`))
      .limit(10)
    return {
      compatibleItems: compatible.map((i) => ({ id: i.id, sku: i.sku, name: i.name, uom: i.uom, onHand: i.onHand, minStock: Number(i.minStock), isCritical: i.isCritical, belowMin: i.onHand < Number(i.minStock) })),
      partsUsed: used.map((u) => ({ id: u.id, sku: u.sku, name: u.name, uom: u.uom, quantity: u.quantity, cost: money(u.cost) })),
    }
  }

  /** Para OT: cuántas unidades hay de un ítem en una ubicación (UI de consumo de repuestos). */
  async stockAt(plantId: string, itemId: string, locationId: string) {
    const [row] = await this.db.select({ q: stock.quantityOnHand }).from(stock).where(and(eq(stock.itemId, itemId), eq(stock.locationId, locationId)))
    return Number(row?.q ?? 0)
  }

  /** Para no mostrar ítems inactivos al consumir repuestos. */
  activeItem(plantId: string, itemId: string) {
    return this.db.select().from(items).where(and(eq(items.id, itemId), eq(items.plantId, plantId), ne(items.status, 'INACTIVE')))
  }
}

function itemColumns() {
  return {
    id: items.id,
    plantId: items.plantId,
    assetModelId: items.assetModelId,
    sku: items.sku,
    name: items.name,
    description: items.description,
    itemType: items.itemType,
    uom: items.uom,
    minStock: items.minStock,
    maxStock: items.maxStock,
    isCritical: items.isCritical,
    unitCost: items.unitCost,
    status: items.status,
    createdAt: items.createdAt,
    updatedAt: items.updatedAt,
  }
}
