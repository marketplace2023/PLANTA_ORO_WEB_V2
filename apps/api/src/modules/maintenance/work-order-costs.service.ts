import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq, gte, inArray, ne, sql } from 'drizzle-orm'
import { validationError } from '../../common/errors'
import type { AppRequest, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { assets, plantSettings, resources, users, workOrderCosts, workOrderParts, workOrders, type CostKind } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { PricingService } from '../budget/pricing.service'
import type { AddCostDto } from './maintenance.schemas'

/** Igual que los repuestos: mientras la orden se ejecuta (o terminó pero no se cerró) se registran o quitan costos. */
const COSTS_EDITABLE = ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED']

/** Tipo de recurso del libro de precios que corresponde a cada tipo de costo (servicios y otros no usan recursos). */
const RESOURCE_TYPE_FOR: Partial<Record<CostKind, string>> = { LABOR: 'LABOR', EQUIPMENT: 'EQUIPMENT', TRANSPORT: 'TRANSPORT' }

const money = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
const round4 = (v: number) => Math.round((v + Number.EPSILON) * 10_000) / 10_000
const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(' ') || null

const lineCostSql = sql`${workOrderCosts.quantity} * ${workOrderCosts.unitCost}`
const partCostSql = sql`${workOrderParts.quantity} * ${workOrderParts.unitCost}`

@Injectable()
export class WorkOrderCostsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
  ) {}

  async currency(plantId: string) {
    const [s] = await this.db.select({ currency: plantSettings.currencyCode }).from(plantSettings).where(eq(plantSettings.plantId, plantId))
    return s?.currency ?? 'USD'
  }

  async list(workOrderId: string) {
    const rows = await this.db
      .select({
        id: workOrderCosts.id,
        kind: workOrderCosts.kind,
        description: workOrderCosts.description,
        resourceId: resources.id,
        resourceCode: resources.code,
        resourceUnit: resources.unit,
        quantity: workOrderCosts.quantity,
        unitCost: workOrderCosts.unitCost,
        createdAt: workOrderCosts.createdAt,
        first: users.firstName,
        last: users.lastName,
      })
      .from(workOrderCosts)
      .leftJoin(resources, eq(resources.id, workOrderCosts.resourceId))
      .leftJoin(users, eq(users.id, workOrderCosts.createdBy))
      .where(eq(workOrderCosts.workOrderId, workOrderId))
      .orderBy(asc(workOrderCosts.createdAt), asc(workOrderCosts.id))

    const costs = rows.map((r) => {
      const quantity = Number(r.quantity)
      const unitCost = Number(r.unitCost)
      return {
        id: r.id,
        kind: r.kind as CostKind,
        description: r.description,
        resource: r.resourceId ? { id: r.resourceId, code: r.resourceCode!, unit: r.resourceUnit! } : null,
        quantity,
        unitCost,
        lineCost: money(quantity * unitCost),
        createdAt: r.createdAt,
        createdBy: fullName(r.first, r.last),
      }
    })
    return { costs, otherCost: money(costs.reduce((sum, c) => sum + c.lineCost, 0)) }
  }

  private async load(plant: PlantRow, id: string) {
    const [wo] = await this.db.select().from(workOrders).where(and(eq(workOrders.id, id), eq(workOrders.plantId, plant.id)))
    if (!wo) throw new NotFoundException('Orden de trabajo no encontrada')
    return wo
  }

  /** Quien puede editar la orden, o quien la tiene asignada, registra los costos de su trabajo. */
  private assertMay(wo: { assignedTo: string | null }, req: AppRequest) {
    const mayUpdate = req.permissions?.has('maintenance.update') ?? false
    const isAssignee = !!req.user && wo.assignedTo === req.user.id
    if (!mayUpdate && !isAssignee) throw new ForbiddenException('Solo quien edita la orden o su responsable puede registrar costos')
  }

  /** Costo unitario (foto, en moneda base) y descripción de un recurso del libro de precios. */
  private async fromResource(plant: PlantRow, dto: AddCostDto, req: AppRequest) {
    if (!(req.permissions?.has('budget.read') ?? false)) {
      throw new ForbiddenException('Para usar un recurso del libro de precios necesitas acceso a Presupuestos; registra el costo a mano')
    }
    const expected = RESOURCE_TYPE_FOR[dto.kind]
    if (!expected) throw validationError('resourceId', 'Los servicios y otros costos no usan recursos del libro de precios')
    const [res] = await this.db.select().from(resources).where(and(eq(resources.id, dto.resourceId!), eq(resources.plantId, plant.id)))
    if (!res) throw validationError('resourceId', 'Recurso no encontrado en esta planta')
    if (res.resourceType !== expected) throw validationError('resourceId', `El recurso es de tipo ${res.resourceType} y el costo es de tipo ${dto.kind}`)
    if (res.status !== 'ACTIVE') throw new ConflictException('El recurso está inactivo')
    const rates = await this.pricing.rates(plant.id)
    const rate = rates.get(res.currency)
    if (rate === undefined) throw new ConflictException(`Falta el tipo de cambio de ${res.currency}: cárgalo en Presupuestos antes de usar este recurso`)
    return { unitCost: round4(Number(res.unitPrice) * rate), description: dto.description ?? res.name }
  }

  async add(plant: PlantRow, id: string, dto: AddCostDto, req: AppRequest) {
    const wo = await this.load(plant, id)
    this.assertMay(wo, req)
    const priced = dto.resourceId ? await this.fromResource(plant, dto, req) : { unitCost: dto.unitCost!, description: dto.description! }

    const costId = await this.db.transaction(async (tx) => {
      // Bloquea la orden: si se cierra o cancela en paralelo, no se agregan costos sobre una orden que ya no admite cambios.
      const [locked] = await tx.select({ status: workOrders.status }).from(workOrders).where(eq(workOrders.id, id)).for('update')
      if (!COSTS_EDITABLE.includes(locked.status)) {
        throw new ConflictException('Solo se registran costos en órdenes en ejecución, en pausa o terminadas (sin cerrar)')
      }
      const [row] = await tx
        .insert(workOrderCosts)
        .values({ workOrderId: id, kind: dto.kind, description: priced.description, resourceId: dto.resourceId, quantity: String(dto.quantity), unitCost: String(priced.unitCost), createdBy: req.user?.id })
        .returning({ id: workOrderCosts.id })
      return row.id
    })

    await this.audit.record(req, {
      module: 'maintenance',
      entityType: 'work_order',
      entityId: id,
      plantId: plant.id,
      action: 'cost.added',
      newData: { costId, kind: dto.kind, resourceId: dto.resourceId ?? null, quantity: dto.quantity, unitCost: priced.unitCost },
    })
    return this.list(id)
  }

  async remove(plant: PlantRow, id: string, costId: string, req: AppRequest) {
    const wo = await this.load(plant, id)
    this.assertMay(wo, req)

    const removed = await this.db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: workOrders.status }).from(workOrders).where(eq(workOrders.id, id)).for('update')
      if (!COSTS_EDITABLE.includes(locked.status)) throw new ConflictException('La orden ya no admite cambios en sus costos')
      const [row] = await tx
        .delete(workOrderCosts)
        .where(and(eq(workOrderCosts.id, costId), eq(workOrderCosts.workOrderId, id)))
        .returning()
      if (!row) throw new NotFoundException('Costo no encontrado en la orden')
      return row
    })

    await this.audit.record(req, {
      module: 'maintenance',
      entityType: 'work_order',
      entityId: id,
      plantId: plant.id,
      action: 'cost.removed',
      oldData: { costId, kind: removed.kind, quantity: removed.quantity, unitCost: removed.unitCost },
    })
    return this.list(id)
  }

  /** Costo (sin repuestos) de las órdenes terminadas en los últimos `days` días: KPI de costos del tablero. */
  async costSince(plantId: string, days: number) {
    const since = new Date(Date.now() - days * 86_400_000)
    const [row] = await this.db
      .select({ cost: sql<number>`coalesce(sum(${lineCostSql}), 0)::float8` })
      .from(workOrderCosts)
      .innerJoin(workOrders, eq(workOrders.id, workOrderCosts.workOrderId))
      .where(and(eq(workOrders.plantId, plantId), inArray(workOrders.status, ['COMPLETED', 'CLOSED']), gte(workOrders.actualEnd, since)))
    return money(row.cost)
  }

  /** Costo acumulado (sin repuestos) de un activo, excluyendo órdenes canceladas. */
  async costForAsset(plantId: string, assetId: string) {
    const [row] = await this.db
      .select({ cost: sql<number>`coalesce(sum(${lineCostSql}), 0)::float8` })
      .from(workOrderCosts)
      .innerJoin(workOrders, eq(workOrders.id, workOrderCosts.workOrderId))
      .where(and(eq(workOrders.plantId, plantId), eq(workOrders.assetId, assetId), ne(workOrders.status, 'CANCELLED')))
    return money(row.cost)
  }

  /**
   * Desglose de costos de un activo (pestaña Costos de la FUR): por categoría, por mes (últimos 12), por tipo de orden
   * y por orden. Excluye las órdenes canceladas. El mes es el del registro del costo, en UTC.
   */
  async assetBreakdown(plant: PlantRow, assetId: string) {
    const [asset] = await this.db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, assetId), eq(assets.plantId, plant.id)))
    if (!asset) throw new NotFoundException('Activo no encontrado')

    const scope = and(eq(workOrders.plantId, plant.id), eq(workOrders.assetId, assetId), ne(workOrders.status, 'CANCELLED'))
    const month = (col: typeof workOrderParts.createdAt | typeof workOrderCosts.createdAt) => sql<string>`to_char(${col} at time zone 'UTC', 'YYYY-MM')`

    const [partsByOrder, costsByOrderKind, partsByMonth, costsByMonth, [uncosted]] = await Promise.all([
      this.db
        .select({ workOrderId: workOrderParts.workOrderId, cost: sql<number>`coalesce(sum(${partCostSql}), 0)::float8` })
        .from(workOrderParts)
        .innerJoin(workOrders, eq(workOrders.id, workOrderParts.workOrderId))
        .where(scope)
        .groupBy(workOrderParts.workOrderId),
      this.db
        .select({ workOrderId: workOrderCosts.workOrderId, kind: workOrderCosts.kind, cost: sql<number>`sum(${lineCostSql})::float8` })
        .from(workOrderCosts)
        .innerJoin(workOrders, eq(workOrders.id, workOrderCosts.workOrderId))
        .where(scope)
        .groupBy(workOrderCosts.workOrderId, workOrderCosts.kind),
      this.db
        .select({ month: month(workOrderParts.createdAt), cost: sql<number>`coalesce(sum(${partCostSql}), 0)::float8` })
        .from(workOrderParts)
        .innerJoin(workOrders, eq(workOrders.id, workOrderParts.workOrderId))
        .where(scope)
        .groupBy(month(workOrderParts.createdAt)),
      this.db
        .select({ month: month(workOrderCosts.createdAt), cost: sql<number>`sum(${lineCostSql})::float8` })
        .from(workOrderCosts)
        .innerJoin(workOrders, eq(workOrders.id, workOrderCosts.workOrderId))
        .where(scope)
        .groupBy(month(workOrderCosts.createdAt)),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(workOrderParts)
        .innerJoin(workOrders, eq(workOrders.id, workOrderParts.workOrderId))
        .where(and(scope, sql`${workOrderParts.unitCost} is null`)),
    ])

    const totals = { parts: 0, labor: 0, equipment: 0, transport: 0, service: 0, other: 0 }
    const perOrder = new Map<string, { parts: number; other: number }>()
    const entry = (id: string) => perOrder.get(id) ?? perOrder.set(id, { parts: 0, other: 0 }).get(id)!
    for (const p of partsByOrder) {
      entry(p.workOrderId).parts += p.cost
      totals.parts += p.cost
    }
    for (const c of costsByOrderKind) {
      entry(c.workOrderId).other += c.cost
      totals[c.kind.toLowerCase() as 'labor' | 'equipment' | 'transport' | 'service' | 'other'] += c.cost
    }

    const orderRows = perOrder.size
      ? await this.db.select({ id: workOrders.id, code: workOrders.code, title: workOrders.title, type: workOrders.type, status: workOrders.status }).from(workOrders).where(inArray(workOrders.id, [...perOrder.keys()]))
      : []
    const orders = orderRows
      .map((o) => {
        const c = perOrder.get(o.id)!
        return { ...o, parts: money(c.parts), other: money(c.other), total: money(c.parts + c.other) }
      })
      .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code))

    const typeTotals = new Map<string, { orders: number; total: number }>()
    for (const o of orders) {
      const t = typeTotals.get(o.type) ?? { orders: 0, total: 0 }
      t.orders += 1
      t.total += o.total
      typeTotals.set(o.type, t)
    }

    // Últimos 12 meses (incluye el actual) aunque no tengan costos: la serie siempre es continua.
    const now = new Date()
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1))
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })
    const partsM = new Map(partsByMonth.map((r) => [r.month, r.cost]))
    const otherM = new Map(costsByMonth.map((r) => [r.month, r.cost]))
    const byMonth = months.map((m) => ({ month: m, parts: money(partsM.get(m) ?? 0), other: money(otherM.get(m) ?? 0), total: money((partsM.get(m) ?? 0) + (otherM.get(m) ?? 0)) }))
    // Costos anteriores a la ventana: no se pierden del total, se informan aparte.
    const inWindow = byMonth.reduce((sum, m) => sum + m.total, 0)

    const other = totals.labor + totals.equipment + totals.transport + totals.service + totals.other
    const total = totals.parts + other
    return {
      currency: await this.currency(plant.id),
      totals: {
        parts: money(totals.parts),
        labor: money(totals.labor),
        equipment: money(totals.equipment),
        transport: money(totals.transport),
        service: money(totals.service),
        other: money(totals.other),
        total: money(total),
        partsWithoutCost: uncosted?.n ?? 0,
      },
      byMonth,
      beforeWindow: money(Math.max(0, total - inWindow)),
      byType: [...typeTotals.entries()].map(([type, v]) => ({ type, orders: v.orders, total: money(v.total) })).sort((a, b) => b.total - a.total),
      orderCount: orders.length,
      orders: orders.slice(0, 20),
    }
  }
}
