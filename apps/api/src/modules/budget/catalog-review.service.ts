import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm'
import type { AuthUser } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { auditEvents, budgetCatalogReleaseEntries, budgetCatalogReleases, budgetMasterEntries, budgetMasterReviews } from '../../database/schema'
import {
  catalogReferences, initialCatalogDraft, referenceKey, validateCatalogNode,
  type CatalogAction, type CatalogEdit, type CatalogNode, type CatalogPublishInput, type CatalogReleaseInput,
} from './catalog-review.rules'

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Reader = Pick<Database, 'select'>
const today = () => new Date().toISOString().slice(0, 10)
const actorName = (u: AuthUser) => `${u.firstName} ${u.lastName}`.trim()

@Injectable()
export class CatalogReviewService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async source(id: string) {
    const [source] = await this.db.select().from(budgetMasterEntries).where(eq(budgetMasterEntries.id, id))
    if (!source) throw new NotFoundException('Maestro no encontrado')
    return source
  }

  /** All mutations of one batch are serialized, including approvals of dependent rows and publication. */
  private async lock(tx: Transaction, batchId: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lulo-review:${batchId}`}))`)
  }

  private async graph(db: Reader, batchId: string, roots: string[]) {
    const graph = new Map<string, CatalogNode>()
    const byId = new Map<string, CatalogNode>()
    const requested = new Set<string>()
    const add = (rows: Awaited<ReturnType<typeof query>>) => {
      for (const { source, review } of rows) {
        const node: CatalogNode = {
          source, revision: review?.revision ?? 0, state: review?.state ?? 'DRAFT',
          draft: review?.draft ?? initialCatalogDraft(source), dependencies: review?.dependencies ?? {},
        }
        graph.set(referenceKey(source), node)
        byId.set(source.id, node)
      }
    }
    const query = (ids: string[], bySource: boolean) => db.select({ source: budgetMasterEntries, review: budgetMasterReviews })
      .from(budgetMasterEntries).leftJoin(budgetMasterReviews, eq(budgetMasterReviews.entryId, budgetMasterEntries.id))
      .where(and(eq(budgetMasterEntries.batchId, batchId), inArray(bySource ? budgetMasterEntries.sourceId : budgetMasterEntries.id, ids)))
    add(await query(roots, false))
    if (roots.some(id => !byId.has(id))) throw new NotFoundException('Hay maestros inexistentes o ajenos al lote')
    for (;;) {
      const refs = [...byId.values()].flatMap(catalogReferences).filter(r => !graph.has(referenceKey(r)) && !requested.has(referenceKey(r)))
      if (!refs.length) break
      for (const ref of refs) requested.add(referenceKey(ref))
      const wanted = new Set(refs.map(referenceKey))
      const sourceIds = [...new Set(refs.map(r => r.sourceId))]
      for (let i = 0; i < sourceIds.length; i += 1000) add((await query(sourceIds.slice(i, i + 1000), true)).filter(row => wanted.has(referenceKey(row.source))))
      if (byId.size > 20000) throw new UnprocessableEntityException('Seleccione una versión piloto más pequeña')
    }
    return { graph, byId }
  }

  private async audit(tx: Transaction, u: AuthUser, id: string, action: string, reason: string, oldData: unknown, value: unknown) {
    await tx.insert(auditEvents).values({ userId: u.id, module: 'budget-catalog', entityType: 'master-review', entityId: id, action,
      oldData, newData: { reason, actorName: actorName(u), value } })
  }

  async review(id: string) {
    const original = await this.source(id)
    const { graph, byId } = await this.graph(this.db, original.batchId, [id])
    const node = byId.get(id)!
    return {
      original, revision: node.revision, state: node.state, draft: node.draft,
      blockers: validateCatalogNode(node, graph, today()),
      dependencies: [...new Map(catalogReferences(node).map(ref => {
        const dep = graph.get(referenceKey(ref))
        return [referenceKey(ref), dep ? { id: dep.source.id, sourceId: dep.source.sourceId, resourceType: dep.source.resourceType, code: dep.source.code, name: dep.draft.name, kind: dep.source.kind, revision: dep.revision, state: dep.state } : { id: null, sourceId: ref.sourceId, resourceType: ref.resourceType, code: ref.sourceId, name: 'Referencia inexistente', kind: ref.kind, revision: 0, state: 'MISSING' }]
      })).values()],
    }
  }

  async summary(batchId: string) {
    return this.db.select({ state: sql<string>`coalesce(${budgetMasterReviews.state}, 'DRAFT')`, count: sql<number>`count(*)::int` })
      .from(budgetMasterEntries).leftJoin(budgetMasterReviews, eq(budgetMasterReviews.entryId, budgetMasterEntries.id))
      .where(eq(budgetMasterEntries.batchId, batchId)).groupBy(sql`coalesce(${budgetMasterReviews.state}, 'DRAFT')`)
  }

  async history(id: string, page: number) {
    await this.source(id)
    return this.db.select({ id: auditEvents.id, occurredAt: auditEvents.occurredAt, userId: auditEvents.userId, action: auditEvents.action, oldData: auditEvents.oldData, newData: auditEvents.newData })
      .from(auditEvents).where(and(eq(auditEvents.module, 'budget-catalog'), eq(auditEvents.entityId, id)))
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id)).limit(20).offset((page - 1) * 20)
  }

  async edit(id: string, input: CatalogEdit, user: AuthUser) {
    const source = await this.source(id)
    return this.db.transaction(async tx => {
      await this.lock(tx, source.batchId)
      const [old] = await tx.select().from(budgetMasterReviews).where(eq(budgetMasterReviews.entryId, id))
      if ((old?.revision ?? 0) !== input.expectedRevision) throw new ConflictException('Otro administrador modificó el registro. Recargue antes de guardar')
      const value = { revision: input.expectedRevision + 1, state: 'DRAFT', draft: input.draft, dependencies: {}, actorId: user.id, actorName: actorName(user), updatedAt: new Date() }
      await tx.insert(budgetMasterReviews).values({ entryId: id, ...value }).onConflictDoUpdate({ target: budgetMasterReviews.entryId, set: value })
      await this.audit(tx, user, id, 'EDIT', input.reason, old ?? { revision: 0, draft: initialCatalogDraft(source) }, value)
      return { revision: value.revision, state: value.state }
    })
  }

  async approve(id: string, input: CatalogAction, user: AuthUser) {
    const source = await this.source(id)
    return this.db.transaction(async tx => {
      await this.lock(tx, source.batchId)
      const { graph, byId } = await this.graph(tx, source.batchId, [id])
      const node = byId.get(id)!
      if (node.revision !== input.expectedRevision) throw new ConflictException('La revisión cambió. Recargue antes de aprobar')
      // A stale approval can be renewed, but dependencies must be valid in their current revision.
      const blockers = validateCatalogNode({ ...node, state: 'DRAFT' }, graph, today())
      if (blockers.length) throw new UnprocessableEntityException({ message: blockers.slice(0, 20).join('; '), blockers })
      if (node.state === 'APPROVED' && !validateCatalogNode(node, graph, today()).length) return { revision: node.revision, state: node.state }
      const dependencies = Object.fromEntries(catalogReferences(node).map(ref => { const d = graph.get(referenceKey(ref))!; return [d.source.id, d.revision] }))
      const value = { revision: node.revision + 1, state: 'APPROVED', draft: node.draft, dependencies, actorId: user.id, actorName: actorName(user), updatedAt: new Date() }
      await tx.insert(budgetMasterReviews).values({ entryId: id, ...value }).onConflictDoUpdate({ target: budgetMasterReviews.entryId, set: value })
      await this.audit(tx, user, id, 'APPROVE', input.reason, node, value)
      return { revision: value.revision, state: value.state }
    })
  }

  async releases(batchId: string) {
    return this.db.select().from(budgetCatalogReleases).where(eq(budgetCatalogReleases.batchId, batchId)).orderBy(desc(budgetCatalogReleases.version)).limit(100)
  }

  async release(id: string, page: number) {
    const [release] = await this.db.select().from(budgetCatalogReleases).where(eq(budgetCatalogReleases.id, id))
    if (!release) throw new NotFoundException('Versión no encontrada')
    const items = await this.db.select().from(budgetCatalogReleaseEntries).where(eq(budgetCatalogReleaseEntries.releaseId, id))
      .orderBy(asc(budgetCatalogReleaseEntries.code), asc(budgetCatalogReleaseEntries.entryId)).limit(30).offset((page - 1) * 30)
    const events = await this.db.select({ id: auditEvents.id, occurredAt: auditEvents.occurredAt, action: auditEvents.action, data: auditEvents.newData })
      .from(auditEvents).where(and(eq(auditEvents.module, 'budget-catalog'), eq(auditEvents.entityId, id)))
      .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id)).limit(20)
    return { ...release, items, events, page, pageSize: 30 }
  }

  private validateSelection(nodes: CatalogNode[], graph: Map<string, CatalogNode>) {
    const codes = nodes.map(n => JSON.stringify([n.source.kind, n.source.resourceType, n.source.code]))
    if (new Set(codes).size !== codes.length) throw new UnprocessableEntityException('Seleccione una sola variante por código de maestro en cada versión')
    const errors = nodes.flatMap(node => [
      ...(node.state !== 'APPROVED' ? [`${node.source.code}: falta la aprobación`] : []),
      ...validateCatalogNode(node, graph, today()).map(e => `${node.source.code}: ${e}`),
    ])
    if (errors.length) throw new UnprocessableEntityException({ message: errors.slice(0, 20).join('; '), blockerCount: errors.length })
    const prices = nodes.filter(n => n.source.kind === 'RESOURCE').map(n => n.draft.price!)
    const currencies = new Set(prices.map(p => `${p.currency}:${p.denomination}`))
    if (currencies.size > 1) throw new UnprocessableEntityException('Una versión piloto debe usar la misma moneda y denominación; no se convierte moneda automáticamente')
  }

  async prepare(batchId: string, input: CatalogReleaseInput, user: AuthUser) {
    return this.db.transaction(async tx => {
      await this.lock(tx, batchId)
      const { graph, byId } = await this.graph(tx, batchId, input.entryIds)
      const nodes = [...byId.values()].sort((a, b) => a.source.id.localeCompare(b.source.id))
      this.validateSelection(nodes, graph)
      const entries = nodes.map(n => ({ entryId: n.source.id, revision: n.revision, kind: n.source.kind, resourceType: n.source.resourceType, code: n.source.code, name: n.draft.name,
        snapshot: { sourceId: n.source.sourceId, sourceContext: n.source.sourceContext, draft: n.draft, dependencies: n.dependencies } }))
      const rootIds = [...input.entryIds].sort()
      const contentHash = createHash('sha256').update(JSON.stringify({ usage: 'REFERENCE_ONLY', name: input.name, rootIds, entries })).digest('hex')
      const [existing] = await tx.select().from(budgetCatalogReleases).where(and(eq(budgetCatalogReleases.batchId, batchId), eq(budgetCatalogReleases.contentHash, contentHash)))
      if (existing) return existing
      const [{ version }] = await tx.select({ version: max(budgetCatalogReleases.version) }).from(budgetCatalogReleases).where(eq(budgetCatalogReleases.batchId, batchId))
      const [release] = await tx.insert(budgetCatalogReleases).values({ batchId, version: (version ?? 0) + 1, name: input.name, contentHash, rootIds, entryCount: entries.length, createdBy: user.id }).returning()
      for (let i = 0; i < entries.length; i += 200) await tx.insert(budgetCatalogReleaseEntries).values(entries.slice(i, i + 200).map(e => ({ ...e, releaseId: release.id })))
      await this.audit(tx, user, release.id, 'PREPARE_RELEASE', input.reason, null, { batchId, version: release.version, contentHash, entryCount: entries.length, rootIds })
      return release
    })
  }

  async publish(id: string, input: CatalogPublishInput, user: AuthUser) {
    const [source] = await this.db.select().from(budgetCatalogReleases).where(eq(budgetCatalogReleases.id, id))
    if (!source) throw new NotFoundException('Versión no encontrada')
    return this.db.transaction(async tx => {
      await this.lock(tx, source.batchId)
      const [release] = await tx.select().from(budgetCatalogReleases).where(eq(budgetCatalogReleases.id, id))
      if (release.contentHash !== input.expectedHash) throw new ConflictException('La huella de la versión no coincide')
      if (release.state === 'PUBLISHED') return release
      const snapshots = await tx.select().from(budgetCatalogReleaseEntries).where(eq(budgetCatalogReleaseEntries.releaseId, id))
      const { graph, byId } = await this.graph(tx, release.batchId, snapshots.map(e => e.entryId))
      if (snapshots.some(e => byId.get(e.entryId)?.revision !== e.revision)) throw new ConflictException('Los maestros cambiaron después de preparar esta versión. Prepare una nueva')
      this.validateSelection([...byId.values()], graph)
      const [published] = await tx.update(budgetCatalogReleases).set({ state: 'PUBLISHED', publishedAt: new Date(), publishedBy: user.id })
        .where(eq(budgetCatalogReleases.id, id)).returning()
      await this.audit(tx, user, id, 'PUBLISH_RELEASE', input.reason, { state: release.state }, { version: release.version, contentHash: release.contentHash, usage: release.usage })
      return published
    })
  }
}
