import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQLWrapper } from 'drizzle-orm'
import { z } from 'zod'
import { DB, type Database } from '../../database/database.module'
import { auditEvents, luloMasterCatalogs, luloMasterComponents, luloMasterFamilies, luloMasterItems, luloMasterResources, luloPlantMasterValues, luloPriceLists, luloResourcePrices } from '../../database/schema'
import { escapeLike } from '../../common/pagination'
import type { AuthUser } from '../../common/types'
import type { LuloApu, LuloCatalog, LuloResource } from './lulo-engine'
import { LULO_PROFILE, luloDecimal } from './lulo.schemas'

export const masterListSchema = z.object({
  catalogId: z.uuid().optional(), kind: z.enum(['ITEM', 'MATERIAL', 'EQUIPMENT', 'LABOR', 'FAMILY']).default('ITEM'),
  familyId: z.uuid().optional(), search: z.string().trim().max(160).default(''), page: z.coerce.number().int().min(1).max(10000).default(1),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
})
export const masterValueSchema = z.object({
  expectedRevision: z.number().int().min(0), reason: z.string().trim().min(8).max(1000),
  value: z.object({ name: z.string().trim().min(1).max(2000), unit: z.string().trim().min(1).max(30).nullable(), amount: luloDecimal.nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/).nullable(), baseDate: z.iso.date().nullable(), validUntil: z.iso.date().nullable(), evidence: z.string().trim().max(1000), verified: z.boolean(),
    zeroReason: z.string().trim().max(1000).optional(),
    yieldValue: luloDecimal.refine(v => Number(v) > 0, 'El rendimiento debe ser positivo').optional(), components: z.array(z.object({ resourceId: z.uuid(), quantity: luloDecimal.refine(v => Number(v) > 0, 'La cantidad debe ser positiva'), wastePct: luloDecimal.refine(v => Number(v) <= 100) })).min(1).max(1000).optional(),
  }).strict().superRefine((v, ctx) => {
    if (v.verified && (!v.amount || !v.currency || !v.baseDate || !v.validUntil || v.evidence.length < 8)) ctx.addIssue({ code: 'custom', message: 'Para confirmar el precio indica importe, moneda, fechas y fuente' })
    if (v.verified && Number(v.amount) === 0 && (v.zeroReason?.length ?? 0) < 8) ctx.addIssue({ code: 'custom', message: 'Indica un motivo explícito para el costo cero' })
    if (v.baseDate && v.validUntil && v.validUntil < v.baseDate) ctx.addIssue({ code: 'custom', message: 'La vigencia no puede terminar antes de la fecha base' })
  }),
}).strict()
type Resource = typeof luloMasterResources.$inferSelect
type Value = typeof luloPlantMasterValues.$inferSelect
const visible = (column: SQLWrapper, plantId?: string) => plantId ? or(isNull(column), sql`${column} = ${plantId}`) : isNull(column)

