import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { DB, type Database } from '../../database/database.module'
import * as s from '../../database/schema'
import type { AuthUser, PlantRow } from '../../common/types'
import { luloDecimal } from './lulo.schemas'
import { luloHash } from './lulo-hash'
import { LuloMastersService } from './lulo-masters.service'
import { priceListSchema, priceSchema } from './lulo-works.schemas'
import { readMasterFile } from './lulo-master-import'
import { unitCode } from './lulo-works.engine'
const text = z.string().trim()
export const newMasterSchema = z.object({ catalogId: z.uuid(), kind: z.enum(['ITEM', 'MATERIAL', 'EQUIPMENT', 'LABOR', 'FAMILY']), code: text.min(1).max(80).transform(v => v.toUpperCase()), name: text.min(1).max(2000), unit: text.max(30).nullable(), familyId: z.uuid().nullable(), resourceType: z.enum(['MATERIAL', 'EQUIPMENT', 'LABOR']).optional(), amount: luloDecimal, yieldValue: luloDecimal.refine(v => Number(v) > 0), components: z.array(z.object({ resourceId: z.uuid(), quantity: luloDecimal.refine(v => Number(v) > 0), wastePct: luloDecimal.refine(v => Number(v) <= 100) }).strict()).max(1000) }).strict()
export const masterImportSchema = z.object({ rows: z.array(newMasterSchema).min(1).max(1000) }).strict()
export const referenceSchema = z.object({ kind: z.enum(['UNIT', 'SUPPLIER']), code: text.min(1).max(80).transform(v => v.toUpperCase()), name: text.min(1).max(200), dimension: z.enum(['COUNT', 'LENGTH', 'AREA', 'VOLUME', 'MASS', 'TIME', 'OTHER']), notes: text.max(1000), status: z.enum(['ACTIVE', 'INACTIVE']) }).strict()
@Injectable()
export class LuloMasterManagementService {
  constructor(@Inject(DB) private readonly db: Database, private readonly masters: LuloMastersService) {}
  async references(plant: PlantRow) { return this.db.select().from(s.luloReferences).where(eq(s.luloReferences.plantId, plant.id)).orderBy(asc(s.luloReferences.kind), asc(s.luloReferences.code)) }
  async saveReference(plant: PlantRow, input: z.infer<typeof referenceSchema>, actor: AuthUser, id?: string, revision?: number) {
    return this.db.transaction(async tx => {
      const [old] = id ? await tx.select().from(s.luloReferences).where(and(eq(s.luloReferences.plantId, plant.id), eq(s.luloReferences.id, id))).for('update') : []
      if (id && !old) throw new NotFoundException('Referencia no encontrada'); if (old && old.revision !== revision) throw new ConflictException('La referencia cambió')
      if (old && (old.kind !== input.kind || old.code !== input.code)) throw new UnprocessableEntityException('El código y tipo de una referencia se conservan; crea otra para reemplazarla')
      const [saved] = old ? await tx.update(s.luloReferences).set({ ...input, revision: old.revision + 1 }).where(eq(s.luloReferences.id, id!)).returning() : await tx.insert(s.luloReferences).values({ plantId: plant.id, ...input }).returning()
      await tx.insert(s.auditEvents).values({ userId: actor.id, plantId: plant.id, module: 'budget-lulo', entityType: 'reference', entityId: saved.id, action: 'REFERENCE_SAVE', oldData: old ?? null, newData: saved }); return saved
    })
  }
  private async validate(plant: PlantRow, input: z.infer<typeof newMasterSchema>) {
    await this.masters.catalog(input.catalogId)
    if (input.kind === 'FAMILY' && !input.resourceType) throw new UnprocessableEntityException('Selecciona el tipo de familia')
    if (input.kind !== 'FAMILY' && !input.unit) throw new UnprocessableEntityException('La unidad es obligatoria')
    if (input.kind === 'ITEM' && !input.components.length) throw new UnprocessableEntityException('La partida maestra necesita composición')
    if (input.familyId) { const [family] = await this.db.select().from(s.luloMasterFamilies).where(and(eq(s.luloMasterFamilies.id, input.familyId), eq(s.luloMasterFamilies.catalogId, input.catalogId), or(isNull(s.luloMasterFamilies.plantId), eq(s.luloMasterFamilies.plantId, plant.id)))); if (!family || family.resourceType !== input.kind) throw new UnprocessableEntityException('La familia no corresponde al tipo o a la planta') }
    if (input.components.length) { const ids = [...new Set(input.components.map(c => c.resourceId))]; const resources = await this.db.select().from(s.luloMasterResources).where(and(inArray(s.luloMasterResources.id, ids), eq(s.luloMasterResources.catalogId, input.catalogId), or(isNull(s.luloMasterResources.plantId), eq(s.luloMasterResources.plantId, plant.id)), eq(s.luloMasterResources.active, true))); if (resources.length !== ids.length) throw new UnprocessableEntityException('La composición contiene insumos no disponibles en esta planta'); for (const c of input.components) if (resources.find(r => r.id === c.resourceId)?.resourceType !== 'MATERIAL' && Number(c.wastePct) > 0) throw new UnprocessableEntityException('El desperdicio solo se aplica a materiales') }
  }
  private async insert(tx: Parameters<Parameters<Database['transaction']>[0]>[0], plant: PlantRow, input: z.infer<typeof newMasterSchema>, actor: AuthUser) {
    const kind = input.kind === 'ITEM' ? 'APU' : input.kind === 'FAMILY' ? 'FAMILY' : 'RESOURCE'
    const [entry] = await tx.insert(s.budgetMasterEntries).values({ batchId: input.catalogId, kind, resourceType: input.kind === 'ITEM' ? '' : input.kind === 'FAMILY' ? input.resourceType! : input.kind, sourceId: `plant:${plant.id}:${input.kind}:${input.code}`, code: input.code, name: input.name, unit: input.unit, sourceContext: `PLANT:${plant.id}`, status: 'RECOVERED', issues: [], data: { createdInPlant: plant.id, provenance: 'CREATED_IN_FUR', input } }).returning()
    const base = { id: entry.id, catalogId: input.catalogId, plantId: plant.id, code: input.code, name: input.name, active: true }
    if (input.kind === 'FAMILY') await tx.insert(s.luloMasterFamilies).values({ ...base, resourceType: input.resourceType! })
    else if (input.kind === 'ITEM') {
      await tx.insert(s.luloMasterItems).values({ ...base, unit: input.unit, yieldValue: input.yieldValue, originalUnitPrice: input.amount, issues: [], sourceFields: { provenance: 'CREATED_IN_FUR' } })
      const resources = await tx.select().from(s.luloMasterResources).where(inArray(s.luloMasterResources.id, input.components.map(c => c.resourceId)))
      await tx.insert(s.luloMasterComponents).values(input.components.map((c, position) => ({ itemId: entry.id, resourceId: c.resourceId, position, resourceType: resources.find(r => r.id === c.resourceId)!.resourceType, originalCode: resources.find(r => r.id === c.resourceId)!.code, quantity: c.quantity, wastePct: c.wastePct, sourceFields: { provenance: 'CREATED_IN_FUR' } })))
    } else await tx.insert(s.luloMasterResources).values({ ...base, resourceType: input.kind, familyId: input.familyId, unit: input.unit, originalUnit: input.unit, historicalPrice: input.amount, dailyCost: input.kind === 'EQUIPMENT' ? input.amount : null, sourceFields: { provenance: 'CREATED_IN_FUR' } })
    await tx.insert(s.auditEvents).values({ userId: actor.id, plantId: plant.id, module: 'budget-lulo', entityType: 'plant-master', entityId: entry.id, action: 'MASTER_CREATE', newData: input })
    return entry.id
  }
  async create(plant: PlantRow, input: z.infer<typeof newMasterSchema>, actor: AuthUser) { await this.validate(plant, input); const id = await this.db.transaction(tx => this.insert(tx, plant, input, actor)); return { id } }
  async deactivate(plant: PlantRow, id: string, active: boolean, actor: AuthUser) {
    const item = await this.masters.detail(id, plant.id)
    if (item.item.plantId !== plant.id) throw new UnprocessableEntityException('La base común se conserva; solo puedes desactivar maestros creados en tu planta')
    await this.db.transaction(async tx => { if (item.kind === 'FAMILY') await tx.update(s.luloMasterFamilies).set({ active }).where(eq(s.luloMasterFamilies.id, id)); else if (item.kind === 'ITEM') await tx.update(s.luloMasterItems).set({ active }).where(eq(s.luloMasterItems.id, id)); else await tx.update(s.luloMasterResources).set({ active }).where(eq(s.luloMasterResources.id, id)); await tx.insert(s.auditEvents).values({ userId: actor.id, plantId: plant.id, module: 'budget-lulo', entityType: 'plant-master', entityId: id, action: 'MASTER_STATUS', newData: { active } }) })
    return { id, active }
  }
  async lists(plant: PlantRow) { return this.db.select().from(s.luloPriceLists).where(eq(s.luloPriceLists.plantId, plant.id)).orderBy(asc(s.luloPriceLists.name)) }
  async list(plant: PlantRow, id: string) { const [row] = await this.db.select().from(s.luloPriceLists).where(and(eq(s.luloPriceLists.plantId, plant.id), eq(s.luloPriceLists.id, id))); if (!row) throw new NotFoundException('Lista de precios no encontrada'); return row }
  async saveList(plant: PlantRow, input: z.infer<typeof priceListSchema>, id?: string, revision?: number, actor?: AuthUser) {
    return this.db.transaction(async tx => {
      const [row] = id ? await tx.select().from(s.luloPriceLists).where(and(eq(s.luloPriceLists.id, id), eq(s.luloPriceLists.plantId, plant.id))).for('update') : []
      if (id && !row) throw new NotFoundException('Lista de precios no encontrada')
      if (row && row.revision !== revision) throw new ConflictException('La lista cambió')
      if (row && row.currency !== input.currency && (await tx.select({ id: s.luloResourcePrices.id }).from(s.luloResourcePrices).where(eq(s.luloResourcePrices.listId, row.id)).limit(1)).length) throw new UnprocessableEntityException('Una lista con precios conserva su moneda')
      const [saved] = row ? await tx.update(s.luloPriceLists).set({ ...input, revision: row.revision + 1 }).where(eq(s.luloPriceLists.id, row.id)).returning() : await tx.insert(s.luloPriceLists).values({ plantId: plant.id, ...input }).returning()
      if (actor) await tx.insert(s.auditEvents).values({ userId: actor.id, plantId: plant.id, module: 'budget-lulo', entityType: 'price-list', entityId: saved.id, action: 'PRICE_LIST_SAVE', oldData: row ?? null, newData: saved })
      return saved
    })
  }
  async prices(plant: PlantRow, id: string) { await this.list(plant, id); return this.db.select({ price: s.luloResourcePrices, code: s.luloMasterResources.code, name: s.luloMasterResources.name }).from(s.luloResourcePrices).innerJoin(s.luloMasterResources, eq(s.luloResourcePrices.resourceId, s.luloMasterResources.id)).where(eq(s.luloResourcePrices.listId, id)).orderBy(desc(s.luloResourcePrices.baseDate), desc(s.luloResourcePrices.revision)).limit(5000) }
  async price(plant: PlantRow, id: string, input: z.infer<typeof priceSchema>, actor: AuthUser) {
    const list = await this.list(plant, id); if (list.status !== 'ACTIVE') throw new UnprocessableEntityException('La lista está inactiva')
    const detail = await this.masters.detail(input.resourceId, plant.id)
    if (detail.kind === 'ITEM' || detail.kind === 'FAMILY') throw new UnprocessableEntityException('Selecciona un insumo')
    if (detail.kind === 'MATERIAL' && input.costBasis !== 'UNIT' || detail.kind !== 'MATERIAL' && input.costBasis === 'UNIT') throw new UnprocessableEntityException('La base temporal es incompatible con el tipo de insumo')
    if (detail.kind === 'MATERIAL' && unitCode(input.unit) !== unitCode(detail.item.unit ?? '')) throw new UnprocessableEntityException('Expresa el precio en la unidad del insumo; las conversiones deben realizarse y documentarse antes de publicarlo')
    if (input.costBasis === 'HOUR' && unitCode(input.unit) !== 'H' || input.costBasis === 'DAY' && unitCode(input.unit) !== 'DIA') throw new UnprocessableEntityException('Usa H para tarifa horaria o DIA para tarifa diaria')
    return this.db.transaction(async tx => {
      const [current] = await tx.select().from(s.luloPriceLists).where(and(eq(s.luloPriceLists.id, id), eq(s.luloPriceLists.plantId, plant.id))).for('update')
      if (!current || current.revision !== list.revision || current.status !== 'ACTIVE') throw new ConflictException('La lista cambió mientras publicabas el precio; recárgala')
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lulo-price:${id}:${input.resourceId}:${input.baseDate}`}))`)
      const [old] = await tx.select().from(s.luloResourcePrices).where(and(eq(s.luloResourcePrices.listId, id), eq(s.luloResourcePrices.resourceId, input.resourceId), eq(s.luloResourcePrices.baseDate, input.baseDate))).orderBy(desc(s.luloResourcePrices.revision)).limit(1)
      const [saved] = await tx.insert(s.luloResourcePrices).values({ plantId: plant.id, listId: id, ...input, revision: (old?.revision ?? 0) + 1, createdBy: actor.id }).returning()
      await tx.insert(s.auditEvents).values({ userId: actor.id, plantId: plant.id, module: 'budget-lulo', entityType: 'resource-price', entityId: saved.id, action: 'PRICE_PUBLISH', newData: { ...saved, currency: list.currency } }); return saved
    })
  }
  async previewImport(plant: PlantRow, input: z.infer<typeof masterImportSchema>, actor: AuthUser, fileErrors: { row: number; message: string }[] = [], fileHash?: string, fileRows?: number) {
    const errors: { row: number; message: string }[] = [...fileErrors], seen = new Set<string>()
    for (const [index, r] of input.rows.entries()) {
      try { const key = `${r.catalogId}:${r.kind}:${r.code}`; if (seen.has(key)) throw new Error('Código repetido dentro del archivo'); seen.add(key); await this.validate(plant, r)
        const table = r.kind === 'ITEM' ? s.luloMasterItems : r.kind === 'FAMILY' ? s.luloMasterFamilies : s.luloMasterResources
        const existing = await this.db.select({ id: table.id }).from(table).where(and(eq(table.catalogId, r.catalogId), eq(table.code, r.code), or(isNull(table.plantId), eq(table.plantId, plant.id)))); if (existing.length) throw new Error('El código ya existe; corrígelo desde su ficha para conservar el historial')
      } catch (e) { errors.push({ row: index + 1, message: (e as Error).message }) }
    }
    const hash = luloHash({ input, fileHash }), result = { rows: fileRows ?? input.rows.length, valid: Math.max(0, (fileRows ?? input.rows.length) - new Set(errors.map(e => e.row)).size), mastersToCreate: input.rows.length, errors }
    const [existing] = await this.db.select().from(s.luloMasterImports).where(and(eq(s.luloMasterImports.plantId, plant.id), eq(s.luloMasterImports.hash, hash)))
    if (existing) return existing
    return (await this.db.insert(s.luloMasterImports).values({ plantId: plant.id, hash, input, result, createdBy: actor.id }).returning())[0]
  }
  async previewFile(plant: PlantRow, catalogId: string, file: Express.Multer.File, actor: AuthUser) {
    await this.masters.catalog(catalogId)
    const rows = await readMasterFile(file), families = await this.db.select().from(s.luloMasterFamilies).where(and(eq(s.luloMasterFamilies.catalogId, catalogId), or(isNull(s.luloMasterFamilies.plantId), eq(s.luloMasterFamilies.plantId, plant.id))))
    const resources = await this.db.select().from(s.luloMasterResources).where(and(eq(s.luloMasterResources.catalogId, catalogId), or(isNull(s.luloMasterResources.plantId), eq(s.luloMasterResources.plantId, plant.id))))
    const types: Record<string, string> = { MATERIAL: 'MATERIAL', EQUIPO: 'EQUIPMENT', MANO_OBRA: 'LABOR', PARTIDA: 'ITEM' }, errors: { row: number; message: string }[] = []
    const converted: z.infer<typeof newMasterSchema>[] = [], groups = new Map<string, z.infer<typeof newMasterSchema>>()
    for (const { number, values: r } of rows) try {
      const kind = types[r.tipo.toUpperCase()]; if (!kind) throw new Error('Tipo de maestro no permitido')
      const family = r.familia ? families.find(f => f.code === r.familia.toUpperCase() && f.resourceType === kind) : undefined
      if (r.familia && !family) throw new Error('No existe una familia de ese código y tipo')
      const value = newMasterSchema.parse({ catalogId, kind, code: r.codigo, name: r.descripcion, unit: r.unidad || null, amount: r.costo || '0', yieldValue: r.rendimiento || '1', familyId: family?.id ?? null, components: [] })
      if (kind === 'ITEM') {
        const resource = resources.find(i => i.code === r.codigo_insumo.toUpperCase() && i.resourceType === types[r.tipo_insumo.toUpperCase()]); if (!resource) throw new Error('No existe el insumo indicado para la composición')
        const component = z.object({ resourceId: z.uuid(), quantity: luloDecimal.refine(v => Number(v) > 0), wastePct: luloDecimal.refine(v => Number(v) <= 100) }).parse({ resourceId: resource.id, quantity: r.cantidad, wastePct: r.desperdicio || '0' })
        const existing = groups.get(value.code)
        if (existing) { if (existing.name !== value.name || existing.unit !== value.unit || existing.yieldValue !== value.yieldValue || existing.amount !== value.amount) throw new Error('La cabecera de una partida repetida debe coincidir'); existing.components.push(component) }
        else { value.components.push(component); groups.set(value.code, value); converted.push(value) }
      } else converted.push(value)
    } catch (e) { errors.push({ row: number, message: e instanceof z.ZodError ? e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : (e as Error).message }) }
    return this.previewImport(plant, { rows: converted }, actor, errors, luloHash(file.buffer.toString('base64')), rows.length)
  }
  async confirmImport(plant: PlantRow, id: string, hash: string, actor: AuthUser) {
    return this.db.transaction(async tx => {
      const [batch] = await tx.select().from(s.luloMasterImports).where(and(eq(s.luloMasterImports.plantId, plant.id), eq(s.luloMasterImports.id, id))).for('update')
      if (!batch) throw new NotFoundException('Importación no encontrada'); if (hash !== batch.hash) throw new ConflictException('La vista previa no corresponde al archivo')
      if (batch.status === 'CONFIRMED') return batch
      if ((batch.result.errors as unknown[]).length) throw new UnprocessableEntityException('Corrige las filas señaladas antes de confirmar')
      const input = masterImportSchema.parse(batch.input); for (const row of input.rows) await this.validate(plant, row)
      const ids = []; for (const row of input.rows) ids.push(await this.insert(tx, plant, row, actor))
      return (await tx.update(s.luloMasterImports).set({ status: 'CONFIRMED', result: { ...batch.result, ids } }).where(eq(s.luloMasterImports.id, id)).returning())[0]
    })
  }
}
