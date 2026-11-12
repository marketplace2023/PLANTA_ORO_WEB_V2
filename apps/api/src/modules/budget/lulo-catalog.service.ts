import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { AuthUser } from '../../common/types'
import { escapeLike } from '../../common/pagination'
import { DB, type Database } from '../../database/database.module'
import { auditEvents, budgetCatalogReleaseEntries, budgetCatalogReleases, budgetMasterBatches, budgetPublications } from '../../database/schema'
import { LULO_PROFILE, type LuloInput } from './lulo.schemas'
import { calculateLulo, luloValidity, type LuloApu, type LuloCatalog, type LuloResource } from './lulo-engine'
import { LuloMastersService, masterListSchema } from './lulo-masters.service'

type ReleaseEntry = typeof budgetCatalogReleaseEntries.$inferSelect
type Publication = typeof budgetPublications.$inferSelect

export function projectLuloCatalog(rows: ReleaseEntry[], publication: Pick<Publication, 'id' | 'label' | 'demo'>, release: { version: number; contentHash: string }): LuloCatalog {
  const resources = new Map(rows.filter(r => r.kind === 'RESOURCE').map(r => [JSON.stringify([r.resourceType, r.snapshot.sourceId]), r]))
  const apus: LuloApu[] = rows.filter(r => r.kind === 'APU').map(row => {
    const a = row.snapshot.draft
    if (!a.unit || !a.yieldValue || !a.yieldBasis || !a.composition.length) throw new Error(`Revise la base y composición de ${row.code}`)
    const components = a.composition.map(c => {
      const resource = resources.get(JSON.stringify([c.resourceType, c.resourceSourceId]))
      if (!resource?.snapshot.draft.price || !resource.snapshot.draft.unit) throw new Error(`Falta el insumo aprobado de ${row.code}`)
      const r = resource.snapshot.draft; const p = r.price!
      const projected: LuloResource = { id: resource.entryId, code: resource.code, name: resource.name, type: c.resourceType, unit: r.unit!, amount: p.amount, costBasis: p.costBasis, currency: p.currency, denomination: p.denomination,
        baseDate: p.baseDate, validUntil: p.validUntil, evidence: 'Precio verificado en la publicación del catálogo' }
      if ((a.yieldBasis === 'HOUR' && p.costBasis === 'DAY' || a.yieldBasis === 'DAY' && p.costBasis === 'HOUR') && (!a.hoursPerDay || Number(a.hoursPerDay) <= 0)) throw new Error(`Defina la jornada para convertir tarifas de ${row.code}`)
      return { resource: projected, quantity: c.quantity, wastePct: c.wastePct ?? '0' }
    })
    return { id: row.entryId, code: row.code, name: row.name, unit: a.unit, yieldValue: a.yieldValue, yieldBasis: a.yieldBasis, hoursPerDay: a.hoursPerDay, methodNote: a.methodNote, publicationId: publication.id, components }
  })
  if (!apus.length) throw new Error('La versión necesita al menos un APU completo para calcular')
  const price = apus[0].components[0].resource
  if (apus.flatMap(a => a.components).some(c => c.resource.currency !== price.currency || c.resource.denomination !== price.denomination)) throw new Error('La versión contiene monedas o denominaciones incompatibles')
  return { profile: LULO_PROFILE, publicationId: publication.id, label: publication.label, version: release.version, demo: publication.demo, currency: price.currency, denomination: price.denomination, hash: release.contentHash, apus }
}

@Injectable()
export class LuloCatalogService {
  constructor(@Inject(DB) private readonly db: Database, private readonly masters: LuloMastersService) {}

  async publications(admin = false) {
    const rows = await this.db.select({ p: budgetPublications, version: budgetCatalogReleases.version, hash: budgetCatalogReleases.contentHash })
      .from(budgetPublications).innerJoin(budgetCatalogReleases, eq(budgetCatalogReleases.id, budgetPublications.releaseId))
      .where(and(eq(budgetCatalogReleases.state, 'PUBLISHED'), admin ? undefined : eq(budgetPublications.active, true)))
      .orderBy(asc(budgetPublications.demo), desc(budgetPublications.createdAt)).limit(100)
    const publications = rows.map(({ p, version, hash }) => ({ id: p.id, label: p.label, version, demo: p.demo, active: p.active, profile: p.profile, hash, historical: false, ...(admin ? { releaseId: p.releaseId } : {}) }))
    const shared = admin ? [] : (await this.masters.catalogs()).map(c => ({ id: c.id, label: c.name, version: 1, demo: false, active: true, profile: LULO_PROFILE, hash: c.sourceHash, historical: true }))
    return [...shared, ...publications]
  }

