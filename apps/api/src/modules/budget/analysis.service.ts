import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'
import { isUniqueViolation } from '../../common/db-errors'
import type { AppRequest, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { apus, budgets, resources, scenarios, valuationLines, valuations, budgetItems } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { type Adjustments, itemAmount, round2, scenarioTotals, sensitivity, totalsFromDirect } from './budget-engine'
import type { ScenarioDto } from './budget.schemas'
import { BudgetsService, ratesOf, type PricedItem } from './budgets.service'
import { PricingService } from './pricing.service'

@Injectable()
export class AnalysisService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly budgetsSvc: BudgetsService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
  ) {}

  /** Los análisis necesitan el desglose de TODAS las partidas: si falta un tipo de cambio, se dice en vez de calcular a medias. */
  private breakdownItems(items: PricedItem[]) {
    const missing = items.filter((i) => i.breakdown === null)
    if (missing.length > 0) throw new ConflictException(`Hay partidas sin precio (${missing.slice(0, 5).map((i) => i.code).join(', ')}): revisa los tipos de cambio y los APU`)
    return items.map((i) => ({ quantity: i.quantity, breakdown: i.breakdown! }))
  }

  async listScenarios(plant: PlantRow, budgetId: string) {
    await this.budgetsSvc.loadBudget(plant, budgetId)
    return this.db.select({ id: scenarios.id, name: scenarios.name, adjustments: scenarios.adjustments, createdAt: scenarios.createdAt }).from(scenarios).where(eq(scenarios.budgetId, budgetId)).orderBy(asc(scenarios.name))
  }

  /** Los escenarios son análisis (no tocan la estructura): se pueden crear también sobre un presupuesto aprobado. */
  async createScenario(plant: PlantRow, budgetId: string, dto: ScenarioDto, req: AppRequest) {
    await this.budgetsSvc.loadBudget(plant, budgetId)
    const [row] = await this.db
      .insert(scenarios)
      .values({ budgetId, name: dto.name, adjustments: dto.adjustments, createdBy: req.user?.id })
      .returning()
      .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException(`Ya existe un escenario llamado «${dto.name}»`)) : Promise.reject(e)))
    await this.audit.record(req, { module: 'budget', entityType: 'scenario', entityId: row.id, plantId: plant.id, action: 'scenario.created', newData: { budgetId, ...dto } })
    return row
  }

  async deleteScenario(plant: PlantRow, budgetId: string, scenarioId: string, req: AppRequest) {
    await this.budgetsSvc.loadBudget(plant, budgetId)
    const removed = await this.db.delete(scenarios).where(and(eq(scenarios.id, scenarioId), eq(scenarios.budgetId, budgetId))).returning({ id: scenarios.id })
    if (removed.length === 0) throw new NotFoundException('Escenario no encontrado')
    await this.audit.record(req, { module: 'budget', entityType: 'scenario', entityId: scenarioId, plantId: plant.id, action: 'scenario.deleted' })
  }

  /** Base vs escenarios y sensibilidad (±10 % por tipo de recurso), design.md §28. */
  async analysis(plant: PlantRow, budgetId: string) {
    const b = await this.budgetsSvc.loadBudget(plant, budgetId)
    const items = this.breakdownItems(await this.budgetsSvc.pricedItems(plant, b))
    const rates = ratesOf(b)
    const base = scenarioTotals(items, rates, {})
    const list = await this.listScenarios(plant, budgetId)
    return {
      baseCurrency: await this.pricing.baseCurrency(plant.id),
      base,
      scenarios: list.map((s) => {
        const totals = scenarioTotals(items, rates, s.adjustments as Adjustments)
        const change = round2(totals.total - base.total)
        return { id: s.id, name: s.name, adjustments: s.adjustments, totals, change, changePct: base.total === 0 ? null : Math.round((change / base.total) * 10_000) / 100 }
      }),
      sensitivity: sensitivity(items, rates, 10),
    }
  }

  /**
   * Desviación de precios: lo congelado al aprobar vs el precio vigente hoy de cada APU.
   * Responde "¿cuánto subió (o bajó) el costo respecto al presupuesto aprobado?" sin tocar el aprobado.
   */
  async deviations(plant: PlantRow, budgetId: string) {
    const b = await this.budgetsSvc.loadBudget(plant, budgetId)
    if (b.status === 'DRAFT') throw new ConflictException('Las desviaciones se calculan sobre un presupuesto aprobado (en borrador los precios ya son los vigentes)')
    const frozen = await this.budgetsSvc.pricedItems(plant, b)
    const live = await this.pricing.priceApus(plant.id, [...new Set(frozen.map((i) => i.apuId))])
    const rows = frozen.map((i) => {
      const p = live.get(i.apuId)
      const current = p?.ok ? p.priced.direct : null
      const diff = current === null || i.unitPrice === null ? null : Math.round((current - i.unitPrice) * 10_000) / 10_000
      return {
        itemId: i.id,
        code: i.code,
        description: i.description,
        unit: i.unit,
        quantity: i.quantity,
        frozenUnitPrice: i.unitPrice,
        currentUnitPrice: current,
        diff,
        diffPct: diff === null || !i.unitPrice ? null : Math.round((diff / i.unitPrice) * 10_000) / 100,
        impact: diff === null ? null : round2(i.quantity * diff),
      }
    })
    const impactDirect = round2(rows.reduce((s, r) => s + (r.impact ?? 0), 0))
    const rates = ratesOf(b)
    const direct = round2(frozen.reduce((s, i) => s + (i.amount ?? 0), 0))
    const impactTotal = round2(totalsFromDirect(direct + impactDirect, rates).total - totalsFromDirect(direct, rates).total)
    return {
      baseCurrency: await this.pricing.baseCurrency(plant.id),
      impactDirect,
      impactTotal,
      itemsAffected: rows.filter((r) => r.diff !== null && r.diff !== 0).length,
      items: rows.sort((a, b2) => Math.abs(b2.impact ?? 0) - Math.abs(a.impact ?? 0)),
    }
  }

  /** Tablero del módulo (design.md §28 y arquitectura §35.7). */
  async summary(plant: PlantRow) {
    const all = await this.db.select().from(budgets).where(eq(budgets.plantId, plant.id))
    const byStatus: Record<string, number> = {}
    for (const b of all) byStatus[b.status] = (byStatus[b.status] ?? 0) + 1

    let approvedDirect = 0
    let approvedTotal = 0
    let executedDirect = 0
    let executedTotal = 0
    let drift = 0
    const approved = all.filter((b) => b.status !== 'DRAFT')
    for (const b of approved) {
      const items = await this.budgetsSvc.pricedItems(plant, b)
      const t = this.budgetsSvc.totals(items, ratesOf(b))
      approvedDirect += t.direct
      approvedTotal += t.total
      const [ex] = await this.db
        .select({ amount: sql<number>`coalesce(sum(round(${valuationLines.quantity} * ${budgetItems.frozenUnitPrice}, 2)), 0)::float8` })
        .from(valuationLines)
        .innerJoin(valuations, eq(valuations.id, valuationLines.valuationId))
        .innerJoin(budgetItems, eq(budgetItems.id, valuationLines.itemId))
        .where(and(eq(valuations.budgetId, b.id), eq(valuations.status, 'APPROVED')))
      executedDirect += ex.amount
      executedTotal += totalsFromDirect(ex.amount, ratesOf(b)).total
      if (b.status === 'APPROVED') {
        const live = await this.pricing.priceApus(plant.id, [...new Set(items.map((i) => i.apuId))])
        drift += items.reduce((s, i) => {
          const p = live.get(i.apuId)
          return p?.ok && i.unitPrice !== null ? s + itemAmount(i.quantity, p.priced.direct) - itemAmount(i.quantity, i.unitPrice) : s
        }, 0)
      }
    }
    const [{ apuCount }] = await this.db.select({ apuCount: sql<number>`count(*)::int` }).from(apus).where(and(eq(apus.plantId, plant.id), eq(apus.status, 'ACTIVE')))
    const [{ resourceCount }] = await this.db.select({ resourceCount: sql<number>`count(*)::int` }).from(resources).where(and(eq(resources.plantId, plant.id), eq(resources.status, 'ACTIVE')))
    return {
      baseCurrency: await this.pricing.baseCurrency(plant.id),
      budgetsByStatus: byStatus,
      budgetCount: all.length,
      approvedDirect: round2(approvedDirect),
      approvedTotal: round2(approvedTotal),
      executedDirect: round2(executedDirect),
      executedTotal: round2(executedTotal),
      /** Avance físico-financiero: lo valorizado (aprobado) sobre el costo directo aprobado. */
      progressPct: approvedDirect === 0 ? null : Math.round((executedDirect / approvedDirect) * 10_000) / 100,
      priceDriftDirect: round2(drift),
      apuCount,
      resourceCount,
    }
  }
}
