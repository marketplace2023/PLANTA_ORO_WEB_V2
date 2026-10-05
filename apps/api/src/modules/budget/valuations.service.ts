import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { validationError } from '../../common/errors'
import type { AppRequest, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { budgetItems, budgets, valuationLines, valuations } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { itemAmount, round2, totalsFromDirect } from './budget-engine'
import type { ValuationDto } from './budget.schemas'
import { BudgetsService, ratesOf } from './budgets.service'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Valorizaciones: lo ejecutado en un periodo, medido sobre las partidas y los precios CONGELADOS del presupuesto aprobado. */
@Injectable()
export class ValuationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly budgetsSvc: BudgetsService,
    private readonly audit: AuditService,
  ) {}

  /** Cantidad ya valorizada y APROBADA por partida (se puede excluir una valorización: la que se está editando). */
  private async approvedQty(db: Pick<Database, 'select'>, budgetId: string, exceptId?: string) {
    const rows = await db
      .select({ itemId: valuationLines.itemId, q: sql<number>`sum(${valuationLines.quantity})::float8` })
      .from(valuationLines)
      .innerJoin(valuations, eq(valuations.id, valuationLines.valuationId))
      .where(and(eq(valuations.budgetId, budgetId), eq(valuations.status, 'APPROVED'), exceptId ? ne(valuations.id, exceptId) : undefined))
      .groupBy(valuationLines.itemId)
    return new Map(rows.map((r) => [r.itemId, r.q]))
  }

  /** Nadie mide más de lo contratado: acumulado aprobado + esta valorización ≤ cantidad del presupuesto. */
  private async assertWithinContract(tx: Tx, budgetId: string, lines: Array<{ itemId: string; quantity: number }>, exceptId?: string) {
    const items = await tx.select().from(budgetItems).where(and(eq(budgetItems.budgetId, budgetId), inArray(budgetItems.id, lines.map((l) => l.itemId))))
    const done = await this.approvedQty(tx, budgetId, exceptId)
    for (const [i, l] of lines.entries()) {
      const item = items.find((x) => x.id === l.itemId)
      if (!item) throw validationError(`lines.${i}.itemId`, 'La partida no pertenece a este presupuesto')
      const remaining = Math.round((Number(item.quantity) - (done.get(item.id) ?? 0)) * 10_000) / 10_000
      if (l.quantity > remaining + 1e-9) throw new ConflictException(`La partida ${item.code} solo admite ${remaining} ${item.unit} más (contratado: ${Number(item.quantity)}, ya valorizado: ${done.get(item.id) ?? 0})`)
    }
  }

  private async lockApproved(tx: Tx, plant: PlantRow, budgetId: string) {
    const [b] = await tx.select().from(budgets).where(and(eq(budgets.id, budgetId), eq(budgets.plantId, plant.id))).for('update')
    if (!b) throw new NotFoundException('Presupuesto no encontrado')
    if (b.status !== 'APPROVED') throw new ConflictException('Solo se valoriza un presupuesto aprobado (no en borrador ni cerrado)')
    return b
  }

  async list(plant: PlantRow, budgetId: string) {
    const b = await this.budgetsSvc.loadBudget(plant, budgetId)
    const rows = await this.db
      .select({
        id: valuations.id,
        number: valuations.number,
        periodStart: valuations.periodStart,
        periodEnd: valuations.periodEnd,
        status: valuations.status,
        approvedAt: valuations.approvedAt,
        direct: sql<number>`coalesce((select sum(round(vl.quantity * i.frozen_unit_price, 2)) from ${valuationLines} vl join ${budgetItems} i on i.id = vl.item_id where vl.valuation_id = "budget"."valuations"."id"), 0)::float8`,
        lineCount: sql<number>`(select count(*)::int from ${valuationLines} vl where vl.valuation_id = "budget"."valuations"."id")`,
      })
      .from(valuations)
      .where(eq(valuations.budgetId, budgetId))
      .orderBy(desc(valuations.number))
    const rates = ratesOf(b)
    const items = await this.budgetsSvc.pricedItems(plant, b)
    const contractDirect = items.reduce((s, i) => s + (i.amount ?? 0), 0)
    const approvedDirect = rows.filter((r) => r.status === 'APPROVED').reduce((s, r) => s + r.direct, 0)
    return {
      budgetStatus: b.status,
      progressPct: contractDirect === 0 ? null : Math.round((approvedDirect / contractDirect) * 10_000) / 100,
      executedDirect: round2(approvedDirect),
      executedTotal: totalsFromDirect(approvedDirect, rates).total,
      items: rows.map((r) => ({ ...r, direct: round2(r.direct), total: totalsFromDirect(r.direct, rates).total })),
    }
  }

  async get(plant: PlantRow, budgetId: string, id: string) {
    const b = await this.budgetsSvc.loadBudget(plant, budgetId)
    const [v] = await this.db.select().from(valuations).where(and(eq(valuations.id, id), eq(valuations.budgetId, budgetId)))
    if (!v) throw new NotFoundException('Valorización no encontrada')
    const items = await this.budgetsSvc.pricedItems(plant, b)
    const mine = new Map((await this.db.select().from(valuationLines).where(eq(valuationLines.valuationId, id))).map((l) => [l.itemId, Number(l.quantity)]))
    const before = await this.approvedQty(this.db, budgetId, id)
    const lines = items
      .filter((i) => mine.has(i.id))
      .map((i) => {
        const quantity = mine.get(i.id)!
        const previous = before.get(i.id) ?? 0
        return {
          itemId: i.id,
          code: i.code,
          description: i.description,
          unit: i.unit,
          contractQuantity: i.quantity,
          previousQuantity: previous,
          quantity,
          cumulativeQuantity: Math.round((previous + quantity) * 10_000) / 10_000,
          unitPrice: i.unitPrice,
          amount: i.unitPrice === null ? null : itemAmount(quantity, i.unitPrice),
        }
      })
    const direct = round2(lines.reduce((s, l) => s + (l.amount ?? 0), 0))
    return { id: v.id, number: v.number, periodStart: v.periodStart, periodEnd: v.periodEnd, status: v.status, note: v.note, approvedAt: v.approvedAt, lines, totals: totalsFromDirect(direct, ratesOf(b)) }
  }

  private async replaceLines(tx: Tx, id: string, lines: ValuationDto['lines']) {
    const ids = lines.map((l) => l.itemId)
    if (new Set(ids).size !== ids.length) throw validationError('lines', 'Una partida solo puede aparecer una vez por valorización')
    await tx.delete(valuationLines).where(eq(valuationLines.valuationId, id))
    await tx.insert(valuationLines).values(lines.map((l) => ({ valuationId: id, itemId: l.itemId, quantity: String(l.quantity) })))
  }

  async create(plant: PlantRow, budgetId: string, dto: ValuationDto, req: AppRequest) {
    const id = await this.db.transaction(async (tx) => {
      await this.lockApproved(tx, plant, budgetId)
      await this.assertWithinContract(tx, budgetId, dto.lines)
      const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${valuations.number}), 0)::int` }).from(valuations).where(eq(valuations.budgetId, budgetId))
      const [v] = await tx.insert(valuations).values({ budgetId, number: n + 1, periodStart: dto.periodStart, periodEnd: dto.periodEnd, note: dto.note, createdBy: req.user?.id }).returning({ id: valuations.id })
      await this.replaceLines(tx, v.id, dto.lines)
      return v.id
    })
    await this.audit.record(req, { module: 'budget', entityType: 'valuation', entityId: id, plantId: plant.id, action: 'created', newData: { budgetId, lines: dto.lines.length } })
    return this.get(plant, budgetId, id)
  }

  async update(plant: PlantRow, budgetId: string, id: string, dto: ValuationDto, req: AppRequest) {
    await this.db.transaction(async (tx) => {
      await this.lockApproved(tx, plant, budgetId)
      const [v] = await tx.select().from(valuations).where(and(eq(valuations.id, id), eq(valuations.budgetId, budgetId))).for('update')
      if (!v) throw new NotFoundException('Valorización no encontrada')
      if (v.status !== 'DRAFT') throw new ConflictException('Una valorización aprobada no se modifica')
      await this.assertWithinContract(tx, budgetId, dto.lines, id)
      await tx.update(valuations).set({ periodStart: dto.periodStart, periodEnd: dto.periodEnd, note: dto.note ?? null }).where(eq(valuations.id, id))
      await this.replaceLines(tx, id, dto.lines)
    })
    await this.audit.record(req, { module: 'budget', entityType: 'valuation', entityId: id, plantId: plant.id, action: 'updated', newData: { lines: dto.lines.length } })
    return this.get(plant, budgetId, id)
  }

  async remove(plant: PlantRow, budgetId: string, id: string, req: AppRequest) {
    await this.db.transaction(async (tx) => {
      await this.lockApproved(tx, plant, budgetId)
      const removed = await tx.delete(valuations).where(and(eq(valuations.id, id), eq(valuations.budgetId, budgetId), eq(valuations.status, 'DRAFT'))).returning({ id: valuations.id })
      if (removed.length === 0) {
        const [v] = await tx.select({ s: valuations.status }).from(valuations).where(and(eq(valuations.id, id), eq(valuations.budgetId, budgetId)))
        if (!v) throw new NotFoundException('Valorización no encontrada')
        throw new ConflictException('Una valorización aprobada no se elimina')
      }
    })
    await this.audit.record(req, { module: 'budget', entityType: 'valuation', entityId: id, plantId: plant.id, action: 'deleted' })
  }

  /** Aprobar fija lo valorizado. Se revalida contra el acumulado bajo el bloqueo del presupuesto: dos aprobaciones simultáneas no sobrepasan lo contratado. */
  async approve(plant: PlantRow, budgetId: string, id: string, req: AppRequest) {
    await this.db.transaction(async (tx) => {
      await this.lockApproved(tx, plant, budgetId)
      const [v] = await tx.select().from(valuations).where(and(eq(valuations.id, id), eq(valuations.budgetId, budgetId))).for('update')
      if (!v) throw new NotFoundException('Valorización no encontrada')
      if (v.status !== 'DRAFT') throw new ConflictException('La valorización ya está aprobada')
      if (v.createdBy && v.createdBy === req.user?.id && !req.user?.isGlobalAdmin) throw new ForbiddenException('No puedes aprobar una valorización que tú creaste')
      const lines = await tx.select().from(valuationLines).where(eq(valuationLines.valuationId, id)).orderBy(asc(valuationLines.itemId))
      await this.assertWithinContract(tx, budgetId, lines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) })), id)
      await tx.update(valuations).set({ status: 'APPROVED', approvedBy: req.user?.id, approvedAt: new Date() }).where(eq(valuations.id, id))
    })
    await this.audit.record(req, { module: 'budget', entityType: 'valuation', entityId: id, plantId: plant.id, action: 'approved' })
    return this.get(plant, budgetId, id)
  }
}
