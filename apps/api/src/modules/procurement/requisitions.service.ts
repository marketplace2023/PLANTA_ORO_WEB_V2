import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { validationError } from '../../common/errors'
import { escapeLike, pageOf } from '../../common/pagination'
import { nextCode } from '../../common/sequences'
import type { AppRequest, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import {
  assets,
  items,
  locations,
  plantStages,
  providers,
  requisitionHistory,
  requisitionLines,
  requisitions,
  rfqInvitations,
  rfqs,
  stageMaster,
  supplierQuotes,
  users,
  workOrders,
  type RequisitionStatus,
} from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { InventoryService } from '../inventory/inventory.service'
import type { CreateRequisitionDto, CreateRfqDto, LineDto, ListRequisitionsQuery, ReceiveDto, UpdateRequisitionDto } from './procurement.schemas'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
const requester = alias(users, 'requester')
const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(' ') || null
const num = (v: string | null) => (v === null ? null : Number(v))
const money = (v: number) => Math.round(v * 100) / 100

/** Flujo (§17): DRAFT → SUBMITTED → APPROVED/REJECTED → RFQ → ORDERED → RECEIVED; CANCELLED mientras no se haya pedido. */
export const CANCELLABLE: RequisitionStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RFQ']

@Injectable()
export class RequisitionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  // ---------- Lectura ----------

  private selectRows() {
    const estimated = sql<number>`coalesce((select sum(l.quantity * l.estimated_price) from ${requisitionLines} l where l.requisition_id = ${requisitions.id}), 0)::float8`
    const lineCount = sql<number>`(select count(*) from ${requisitionLines} l where l.requisition_id = ${requisitions.id})::int`
    return this.db
      .select({
        id: requisitions.id,
        code: requisitions.code,
        status: requisitions.status,
        priority: requisitions.priority,
        neededBy: requisitions.neededBy,
        justification: requisitions.justification,
        decisionNote: requisitions.decisionNote,
        approvedAt: requisitions.approvedAt,
        createdAt: requisitions.createdAt,
        updatedAt: requisitions.updatedAt,
        requestedById: requisitions.requestedBy,
        first: requester.firstName,
        last: requester.lastName,
        assetId: assets.id,
        assetTag: assets.tag,
        assetName: assets.name,
        workOrderId: workOrders.id,
        workOrderCode: workOrders.code,
        stageCode: stageMaster.code,
        stageName: stageMaster.name,
        estimatedTotal: estimated,
        lineCount,
      })
      .from(requisitions)
      .leftJoin(requester, eq(requester.id, requisitions.requestedBy))
      .leftJoin(assets, eq(assets.id, requisitions.assetId))
      .leftJoin(workOrders, eq(workOrders.id, requisitions.workOrderId))
      .leftJoin(plantStages, eq(plantStages.id, requisitions.plantStageId))
      .leftJoin(stageMaster, eq(stageMaster.id, plantStages.stageMasterId))
  }

  private toItem(r: Awaited<ReturnType<RequisitionsService['selectRows']>>[number]) {
    return {
      id: r.id,
      code: r.code,
      status: r.status as RequisitionStatus,
      priority: r.priority,
      neededBy: r.neededBy,
      justification: r.justification,
      decisionNote: r.decisionNote,
      approvedAt: r.approvedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      requestedBy: r.requestedById ? { id: r.requestedById, name: fullName(r.first, r.last) ?? '—' } : null,
      asset: r.assetId ? { id: r.assetId, tag: r.assetTag, name: r.assetName } : null,
      workOrder: r.workOrderId ? { id: r.workOrderId, code: r.workOrderCode } : null,
      stage: r.stageCode ? { code: r.stageCode, name: r.stageName } : null,
      estimatedTotal: money(r.estimatedTotal),
      lineCount: r.lineCount,
    }
  }

  async list(plant: PlantRow, q: ListRequisitionsQuery, userId: string) {
    const conditions: Array<SQL | undefined> = [
      eq(requisitions.plantId, plant.id),
      q.status ? inArray(requisitions.status, q.status) : undefined,
      q.priority ? eq(requisitions.priority, q.priority) : undefined,
      q.assetId ? eq(requisitions.assetId, q.assetId) : undefined,
      q.mine === '1' ? eq(requisitions.requestedBy, userId) : undefined,
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(requisitions.code, like), ilike(requisitions.justification, like)))
    }
    const where = and(...conditions)
    const dir = q.dir ?? (q.sort === 'createdAt' ? 'desc' : 'asc')
    const column = q.sort === 'neededBy' ? requisitions.neededBy : q.sort === 'code' ? requisitions.code : requisitions.createdAt
    const [rows, [{ total }]] = await Promise.all([
      this.selectRows()
        .where(where)
        .orderBy(dir === 'asc' ? asc(column) : desc(column), asc(requisitions.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(requisitions).where(where),
    ])
    return pageOf(rows.map((r) => this.toItem(r)), total, q.page, q.pageSize)
  }

  async get(plant: PlantRow, id: string) {
    const [row] = await this.selectRows().where(and(eq(requisitions.id, id), eq(requisitions.plantId, plant.id))).limit(1)
    if (!row) throw new NotFoundException('Requisición no encontrada')

    const lines = await this.db
      .select({
        id: requisitionLines.id,
        itemId: requisitionLines.itemId,
        sku: items.sku,
        description: requisitionLines.description,
        quantity: requisitionLines.quantity,
        uom: requisitionLines.uom,
        estimatedPrice: requisitionLines.estimatedPrice,
        receivedQuantity: requisitionLines.receivedQuantity,
      })
      .from(requisitionLines)
      .leftJoin(items, eq(items.id, requisitionLines.itemId))
      .where(eq(requisitionLines.requisitionId, id))
      .orderBy(asc(requisitionLines.position), asc(requisitionLines.id))

    const changer = alias(users, 'changer')
    const history = await this.db
      .select({ id: requisitionHistory.id, fromStatus: requisitionHistory.fromStatus, toStatus: requisitionHistory.toStatus, note: requisitionHistory.note, changedAt: requisitionHistory.changedAt, first: changer.firstName, last: changer.lastName })
      .from(requisitionHistory)
      .leftJoin(changer, eq(changer.id, requisitionHistory.changedBy))
      .where(eq(requisitionHistory.requisitionId, id))
      .orderBy(desc(requisitionHistory.changedAt), desc(requisitionHistory.id))

    return {
      ...this.toItem(row),
      lines: lines.map((l) => {
        const quantity = Number(l.quantity)
        const estimatedPrice = num(l.estimatedPrice)
        return {
          id: l.id,
          item: l.itemId ? { id: l.itemId, sku: l.sku } : null,
          description: l.description,
          quantity,
          uom: l.uom,
          estimatedPrice,
          lineTotal: estimatedPrice === null ? null : money(quantity * estimatedPrice),
          receivedQuantity: Number(l.receivedQuantity),
        }
      }),
      history: history.map((h) => ({ id: h.id, fromStatus: h.fromStatus, toStatus: h.toStatus, note: h.note, changedAt: h.changedAt, changedBy: fullName(h.first, h.last) })),
      rfq: await this.rfqOf(id),
    }
  }

  /** RFQ vigente (o la última) con los proveedores invitados y las cotizaciones recibidas. */
  private async rfqOf(requisitionId: string) {
    const [rfq] = await this.db.select().from(rfqs).where(eq(rfqs.requisitionId, requisitionId)).orderBy(desc(rfqs.createdAt)).limit(1)
    if (!rfq) return null
    const invited = await this.db
      .select({ id: providers.id, name: providers.organizationName, verified: providers.verified })
      .from(rfqInvitations)
      .innerJoin(providers, eq(providers.id, rfqInvitations.providerId))
      .where(eq(rfqInvitations.rfqId, rfq.id))
      .orderBy(asc(providers.organizationName))
    const quotes = await this.db
      .select({
        id: supplierQuotes.id,
        providerId: supplierQuotes.providerId,
        providerName: providers.organizationName,
        currency: supplierQuotes.currency,
        totalAmount: supplierQuotes.totalAmount,
        deliveryDays: supplierQuotes.deliveryDays,
        conditions: supplierQuotes.conditions,
        status: supplierQuotes.status,
        updatedAt: supplierQuotes.updatedAt,
      })
      .from(supplierQuotes)
      .innerJoin(providers, eq(providers.id, supplierQuotes.providerId))
      .where(eq(supplierQuotes.rfqId, rfq.id))
      .orderBy(asc(supplierQuotes.totalAmount))
    return {
      id: rfq.id,
      code: rfq.code,
      status: rfq.status,
      deadlineAt: rfq.deadlineAt,
      expired: rfq.status === 'OPEN' && rfq.deadlineAt < new Date(),
      invited,
      quotes: quotes.map((qt) => ({ ...qt, totalAmount: Number(qt.totalAmount) })),
    }
  }

  async summary(plant: PlantRow) {
    const rows = await this.db
      .select({ status: requisitions.status, n: sql<number>`count(*)::int` })
      .from(requisitions)
      .where(eq(requisitions.plantId, plant.id))
      .groupBy(requisitions.status)
    const n = (s: RequisitionStatus) => rows.find((r) => r.status === s)?.n ?? 0
    return {
      byStatus: Object.fromEntries(rows.map((r) => [r.status, r.n])),
      pendingApproval: n('SUBMITTED'),
      openRfqs: n('RFQ'),
      awaitingReceipt: n('ORDERED'),
    }
  }

  // ---------- Validaciones de referencias ----------

  private async resolveRefs(plant: PlantRow, dto: { stageCode?: string | null; assetId?: string | null; workOrderId?: string | null }) {
    let plantStageId: string | null | undefined
    if (dto.stageCode !== undefined) {
      if (dto.stageCode === null) plantStageId = null
      else {
        const [st] = await this.db
          .select({ id: plantStages.id })
          .from(plantStages)
          .innerJoin(stageMaster, eq(stageMaster.id, plantStages.stageMasterId))
          .where(and(eq(plantStages.plantId, plant.id), eq(stageMaster.code, dto.stageCode), eq(plantStages.isEnabled, true)))
        if (!st) throw validationError('stageCode', 'La etapa no está habilitada en esta planta')
        plantStageId = st.id
      }
    }
    if (dto.assetId) {
      const [a] = await this.db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, dto.assetId), eq(assets.plantId, plant.id)))
      if (!a) throw validationError('assetId', 'El activo no existe en esta planta')
    }
    if (dto.workOrderId) {
      const [w] = await this.db.select({ id: workOrders.id }).from(workOrders).where(and(eq(workOrders.id, dto.workOrderId), eq(workOrders.plantId, plant.id)))
      if (!w) throw validationError('workOrderId', 'La orden de trabajo no existe en esta planta')
    }
    return plantStageId
  }

  private async normalizeLines(plant: PlantRow, lines: LineDto[]) {
    const itemIds = [...new Set(lines.flatMap((l) => (l.itemId ? [l.itemId] : [])))]
    const found = itemIds.length ? await this.db.select({ id: items.id, uom: items.uom, status: items.status }).from(items).where(and(inArray(items.id, itemIds), eq(items.plantId, plant.id))) : []
    return lines.map((l, i) => {
      let uom = l.uom ?? 'UND'
      if (l.itemId) {
        const item = found.find((f) => f.id === l.itemId)
        if (!item) throw validationError(`lines.${i}.itemId`, 'El ítem no existe en el inventario de esta planta')
        if (item.status !== 'ACTIVE') throw validationError(`lines.${i}.itemId`, 'El ítem está inactivo')
        if (l.uom && l.uom !== item.uom) throw validationError(`lines.${i}.uom`, `La unidad del ítem es ${item.uom}`)
        uom = item.uom
      }
      return { position: i, itemId: l.itemId ?? null, description: l.description, quantity: String(l.quantity), uom, estimatedPrice: l.estimatedPrice === undefined ? null : String(l.estimatedPrice) }
    })
  }

  private assertNotPast(neededBy: string | null | undefined) {
    if (neededBy && neededBy < new Date().toISOString().slice(0, 10)) throw validationError('neededBy', 'La fecha requerida no puede estar en el pasado')
  }

  // ---------- Escritura ----------

  private async history(tx: Tx, id: string, from: string | null, to: string, userId: string | undefined, note?: string | null) {
    await tx.insert(requisitionHistory).values({ requisitionId: id, fromStatus: from, toStatus: to, note: note ?? null, changedBy: userId })
  }

  async create(plant: PlantRow, dto: CreateRequisitionDto, req: AppRequest) {
    this.assertNotPast(dto.neededBy)
    const plantStageId = await this.resolveRefs(plant, dto)
    const lines = await this.normalizeLines(plant, dto.lines)
    const created = await this.db.transaction(async (tx) => {
      const code = await nextCode(tx, plant.id, 'RQ', 'RQ')
      const [rq] = await tx
        .insert(requisitions)
        .values({ plantId: plant.id, code, requestedBy: req.user?.id, plantStageId, assetId: dto.assetId, workOrderId: dto.workOrderId, priority: dto.priority, neededBy: dto.neededBy, justification: dto.justification })
        .returning({ id: requisitions.id, code: requisitions.code })
      await tx.insert(requisitionLines).values(lines.map((l) => ({ ...l, requisitionId: rq.id })))
      await this.history(tx, rq.id, null, 'DRAFT', req.user?.id, 'Requisición creada')
      return rq
    })
    await this.audit.record(req, { module: 'procurement', entityType: 'requisition', entityId: created.id, plantId: plant.id, action: 'created', newData: { code: created.code, lines: dto.lines.length, priority: dto.priority } })
    return this.get(plant, created.id)
  }

  private async load(plant: PlantRow, id: string) {
    const [rq] = await this.db.select().from(requisitions).where(and(eq(requisitions.id, id), eq(requisitions.plantId, plant.id)))
    if (!rq) throw new NotFoundException('Requisición no encontrada')
    return rq
  }

  /** Quien la pidió, o quien aprueba, puede modificarla/cancelarla: no cualquiera con procurement.create. */
  private assertOwnerOrApprover(rq: { requestedBy: string | null }, req: AppRequest) {
    const isOwner = !!req.user && rq.requestedBy === req.user.id
    if (!isOwner && !(req.permissions?.has('procurement.approve') ?? false)) throw new ForbiddenException('Solo quien creó la requisición o quien aprueba puede hacerlo')
  }

  async update(plant: PlantRow, id: string, dto: UpdateRequisitionDto, req: AppRequest) {
    const before = await this.load(plant, id)
    this.assertOwnerOrApprover(before, req)
    if (before.status !== 'DRAFT') throw new ConflictException('Solo se edita una requisición en borrador')
    if (dto.neededBy) this.assertNotPast(dto.neededBy)
    const plantStageId = await this.resolveRefs(plant, dto)
    const lines = dto.lines ? await this.normalizeLines(plant, dto.lines) : undefined

    await this.db.transaction(async (tx) => {
      // El estado se vuelve a comprobar bajo bloqueo: si se envió en paralelo, no se pisan sus líneas.
      const [locked] = await tx.select({ status: requisitions.status }).from(requisitions).where(eq(requisitions.id, id)).for('update')
      if (locked.status !== 'DRAFT') throw new ConflictException('La requisición cambió de estado; recarga e inténtalo de nuevo')
      await tx
        .update(requisitions)
        .set({
          ...(dto.justification !== undefined && { justification: dto.justification }),
          ...(dto.priority !== undefined && { priority: dto.priority }),
          ...(dto.neededBy !== undefined && { neededBy: dto.neededBy }),
          ...(plantStageId !== undefined && { plantStageId }),
          ...(dto.assetId !== undefined && { assetId: dto.assetId }),
          ...(dto.workOrderId !== undefined && { workOrderId: dto.workOrderId }),
          updatedAt: new Date(),
        })
        .where(eq(requisitions.id, id))
      if (lines) {
        await tx.delete(requisitionLines).where(eq(requisitionLines.requisitionId, id))
        await tx.insert(requisitionLines).values(lines.map((l) => ({ ...l, requisitionId: id })))
      }
    })
    await this.audit.record(req, { module: 'procurement', entityType: 'requisition', entityId: id, plantId: plant.id, action: 'updated', oldData: { justification: before.justification, priority: before.priority }, newData: { ...dto, lines: dto.lines?.length } })
    return this.get(plant, id)
  }

  /** Cambio de estado con bloqueo optimista: si otra persona lo movió antes, no se pisa. */
  private async move(plant: PlantRow, id: string, from: RequisitionStatus[], to: RequisitionStatus, req: AppRequest, opts: { note?: string; fromLabel?: string; patch?: Partial<typeof requisitions.$inferInsert>; extra?: (tx: Tx) => Promise<void> } = {}) {
    const moved = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(requisitions)
        .set({ status: to, updatedAt: new Date(), ...opts.patch })
        .where(and(eq(requisitions.id, id), eq(requisitions.plantId, plant.id), inArray(requisitions.status, from)))
        .returning({ id: requisitions.id })
      if (!row) return false
      await this.history(tx, id, opts.fromLabel ?? (from.length === 1 ? from[0] : null), to, req.user?.id, opts.note)
      await opts.extra?.(tx)
      return true
    })
    if (!moved) throw new ConflictException('La requisición cambió de estado mientras la editabas; recarga e inténtalo de nuevo')
    await this.audit.record(req, { module: 'procurement', entityType: 'requisition', entityId: id, plantId: plant.id, action: 'status.changed', newData: { status: to, note: opts.note ?? null } })
  }

  async submit(plant: PlantRow, id: string, req: AppRequest) {
    const rq = await this.load(plant, id)
    this.assertOwnerOrApprover(rq, req)
    if (rq.status !== 'DRAFT') throw new ConflictException('Solo se envía una requisición en borrador')
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(requisitionLines).where(eq(requisitionLines.requisitionId, id))
    if (n === 0) throw validationError('lines', 'Agregue al menos una línea')
    this.assertNotPast(rq.neededBy)
    await this.move(plant, id, ['DRAFT'], 'SUBMITTED', req)
    return this.get(plant, id)
  }

  /** Separación de funciones: nadie aprueba ni rechaza su propia requisición (salvo el administrador del ecosistema). */
  private assertNotSelf(rq: { requestedBy: string | null }, req: AppRequest) {
    if (rq.requestedBy && rq.requestedBy === req.user?.id && !req.user?.isGlobalAdmin) {
      throw new ForbiddenException('No puedes aprobar ni rechazar tu propia requisición')
    }
  }

  async approve(plant: PlantRow, id: string, note: string | undefined, req: AppRequest) {
    const rq = await this.load(plant, id)
    this.assertNotSelf(rq, req)
    if (rq.status !== 'SUBMITTED') throw new ConflictException('Solo se aprueba una requisición enviada')
    await this.move(plant, id, ['SUBMITTED'], 'APPROVED', req, { note, patch: { approvedBy: req.user?.id, approvedAt: new Date(), decisionNote: null } })
    return this.get(plant, id)
  }

  async reject(plant: PlantRow, id: string, note: string, req: AppRequest) {
    const rq = await this.load(plant, id)
    this.assertNotSelf(rq, req)
    if (rq.status !== 'SUBMITTED') throw new ConflictException('Solo se rechaza una requisición enviada')
    await this.move(plant, id, ['SUBMITTED'], 'REJECTED', req, { note, patch: { decisionNote: note } })
    return this.get(plant, id)
  }

  async cancel(plant: PlantRow, id: string, note: string, req: AppRequest) {
    const rq = await this.load(plant, id)
    this.assertOwnerOrApprover(rq, req)
    if (!CANCELLABLE.includes(rq.status as RequisitionStatus)) throw new ConflictException('Ya no se puede cancelar: la requisición está pedida, recibida o cerrada')
    await this.move(plant, id, CANCELLABLE, 'CANCELLED', req, {
      note,
      fromLabel: rq.status,
      patch: { decisionNote: note },
      // Cancelar una requisición con RFQ abierta cierra la solicitud de cotización y descarta lo cotizado.
      extra: async (tx) => {
        await tx.update(rfqs).set({ status: 'CANCELLED', updatedAt: new Date() }).where(and(eq(rfqs.requisitionId, id), eq(rfqs.status, 'OPEN')))
      },
    })
    return this.get(plant, id)
  }

  // ---------- RFQ y adjudicación ----------

  async createRfq(plant: PlantRow, id: string, dto: CreateRfqDto, req: AppRequest) {
    const rq = await this.load(plant, id)
    if (rq.status !== 'APPROVED') throw new ConflictException('Solo se solicita cotización de una requisición aprobada')
    const deadline = new Date(dto.deadlineAt)
    if (deadline.getTime() <= Date.now()) throw validationError('deadlineAt', 'La fecha límite debe ser futura')
    const providerIds = [...new Set(dto.providerIds)]
    const ok = await this.db.select({ id: providers.id }).from(providers).where(and(inArray(providers.id, providerIds), eq(providers.status, 'ACTIVE')))
    if (ok.length !== providerIds.length) throw validationError('providerIds', 'Todos los proveedores invitados deben existir y estar activos')

    let rfqId = ''
    await this.move(plant, id, ['APPROVED'], 'RFQ', req, {
      note: 'Solicitud de cotización enviada',
      extra: async (tx) => {
        const code = await nextCode(tx, plant.id, 'RFQ', 'RFQ')
        const [rfq] = await tx.insert(rfqs).values({ plantId: plant.id, requisitionId: id, code, deadlineAt: deadline, createdBy: req.user?.id }).returning({ id: rfqs.id })
        rfqId = rfq.id
        await tx.insert(rfqInvitations).values(providerIds.map((providerId) => ({ rfqId: rfq.id, providerId })))
      },
    })
    await this.audit.record(req, { module: 'procurement', entityType: 'rfq', entityId: rfqId, plantId: plant.id, action: 'created', newData: { requisitionId: id, providerIds, deadlineAt: dto.deadlineAt } })
    return this.get(plant, id)
  }

  async cancelRfq(plant: PlantRow, id: string, req: AppRequest) {
    const rq = await this.load(plant, id)
    if (rq.status !== 'RFQ') throw new ConflictException('La requisición no tiene una solicitud de cotización abierta')
    await this.move(plant, id, ['RFQ'], 'APPROVED', req, {
      note: 'Solicitud de cotización cancelada',
      extra: async (tx) => {
        await tx.update(rfqs).set({ status: 'CANCELLED', updatedAt: new Date() }).where(and(eq(rfqs.requisitionId, id), eq(rfqs.status, 'OPEN')))
        await tx
          .update(supplierQuotes)
          .set({ status: 'REJECTED', updatedAt: new Date() })
          .where(and(eq(supplierQuotes.status, 'SUBMITTED'), inArray(supplierQuotes.rfqId, tx.select({ id: rfqs.id }).from(rfqs).where(eq(rfqs.requisitionId, id)))))
      },
    })
    return this.get(plant, id)
  }

  async award(plant: PlantRow, id: string, quoteId: string, req: AppRequest) {
    const rq = await this.load(plant, id)
    if (rq.status !== 'RFQ') throw new ConflictException('La requisición no tiene una solicitud de cotización abierta')
    const [named] = await this.db
      .select({ name: providers.organizationName })
      .from(supplierQuotes)
      .innerJoin(providers, eq(providers.id, supplierQuotes.providerId))
      .where(eq(supplierQuotes.id, quoteId))
    await this.move(plant, id, ['RFQ'], 'ORDERED', req, {
      note: named ? `Adjudicada a ${named.name}` : undefined,
      extra: async (tx) => {
        const [rfq] = await tx.select().from(rfqs).where(and(eq(rfqs.requisitionId, id), eq(rfqs.status, 'OPEN'))).for('update')
        if (!rfq) throw new ConflictException('La solicitud de cotización ya no está abierta')
        const [quote] = await tx.select().from(supplierQuotes).where(and(eq(supplierQuotes.id, quoteId), eq(supplierQuotes.rfqId, rfq.id)))
        if (!quote || quote.status !== 'SUBMITTED') throw validationError('quoteId', 'La cotización no existe en esta solicitud o fue retirada')
        await tx.update(supplierQuotes).set({ status: 'AWARDED', updatedAt: new Date() }).where(eq(supplierQuotes.id, quoteId))
        await tx.update(supplierQuotes).set({ status: 'REJECTED', updatedAt: new Date() }).where(and(eq(supplierQuotes.rfqId, rfq.id), eq(supplierQuotes.status, 'SUBMITTED'), sql`${supplierQuotes.id} <> ${quoteId}`))
        await tx.update(rfqs).set({ status: 'AWARDED', updatedAt: new Date() }).where(eq(rfqs.id, rfq.id))
      },
    })
    return this.get(plant, id)
  }

  // ---------- Recepción ----------

  async receive(plant: PlantRow, id: string, dto: ReceiveDto, req: AppRequest) {
    const ids = dto.lines.map((l) => l.lineId)
    if (new Set(ids).size !== ids.length) throw validationError('lines', 'Una línea solo puede aparecer una vez por recepción')

    await this.db.transaction(async (tx) => {
      const [rq] = await tx.select().from(requisitions).where(and(eq(requisitions.id, id), eq(requisitions.plantId, plant.id))).for('update')
      if (!rq) throw new NotFoundException('Requisición no encontrada')
      if (rq.status !== 'ORDERED') throw new ConflictException('Solo se recibe una requisición pedida (adjudicada) y aún no completada')

      const lines = await tx.select().from(requisitionLines).where(eq(requisitionLines.requisitionId, id))
      for (const [i, r] of dto.lines.entries()) {
        const line = lines.find((l) => l.id === r.lineId)
        if (!line) throw validationError(`lines.${i}.lineId`, 'La línea no pertenece a esta requisición')
        const remaining = Number(line.quantity) - Number(line.receivedQuantity)
        if (r.quantity > remaining + 1e-9) throw new ConflictException(`La línea «${line.description}» solo admite ${remaining} ${line.uom} más (pedido: ${line.quantity}, recibido: ${line.receivedQuantity})`)

        if (line.itemId) {
          if (!r.locationId) throw validationError(`lines.${i}.locationId`, 'Indique la ubicación donde ingresa el stock')
          const [loc] = await tx.select({ id: locations.id }).from(locations).where(and(eq(locations.id, r.locationId), eq(locations.plantId, plant.id)))
          if (!loc) throw validationError(`lines.${i}.locationId`, 'La ubicación no existe en esta planta')
          await this.inventory.applyReceipt(
            tx,
            { plantId: plant.id, itemId: line.itemId, userId: req.user?.id, referenceType: 'REQUISITION', referenceId: id, note: dto.note ?? `Recepción de ${rq.code}` },
            r.locationId,
            r.quantity,
            { unitCost: r.unitCost },
          )
        }
        await tx
          .update(requisitionLines)
          .set({ receivedQuantity: sql`${requisitionLines.receivedQuantity} + ${String(r.quantity)}::numeric` })
          .where(eq(requisitionLines.id, line.id))
      }

      const after = await tx.select({ q: requisitionLines.quantity, r: requisitionLines.receivedQuantity }).from(requisitionLines).where(eq(requisitionLines.requisitionId, id))
      const complete = after.every((l) => Number(l.r) >= Number(l.q))
      await this.history(tx, id, 'ORDERED', complete ? 'RECEIVED' : 'ORDERED', req.user?.id, complete ? 'Recepción completa' : 'Recepción parcial')
      if (complete) await tx.update(requisitions).set({ status: 'RECEIVED', updatedAt: new Date() }).where(eq(requisitions.id, id))
    })
    await this.audit.record(req, { module: 'procurement', entityType: 'requisition', entityId: id, plantId: plant.id, action: 'received', newData: { lines: dto.lines.map((l) => ({ lineId: l.lineId, quantity: l.quantity })) } })
    return this.get(plant, id)
  }

  /** Sugerencias para crear una requisición desde el inventario: ítems bajo mínimo con la cantidad faltante hasta el máximo (o el mínimo). */
  async lowStockSuggestions(plant: PlantRow) {
    const rows = await this.db.execute<{ id: string; sku: string; name: string; uom: string; on_hand: number; min_stock: string; max_stock: string | null }>(sql`
      select i.id, i.sku, i.name, i.uom, i.min_stock, i.max_stock,
             coalesce((select sum(s.quantity_on_hand) from inventory.stock s where s.item_id = i.id), 0)::float8 as on_hand
      from inventory.items i
      where i.plant_id = ${plant.id} and i.status = 'ACTIVE'
        and coalesce((select sum(s.quantity_on_hand) from inventory.stock s where s.item_id = i.id), 0) < i.min_stock
      order by i.is_critical desc, i.name`)
    return rows.rows.map((r) => {
      const target = Number(r.max_stock ?? r.min_stock)
      return { itemId: r.id, sku: r.sku, description: r.name, uom: r.uom, onHand: r.on_hand, suggestedQuantity: Math.round((target - r.on_hand) * 10_000) / 10_000 }
    })
  }
}

