import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { validationError } from '../../common/errors'
import { escapeLike, pageOf } from '../../common/pagination'
import { nextCode } from '../../common/sequences'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import {
  assets,
  permissions,
  rolePermissions,
  roles,
  userPlantRoles,
  users,
  workOrderHistory,
  workOrders,
  type WorkOrderStatus,
} from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { WorkOrderCostsService } from './work-order-costs.service'
import { WorkOrderPartsService } from './work-order-parts.service'
import type { CreateWorkOrderDto, ListWorkOrdersQuery, TransitionDto, UpdateWorkOrderDto } from './maintenance.schemas'
import { assigneeMayTransition, BACKLOG_STATUSES, canTransition, DONE_STATUSES, isOpen, isOverdue, OPEN_STATUSES, permissionFor, TRANSITIONS } from './workflow'

const requester = alias(users, 'requester')
const assignee = alias(users, 'assignee')
const changer = alias(users, 'changer')

type Row = Awaited<ReturnType<WorkOrdersService['selectRows']>>[number]
const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(' ') || null

const PRIORITY_ORDER = sql`array_position(array['LOW','MEDIUM','HIGH','URGENT'], ${workOrders.priority})`

@Injectable()
export class WorkOrdersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly partsService: WorkOrderPartsService,
    private readonly costsService: WorkOrderCostsService,
  ) {}

  // ---------- Lectura ----------

  private selectRows() {
    return this.db
      .select({
        id: workOrders.id,
        code: workOrders.code,
        type: workOrders.type,
        priority: workOrders.priority,
        status: workOrders.status,
        title: workOrders.title,
        description: workOrders.description,
        planId: workOrders.planId,
        plannedStart: workOrders.plannedStart,
        plannedEnd: workOrders.plannedEnd,
        actualStart: workOrders.actualStart,
        actualEnd: workOrders.actualEnd,
        completionNotes: workOrders.completionNotes,
        closedAt: workOrders.closedAt,
        createdAt: workOrders.createdAt,
        updatedAt: workOrders.updatedAt,
        assignedToId: workOrders.assignedTo,
        assetId: assets.id,
        assetTag: assets.tag,
        assetName: assets.name,
        assetStatus: assets.status,
        assetCriticality: assets.criticality,
        requesterFirst: requester.firstName,
        requesterLast: requester.lastName,
        assigneeFirst: assignee.firstName,
        assigneeLast: assignee.lastName,
      })
      .from(workOrders)
      .innerJoin(assets, eq(assets.id, workOrders.assetId))
      .leftJoin(requester, eq(requester.id, workOrders.requestedBy))
      .leftJoin(assignee, eq(assignee.id, workOrders.assignedTo))
  }

  toItem(r: Row, now = new Date()) {
    const status = r.status as WorkOrderStatus
    return {
      id: r.id,
      code: r.code,
      type: r.type,
      priority: r.priority,
      status,
      title: r.title,
      plannedStart: r.plannedStart,
      plannedEnd: r.plannedEnd,
      actualStart: r.actualStart,
      actualEnd: r.actualEnd,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      overdue: isOverdue({ status, plannedEnd: r.plannedEnd }, now),
      planId: r.planId,
      asset: { id: r.assetId, tag: r.assetTag, name: r.assetName, status: r.assetStatus, criticality: r.assetCriticality },
      requestedBy: fullName(r.requesterFirst, r.requesterLast),
      assignedTo: r.assignedToId ? { id: r.assignedToId, name: fullName(r.assigneeFirst, r.assigneeLast) ?? '—' } : null,
      /** Estados a los que se puede pasar; la UI los filtra según los permisos del usuario. */
      nextStatuses: TRANSITIONS[status],
    }
  }

  async list(plant: PlantRow, q: ListWorkOrdersQuery, user: AuthUser) {
    const now = new Date()
    const conditions: Array<SQL | undefined> = [
      eq(workOrders.plantId, plant.id),
      q.status ? inArray(workOrders.status, q.status) : undefined,
      q.type ? inArray(workOrders.type, q.type) : undefined,
      q.priority ? inArray(workOrders.priority, q.priority) : undefined,
      q.assetId ? eq(workOrders.assetId, q.assetId) : undefined,
      q.assignedTo ? eq(workOrders.assignedTo, q.assignedTo === 'me' ? user.id : q.assignedTo) : undefined,
      q.overdue === '1' ? and(inArray(workOrders.status, [...OPEN_STATUSES]), lt(workOrders.plannedEnd, now)) : undefined,
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(workOrders.code, like), ilike(workOrders.title, like), ilike(assets.tag, like), ilike(assets.name, like)))
    }
    const where = and(...conditions)
    const dir = q.dir ?? (q.sort === 'plannedEnd' || q.sort === 'code' ? 'asc' : 'desc')
    const column = q.sort === 'priority' ? PRIORITY_ORDER : q.sort === 'plannedEnd' ? workOrders.plannedEnd : q.sort === 'code' ? workOrders.code : workOrders.createdAt

    const [rows, [{ total }]] = await Promise.all([
      this.selectRows()
        .where(where)
        .orderBy(dir === 'asc' ? asc(column) : desc(column), asc(workOrders.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(workOrders)
        .innerJoin(assets, eq(assets.id, workOrders.assetId))
        .where(where),
    ])
    return pageOf(rows.map((r) => this.toItem(r, now)), total, q.page, q.pageSize)
  }

  async get(plant: PlantRow, id: string) {
    const [row] = await this.selectRows().where(and(eq(workOrders.id, id), eq(workOrders.plantId, plant.id))).limit(1)
    if (!row) throw new NotFoundException('Orden de trabajo no encontrada')

    const history = await this.db
      .select({
        id: workOrderHistory.id,
        fromStatus: workOrderHistory.fromStatus,
        toStatus: workOrderHistory.toStatus,
        note: workOrderHistory.note,
        changedAt: workOrderHistory.changedAt,
        first: changer.firstName,
        last: changer.lastName,
      })
      .from(workOrderHistory)
      .leftJoin(changer, eq(changer.id, workOrderHistory.changedBy))
      .where(eq(workOrderHistory.workOrderId, id))
      .orderBy(desc(workOrderHistory.changedAt), desc(workOrderHistory.id))

    const { parts, partsCost, hasUncosted } = await this.partsService.list(id)
    const { costs, otherCost } = await this.costsService.list(id)
    return {
      ...this.toItem(row),
      parts,
      partsCost,
      partsHaveUncosted: hasUncosted,
      costs,
      otherCost,
      totalCost: Math.round((partsCost + otherCost) * 100) / 100,
      currency: await this.partsService.currency(plant.id),
      description: row.description,
      completionNotes: row.completionNotes,
      closedAt: row.closedAt,
      history: history.map((h) => ({ id: h.id, fromStatus: h.fromStatus, toStatus: h.toStatus, note: h.note, changedAt: h.changedAt, changedBy: fullName(h.first, h.last) })),
    }
  }

  /** Miembros de la planta que pueden trabajar órdenes (tienen maintenance.read por alguno de sus roles activos). */
  async assignees(plantId: string) {
    const now = new Date()
    const rows = await this.db
      .selectDistinct({ userId: users.id, first: users.firstName, last: users.lastName, role: roles.code })
      .from(userPlantRoles)
      .innerJoin(users, eq(users.id, userPlantRoles.userId))
      .innerJoin(roles, eq(roles.id, userPlantRoles.roleId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        and(
          eq(userPlantRoles.plantId, plantId),
          eq(userPlantRoles.status, 'ACTIVE'),
          eq(users.status, 'ACTIVE'),
          eq(permissions.code, 'maintenance.read'),
          or(isNull(userPlantRoles.startsAt), lte(userPlantRoles.startsAt, now)),
          or(isNull(userPlantRoles.endsAt), gte(userPlantRoles.endsAt, now)),
        ),
      )
      .orderBy(asc(users.firstName), asc(users.lastName))

    const byUser = new Map<string, { id: string; name: string; roles: string[] }>()
    for (const r of rows) {
      const entry = byUser.get(r.userId) ?? { id: r.userId, name: fullName(r.first, r.last) ?? '—', roles: [] }
      entry.roles.push(r.role)
      byUser.set(r.userId, entry)
    }
    return [...byUser.values()]
  }

  private async assertAssignable(plantId: string, userId: string) {
    const ok = (await this.assignees(plantId)).some((a) => a.id === userId)
    if (!ok) throw validationError('assignedTo', 'La persona no es miembro de la planta con acceso a mantenimiento')
  }

  // ---------- Escritura ----------

  private async assertAsset(plantId: string, assetId: string) {
    const [asset] = await this.db.select({ status: assets.status }).from(assets).where(and(eq(assets.id, assetId), eq(assets.plantId, plantId))).limit(1)
    if (!asset) throw validationError('assetId', 'El activo no existe en esta planta')
    if (asset.status === 'DECOMMISSIONED') throw validationError('assetId', 'El activo está dado de baja')
  }

  async create(plant: PlantRow, dto: CreateWorkOrderDto, req: AppRequest) {
    await this.assertAsset(plant.id, dto.assetId)

    const created = await this.db.transaction(async (tx) => {
      const code = await nextCode(tx, plant.id, 'OT', 'OT')
      const [wo] = await tx
        .insert(workOrders)
        .values({
          plantId: plant.id,
          assetId: dto.assetId,
          code,
          type: dto.type,
          priority: dto.priority,
          title: dto.title,
          description: dto.description,
          plannedStart: dto.plannedStart,
          plannedEnd: dto.plannedEnd,
          requestedBy: req.user?.id,
        })
        .returning()
      await tx.insert(workOrderHistory).values({ workOrderId: wo.id, fromStatus: null, toStatus: 'REQUESTED', note: 'Solicitud creada', changedBy: req.user?.id })
      return wo
    })

    await this.audit.record(req, {
      module: 'maintenance',
      entityType: 'work_order',
      entityId: created.id,
      plantId: plant.id,
      action: 'created',
      newData: { code: created.code, assetId: dto.assetId, type: dto.type, priority: dto.priority, title: dto.title },
    })
    return this.get(plant, created.id)
  }

  async update(plant: PlantRow, id: string, dto: UpdateWorkOrderDto, req: AppRequest) {
    const [before] = await this.db.select().from(workOrders).where(and(eq(workOrders.id, id), eq(workOrders.plantId, plant.id))).limit(1)
    if (!before) throw new NotFoundException('Orden de trabajo no encontrada')
    if (!isOpen(before.status as WorkOrderStatus)) throw new ConflictException('La orden ya no está abierta y no se puede modificar')

    const plannedStart = dto.plannedStart === undefined ? before.plannedStart : dto.plannedStart
    const plannedEnd = dto.plannedEnd === undefined ? before.plannedEnd : dto.plannedEnd
    if (plannedStart && plannedEnd && plannedEnd < plannedStart) throw validationError('plannedEnd', 'La fecha límite no puede ser anterior al inicio planificado')
    if (dto.assignedTo) await this.assertAssignable(plant.id, dto.assignedTo)

    const patch: Partial<typeof workOrders.$inferInsert> = { updatedAt: new Date() }
    if (dto.title !== undefined) patch.title = dto.title
    if (dto.description !== undefined) patch.description = dto.description
    if (dto.type !== undefined) patch.type = dto.type
    if (dto.priority !== undefined) patch.priority = dto.priority
    if (dto.plannedStart !== undefined) patch.plannedStart = dto.plannedStart
    if (dto.plannedEnd !== undefined) patch.plannedEnd = dto.plannedEnd
    if (dto.assignedTo !== undefined) patch.assignedTo = dto.assignedTo

    await this.db.update(workOrders).set(patch).where(eq(workOrders.id, id))
    const { updatedAt: _u, ...changed } = patch
    await this.audit.record(req, {
      module: 'maintenance',
      entityType: 'work_order',
      entityId: id,
      plantId: plant.id,
      action: 'updated',
      oldData: Object.fromEntries(Object.keys(changed).map((k) => [k, (before as Record<string, unknown>)[k]])),
      newData: changed,
    })
    return this.get(plant, id)
  }

  async transition(plant: PlantRow, id: string, dto: TransitionDto, req: AppRequest) {
    const [wo] = await this.db.select().from(workOrders).where(and(eq(workOrders.id, id), eq(workOrders.plantId, plant.id))).limit(1)
    if (!wo) throw new NotFoundException('Orden de trabajo no encontrada')
    const from = wo.status as WorkOrderStatus
    const to = dto.to

    if (!canTransition(from, to)) throw new ConflictException(`No se puede pasar de ${from} a ${to}`)

    // Permisos finos por transición: cerrar exige maintenance.close; planificar/asignar/cancelar, maintenance.update;
    // y quien tiene la OT asignada puede reportar avance (iniciar, pausar, completar) con solo lectura.
    const perms = req.permissions ?? new Set<string>()
    const needed = permissionFor(to)
    const isAssignee = !!req.user && wo.assignedTo === req.user.id
    if (!(perms.has(needed) || (assigneeMayTransition(to) && isAssignee))) {
      throw new ForbiddenException(`Falta el permiso ${needed} para pasar la orden a ${to}`)
    }

    const now = new Date()
    const patch: Partial<typeof workOrders.$inferInsert> = { status: to, updatedAt: now }

    if (to === 'ASSIGNED') {
      const responsible = dto.assignedTo ?? wo.assignedTo
      if (!responsible) throw validationError('assignedTo', 'Indique el responsable para asignar la orden')
      await this.assertAssignable(plant.id, responsible)
      patch.assignedTo = responsible
    }
    if (to === 'IN_PROGRESS') {
      patch.actualStart = wo.actualStart ?? now
      if (from === 'COMPLETED') patch.actualEnd = null // reabrir
    }
    if (to === 'COMPLETED') {
      if (!dto.completionNotes?.trim()) throw validationError('completionNotes', 'Indique qué trabajo se realizó')
      patch.actualEnd = now
      patch.completionNotes = dto.completionNotes
    }
    if (to === 'CLOSED') {
      patch.closedAt = now
      patch.closedBy = req.user?.id
    }
    if (to === 'CANCELLED' && !dto.note?.trim()) throw validationError('note', 'Indique el motivo de la cancelación')

    // Bloqueo optimista: si otra persona cambió el estado entre la lectura y la escritura, no se pisa.
    const changed = await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(workOrders)
        .set(patch)
        .where(and(eq(workOrders.id, id), eq(workOrders.status, from)))
        .returning({ id: workOrders.id })
      if (updated.length === 0) return false
      await tx.insert(workOrderHistory).values({
        workOrderId: id,
        fromStatus: from,
        toStatus: to,
        note: dto.note ?? (to === 'COMPLETED' ? dto.completionNotes : null) ?? null,
        changedBy: req.user?.id,
      })
      return true
    })
    if (!changed) throw new ConflictException('La orden cambió de estado mientras la editabas; recarga e inténtalo de nuevo')

    await this.audit.record(req, {
      module: 'maintenance',
      entityType: 'work_order',
      entityId: id,
      plantId: plant.id,
      action: 'status.changed',
      oldData: { status: from },
      newData: { status: to, note: dto.note ?? null, assignedTo: patch.assignedTo ?? wo.assignedTo },
    })
    return this.get(plant, id)
  }

  // ---------- KPIs (design.md §26) ----------

  async dashboard(plant: PlantRow) {
    const now = new Date()
    const open = [...OPEN_STATUSES]
    const ago = (days: number) => new Date(now.getTime() - days * 86_400_000)
    const base = eq(workOrders.plantId, plant.id)

    const byStatus = await this.db
      .select({ status: workOrders.status, n: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(base)
      .groupBy(workOrders.status)
    const byType = await this.db
      .select({ type: workOrders.type, n: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(and(base, inArray(workOrders.status, open)))
      .groupBy(workOrders.type)
    const [{ overdue }] = await this.db
      .select({ overdue: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(and(base, inArray(workOrders.status, open), lt(workOrders.plannedEnd, now)))
    const [{ completed30 }] = await this.db
      .select({ completed30: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(and(base, inArray(workOrders.status, [...DONE_STATUSES]), gte(workOrders.actualEnd, ago(30))))

    // MTTR: horas medias de ejecución de correctivos terminados en los últimos 90 días.
    const [{ mttr }] = await this.db
      .select({ mttr: sql<number | null>`avg(extract(epoch from (${workOrders.actualEnd} - ${workOrders.actualStart})) / 3600)::float8` })
      .from(workOrders)
      .where(and(base, eq(workOrders.type, 'CORRECTIVE'), inArray(workOrders.status, [...DONE_STATUSES]), gte(workOrders.actualEnd, ago(90))))

    // Cumplimiento preventivo: de las preventivas con fecha límite en los últimos 90 días, % terminadas a tiempo.
    const [compliance] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        onTime: sql<number>`count(*) filter (where ${workOrders.status} in ('COMPLETED','CLOSED') and ${workOrders.actualEnd} <= ${workOrders.plannedEnd})::int`,
      })
      .from(workOrders)
      .where(and(base, eq(workOrders.type, 'PREVENTIVE'), ne(workOrders.status, 'CANCELLED'), gte(workOrders.plannedEnd, ago(90)), lte(workOrders.plannedEnd, now)))

    const overdueRows = await this.selectRows()
      .where(and(base, inArray(workOrders.status, open), lt(workOrders.plannedEnd, now)))
      .orderBy(asc(workOrders.plannedEnd))
      .limit(5)

    const costs = await this.partsService.costSince(plant.id, 30)
    const otherCost = await this.costsService.costSince(plant.id, 30)

    const count = (status: WorkOrderStatus) => byStatus.find((s) => s.status === status)?.n ?? 0
    return {
      open: OPEN_STATUSES.reduce((sum, s) => sum + count(s), 0),
      backlog: BACKLOG_STATUSES.reduce((sum, s) => sum + count(s), 0),
      inProgress: count('IN_PROGRESS'),
      overdue,
      completedLast30Days: completed30,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s.n])),
      openByType: Object.fromEntries(byType.map((t) => [t.type, t.n])),
      mttrHours: mttr === null ? null : Math.round(mttr * 10) / 10,
      preventiveCompliancePct: compliance.total === 0 ? null : Math.round((compliance.onTime / compliance.total) * 1000) / 10,
      // Costo de las órdenes terminadas en 30 días: repuestos (inventario) y el resto (mano de obra, equipos, transporte, servicios).
      partsCostLast30Days: costs.partsCost,
      otherCostLast30Days: otherCost,
      totalCostLast30Days: Math.round((costs.partsCost + otherCost) * 100) / 100,
      currency: costs.currency,
      // MTBF requiere registro de fallas (fase posterior): se informa como no disponible.
      mtbfHours: null,
      overdueWorkOrders: overdueRows.map((r) => this.toItem(r, now)),
    }
  }

  /** Resumen para la pestaña Mantenimiento de la FUR (último/próximo mantenimiento y órdenes recientes). */
  async assetSummary(plantId: string, assetId: string) {
    const now = new Date()
    const rows = await this.selectRows().where(and(eq(workOrders.plantId, plantId), eq(workOrders.assetId, assetId))).orderBy(desc(workOrders.createdAt)).limit(200)
    const done = rows.filter((r) => DONE_STATUSES.includes(r.status as WorkOrderStatus) && r.actualEnd)
    const lastMaintenanceAt = done.reduce<Date | null>((max, r) => (!max || r.actualEnd! > max ? r.actualEnd! : max), null)
    const partsCost = await this.partsService.costForAsset(plantId, assetId)
    const otherCost = await this.costsService.costForAsset(plantId, assetId)
    return {
      partsCost,
      otherCost,
      totalCost: Math.round((partsCost + otherCost) * 100) / 100,
      currency: await this.partsService.currency(plantId),
      openWorkOrders: rows.filter((r) => isOpen(r.status as WorkOrderStatus)).length,
      overdueWorkOrders: rows.filter((r) => isOverdue({ status: r.status as WorkOrderStatus, plannedEnd: r.plannedEnd }, now)).length,
      lastMaintenanceAt,
      recent: rows.slice(0, 5).map((r) => this.toItem(r, now)),
    }
  }
}
