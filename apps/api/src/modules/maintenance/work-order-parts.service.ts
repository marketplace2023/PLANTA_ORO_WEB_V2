import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq, gte, inArray, ne, sql } from 'drizzle-orm'
import { DB, type Database } from '../../database/database.module'
import { items, locations, plantSettings, users, workOrderParts, workOrders } from '../../database/schema'
import type { AppRequest, PlantRow } from '../../common/types'
import { AuditService } from '../audit/audit.service'
import { InventoryService } from '../inventory/inventory.service'
import type { AddPartDto } from './maintenance.schemas'

/** Mientras la orden se ejecuta (o ya terminó pero aún no se cierra) se pueden registrar o devolver repuestos. */
const PARTS_EDITABLE = ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED']

const money = (v: number) => Math.round(v * 100) / 100
const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(' ') || null

@Injectable()
export class WorkOrderPartsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  async list(workOrderId: string) {
    const rows = await this.db
      .select({
        id: workOrderParts.id,
        itemId: items.id,
        sku: items.sku,
        itemName: items.name,
        uom: items.uom,
        locationCode: locations.code,
        quantity: workOrderParts.quantity,
        unitCost: workOrderParts.unitCost,
        createdAt: workOrderParts.createdAt,
        first: users.firstName,
        last: users.lastName,
      })
      .from(workOrderParts)
      .innerJoin(items, eq(items.id, workOrderParts.itemId))
      .leftJoin(locations, eq(locations.id, workOrderParts.locationId))
      .leftJoin(users, eq(users.id, workOrderParts.createdBy))
      .where(eq(workOrderParts.workOrderId, workOrderId))
      .orderBy(asc(workOrderParts.createdAt), asc(workOrderParts.id))