@Injectable()
export class LuloMastersService {
  constructor(@Inject(DB) private readonly db: Database) {}
  async catalogs() { return this.db.select().from(luloMasterCatalogs).where(eq(luloMasterCatalogs.active, true)).orderBy(asc(luloMasterCatalogs.createdAt)) }
  async catalog(id?: string) {
    const rows = await this.catalogs(); const row = id ? rows.find(c => c.id === id) : rows[0]
    if (!row) throw new NotFoundException('No se encontraron los maestros LULO convertidos')
    return row
  }
  async exists(id: string) { return !!(await this.db.select({ id: luloMasterCatalogs.id }).from(luloMasterCatalogs).where(and(eq(luloMasterCatalogs.id, id), eq(luloMasterCatalogs.active, true))))[0] }
  private async values(plantId?: string, ids?: string[]) {
    if (!plantId || !ids?.length) return new Map<string, Value>()
    const rows = await this.db.select().from(luloPlantMasterValues).where(and(eq(luloPlantMasterValues.plantId, plantId), inArray(luloPlantMasterValues.entryId, ids)))
    return new Map(rows.map(r => [r.entryId, r]))
  }
  private resource(r: Resource, row?: Value) {
    const v = row?.value
    const { sourceFields: _source, ...fields } = r
    return { ...fields, originalName: r.name, name: v?.name ?? r.name, unit: v?.unit ?? r.unit,
      amount: v?.amount ?? (r.resourceType === 'EQUIPMENT' ? r.dailyCost : r.historicalPrice),
      currency: v?.currency ?? null, priceStatus: v?.verified ? 'VERIFIED' : 'HISTORICAL', baseDate: v?.baseDate ?? r.sourceDate, validUntil: v?.validUntil ?? null,
      evidence: v?.evidence ?? '', zeroReason: v?.zeroReason ?? '', revision: row?.revision ?? 0, custom: !!row || !!r.plantId,
    }
  }
  async list(q: z.infer<typeof masterListSchema>, plantId?: string) {
    const catalog = await this.catalog(q.catalogId); const pattern = `%${escapeLike(q.search)}%`
    const status = (column: SQLWrapper) => !plantId || q.status !== 'ALL' ? sql`${column} = ${!plantId || q.status === 'ACTIVE'}` : undefined
    if (q.kind === 'FAMILY') {
      const all = await this.db.select().from(luloMasterFamilies).where(and(visible(luloMasterFamilies.plantId, plantId), status(luloMasterFamilies.active), eq(luloMasterFamilies.catalogId, catalog.id), q.search ? or(ilike(luloMasterFamilies.name, pattern), ilike(luloMasterFamilies.code, pattern)) : undefined)).orderBy(asc(luloMasterFamilies.resourceType), asc(luloMasterFamilies.code))
      const own = await this.values(plantId, all.map(f => f.id))
      return { catalog, items: all.slice((q.page - 1) * 30, q.page * 30).map(f => ({ ...f, name: own.get(f.id)?.value.name ?? f.name })), total: all.length, page: q.page, pageSize: 30 }
    }
    if (q.kind === 'ITEM') {
      const where = and(visible(luloMasterItems.plantId, plantId), status(luloMasterItems.active), eq(luloMasterItems.catalogId, catalog.id), q.search ? or(ilike(luloMasterItems.code, pattern), ilike(luloMasterItems.name, pattern)) : undefined,
        q.familyId ? sql`exists (select 1 from ${luloMasterComponents} c join ${luloMasterResources} r on r.id = c.resource_id where c.item_id = ${luloMasterItems.id} and r.family_id = ${q.familyId})` : undefined)
      const [rows, [count]] = await Promise.all([this.db.select().from(luloMasterItems).where(where).orderBy(asc(luloMasterItems.code)).limit(30).offset((q.page - 1) * 30), this.db.select({ total: sql<number>`count(*)::int` }).from(luloMasterItems).where(where)])
      const values = await this.values(plantId, rows.map(r => r.id))
      return { catalog, items: rows.map(r => { const { sourceFields: _source, ...fields } = r; return { ...fields, name: values.get(r.id)?.value.name ?? r.name, unit: values.get(r.id)?.value.unit ?? r.unit, originalName: r.name, price: values.get(r.id)?.value.amount ?? r.originalUnitPrice, yieldValue: values.get(r.id)?.value.yieldValue ?? r.yieldValue, revision: values.get(r.id)?.revision ?? 0, custom: values.has(r.id) } }), total: count.total, page: q.page, pageSize: 30 }
    }
    const where = and(visible(luloMasterResources.plantId, plantId), status(luloMasterResources.active), eq(luloMasterResources.catalogId, catalog.id), eq(luloMasterResources.resourceType, q.kind), q.familyId ? eq(luloMasterResources.familyId, q.familyId) : undefined,
      q.search ? or(ilike(luloMasterResources.code, pattern), ilike(luloMasterResources.name, pattern)) : undefined)
    const [rows, [count]] = await Promise.all([this.db.select().from(luloMasterResources).where(where).orderBy(asc(luloMasterResources.code)).limit(30).offset((q.page - 1) * 30), this.db.select({ total: sql<number>`count(*)::int` }).from(luloMasterResources).where(where)])
    const values = await this.values(plantId, rows.map(r => r.id))
    return { catalog, items: rows.map(r => this.resource(r, values.get(r.id))), total: count.total, page: q.page, pageSize: 30 }
  }
  async detail(id: string, plantId?: string) {
    const [item] = await this.db.select().from(luloMasterItems).where(and(eq(luloMasterItems.id, id), visible(luloMasterItems.plantId, plantId)))
    const values = await this.values(plantId, [id]); const own = values.get(id)
    if (item) {
      await this.catalog(item.catalogId)
      const original = await this.db.select().from(luloMasterComponents).where(eq(luloMasterComponents.itemId, id)).orderBy(asc(luloMasterComponents.position))
      const components = own?.value.components ? own.value.components.map((c, i) => ({ ...c, id: `${id}:${i}`, position: i, resourceType: '', originalCode: '', depreciation: null, sourceFields: {} })) : original
      const ids = components.map(c => c.resourceId).filter((id): id is string => !!id)
      const resources = ids.length ? await this.db.select().from(luloMasterResources).where(and(visible(luloMasterResources.plantId, plantId), eq(luloMasterResources.catalogId, item.catalogId), inArray(luloMasterResources.id, ids))) : []
      const prices = await this.values(plantId, ids); const byId = new Map(resources.map(r => [r.id, r]))
      const { sourceFields, ...fields } = item
      return { kind: 'ITEM', item: { ...fields, name: own?.value.name ?? item.name, unit: own?.value.unit ?? item.unit, price: own?.value.amount ?? item.originalUnitPrice, yieldValue: own?.value.yieldValue ?? item.yieldValue }, revision: own?.revision ?? 0, value: own?.value ?? null, ...(plantId ? { sourceFields } : {}),
        components: components.map(c => { const r = c.resourceId ? byId.get(c.resourceId) : null; const { sourceFields: _source, ...clean } = c; return { ...clean, resourceType: r?.resourceType ?? c.resourceType, originalCode: r?.code ?? c.originalCode, resource: r ? this.resource(r, prices.get(r.id)) : null } }) }
    }
    const [family] = await this.db.select().from(luloMasterFamilies).where(and(eq(luloMasterFamilies.id, id), visible(luloMasterFamilies.plantId, plantId)))
    if (family) return { kind: 'FAMILY', item: { ...family, name: own?.value.name ?? family.name, unit: null, amount: null }, revision: own?.revision ?? 0, value: own?.value ?? null, components: [] }
    const [resource] = await this.db.select().from(luloMasterResources).where(and(eq(luloMasterResources.id, id), visible(luloMasterResources.plantId, plantId)))
    if (!resource) throw new NotFoundException('Maestro no encontrado')
    await this.catalog(resource.catalogId)
    return { kind: resource.resourceType, item: this.resource(resource, own), revision: own?.revision ?? 0, value: own?.value ?? null, components: [], ...(plantId ? { sourceFields: resource.sourceFields } : {}) }
  }
  async save(plantId: string, id: string, data: z.infer<typeof masterValueSchema>, actor: AuthUser) {
    const detail = await this.detail(id, plantId)
    if (data.value.components && detail.kind !== 'ITEM') throw new UnprocessableEntityException('Solo las partidas tienen composición')
    if (data.value.components) {
      const ids = [...new Set(data.value.components.map(c => c.resourceId))]
      const found = ids.length ? await this.db.select().from(luloMasterResources).where(and(visible(luloMasterResources.plantId, plantId), eq(luloMasterResources.catalogId, detail.item.catalogId), inArray(luloMasterResources.id, ids))) : []
      if (found.length !== ids.length) throw new UnprocessableEntityException('Un insumo no pertenece al catálogo de la partida')
    }
    await this.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lulo-plant-master:${plantId}:${id}`}))`)
      const [old] = await tx.select().from(luloPlantMasterValues).where(and(eq(luloPlantMasterValues.plantId, plantId), eq(luloPlantMasterValues.entryId, id)))
      if ((old?.revision ?? 0) !== data.expectedRevision) throw new ConflictException('El maestro fue modificado. Recarga la versión guardada')
      const changes = { value: data.value, revision: data.expectedRevision + 1, actorId: actor.id, updatedAt: new Date() }
      await tx.insert(luloPlantMasterValues).values({ plantId, entryId: id, ...changes }).onConflictDoUpdate({ target: [luloPlantMasterValues.plantId, luloPlantMasterValues.entryId], set: changes })
      await tx.insert(auditEvents).values({ userId: actor.id, plantId, module: 'budget-lulo', entityType: 'plant-master', entityId: id, action: 'MASTER_SAVE', oldData: old?.value ?? detail.item, newData: { value: data.value, reason: data.reason, revision: changes.revision } })
    })
    return this.detail(id, plantId)
  }
  async snapshot(catalogId: string, ids: string[], currency: string, plantId?: string, priceListId?: string | null, baseDate?: string): Promise<LuloCatalog> {
    const catalog = await this.catalog(catalogId); const apus: LuloApu[] = []
    for (const id of ids) {
      const detail = await this.detail(id, plantId)
      if (!detail.item.active) throw new UnprocessableEntityException('La partida está inactiva para presupuestos nuevos')
      if (detail.kind !== 'ITEM' || !('yieldValue' in detail.item) || detail.item.catalogId !== catalogId) throw new UnprocessableEntityException('La partida no pertenece al catálogo seleccionado')
      const components = await Promise.all(detail.components.map(async c => {
        const r = c.resource
        if (!r || r.amount === null) throw new UnprocessableEntityException(`La partida ${detail.item.code} contiene una referencia sin precio. Puedes usar su PU original como partida sin desglose mientras la corriges`)
        if (!r.active) throw new UnprocessableEntityException(`El insumo ${r.code} está inactivo`)
        if (priceListId) {
          if (!plantId || !baseDate) throw new UnprocessableEntityException('Selecciona fecha base y planta para la lista de precios')
          const [list] = await this.db.select().from(luloPriceLists).where(and(eq(luloPriceLists.plantId, plantId), eq(luloPriceLists.id, priceListId), eq(luloPriceLists.status, 'ACTIVE')))
          if (!list || list.currency !== currency) throw new UnprocessableEntityException('La lista no pertenece a esta planta o usa otra moneda')
          const [price] = await this.db.select().from(luloResourcePrices).where(and(eq(luloResourcePrices.listId, list.id), eq(luloResourcePrices.resourceId, r.id), sql`${luloResourcePrices.baseDate} <= ${baseDate}`, sql`${luloResourcePrices.validUntil} >= ${baseDate}`)).orderBy(desc(luloResourcePrices.baseDate), desc(luloResourcePrices.revision)).limit(1)
          if (!price) throw new UnprocessableEntityException(`No hay precio aplicable a ${baseDate} para ${r.code}; marca la partida como pendiente para guardar el borrador`)
          const resource: LuloResource = { id: r.id, code: r.code, name: r.name, type: r.resourceType as LuloResource['type'], unit: price.unit, amount: price.amount, currency, denomination: currency, costBasis: price.costBasis as LuloResource['costBasis'], baseDate: price.baseDate, validUntil: price.validUntil, evidence: price.evidence, priceStatus: 'VERIFIED', priceId: price.id, priceListId: list.id, priceRevision: price.revision, supplier: price.supplier, zeroReason: price.zeroReason }
          return { resource, quantity: String(c.quantity), wastePct: c.wastePct == null ? '0' : String(c.wastePct) }
        }
        const verified = r.priceStatus === 'VERIFIED'
        if (r.currency && r.currency !== currency) throw new UnprocessableEntityException(`El precio propio de ${r.code} usa ${r.currency}; no hay conversión automática`)
        const unit = r.unit ?? (r.resourceType === 'MATERIAL' ? '' : 'DIA')
        const resource: LuloResource = { id: r.id, code: r.code, name: r.name, type: r.resourceType as LuloResource['type'], unit, amount: r.amount,
          costBasis: r.resourceType === 'MATERIAL' ? 'UNIT' : unit === 'H' ? 'HOUR' : 'DAY', currency, denomination: verified ? r.currency! : 'Moneda del documento; denominación de origen sin confirmar', baseDate: r.baseDate ?? '', validUntil: r.validUntil ?? '', evidence: verified ? r.evidence : 'Valor original del MDB; referencia histórica', priceStatus: verified ? 'VERIFIED' : 'HISTORICAL', zeroReason: r.zeroReason, priceRevision: r.revision || undefined }
        return { resource, quantity: String(c.quantity), wastePct: c.wastePct == null ? '0' : String(c.wastePct) }
      }))
      apus.push({ id, code: detail.item.code, name: detail.item.name, unit: detail.item.unit ?? '', yieldValue: String(detail.item.yieldValue), yieldBasis: 'DAY', hoursPerDay: '8', methodNote: 'Maestro LULO: materiales por unidad, equipo y mano de obra por jornada. Valores originales de referencia.', publicationId: catalogId, components })
    }
    return { profile: LULO_PROFILE, publicationId: catalogId, label: catalog.name, version: 1, demo: false, currency, denomination: 'Moneda del documento; origen histórico', hash: catalog.sourceHash, apus, historical: true }
  }
}
