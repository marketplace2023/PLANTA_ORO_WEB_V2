import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { AuthUser, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { auditEvents, documents, documentVersions, luloClients, luloContracts, luloContractItems, luloDocuments, luloMeasurementAssignments, luloOperationRequests, luloWorkRecords, luloWorks } from '../../database/schema'
import { uuidv7 } from '../../database/schema/common'
import { nextCode } from '../../common/sequences'
import { luloHash } from './lulo-hash'
import { LuloDocumentsService } from './lulo-documents.service'
import { accepted, reconciliation, stableItemId, unitCode, WD, workRecordResult, type WorkContext, type WorkRecord } from './lulo-works.engine'
import { clientSchema, workSchema, type createContractSchema, type createWorkRecordSchema, type transferComputationSchema, type updateWorkRecordSchema, type workActionSchema, type WorkRecordInput } from './lulo-works.schemas'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type Action = z.infer<typeof workActionSchema>
@Injectable()
export class LuloWorksService {
  constructor(@Inject(DB) private readonly db: Database, private readonly budgets: LuloDocumentsService) {}
  private async audit(tx: Tx, plant: PlantRow, actor: AuthUser, id: string, action: string, reason: string, before: unknown, after: unknown) {
    await tx.insert(auditEvents).values({ userId: actor.id, plantId: plant.id, module: 'lulo-work', entityType: 'work-document', entityId: id, action, oldData: before, newData: { reason, actorName: `${actor.firstName} ${actor.lastName}`, value: after } })
  }
  private async operation(tx: Tx, plant: PlantRow, requestId: string, operation: string, input: unknown, run: () => Promise<string>) {
    const inputHash = luloHash(input)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lulo-request:${plant.id}:${requestId}`}))`)
    const [existing] = await tx.select().from(luloOperationRequests).where(and(eq(luloOperationRequests.plantId, plant.id), eq(luloOperationRequests.requestId, requestId)))
    if (existing) { if (existing.inputHash !== inputHash || existing.operation !== operation) throw new ConflictException('La solicitud ya se usó con otro contenido'); return existing.resultId }
    const id = await run(); await tx.insert(luloOperationRequests).values({ plantId: plant.id, requestId, operation, inputHash, resultId: id }); return id
  }
  private async context(tx: Tx | Database, plant: PlantRow, id: string, lock = false): Promise<WorkContext> {
    const query = tx.select().from(luloContracts).where(and(eq(luloContracts.id, id), eq(luloContracts.plantId, plant.id)))
    const [contract] = await (lock ? query.for('update') : query)
    if (!contract) throw new NotFoundException('Contrato no encontrado')
    const items = await tx.select().from(luloContractItems).where(eq(luloContractItems.contractId, id)).orderBy(asc(luloContractItems.code))
    const records = await tx.select().from(luloWorkRecords).where(eq(luloWorkRecords.contractId, id)).orderBy(asc(luloWorkRecords.createdAt), asc(luloWorkRecords.id))
    return { contract, items, records }
  }
  private check(ctx: WorkContext, r: WorkRecord) {
    try { return workRecordResult(ctx, r) } catch (e) { if (e instanceof Error) throw new UnprocessableEntityException(e.message); throw e }
  }
  private async evidence(tx: Tx, plant: PlantRow, p: WorkRecordInput): Promise<WorkRecordInput> {
    const all = [...p.evidence, ...(p.kind === 'CLOSURE' ? p.resolutions.flatMap(r => r.evidence) : [])]
    const ids = [...new Set(all.flatMap(e => e.documentId ? [e.documentId] : []))]
    if (!ids.length) return p
    const found = await tx.select({ id: documents.id, currentVersion: documents.currentVersion }).from(documents).where(and(eq(documents.plantId, plant.id), inArray(documents.id, ids)))
    if (found.length !== ids.length) throw new UnprocessableEntityException('Un documento de evidencia no pertenece a esta planta')
    const versions = await tx.select({ documentId: documentVersions.documentId, version: documentVersions.version, checksum: documentVersions.checksum }).from(documentVersions).where(inArray(documentVersions.documentId, ids))
    const freeze = (e: WorkRecordInput['evidence'][number]) => {
      if (!e.documentId) return e
      const version = e.documentVersion ?? found.find(d => d.id === e.documentId)!.currentVersion
      const row = versions.find(v => v.documentId === e.documentId && v.version === version)
      if (!row || e.checksum && row.checksum !== e.checksum) throw new UnprocessableEntityException('La versión o huella del documento de evidencia no coincide')
      return { ...e, documentVersion: row.version, checksum: row.checksum }
    }
    return { ...p, evidence: p.evidence.map(freeze), ...(p.kind === 'CLOSURE' ? { resolutions: p.resolutions.map(r => ({ ...r, evidence: r.evidence.map(freeze) })) } : {}) } as WorkRecordInput
  }
  async clients(plant: PlantRow) { return this.db.select().from(luloClients).where(eq(luloClients.plantId, plant.id)).orderBy(asc(luloClients.name)).limit(1000) }
  async works(plant: PlantRow) { return this.db.select({ work: luloWorks, client: luloClients }).from(luloWorks).innerJoin(luloClients, eq(luloWorks.clientId, luloClients.id)).where(eq(luloWorks.plantId, plant.id)).orderBy(desc(luloWorks.createdAt)).limit(1000) }
  async saveClient(plant: PlantRow, input: z.infer<typeof clientSchema>, actor: AuthUser, id?: string, revision?: number) {
    return this.db.transaction(async tx => {
      const [old] = id ? await tx.select().from(luloClients).where(and(eq(luloClients.plantId, plant.id), eq(luloClients.id, id))).for('update') : []
      if (id && !old) throw new NotFoundException('Cliente no encontrado'); if (old && old.revision !== revision) throw new ConflictException('El cliente cambió')
      const [saved] = old ? await tx.update(luloClients).set({ ...input, revision: old.revision + 1 }).where(eq(luloClients.id, old.id)).returning() : await tx.insert(luloClients).values({ plantId: plant.id, ...input }).returning()
      await this.audit(tx, plant, actor, saved.id, 'CLIENT_SAVE', 'Mantenimiento de cliente', old ?? null, saved); return saved
    })
  }
  async saveWork(plant: PlantRow, input: z.infer<typeof workSchema>, actor: AuthUser, id?: string, revision?: number) {
    return this.db.transaction(async tx => {
      const [client] = await tx.select().from(luloClients).where(and(eq(luloClients.plantId, plant.id), eq(luloClients.id, input.clientId)))
      if (!client || client.status !== 'ACTIVE') throw new UnprocessableEntityException('Selecciona un cliente activo de esta planta')
      const [old] = id ? await tx.select().from(luloWorks).where(and(eq(luloWorks.plantId, plant.id), eq(luloWorks.id, id))).for('update') : []
      if (id && !old) throw new NotFoundException('Obra no encontrada'); if (old && old.revision !== revision) throw new ConflictException('La obra cambió')
      const [saved] = old ? await tx.update(luloWorks).set({ ...input, revision: old.revision + 1 }).where(eq(luloWorks.id, old.id)).returning() : await tx.insert(luloWorks).values({ plantId: plant.id, ...input }).returning()
      await this.audit(tx, plant, actor, saved.id, 'WORK_SAVE', 'Mantenimiento de obra', old ?? null, saved); return saved
    })
  }
  async list(plant: PlantRow) { return this.db.select().from(luloContracts).where(eq(luloContracts.plantId, plant.id)).orderBy(desc(luloContracts.createdAt)).limit(1000) }
  async get(plant: PlantRow, id: string) {
    const ctx = await this.context(this.db, plant, id)
    const history = await this.db.select().from(auditEvents).where(and(eq(auditEvents.plantId, plant.id), eq(auditEvents.module, 'lulo-work'), inArray(auditEvents.entityId, [id, ...ctx.records.map(r => r.id)]))).orderBy(desc(auditEvents.occurredAt)).limit(200)
    const assignments = await this.db.select().from(luloMeasurementAssignments).where(eq(luloMeasurementAssignments.contractId, id))
    return { ...ctx, assignments, history }
  }
  async activate(plant: PlantRow, data: z.infer<typeof createContractSchema>, actor: AuthUser) {
    const id = await this.db.transaction(tx => this.operation(tx, plant, data.requestId, 'ACTIVATE', data.input, async () => {
      const [doc] = await tx.select().from(luloDocuments).where(and(eq(luloDocuments.plantId, plant.id), eq(luloDocuments.id, data.input.documentId)))
      const [work] = await tx.select().from(luloWorks).where(and(eq(luloWorks.plantId, plant.id), eq(luloWorks.id, data.input.workId)))
      if (!doc || doc.status !== 'ISSUED' || doc.catalog.demo) throw new UnprocessableEntityException('El contrato requiere un presupuesto real emitido de esta planta')
      if (!work || work.status !== 'ACTIVE') throw new UnprocessableEntityException('Selecciona una obra activa de esta planta')
      if (doc.input.workId && doc.input.workId !== work.id) throw new UnprocessableEntityException('La obra no coincide con el presupuesto emitido')
      const [client] = await tx.select().from(luloClients).where(eq(luloClients.id, work.clientId))
      const [contract] = await tx.insert(luloContracts).values({ plantId: plant.id, workId: work.id, documentId: doc.id, code: data.input.code, name: data.input.name, currency: doc.input.currency, input: data.input, baseline: { work, client, document: doc } }).returning()
      if (new Set(doc.result.lines.map(l => l.code)).size !== doc.result.lines.length) throw new UnprocessableEntityException('El contrato requiere códigos de partida únicos')
      await tx.insert(luloContractItems).values(doc.result.lines.map(l => ({ contractId: contract.id, sourceLineId: l.id, code: l.code, name: l.description, unit: l.unit, chapter: doc.input.chapters.find(c => c.id === l.chapterId)?.name ?? '', quantity: l.quantity, price: l.price, assetId: l.assetId ?? null, taxable: l.taxable })))
      await this.audit(tx, plant, actor, contract.id, 'CONTRACT_ACTIVATE', 'Línea base contractual fijada desde presupuesto emitido', null, contract); return contract.id
    }))
    return this.get(plant, id)
  }
  async create(plant: PlantRow, contractId: string, data: z.infer<typeof createWorkRecordSchema>, actor: AuthUser) {
    const id = await this.db.transaction(tx => this.operation(tx, plant, data.requestId, `CREATE:${contractId}`, data.input, async () => {
      const ctx = await this.context(tx, plant, contractId, true)
      if (ctx.contract.status === 'CLOSED') throw new ConflictException('El contrato está cerrado; abre una rectificación del cierre')
      data = { ...data, input: await this.evidence(tx, plant, data.input) }
      const id = uuidv7(), code = await nextCode(tx, plant.id, `LULO_${data.input.kind}`, ({ COMPUTATION: 'CMP', MEASUREMENT: 'MED', CHANGE: 'CAM', VALUATION: 'VAL', SCHEDULE: 'CRO', INDEX: 'IND', PROFILE: 'PER', RECONSIDERATION: 'REC', BALANCE: 'SAL', CLOSURE: 'CIE' }[data.input.kind]))
      const row: WorkRecord = { id, contractId, kind: data.input.kind, code, title: data.input.title, reference: data.input.kind === 'MEASUREMENT' ? data.input.fieldReference : data.input.kind === 'BALANCE' ? data.input.reference : null, status: 'DRAFT', revision: 1, predecessorId: data.input.kind === 'CLOSURE' || data.input.kind === 'RECONSIDERATION' ? data.input.correctionOf : null, payload: data.input, result: {}, contentHash: '', createdBy: actor.id, approvedBy: null, issuedAt: null, createdAt: new Date(), updatedAt: new Date() }
      row.result = this.check(ctx, row); row.contentHash = luloHash({ payload: row.payload, result: row.result })
      await tx.insert(luloWorkRecords).values(row); await this.audit(tx, plant, actor, id, 'RECORD_CREATE', 'Documento de obra creado', null, row); return id
    }))
    return (await this.get(plant, contractId)).records.find(r => r.id === id)!
  }
  async update(plant: PlantRow, contractId: string, id: string, data: z.infer<typeof updateWorkRecordSchema>, actor: AuthUser) {
    await this.db.transaction(async tx => {
      const ctx = await this.context(tx, plant, contractId, true), old = ctx.records.find(r => r.id === id)
      if (!old) throw new NotFoundException('Documento de obra no encontrado')
      if (old.status !== 'DRAFT' || ctx.contract.status === 'CLOSED' || old.kind !== data.input.kind) throw new ConflictException('Solo puedes editar un borrador del mismo tipo en un contrato abierto')
      if (old.revision !== data.expectedRevision) throw new ConflictException('El documento cambió; recarga su revisión')
      data = { ...data, input: await this.evidence(tx, plant, data.input) }
      const row = { ...old, payload: data.input }, result = this.check(ctx, row)
      const [saved] = await tx.update(luloWorkRecords).set({ title: data.input.title, payload: data.input, result, revision: old.revision + 1, reference: data.input.kind === 'MEASUREMENT' ? data.input.fieldReference : data.input.kind === 'BALANCE' ? data.input.reference : null, contentHash: luloHash({ payload: data.input, result }), updatedAt: new Date() }).where(eq(luloWorkRecords.id, id)).returning()
      await this.audit(tx, plant, actor, id, 'RECORD_SAVE', data.reason, old, saved)
    })
    return (await this.get(plant, contractId)).records.find(r => r.id === id)!
  }
  async preview(plant: PlantRow, contractId: string, id: string, revision: number) {
    const ctx = await this.context(this.db, plant, contractId), r = ctx.records.find(r => r.id === id)
    if (!r) throw new NotFoundException('Documento de obra no encontrado'); if (r.revision !== revision) throw new ConflictException('El documento cambió')
    const result = accepted(r) ? r.result : this.check(ctx, r)
    return { result, previewHash: luloHash({ contractRevision: ctx.contract.revision, recordRevision: r.revision, payload: r.payload, result }) }
  }
  async action(plant: PlantRow, contractId: string, id: string, action: 'submit' | 'return' | 'approve' | 'issue', data: Action, actor: AuthUser) {
    await this.db.transaction(tx => this.operation(tx, plant, data.requestId, `${action}:${contractId}:${id}`, data, async () => {
      const ctx = await this.context(tx, plant, contractId, true), old = ctx.records.find(r => r.id === id)
      if (!old) throw new NotFoundException('Documento de obra no encontrado')
      if (old.revision !== data.expectedRevision) throw new ConflictException('El documento cambió; recarga su revisión')
      if (ctx.contract.status === 'CLOSED') throw new ConflictException('El contrato está cerrado')
      const emit = ['VALUATION', 'RECONSIDERATION', 'CLOSURE'].includes(old.kind)
      if (old.status !== (action === 'submit' ? 'DRAFT' : 'IN_REVIEW')) throw new ConflictException('La acción no corresponde al estado actual')
      if (action === 'approve' && emit || action === 'issue' && !emit) throw new ConflictException(emit ? 'Este documento debe emitirse' : 'Este documento debe aprobarse')
      const result = action === 'return' ? old.result : this.check(ctx, old)
      if (['approve', 'issue'].includes(action)) {
        const hash = luloHash({ contractRevision: ctx.contract.revision, recordRevision: old.revision, payload: old.payload, result })
        if (data.previewHash !== hash) throw new ConflictException('Revisa una vista previa actual antes de confirmar')
      }
      if (action === 'approve' && old.payload.kind === 'CHANGE') {
        const additions = old.payload.lines.flatMap((l, i) => l.type === 'NEW' ? [{ id: stableItemId(old.id, i), contractId, sourceLineId: null, code: l.code, name: l.name, unit: l.unit, chapter: 'Partidas adicionales', quantity: '0', price: l.price!, taxable: l.taxable ?? true }] : [])
        if (additions.length) await tx.insert(luloContractItems).values(additions)
      }
      if (action === 'issue' && old.payload.kind === 'VALUATION') await tx.insert(luloMeasurementAssignments).values((result.allocations as { measurementId: string; itemId: string; quantity: string }[]).map(a => ({ contractId, valuationId: id, measurementId: a.measurementId, itemId: a.itemId, quantity: a.quantity })))
      const status = action === 'submit' ? 'IN_REVIEW' : action === 'return' ? 'DRAFT' : action === 'issue' ? 'ISSUED' : 'APPROVED'
      const [saved] = await tx.update(luloWorkRecords).set({ status, result, contentHash: luloHash({ payload: old.payload, result }), revision: old.revision + 1, updatedAt: new Date(), ...(['approve', 'issue'].includes(action) ? { approvedBy: actor.id, issuedAt: new Date() } : {}) }).where(eq(luloWorkRecords.id, id)).returning()
      if (['approve', 'issue'].includes(action)) await tx.update(luloContracts).set({ revision: ctx.contract.revision + 1, updatedAt: new Date(), ...(old.kind === 'CLOSURE' ? { status: 'CLOSED' } : {}) }).where(eq(luloContracts.id, contractId))
      await this.audit(tx, plant, actor, id, `RECORD_${action.toUpperCase()}`, data.reason, old, saved); return id
    }))
    return (await this.get(plant, contractId)).records.find(r => r.id === id)!
  }
  async reconcile(plant: PlantRow, id: string, cutoff: string) { const ctx = await this.context(this.db, plant, id); try { return reconciliation(ctx, cutoff) } catch (e) { throw new UnprocessableEntityException((e as Error).message) } }
  async rectify(plant: PlantRow, contractId: string, id: string, data: Action, actor: AuthUser) {
    await this.db.transaction(tx => this.operation(tx, plant, data.requestId, `REOPEN:${id}`, data, async () => {
      const ctx = await this.context(tx, plant, contractId, true), record = ctx.records.find(r => r.id === id)
      if (!record || record.kind !== 'CLOSURE' || record.status !== 'ISSUED' || ctx.contract.status !== 'CLOSED') throw new ConflictException('Selecciona el cierre emitido del contrato cerrado')
      if (record.revision !== data.expectedRevision || ctx.records.filter(r => r.kind === 'CLOSURE' && r.status === 'ISSUED').at(-1)?.id !== id) throw new ConflictException('Solo puedes rectificar el último cierre')
      await tx.update(luloContracts).set({ status: 'REOPENED', revision: ctx.contract.revision + 1, updatedAt: new Date() }).where(eq(luloContracts.id, contractId))
      await this.audit(tx, plant, actor, id, 'CLOSURE_REOPEN', data.reason, ctx.contract, { status: 'REOPENED', predecessorId: id }); return id
    }))
    return this.get(plant, contractId)
  }
  async progress(plant: PlantRow, contractId: string, cutoff: string) {
    const ctx = await this.context(this.db, plant, contractId), view = reconciliation(ctx, cutoff)
    const schedule = ctx.records.filter(r => r.kind === 'SCHEDULE' && accepted(r)).at(-1)
    const activities = schedule?.payload.kind === 'SCHEDULE' ? schedule.payload.activities.map(a => {
      const row = view.lines.find(l => l.itemId === a.itemId)!, duration = Math.max(1, Date.parse(a.endDate) - Date.parse(a.startDate)), elapsed = Math.min(duration, Math.max(0, Date.parse(cutoff) - Date.parse(a.startDate)))
      return { ...a, plannedPct: new WD(elapsed).div(duration).mul(100).toFixed(2), actualPct: new WD(row.current).isZero() ? '0.00' : WD.min(100, new WD(row.measured).div(row.current).mul(100)).toFixed(2) }
    }) : []
    return { cutoff, scheduleId: schedule?.id ?? null, activities, physicalPct: activities.length ? activities.reduce((s, a) => s.plus(new WD(a.actualPct).mul(a.weight).div(100)), new WD(0)).toFixed(2) : null, plannedPct: activities.length ? activities.reduce((s, a) => s.plus(new WD(a.plannedPct).mul(a.weight).div(100)), new WD(0)).toFixed(2) : null, economicPct: new WD(view.currentAmount).isZero() ? '0.00' : new WD(view.balances.gross).div(view.currentAmount).mul(100).toFixed(2) }
  }
  async transfer(plant: PlantRow, contractId: string, id: string, data: z.infer<typeof transferComputationSchema>, actor: AuthUser) {
    const ctx = await this.context(this.db, plant, contractId), comp = ctx.records.find(r => r.id === id)
    if (!comp || comp.kind !== 'COMPUTATION' || !accepted(comp)) throw new UnprocessableEntityException('Selecciona un cómputo aprobado')
    const doc = await this.budgets.get(plant, data.documentId)
    if (doc.status !== 'DRAFT' || doc.revision !== data.documentRevision || doc.input.workId !== ctx.contract.workId) throw new ConflictException('Selecciona un borrador actual de la misma obra')
    const line = doc.input.lines.find(l => l.id === data.lineId)
    if (!line || unitCode(line.unit) !== String(comp.result.unit)) throw new UnprocessableEntityException('La partida destino no existe o tiene otra unidad')
    const preview = { previous: line.quantity, quantity: String(comp.result.quantity), documentId: doc.id, lineId: line.id, computationId: comp.id, revision: doc.revision }
    const hash = luloHash(preview)
    if (!data.confirm) return { ...preview, previewHash: hash }
    if (data.previewHash !== hash) throw new ConflictException('Confirma una vista previa vigente de la transferencia')
    return this.budgets.save(plant, doc.id, { expectedRevision: doc.revision, reason: data.reason, input: { ...doc.input, lines: doc.input.lines.map(l => l.id === line.id ? { ...l, quantity: preview.quantity, computationId: comp.id } : l) } }, actor)
  }
}