    const parts = rows.map((r) => {
      const quantity = Number(r.quantity)
      const unitCost = r.unitCost === null ? null : Number(r.unitCost)
      return {
        id: r.id,
        item: { id: r.itemId, sku: r.sku, name: r.itemName, uom: r.uom },
        location: r.locationCode,
        quantity,
        unitCost,
        lineCost: unitCost === null ? null : money(quantity * unitCost),
        createdAt: r.createdAt,
        createdBy: fullName(r.first, r.last),
      }
    })
    return { parts, partsCost: money(parts.reduce((sum, p) => sum + (p.lineCost ?? 0), 0)), hasUncosted: parts.some((p) => p.lineCost === null) }
  }

  private async load(plant: PlantRow, id: string) {
    const [wo] = await this.db.select().from(workOrders).where(and(eq(workOrders.id, id), eq(workOrders.plantId, plant.id)))
    if (!wo) throw new NotFoundException('Orden de trabajo no encontrada')
    return wo
  }

  /** Quien puede editar la orden, o quien la tiene asignada, registra los repuestos que usó. */
  private assertMay(wo: { assignedTo: string | null }, req: AppRequest) {
    const mayUpdate = req.permissions?.has('maintenance.update') ?? false
    const isAssignee = !!req.user && wo.assignedTo === req.user.id
    if (!mayUpdate && !isAssignee) throw new ForbiddenException('Solo quien edita la orden o su responsable puede registrar repuestos')
  }

  async add(plant: PlantRow, id: string, dto: AddPartDto, req: AppRequest) {
    const wo = await this.load(plant, id)
    this.assertMay(wo, req)

    const partId = await this.db.transaction(async (tx) => {
      // Bloquea la orden: si cambia de estado en paralelo (p. ej. se cierra), no se consume stock sobre una orden cerrada.
      const [locked] = await tx.select({ status: workOrders.status }).from(workOrders).where(eq(workOrders.id, id)).for('update')
      if (!PARTS_EDITABLE.includes(locked.status)) {
        throw new ConflictException('Solo se registran repuestos en órdenes en ejecución, en pausa o terminadas (sin cerrar)')
      }
      const movement = await this.inventory.applyIssue(
        tx,
        { plantId: plant.id, itemId: dto.itemId, userId: req.user?.id, referenceType: 'WORK_ORDER', referenceId: id, note: dto.note ?? `Consumo en ${wo.code}` },
        dto.locationId,
        dto.quantity,
      )
      const [part] = await tx
        .insert(workOrderParts)
        .values({
          workOrderId: id,
          itemId: dto.itemId,
          locationId: dto.locationId,
          quantity: String(dto.quantity),
          unitCost: movement.unitCost === null ? null : String(movement.unitCost),
          createdBy: req.user?.id,
        })
        .returning({ id: workOrderParts.id })
      return part.id
    })

    await this.audit.record(req, {
      module: 'maintenance',
      entityType: 'work_order',
      entityId: id,
      plantId: plant.id,
      action: 'part.consumed',
      newData: { partId, itemId: dto.itemId, locationId: dto.locationId, quantity: dto.quantity },
    })
    return this.list(id)
  }

  async remove(plant: PlantRow, id: string, partId: string, req: AppRequest) {
    const wo = await this.load(plant, id)
    this.assertMay(wo, req)

    const part = await this.db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: workOrders.status }).from(workOrders).where(eq(workOrders.id, id)).for('update')
      if (!PARTS_EDITABLE.includes(locked.status)) throw new ConflictException('La orden ya no admite cambios en sus repuestos')

      // El DELETE devuelve la fila solo una vez: dos devoluciones simultáneas no duplican el reingreso.
      const [removed] = await tx
        .delete(workOrderParts)
        .where(and(eq(workOrderParts.id, partId), eq(workOrderParts.workOrderId, id)))
        .returning()
      if (!removed) throw new NotFoundException('Repuesto no encontrado en la orden')
      if (!removed.locationId) throw new ConflictException('La ubicación original ya no existe; reingrese el stock manualmente desde Inventario')

      await this.inventory.applyReceipt(
        tx,
        { plantId: plant.id, itemId: removed.itemId, userId: req.user?.id, referenceType: 'WORK_ORDER', referenceId: id, note: `Devolución desde ${wo.code}` },
        removed.locationId,
        Number(removed.quantity),
        // Devolución: conserva el costo promedio vigente (no es una compra nueva).
        { revalue: false, unitCost: removed.unitCost === null ? undefined : Number(removed.unitCost) },
      )
      return removed
    })

    await this.audit.record(req, {
      module: 'maintenance',
      entityType: 'work_order',
      entityId: id,
      plantId: plant.id,
      action: 'part.returned',
      oldData: { partId, itemId: part.itemId, quantity: part.quantity },
    })
    return this.list(id)
  }

  async currency(plantId: string) {
    const [settings] = await this.db.select({ currency: plantSettings.currencyCode }).from(plantSettings).where(eq(plantSettings.plantId, plantId))
    return settings?.currency ?? 'USD'
  }

  /** Costo de repuestos de las órdenes terminadas en los últimos `days` días (KPI de costos del tablero). */
  async costSince(plantId: string, days: number) {
    const since = new Date(Date.now() - days * 86_400_000)
    const [row] = await this.db
      .select({ cost: sql<number>`coalesce(sum(${workOrderParts.quantity} * ${workOrderParts.unitCost}), 0)::float8`, orders: sql<number>`count(distinct ${workOrders.id})::int` })
      .from(workOrderParts)
      .innerJoin(workOrders, eq(workOrders.id, workOrderParts.workOrderId))
      .where(and(eq(workOrders.plantId, plantId), inArray(workOrders.status, ['COMPLETED', 'CLOSED']), gte(workOrders.actualEnd, since)))
    return { partsCost: money(row.cost), orders: row.orders, currency: await this.currency(plantId) }
  }

  /** Costo acumulado de repuestos de un activo (excluye órdenes canceladas); alimenta la FUR. */
  async costForAsset(plantId: string, assetId: string) {
    const [row] = await this.db
      .select({ cost: sql<number>`coalesce(sum(${workOrderParts.quantity} * ${workOrderParts.unitCost}), 0)::float8` })
      .from(workOrderParts)
      .innerJoin(workOrders, eq(workOrders.id, workOrderParts.workOrderId))
      .where(and(eq(workOrders.plantId, plantId), eq(workOrders.assetId, assetId), ne(workOrders.status, 'CANCELLED')))
    return money(row.cost)
  }
}
