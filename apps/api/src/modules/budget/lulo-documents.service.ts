import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { and, desc, eq, ilike, inArray, max, sql } from 'drizzle-orm'
import type { AuthUser, PlantRow } from '../../common/types'
import { escapeLike } from '../../common/pagination'
import { nextCode } from '../../common/sequences'
import { DB, type Database } from '../../database/database.module'
import { assets, assetNetworks, plantNetworks, networkMaster, plantStages, stageMaster, auditEvents, luloDocuments, luloWorks, luloClients, luloRecalculationProposals, luloOperationRequests, luloPriceLists } from '../../database/schema'
import { uuidv7 } from '../../database/schema/common'
import { LuloCatalogService } from './lulo-catalog.service'
import { luloHash } from './lulo-hash'
import { luloValidity } from './lulo-engine'
import { type LuloInput, type luloActionSchema, type luloRefreshSchema, type luloSaveSchema } from './lulo.schemas'
import type { z } from 'zod'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type Document = typeof luloDocuments.$inferSelect

@Injectable()
export class LuloDocumentsService {
  constructor(@Inject(DB) private readonly db: Database, private readonly catalogs: LuloCatalogService) {}
  private async hydrate(plant: PlantRow, input: LuloInput): Promise<LuloInput> {
    const [priceList] = input.priceListId ? await this.db.select().from(luloPriceLists).where(and(eq(luloPriceLists.plantId, plant.id), eq(luloPriceLists.id, input.priceListId))) : []
    if (input.priceListId && (!priceList || priceList.currency !== input.currency)) throw new UnprocessableEntityException('La lista de precios no corresponde a la planta o a la moneda')
    input = { ...input, priceListSnapshot: priceList ? { id: priceList.id, name: priceList.name, currency: priceList.currency, revision: priceList.revision } : undefined }
    const ids = [...new Set(input.lines.flatMap(l => l.assetId ? [l.assetId] : []))]
    const rows = ids.length ? await this.db.select({ id: assets.id, tag: assets.tag, name: assets.name, stageCode: stageMaster.code }).from(assets).leftJoin(plantStages, eq(assets.plantStageId, plantStages.id)).leftJoin(stageMaster, eq(plantStages.stageMasterId, stageMaster.id)).where(and(eq(assets.plantId, plant.id), inArray(assets.id, ids))) : []
    if (rows.length !== ids.length) throw new UnprocessableEntityException('Un activo vinculado no pertenece a la planta')
    const networks = ids.length ? await this.db.select({ assetId: assetNetworks.assetId, code: networkMaster.code }).from(assetNetworks).innerJoin(plantNetworks, eq(assetNetworks.plantNetworkId, plantNetworks.id)).innerJoin(networkMaster, eq(plantNetworks.networkMasterId, networkMaster.id)).where(and(eq(plantNetworks.plantId, plant.id), inArray(assetNetworks.assetId, ids))) : []
    input = { ...input, lines: input.lines.map(l => { const a = rows.find(r => r.id === l.assetId); return { ...l, assetSnapshot: a ? { ...a, networkCodes: networks.filter(n => n.assetId === a.id).map(n => n.code) } : undefined } }) }
    if (!input.workId) return { ...input, workSnapshot: undefined }
    const [row] = await this.db.select({ work: luloWorks, client: luloClients }).from(luloWorks).innerJoin(luloClients, eq(luloWorks.clientId, luloClients.id)).where(and(eq(luloWorks.plantId, plant.id), eq(luloWorks.id, input.workId)))
    if (!row || row.work.status !== 'ACTIVE') throw new UnprocessableEntityException('Selecciona una obra activa de esta planta')
    return { ...input, project: row.work.name, client: row.client.name, workSnapshot: { id: row.work.id, code: row.work.code, name: row.work.name, location: row.work.location, contractReference: row.work.contractReference, clientId: row.client.id, clientName: row.client.name, taxId: row.client.taxId, address: row.client.address, contact: row.client.contact } }
  }