  async catalog(id: string, currency?: string, plantId?: string, apuIds?: string[]): Promise<LuloCatalog> {
    if (await this.masters.exists(id)) {
      if (!currency || !apuIds?.length) throw new UnprocessableEntityException('Seleccione partidas y la moneda del documento para usar los maestros originales')
      return this.masters.snapshot(id, apuIds, currency, plantId)
    }
    const [r] = await this.db.select({ p: budgetPublications, release: budgetCatalogReleases }).from(budgetPublications)
      .innerJoin(budgetCatalogReleases, eq(budgetCatalogReleases.id, budgetPublications.releaseId))
      .where(and(eq(budgetPublications.id, id), eq(budgetPublications.active, true), eq(budgetCatalogReleases.state, 'PUBLISHED')))
    if (!r) throw new NotFoundException('Publicación no disponible')
    const rows = await this.db.select().from(budgetCatalogReleaseEntries).where(eq(budgetCatalogReleaseEntries.releaseId, r.p.releaseId))
    try { return projectLuloCatalog(rows, r.p, r.release) } catch (e) { throw new UnprocessableEntityException((e as Error).message) }
  }

  async search(id: string, page: number, search = '') {
    if (await this.masters.exists(id)) {
      const result = await this.masters.list(masterListSchema.parse({ catalogId: id, kind: 'ITEM', page, search }))
      return { ...result, items: result.items.map(r => { const i = r as { id: string; code: string; name: string; unit: string | null; price: string; issues: string[] }; return { ...i, originalUnitPrice: i.price, historical: true } }), currency: null, denomination: 'Sin confirmar en el archivo original', label: result.catalog.name, demo: false, historical: true }
    }
    const [p] = await this.db.select().from(budgetPublications).where(and(eq(budgetPublications.id, id), eq(budgetPublications.active, true)))
    if (!p) throw new NotFoundException('Publicación no disponible')
    const pattern = `%${escapeLike(search)}%`
    const where = and(eq(budgetCatalogReleaseEntries.releaseId, p.releaseId), eq(budgetCatalogReleaseEntries.kind, 'APU'), search ? or(ilike(budgetCatalogReleaseEntries.code, pattern), ilike(budgetCatalogReleaseEntries.name, pattern)) : undefined)
    const [items, [count]] = await Promise.all([
      this.db.select({ id: budgetCatalogReleaseEntries.entryId, code: budgetCatalogReleaseEntries.code, name: budgetCatalogReleaseEntries.name, unit: sql<string>`${budgetCatalogReleaseEntries.snapshot}->'draft'->>'unit'` })
        .from(budgetCatalogReleaseEntries).where(where).orderBy(asc(budgetCatalogReleaseEntries.code)).limit(20).offset((page - 1) * 20),
      this.db.select({ total: sql<number>`count(*)::int` }).from(budgetCatalogReleaseEntries).where(where),
    ])
    // No recovered source blobs, actor data or contextual project identifiers are exposed.
    const catalog = await this.catalog(id)
    return { items, total: count.total, page, pageSize: 20, currency: catalog.currency, denomination: catalog.denomination, label: catalog.label, demo: catalog.demo }
  }

  async snapshot(input: LuloInput, frozen?: LuloCatalog, plantId?: string) {
    const ids = new Set(input.lines.filter(l => l.mode !== 'MANUAL' && !l.pendingReason?.trim()).map(l => l.apuId!))
    if (!plantId && (input.workId || input.priceListId || input.lines.some(l => l.assetId || l.computationId))) throw new UnprocessableEntityException('Las referencias privadas de obra, precios y activos se resuelven dentro de planta')
    if (input.publicationId && await this.masters.exists(input.publicationId)) {
      if (frozen?.publicationId === input.publicationId && [...ids].every(id => frozen.apus.some(a => a.id === id))) return { ...frozen, apus: frozen.apus.filter(a => ids.has(a.id)) }
      const catalog = ids.size ? await this.masters.snapshot(input.publicationId, [...ids], input.currency, plantId, input.priceListId, input.baseDate) : { profile: LULO_PROFILE, publicationId: input.publicationId, label: (await this.masters.catalog(input.publicationId)).name, version: 1, demo: false, currency: input.currency, denomination: 'Moneda declarada en el documento; origen histórico', hash: (await this.masters.catalog(input.publicationId)).sourceHash, apus: [], historical: true } satisfies LuloCatalog
      return frozen?.publicationId === input.publicationId ? { ...catalog, apus: catalog.apus.map(a => frozen.apus.find(f => f.id === a.id) ?? a) } : catalog
    }
    if (!ids.size) {
      const context = frozen ?? (input.publicationId ? await this.catalog(input.publicationId) : null)
      if (context && context.currency !== input.currency) throw new UnprocessableEntityException('La moneda debe coincidir con la publicación seleccionada')
      return { profile: LULO_PROFILE, publicationId: input.publicationId, label: context?.label ?? 'Partidas manuales', version: context?.version ?? 0, demo: context?.demo ?? false, currency: input.currency, denomination: context?.denomination ?? input.currency, hash: context?.hash ?? 'MANUAL', apus: [] } satisfies LuloCatalog
    }
    if (!input.publicationId) throw new UnprocessableEntityException('Seleccione una publicación del catálogo')
    let catalog = frozen
    if (!catalog || catalog.publicationId !== input.publicationId || [...ids].some(id => !catalog!.apus.some(a => a.id === id))) {
      const live = await this.catalog(input.publicationId)
      catalog = frozen && frozen.publicationId === live.publicationId ? { ...frozen, apus: [...frozen.apus, ...live.apus.filter(a => !frozen.apus.some(old => old.id === a.id))] } : live
    }
    const apus = catalog.apus.filter(a => ids.has(a.id))
    if (apus.length !== ids.size) throw new UnprocessableEntityException('Hay partidas que no pertenecen a la publicación seleccionada')
    if (catalog.currency !== input.currency) throw new UnprocessableEntityException('La moneda del presupuesto debe coincidir con el catálogo')
    return { ...catalog, apus }
  }

