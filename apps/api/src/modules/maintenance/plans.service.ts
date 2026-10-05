import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq, inArray, min, sql } from 'drizzle-orm'
import { validationError } from '../../common/errors'
import { nextCode } from '../../common/sequences'
import { pageOf } from '../../common/pagination'
import type { AppRequest, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { assets, maintenancePlans, workOrderHistory, workOrders } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import type { CreatePlanDto, ListPlansQuery, UpdatePlanDto } from './maintenance.schemas'
import { addFrequency, OPEN_STATUSES } from './workflow'
import { WorkOrdersService } from './work-orders.service'

/** Un plan CONDITION produce inspecciones; el resto produce órdenes del mismo tipo. */
const ORDER_TYPE = { PREVENTIVE: 'PREVENTIVE', PREDICTIVE: 'PREDICTIVE', CONDITION: 'INSPECTION' } as const

@Injectable()
export class PlansService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  private selectRows() {
    return this.db
      .select({
        id: maintenancePlans.id,
        name: maintenancePlans.name,
        description: maintenancePlans.description,
        planType: maintenancePlans.planType,
        priority: maintenancePlans.priority,
        frequencyValue: maintenancePlans.frequencyValue,
        frequencyUnit: maintenancePlans.frequencyUnit,
        nextDueAt: maintenancePlans.nextDueAt,
        lastGeneratedAt: maintenancePlans.lastGeneratedAt,
        status: maintenancePlans.status,
        createdAt: maintenancePlans.createdAt,
        assetId: assets.id,
        assetTag: assets.tag,
        assetName: assets.name,
      })
      .from(maintenancePlans)
      .innerJoin(assets, eq(assets.id, maintenancePlans.assetId))
  }

  private toItem(r: Awaited<ReturnType<PlansService['selectRows']>>[number], now = new Date()) {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      planType: r.planType,
      priority: r.priority,
      frequencyValue: r.frequencyValue,
      frequencyUnit: r.frequencyUnit,
      nextDueAt: r.nextDueAt,
      lastGeneratedAt: r.lastGeneratedAt,
      status: r.status,
      overdue: r.status === 'ACTIVE' && r.nextDueAt < now,
      asset: { id: r.assetId, tag: r.assetTag, name: r.assetName },
    }
  }

  async list(plant: PlantRow, q: ListPlansQuery) {
    const where = and(
      eq(maintenancePlans.plantId, plant.id),
      q.assetId ? eq(maintenancePlans.assetId, q.assetId) : undefined,
      q.status ? eq(maintenancePlans.status, q.status) : undefined,
    )
    const [rows, [{ total }]] = await Promise.all([
      this.selectRows()
        .where(where)
        .orderBy(asc(maintenancePlans.nextDueAt), asc(maintenancePlans.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(maintenancePlans).where(where),
    ])
    const now = new Date()
    return pageOf(rows.map((r) => this.toItem(r, now)), total, q.page, q.pageSize)
  }

  private async getRow(plant: PlantRow, id: string) {
    const [row] = await this.selectRows().where(and(eq(maintenancePlans.id, id), eq(maintenancePlans.plantId, plant.id))).limit(1)
    if (!row) throw new NotFoundException('Plan no encontrado')
    return row
  }

  async create(plant: PlantRow, dto: CreatePlanDto, req: AppRequest) {
    const [asset] = await this.db.select({ status: assets.status }).from(assets).where(and(eq(assets.id, dto.assetId), eq(assets.plantId, plant.id))).limit(1)
    if (!asset) throw validationError('assetId', 'El activo no existe en esta planta')
    if (asset.status === 'DECOMMISSIONED') throw validationError('assetId', 'El activo está dado de baja')

    const [plan] = await this.db
      .insert(maintenancePlans)
      .values({
        plantId: plant.id,
        assetId: dto.assetId,
        planType: dto.planType,
        name: dto.name,
        description: dto.description,
        priority: dto.priority,
        frequencyValue: dto.frequencyValue,
        frequencyUnit: dto.frequencyUnit,
        nextDueAt: dto.firstDueAt,
        createdBy: req.user?.id,
      })
      .returning()
    await this.audit.record(req, {
      module: 'maintenance',
      entityType: 'plan',
      entityId: plan.id,
      plantId: plant.id,
      action: 'created',
      newData: { name: plan.name, assetId: plan.assetId, frequency: `${plan.frequencyValue} ${plan.frequencyUnit}`, nextDueAt: plan.nextDueAt },
    })
    return this.toItem(await this.getRow(plant, plan.id))
  }

  async update(plant: PlantRow, id: string, dto: UpdatePlanDto, req: AppRequest) {
    const before = await this.getRow(plant, id)
    await this.db
      .update(maintenancePlans)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.frequencyValue !== undefined && { frequencyValue: dto.frequencyValue }),
        ...(dto.frequencyUnit !== undefined && { frequencyUnit: dto.frequencyUnit }),
        ...(dto.nextDueAt !== undefined && { nextDueAt: dto.nextDueAt }),
        ...(dto.status !== undefined && { status: dto.status }),
        updatedAt: new Date(),
      })
      .where(eq(maintenancePlans.id, id))
    await this.audit.record(req, {
      module: 'maintenance',
      entityType: 'plan',
      entityId: id,
      plantId: plant.id,
      action: 'updated',
      oldData: { name: before.name, status: before.status, nextDueAt: before.nextDueAt, frequencyValue: before.frequencyValue, frequencyUnit: before.frequencyUnit },
      newData: dto,
    })
    return this.toItem(await this.getRow(plant, id))
  }

  /**
   * Genera la orden de trabajo del plan y avanza la próxima fecha. La nueva fecha se calcula desde la anterior
   * (no desde hoy) para que un retraso no desplace todo el calendario. No genera si ya hay una OT abierta del plan.
   */
  async generate(plant: PlantRow, id: string, req: AppRequest) {
    const plan = await this.getRow(plant, id)
    if (plan.status !== 'ACTIVE') throw new ConflictException('El plan está pausado: reactívalo para generar órdenes')

    const [open] = await this.db
      .select({ code: workOrders.code })
      .from(workOrders)
      .where(and(eq(workOrders.planId, id), inArray(workOrders.status, [...OPEN_STATUSES])))
      .limit(1)
    if (open) throw new ConflictException(`El plan ya tiene una orden abierta (${open.code})`)

    const now = new Date()
    const orderId = await this.db.transaction(async (tx) => {
      const code = await nextCode(tx, plant.id, 'OT', 'OT', now)
      const [wo] = await tx
        .insert(workOrders)
        .values({
          plantId: plant.id,
          assetId: plan.assetId,
          planId: plan.id,
          code,
          type: ORDER_TYPE[plan.planType as keyof typeof ORDER_TYPE] ?? 'PREVENTIVE',
          priority: plan.priority,
          status: 'PLANNED',
          title: plan.name,
          description: plan.description,
          plannedStart: plan.nextDueAt,
          plannedEnd: plan.nextDueAt,
          requestedBy: req.user?.id,
        })
        .returning({ id: workOrders.id })
      await tx.insert(workOrderHistory).values({ workOrderId: wo.id, fromStatus: null, toStatus: 'PLANNED', note: `Generada desde el plan «${plan.name}»`, changedBy: req.user?.id })
      await tx
        .update(maintenancePlans)
        .set({ nextDueAt: addFrequency(plan.nextDueAt, { value: plan.frequencyValue, unit: plan.frequencyUnit as 'DAYS' | 'WEEKS' | 'MONTHS' }), lastGeneratedAt: now, updatedAt: now })
        .where(eq(maintenancePlans.id, id))
      return wo.id
    })

    await this.audit.record(req, {
      module: 'maintenance',
      entityType: 'plan',
      entityId: id,
      plantId: plant.id,
      action: 'work_order.generated',
      oldData: { nextDueAt: plan.nextDueAt },
      newData: { workOrderId: orderId },
    })
    return this.workOrders.get(plant, orderId)
  }

  /** Próximo vencimiento de planes activos del activo (para la FUR). */
  async nextDueAt(plantId: string, assetId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ next: min(maintenancePlans.nextDueAt) })
      .from(maintenancePlans)
      .where(and(eq(maintenancePlans.plantId, plantId), eq(maintenancePlans.assetId, assetId), eq(maintenancePlans.status, 'ACTIVE')))
    return row?.next ?? null
  }
}