  private async audit(tx: Tx, actor: AuthUser, doc: Document, action: string, reason: string) {
    await tx.insert(auditEvents).values({ userId: actor.id, plantId: doc.plantId, module: 'budget-lulo', entityType: 'document', entityId: doc.id, action,
      newData: { reason, actorName: `${actor.firstName} ${actor.lastName}`, revision: doc.revision, version: doc.version, state: doc.status, contentHash: doc.contentHash } })
  }
  async get(plant: PlantRow, id: string) {
    const [doc] = await this.db.select().from(luloDocuments).where(and(eq(luloDocuments.id, id), eq(luloDocuments.plantId, plant.id)))
    if (!doc) throw new NotFoundException('Presupuesto no encontrado')
    const history = await this.db.select({ id: auditEvents.id, occurredAt: auditEvents.occurredAt, action: auditEvents.action, data: auditEvents.newData })
      .from(auditEvents).where(and(eq(auditEvents.module, 'budget-lulo'), eq(auditEvents.entityId, id))).orderBy(desc(auditEvents.occurredAt)).limit(100)
    return { ...doc, warnings: luloValidity(doc.input, doc.catalog, new Date().toISOString().slice(0, 10)), history }
  }
  async list(plant: PlantRow, page: number, search = '') {
    const where = and(eq(luloDocuments.plantId, plant.id), search ? ilike(luloDocuments.title, `%${escapeLike(search)}%`) : undefined)
    const [items, [n]] = await Promise.all([
      this.db.select({ id: luloDocuments.id, code: luloDocuments.code, title: luloDocuments.title, status: luloDocuments.status, version: luloDocuments.version, revision: luloDocuments.revision, createdAt: luloDocuments.createdAt,
        total: sql<string>`${luloDocuments.result}->'totals'->>'total'`, currency: sql<string>`${luloDocuments.input}->>'currency'`, demo: sql<boolean>`(${luloDocuments.catalog}->>'demo')::boolean` })
        .from(luloDocuments).where(where).orderBy(desc(luloDocuments.createdAt), desc(luloDocuments.id)).limit(20).offset((page - 1) * 20),
      this.db.select({ total: sql<number>`count(*)::int` }).from(luloDocuments).where(where),
    ])
    return { items, total: n.total, page, pageSize: 20 }
  }
  private async locked(tx: Tx, plant: PlantRow, id: string, revision: number, status?: string) {
    const [doc] = await tx.select().from(luloDocuments).where(and(eq(luloDocuments.id, id), eq(luloDocuments.plantId, plant.id))).for('update')
    if (!doc) throw new NotFoundException('Presupuesto no encontrado')
    if (doc.revision !== revision) throw new ConflictException('El presupuesto cambió. Recargue la revisión guardada')
    if (status && doc.status !== status) throw new ConflictException(`Esta acción requiere el estado ${status}`)
    return doc
  }
  async adopt(plant: PlantRow, requestId: string, input: LuloInput, actor: AuthUser) {
    const requestHash = luloHash(input)
    const id = await this.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lulo-adopt:${plant.id}:${requestId}`}))`)
      const [existing] = await tx.select().from(luloDocuments).where(and(eq(luloDocuments.plantId, plant.id), eq(luloDocuments.requestId, requestId)))
      if (existing) { if (existing.requestHash !== requestHash) throw new ConflictException('Esta solicitud ya se usó para otro contenido'); return existing.id }
      input = await this.hydrate(plant, input)
      const catalog = await this.catalogs.snapshot(input, undefined, plant.id)
      const { result } = this.catalogs.calculate(input, catalog, false)
      const id = uuidv7()
      const code = await nextCode(tx, plant.id, 'LULO', 'LUL')
      const [doc] = await tx.insert(luloDocuments).values({ id, groupId: id, version: 1, plantId: plant.id, code, title: input.title, input, catalog, result, requestId, requestHash,
        contentHash: luloHash({ input, catalog, result }), createdBy: actor.id }).returning()
      await this.audit(tx, actor, doc, 'ADOPT', 'Presupuesto creado desde la estimación compartida')
      return id
    })
    return this.get(plant, id)
  }
  async save(plant: PlantRow, id: string, data: z.infer<typeof luloSaveSchema>, actor: AuthUser) {
    await this.db.transaction(async tx => {
      const old = await this.locked(tx, plant, id, data.expectedRevision, 'DRAFT')
      data = { ...data, input: await this.hydrate(plant, data.input) }
      if (data.input.publicationId !== old.input.publicationId || data.input.currency !== old.input.currency) throw new UnprocessableEntityException('Use el recálculo confirmado para cambiar de publicación; la moneda de un documento se conserva')
      const catalog = await this.catalogs.snapshot(data.input, old.catalog, plant.id)
      const { result } = this.catalogs.calculate(data.input, catalog, false)
      const [doc] = await tx.update(luloDocuments).set({ input: data.input, catalog, result, title: data.input.title, revision: old.revision + 1, updatedAt: new Date(), contentHash: luloHash({ input: data.input, catalog, result }) }).where(eq(luloDocuments.id, id)).returning()
      await this.audit(tx, actor, doc, 'SAVE', data.reason)
    })
    return this.get(plant, id)
  }
  async preview(plant: PlantRow, id: string, data: z.infer<typeof luloSaveSchema>) {
    const doc = await this.get(plant, id)
    if (doc.revision !== data.expectedRevision) throw new ConflictException('El presupuesto cambió. Recargue antes de calcular')
    if (data.input.publicationId !== doc.input.publicationId || data.input.currency !== doc.input.currency) throw new UnprocessableEntityException('Use el recálculo confirmado para cambiar de publicación')
    const catalog = await this.catalogs.snapshot(data.input, doc.catalog, plant.id)
    const { result, warnings } = this.catalogs.calculate(data.input, catalog, false)
    return { catalog, result, warnings, hash: luloHash({ input: data.input, catalog, result }) }
  }
  async transition(plant: PlantRow, id: string, data: z.infer<typeof luloActionSchema>, action: 'SUBMIT' | 'RETURN' | 'ISSUE', actor: AuthUser) {
    await this.db.transaction(async tx => {
      const operation = `BUDGET_${action}:${id}`, inputHash = luloHash({ id, action, data })
      if (data.requestId) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lulo-request:${plant.id}:${data.requestId}`}))`)
        const [existing] = await tx.select().from(luloOperationRequests).where(and(eq(luloOperationRequests.plantId, plant.id), eq(luloOperationRequests.requestId, data.requestId)))
        if (existing) { if (existing.operation !== operation || existing.inputHash !== inputHash) throw new ConflictException('La solicitud ya se usó para otra operación'); return }
      }
      const old = await this.locked(tx, plant, id, data.expectedRevision, action === 'SUBMIT' ? 'DRAFT' : 'IN_REVIEW')
      if (action !== 'RETURN') this.catalogs.calculate(old.input, old.catalog)
      if (action !== 'RETURN' && luloValidity(old.input, old.catalog, new Date().toISOString().slice(0, 10)).length) throw new UnprocessableEntityException('Resuelve las partidas pendientes y confirma los precios antes de enviar o emitir')
      const status = action === 'SUBMIT' ? 'IN_REVIEW' : action === 'RETURN' ? 'DRAFT' : 'ISSUED'
      const [doc] = await tx.update(luloDocuments).set({ status, revision: old.revision + 1, updatedAt: new Date(), ...(action === 'ISSUE' ? { issuedBy: actor.id, issuedAt: new Date() } : {}) }).where(eq(luloDocuments.id, id)).returning()
      await this.audit(tx, actor, doc, action, data.reason)
      if (data.requestId) await tx.insert(luloOperationRequests).values({ plantId: plant.id, requestId: data.requestId, operation, inputHash, resultId: id })
    })
    return this.get(plant, id)
  }
  private async refreshCandidate(doc: Document, data: z.infer<typeof luloRefreshSchema>) {
    const available = new Set(doc.catalog.apus.map(a => a.id))
    if (new Set(data.apuIds).size !== data.apuIds.length || data.apuIds.some(id => !available.has(id))) throw new UnprocessableEntityException('Seleccione APU utilizados por este presupuesto')
    const current = await this.catalogs.snapshot({ ...doc.input, publicationId: data.publicationId, lines: doc.input.lines.filter(l => l.apuId && data.apuIds.includes(l.apuId)) }, undefined, doc.plantId)
    if (current.currency !== doc.catalog.currency || current.denomination !== doc.catalog.denomination || current.demo !== doc.catalog.demo) throw new UnprocessableEntityException('La nueva versión debe conservar moneda, denominación y condición de demostración')
    const selected = new Set(data.apuIds)
    const types = data.resourceTypes ?? ['MATERIAL', 'EQUIPMENT', 'LABOR']
    const apus = doc.catalog.apus.map(a => {
      if (!selected.has(a.id)) return a
      const replacement = current.apus.find(n => n.id === a.id); if (!replacement) throw new UnprocessableEntityException(`No está disponible ${a.code} en la nueva publicación`)
      if (data.replaceStructure) return replacement
      return { ...a, components: a.components.map(c => { if (!types.includes(c.resource.type)) return c; const price = replacement.components.find(n => n.resource.id === c.resource.id); if (!price) throw new UnprocessableEntityException(`No hay un precio de actualización para ${c.resource.code}`); return { ...c, resource: price.resource } }) }
    })
    const catalog = { ...current, apus }
    const input = { ...doc.input, publicationId: current.publicationId }
    const { result, warnings } = this.catalogs.calculate(input, catalog, false)
    const changes = apus.flatMap(a => { const old = doc.catalog.apus.find(o => o.id === a.id)!; return a.components.map(c => ({ apuCode: a.code, code: c.resource.code, type: c.resource.type, previous: old.components.find(o => o.resource.id === c.resource.id)?.resource.amount ?? null, next: c.resource.amount })).filter(c => c.previous !== c.next) })
    return { input, catalog, result, warnings, changes, previousTotal: doc.result.totals.total, previewHash: luloHash({ revision: doc.revision, input, catalog, result }) }
  }
  async refresh(plant: PlantRow, id: string, data: z.infer<typeof luloRefreshSchema>, actor: AuthUser, commit: boolean) {
    const output = await this.db.transaction(async tx => {
      const [scoped] = await tx.select({ id: luloDocuments.id }).from(luloDocuments).where(and(eq(luloDocuments.plantId, plant.id), eq(luloDocuments.id, id))).for('update')
      if (!scoped) throw new NotFoundException('Presupuesto no encontrado')
      if (commit && data.previewHash) {
        const [proposal] = await tx.select().from(luloRecalculationProposals).where(and(eq(luloRecalculationProposals.plantId, plant.id), eq(luloRecalculationProposals.documentId, id), eq(luloRecalculationProposals.hash, data.previewHash))).for('update')
        if (proposal?.committedRevision) return null
        if (!proposal || proposal.expiresAt.getTime() < Date.now()) throw new ConflictException('La propuesta de recálculo no existe o venció; genera una nueva vista previa')
      }
      const doc = await this.locked(tx, plant, id, data.expectedRevision, 'DRAFT')
      const candidate = await this.refreshCandidate(doc, data)
      if (!commit) {
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
        await tx.insert(luloRecalculationProposals).values({ plantId: plant.id, documentId: id, revision: doc.revision, hash: candidate.previewHash, input: candidate.input, catalog: candidate.catalog, result: candidate.result, warnings: candidate.warnings, expiresAt }).onConflictDoUpdate({ target: [luloRecalculationProposals.documentId, luloRecalculationProposals.hash], set: { expiresAt } })
        return { ...candidate, expiresAt }
      }
      if (!data.previewHash || candidate.previewHash !== data.previewHash) throw new ConflictException('Obtenga una vista previa actual antes de confirmar el recálculo')
      const [saved] = await tx.update(luloDocuments).set({ input: candidate.input, catalog: candidate.catalog, result: candidate.result, revision: doc.revision + 1, updatedAt: new Date(),
        contentHash: luloHash({ input: candidate.input, catalog: candidate.catalog, result: candidate.result }) }).where(eq(luloDocuments.id, id)).returning()
      await this.audit(tx, actor, saved, 'RECALCULATE', data.reason)
      await tx.update(luloRecalculationProposals).set({ committedRevision: saved.revision }).where(and(eq(luloRecalculationProposals.documentId, id), eq(luloRecalculationProposals.hash, data.previewHash!)))
      return null
    })
    return commit ? this.get(plant, id) : output
  }
  async revise(plant: PlantRow, id: string, data: z.infer<typeof luloActionSchema> & { requestId: string }, actor: AuthUser) {
    const newId = await this.db.transaction(async tx => {
      const [found] = await tx.select().from(luloDocuments).where(and(eq(luloDocuments.id, id), eq(luloDocuments.plantId, plant.id)))
      if (!found) throw new NotFoundException('Presupuesto no encontrado')
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lulo-family:${found.groupId}`}))`)
      const old = await this.locked(tx, plant, id, data.expectedRevision, 'ISSUED')
      const requestHash = luloHash({ predecessorId: id, reason: data.reason })
      const [existing] = await tx.select().from(luloDocuments).where(and(eq(luloDocuments.plantId, plant.id), eq(luloDocuments.requestId, data.requestId)))
      if (existing) { if (existing.requestHash !== requestHash) throw new ConflictException('La solicitud corresponde a otro contenido'); return existing.id }
      const [{ version }] = await tx.select({ version: max(luloDocuments.version) }).from(luloDocuments).where(eq(luloDocuments.groupId, old.groupId))
      const [created] = await tx.insert(luloDocuments).values({ plantId: plant.id, groupId: old.groupId, version: (version ?? 1) + 1, predecessorId: old.id, code: await nextCode(tx, plant.id, 'LULO', 'LUL'), title: old.title,
        input: old.input, catalog: old.catalog, result: old.result, contentHash: old.contentHash, requestId: data.requestId, requestHash, createdBy: actor.id }).returning()
      await this.audit(tx, actor, created, 'REVISE', data.reason)
      return created.id
    })
    return this.get(plant, newId)
  }
}