  calculate(input: LuloInput, catalog: LuloCatalog, requireCurrent = true) {
    try {
      const warnings = luloValidity(input, catalog, new Date().toISOString().slice(0, 10))
      if (requireCurrent && catalog.historical && warnings.some(w => !w.startsWith('Partida pendiente')) && !input.referenceMode) throw new Error('Confirma el uso referencial de los valores históricos y la moneda del documento')
      if (requireCurrent && warnings.some(w => !w.startsWith('Partida pendiente')) && !catalog.historical) throw new Error(warnings.join('; '))
      return { result: calculateLulo(input, catalog), warnings }
    } catch (e) { throw new UnprocessableEntityException((e as Error).message) }
  }

  async activate(releaseId: string, data: { expectedHash: string; label: string; reason: string }, actor: AuthUser) {
    return this.db.transaction(async tx => {
      const [release] = await tx.select().from(budgetCatalogReleases).where(eq(budgetCatalogReleases.id, releaseId)).for('update')
      if (!release || release.state !== 'PUBLISHED') throw new ConflictException('Primero publique la versión revisada en Admin')
      if (release.contentHash !== data.expectedHash) throw new ConflictException('La huella de la versión cambió')
      const rows = await tx.select().from(budgetCatalogReleaseEntries).where(eq(budgetCatalogReleaseEntries.releaseId, releaseId))
      let catalog: LuloCatalog
      try { catalog = projectLuloCatalog(rows, { id: release.id, label: data.label, demo: false }, release) } catch (e) { throw new UnprocessableEntityException((e as Error).message) }
      // Validate every published APU against the calculation profile before enabling this specific release.
      const today = new Date().toISOString().slice(0, 10)
      for (const a of catalog.apus) {
        const input: LuloInput = { title: 'Validación', project: '', client: '', notes: '', publicationId: release.id, currency: catalog.currency, precision: 2, rates: { fcasPct: '0', overheadPct: '0', utilityPct: '0', financePct: '0', taxPct: '0' }, chapters: [{ id: 'c', name: 'Validación', parentId: null }], overrides: [], lines: [{ id: 'l', chapterId: 'c', mode: 'CALCULATED', apuId: a.id, code: a.code, description: a.name, unit: a.unit, quantity: '1', manualPrice: null, reason: '', taxable: true }] }
        const warnings = luloValidity(input, catalog, today)
        if (warnings.length) throw new UnprocessableEntityException(warnings.join('; '))
        this.calculate(input, catalog)
      }
      const [previous] = await tx.select().from(budgetPublications).where(eq(budgetPublications.releaseId, releaseId))
      if (previous?.active) return previous
      const [batch] = await tx.select().from(budgetMasterBatches).where(eq(budgetMasterBatches.id, release.batchId))
      const demo = batch.source.startsWith('DEMO')
      const [p] = previous ? await tx.update(budgetPublications).set({ active: true }).where(eq(budgetPublications.id, previous.id)).returning()
        : await tx.insert(budgetPublications).values({ releaseId, label: data.label, profile: LULO_PROFILE, demo, createdBy: actor.id }).returning()
      await tx.insert(auditEvents).values({ userId: actor.id, module: 'budget-lulo', entityType: 'publication', entityId: p.id, action: 'ACTIVATE', newData: { reason: data.reason, releaseId, hash: release.contentHash } })
      return p
    })
  }

  async withdraw(id: string, reason: string, actor: AuthUser) {
    const [p] = await this.db.update(budgetPublications).set({ active: false }).where(eq(budgetPublications.id, id)).returning()
    if (!p) throw new NotFoundException('Publicación no encontrada')
    await this.db.insert(auditEvents).values({ userId: actor.id, module: 'budget-lulo', entityType: 'publication', entityId: id, action: 'WITHDRAW', newData: { reason } })
    return { id: p.id, active: false }
  }
}
