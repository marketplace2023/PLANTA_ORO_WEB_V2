import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { isUniqueViolation } from '../../common/db-errors'
import { validationError } from '../../common/errors'
import { escapeLike, pageOf } from '../../common/pagination'
import type { AppRequest, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { apuResources, apus, budgetItems, resources } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import type { ApuLineDto, CreateApuDto, ListApusQuery, UpdateApuDto, UpdateApuLineDto } from './budget.schemas'
import { PricingService } from './pricing.service'

@Injectable()
export class ApusService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
  ) {}

  private async load(plant: PlantRow, id: string) {
    const [a] = await this.db.select().from(apus).where(and(eq(apus.id, id), eq(apus.plantId, plant.id)))
    if (!a) throw new NotFoundException('APU no encontrado')
    return a
  }

  async list(plant: PlantRow, q: ListApusQuery) {
    const conditions: Array<SQL | undefined> = [eq(apus.plantId, plant.id), q.status === 'ALL' ? undefined : eq(apus.status, q.status)]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(apus.code, like), ilike(apus.name, like)))
    }
    const where = and(...conditions)
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(apus)
        .where(where)
        .orderBy(asc(apus.code))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(apus).where(where),
    ])
    const priced = await this.pricing.priceApus(plant.id, rows.map((r) => r.id))
    const counts = new Map((await this.db.select({ apuId: apuResources.apuId, n: sql<number>`count(*)::int` }).from(apuResources).groupBy(apuResources.apuId)).map((r) => [r.apuId, r.n]))
    return {
      ...pageOf(
        rows.map((a) => {
          const p = priced.get(a.id)
          return { id: a.id, code: a.code, name: a.name, unit: a.unit, status: a.status, yieldValue: Number(a.yieldValue), lineCount: counts.get(a.id) ?? 0, unitPrice: p?.ok ? p.priced.direct : null, missingRates: p && !p.ok ? p.missingRates : [] }
        }),
        total,
        q.page,
        q.pageSize,
      ),
      baseCurrency: await this.pricing.baseCurrency(plant.id),
    }
  }

  /** Editor del APU: cabecera, líneas con su subtotal y el pie con costo directo y desglose (design.md §46). */
  async get(plant: PlantRow, id: string) {
    const a = await this.load(plant, id)
    const lines = await this.db
      .select({
        id: apuResources.id,
        resourceId: resources.id,
        code: resources.code,
        name: resources.name,
        type: resources.resourceType,
        unit: resources.unit,
        price: resources.unitPrice,
        currency: resources.currency,
        quantity: apuResources.quantity,
        wastePct: apuResources.wastePct,
        status: resources.status,
      })
      .from(apuResources)
      .innerJoin(resources, eq(resources.id, apuResources.resourceId))
      .where(eq(apuResources.apuId, id))
      .orderBy(asc(apuResources.position), asc(apuResources.id))
    const pricing = (await this.pricing.priceApus(plant.id, [id])).get(id)!
    const [{ used }] = await this.db.select({ used: sql<number>`count(distinct ${budgetItems.budgetId})::int` }).from(budgetItems).where(eq(budgetItems.apuId, id))
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      unit: a.unit,
      description: a.description,
      yieldValue: Number(a.yieldValue),
      hoursPerDay: Number(a.hoursPerDay),
      status: a.status,
      baseCurrency: await this.pricing.baseCurrency(plant.id),
      missingRates: pricing.ok ? [] : pricing.missingRates,
      lines: lines.map((l, i) => ({
        id: l.id,
        resourceId: l.resourceId,
        code: l.code,
        name: l.name,
        type: l.type,
        unit: l.unit,
        unitPrice: Number(l.price),
        currency: l.currency,
        quantity: Number(l.quantity),
        wastePct: Number(l.wastePct),
        resourceStatus: l.status,
        subtotal: pricing.ok ? pricing.priced.lines[i] : null,
      })),
      directCost: pricing.ok ? pricing.priced.direct : null,
      breakdown: pricing.ok ? pricing.priced.breakdown : null,
      /** En cuántos presupuestos se usa (los aprobados no cambian: están congelados). */
      usedInBudgets: used,
    }
  }

  async create(plant: PlantRow, dto: CreateApuDto, req: AppRequest) {
    const [row] = await this.db
      .insert(apus)
      .values({ plantId: plant.id, code: dto.code, name: dto.name, unit: dto.unit, description: dto.description, yieldValue: String(dto.yieldValue), hoursPerDay: String(dto.hoursPerDay) })
      .returning()
      .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException(`Ya existe un APU con el código ${dto.code}`)) : Promise.reject(e)))
    await this.audit.record(req, { module: 'budget', entityType: 'apu', entityId: row.id, plantId: plant.id, action: 'created', newData: { code: dto.code, name: dto.name } })
    return this.get(plant, row.id)
  }

  async update(plant: PlantRow, id: string, dto: UpdateApuDto, req: AppRequest) {
    const before = await this.load(plant, id)
    await this.db
      .update(apus)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.yieldValue !== undefined && { yieldValue: String(dto.yieldValue) }),
        ...(dto.hoursPerDay !== undefined && { hoursPerDay: String(dto.hoursPerDay) }),
        ...(dto.status !== undefined && { status: dto.status }),
      })
      .where(eq(apus.id, id))
    await this.audit.record(req, { module: 'budget', entityType: 'apu', entityId: id, plantId: plant.id, action: 'updated', oldData: { name: before.name, yieldValue: before.yieldValue, hoursPerDay: before.hoursPerDay, status: before.status }, newData: dto })
    return this.get(plant, id)
  }

  async addLine(plant: PlantRow, id: string, dto: ApuLineDto, req: AppRequest) {
    await this.load(plant, id)
    const [res] = await this.db.select().from(resources).where(and(eq(resources.id, dto.resourceId), eq(resources.plantId, plant.id)))
    if (!res) throw validationError('resourceId', 'El recurso no existe en esta planta')
    if (res.status !== 'ACTIVE') throw validationError('resourceId', 'El recurso está inactivo')
    const lineId = await this.db.transaction(async (tx) => {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(apuResources).where(eq(apuResources.apuId, id))
      const [row] = await tx
        .insert(apuResources)
        .values({ apuId: id, resourceId: dto.resourceId, position: n, quantity: String(dto.quantity), wastePct: String(dto.wastePct) })
        .returning({ id: apuResources.id })
        .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException('El recurso ya está en este APU: edite su cantidad')) : Promise.reject(e)))
      return row.id
    })
    await this.audit.record(req, { module: 'budget', entityType: 'apu', entityId: id, plantId: plant.id, action: 'line.added', newData: { lineId, ...dto } })
    return this.get(plant, id)
  }

  async updateLine(plant: PlantRow, id: string, lineId: string, dto: UpdateApuLineDto, req: AppRequest) {
    await this.load(plant, id)
    const updated = await this.db
      .update(apuResources)
      .set({ ...(dto.quantity !== undefined && { quantity: String(dto.quantity) }), ...(dto.wastePct !== undefined && { wastePct: String(dto.wastePct) }) })
      .where(and(eq(apuResources.id, lineId), eq(apuResources.apuId, id)))
      .returning({ id: apuResources.id })
    if (updated.length === 0) throw new NotFoundException('Línea no encontrada')
    await this.audit.record(req, { module: 'budget', entityType: 'apu', entityId: id, plantId: plant.id, action: 'line.updated', newData: { lineId, ...dto } })
    return this.get(plant, id)
  }

  async deleteLine(plant: PlantRow, id: string, lineId: string, req: AppRequest) {
    await this.load(plant, id)
    const removed = await this.db.delete(apuResources).where(and(eq(apuResources.id, lineId), eq(apuResources.apuId, id))).returning({ id: apuResources.id })
    if (removed.length === 0) throw new NotFoundException('Línea no encontrada')
    await this.audit.record(req, { module: 'budget', entityType: 'apu', entityId: id, plantId: plant.id, action: 'line.deleted', oldData: { lineId } })
    return this.get(plant, id)
  }
}
