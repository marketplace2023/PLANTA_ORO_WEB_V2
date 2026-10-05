import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { isUniqueViolation } from '../../common/db-errors'
import { validationError } from '../../common/errors'
import { escapeLike, pageOf } from '../../common/pagination'
import type { AppRequest, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { apuResources, exchangeRates, items as inventoryItems, priceHistory, resources, users } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { PricingService } from './pricing.service'
import type { CreateResourceDto, ListResourcesQuery, UpdateResourceDto } from './budget.schemas'

type ResourceRow = typeof resources.$inferSelect

@Injectable()
export class ResourcesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
  ) {}

  private view(r: ResourceRow) {
    return { id: r.id, code: r.code, name: r.name, resourceType: r.resourceType, unit: r.unit, unitPrice: Number(r.unitPrice), currency: r.currency, status: r.status, sourceItemId: r.sourceItemId, updatedAt: r.updatedAt }
  }

  async list(plant: PlantRow, q: ListResourcesQuery) {
    const conditions: Array<SQL | undefined> = [
      eq(resources.plantId, plant.id),
      q.type ? eq(resources.resourceType, q.type) : undefined,
      q.status === 'ALL' ? undefined : eq(resources.status, q.status),
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(resources.code, like), ilike(resources.name, like)))
    }
    const where = and(...conditions)
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(resources)
        .where(where)
        .orderBy(asc(resources.resourceType), asc(resources.code))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(resources).where(where),
    ])
    return { ...pageOf(rows.map((r) => this.view(r)), total, q.page, q.pageSize), baseCurrency: await this.pricing.baseCurrency(plant.id) }
  }

  private async load(plant: PlantRow, id: string) {
    const [r] = await this.db.select().from(resources).where(and(eq(resources.id, id), eq(resources.plantId, plant.id)))
    if (!r) throw new NotFoundException('Recurso no encontrado')
    return r
  }

  /** Un recurso solo puede estar en moneda base o en una con tipo de cambio cargado (si no, ningún APU podría preciarlo). */
  private async assertCurrency(plantId: string, currency: string) {
    if (!(await this.pricing.rates(plantId)).has(currency)) throw validationError('currency', `Cargue primero el tipo de cambio de ${currency}`)
  }

  async create(plant: PlantRow, dto: CreateResourceDto, req: AppRequest) {
    const currency = dto.currency ?? (await this.pricing.baseCurrency(plant.id))
    await this.assertCurrency(plant.id, currency)
    const row = await this.db.transaction(async (tx) => {
      const [r] = await tx
        .insert(resources)
        .values({ plantId: plant.id, code: dto.code, name: dto.name, resourceType: dto.resourceType, unit: dto.unit, unitPrice: String(dto.unitPrice), currency })
        .returning()
        .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException(`Ya existe un recurso con el código ${dto.code}`)) : Promise.reject(e)))
      await tx.insert(priceHistory).values({ resourceId: r.id, unitPrice: r.unitPrice, currency, note: 'Precio inicial', changedBy: req.user?.id })
      return r
    })
    await this.audit.record(req, { module: 'budget', entityType: 'resource', entityId: row.id, plantId: plant.id, action: 'created', newData: { code: dto.code, resourceType: dto.resourceType, unitPrice: dto.unitPrice, currency } })
    return this.view(row)
  }

  /** Cambiar precio o moneda deja una fila en el historial (precio anterior intacto). Los presupuestos aprobados no se tocan: están congelados. */
  async update(plant: PlantRow, id: string, dto: UpdateResourceDto, req: AppRequest) {
    const before = await this.load(plant, id)
    if (dto.currency) await this.assertCurrency(plant.id, dto.currency)
    const priceChanged = (dto.unitPrice !== undefined && dto.unitPrice !== Number(before.unitPrice)) || (dto.currency !== undefined && dto.currency !== before.currency)
    const row = await this.db.transaction(async (tx) => {
      const [r] = await tx
        .update(resources)
        .set({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.unitPrice !== undefined && { unitPrice: String(dto.unitPrice) }),
          ...(dto.currency !== undefined && { currency: dto.currency }),
          ...(dto.status !== undefined && { status: dto.status }),
        })
        .where(eq(resources.id, id))
        .returning()
      if (priceChanged) await tx.insert(priceHistory).values({ resourceId: id, unitPrice: r.unitPrice, currency: r.currency, note: dto.note, changedBy: req.user?.id })
      return r
    })
    await this.audit.record(req, {
      module: 'budget',
      entityType: 'resource',
      entityId: id,
      plantId: plant.id,
      action: priceChanged ? 'price.changed' : 'updated',
      oldData: { name: before.name, unitPrice: before.unitPrice, currency: before.currency, status: before.status },
      newData: dto,
    })
    return this.view(row)
  }

  async history(plant: PlantRow, id: string) {
    await this.load(plant, id)
    const rows = await this.db
      .select({ id: priceHistory.id, unitPrice: priceHistory.unitPrice, currency: priceHistory.currency, note: priceHistory.note, changedAt: priceHistory.changedAt, first: users.firstName, last: users.lastName })
      .from(priceHistory)
      .leftJoin(users, eq(users.id, priceHistory.changedBy))
      .where(eq(priceHistory.resourceId, id))
      .orderBy(desc(priceHistory.changedAt), desc(priceHistory.id))
    return rows.map((r) => ({ id: r.id, unitPrice: Number(r.unitPrice), currency: r.currency, note: r.note, changedAt: r.changedAt, changedBy: [r.first, r.last].filter(Boolean).join(' ') || null }))
  }

  /** Importa el costo promedio de un ítem de inventario como recurso (vinculado a su origen). */
  async importFromInventory(plant: PlantRow, dto: { itemId: string; resourceType: 'MATERIAL' | 'EQUIPMENT' | 'TRANSPORT'; code?: string }, req: AppRequest) {
    const [item] = await this.db.select().from(inventoryItems).where(and(eq(inventoryItems.id, dto.itemId), eq(inventoryItems.plantId, plant.id)))
    if (!item) throw validationError('itemId', 'El ítem no existe en el inventario de esta planta')
    if (item.unitCost === null) throw new ConflictException('El ítem no tiene costo cargado en el inventario')
    const [dup] = await this.db.select({ id: resources.id }).from(resources).where(and(eq(resources.plantId, plant.id), eq(resources.sourceItemId, item.id)))
    if (dup) throw new ConflictException('Este ítem ya fue importado como recurso')
    return this.create(
      plant,
      { code: dto.code ?? `INV-${item.sku}`.slice(0, 40).toUpperCase(), name: item.name, resourceType: dto.resourceType, unit: item.uom.slice(0, 10), unitPrice: Number(item.unitCost) },
      req,
    ).then(async (created) => {
      await this.db.update(resources).set({ sourceItemId: item.id }).where(eq(resources.id, created.id))
      return { ...created, sourceItemId: item.id }
    })
  }

  // ---------- Tipos de cambio ----------

  async listRates(plant: PlantRow) {
    const rows = await this.db.select().from(exchangeRates).where(eq(exchangeRates.plantId, plant.id)).orderBy(asc(exchangeRates.currency))
    return { baseCurrency: await this.pricing.baseCurrency(plant.id), rates: rows.map((r) => ({ currency: r.currency, rate: Number(r.rate), updatedAt: r.updatedAt })) }
  }

  async setRate(plant: PlantRow, dto: { currency: string; rate: number }, req: AppRequest) {
    const base = await this.pricing.baseCurrency(plant.id)
    if (dto.currency === base) throw validationError('currency', `${base} es la moneda base de la planta: su tipo de cambio es siempre 1`)
    await this.db
      .insert(exchangeRates)
      .values({ plantId: plant.id, currency: dto.currency, rate: String(dto.rate) })
      .onConflictDoUpdate({ target: [exchangeRates.plantId, exchangeRates.currency], set: { rate: String(dto.rate), updatedAt: new Date() } })
    await this.audit.record(req, { module: 'budget', entityType: 'exchange_rate', plantId: plant.id, action: 'rate.set', newData: dto })
    return this.listRates(plant)
  }

  async deleteRate(plant: PlantRow, currency: string, req: AppRequest) {
    // No se quita un tipo de cambio que algún recurso todavía usa: sus APU quedarían sin precio.
    const [inUse] = await this.db.select({ n: sql<number>`count(*)::int` }).from(resources).where(and(eq(resources.plantId, plant.id), eq(resources.currency, currency)))
    if (inUse.n > 0) throw new ConflictException(`${inUse.n} recurso(s) están en ${currency}: cámbialos de moneda antes de quitar el tipo de cambio`)
    const removed = await this.db.delete(exchangeRates).where(and(eq(exchangeRates.plantId, plant.id), eq(exchangeRates.currency, currency))).returning()
    if (removed.length === 0) throw new NotFoundException('Tipo de cambio no encontrado')
    await this.audit.record(req, { module: 'budget', entityType: 'exchange_rate', plantId: plant.id, action: 'rate.deleted', oldData: { currency } })
    return this.listRates(plant)
  }

  /** Cuántos APU usan un recurso (para avisar antes de cambiar un precio). */
  async usage(plant: PlantRow, id: string) {
    await this.load(plant, id)
    const [{ n }] = await this.db.select({ n: sql<number>`count(distinct ${apuResources.apuId})::int` }).from(apuResources).where(eq(apuResources.resourceId, id))
    return { apus: n }
  }
}
