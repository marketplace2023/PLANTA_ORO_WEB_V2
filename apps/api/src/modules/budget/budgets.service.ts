import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { isUniqueViolation } from '../../common/db-errors'
import { validationError } from '../../common/errors'
import { escapeLike, pageOf } from '../../common/pagination'
import { nextCode } from '../../common/sequences'
import type { AppRequest, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { apus, budgetItems, budgets, chapters, projects, scenarios, users } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { type Breakdown, emptyBreakdown, itemAmount, type Rates, round2, totalsFromDirect, type Totals } from './budget-engine'
import type { ChapterDto, CreateBudgetDto, CreateProjectDto, ItemDto, ListBudgetsQuery, UpdateBudgetDto, UpdateChapterDto, UpdateItemDto, UpdateProjectDto } from './budget.schemas'
import { PricingService } from './pricing.service'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type BudgetRow = typeof budgets.$inferSelect

export type PricedItem = {
  id: string
  chapterId: string
  apuId: string
  code: string
  description: string
  unit: string
  quantity: number
  position: number
  unitPrice: number | null
  breakdown: Breakdown | null
  amount: number | null
  missingRates: string[]
  frozen: boolean
}

export const ratesOf = (b: Pick<BudgetRow, 'overheadPct' | 'utilityPct' | 'taxPct'>): Rates => ({ overheadPct: Number(b.overheadPct), utilityPct: Number(b.utilityPct), taxPct: Number(b.taxPct) })

@Injectable()
export class BudgetsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Carga y precios ----------

  async loadBudget(plant: PlantRow, id: string): Promise<BudgetRow> {
    const [b] = await this.db.select().from(budgets).where(and(eq(budgets.id, id), eq(budgets.plantId, plant.id)))
    if (!b) throw new NotFoundException('Presupuesto no encontrado')
    return b
  }

  /**
   * Partidas con su precio: en borrador, el VIGENTE de cada APU; aprobado o cerrado, el CONGELADO al aprobar
   * (así cambiar un precio del libro no altera un presupuesto aprobado).
   */
  async pricedItems(plant: PlantRow, budget: Pick<BudgetRow, 'id' | 'status'>): Promise<PricedItem[]> {
    const rows = await this.db.select().from(budgetItems).where(eq(budgetItems.budgetId, budget.id)).orderBy(asc(budgetItems.position), asc(budgetItems.code))
    const frozen = budget.status !== 'DRAFT'
    const live = frozen ? new Map() : await this.pricing.priceApus(plant.id, [...new Set(rows.map((r) => r.apuId))])
    return rows.map((r) => {
      const quantity = Number(r.quantity)
      let unitPrice: number | null = null
      let breakdown: Breakdown | null = null
      let missing: string[] = []
      if (frozen) {
        unitPrice = r.frozenUnitPrice === null ? null : Number(r.frozenUnitPrice)
        breakdown = (r.frozenBreakdown as Breakdown | null) ?? null
      } else {
        const p = live.get(r.apuId)
        if (p?.ok) {
          unitPrice = p.priced.direct
          breakdown = p.priced.breakdown
        } else if (p) missing = p.missingRates
      }
      return { id: r.id, chapterId: r.chapterId, apuId: r.apuId, code: r.code, description: r.description, unit: r.unit, quantity, position: r.position, unitPrice, breakdown, amount: unitPrice === null ? null : itemAmount(quantity, unitPrice), missingRates: missing, frozen }
    })
  }

  totals(items: PricedItem[], rates: Rates): Totals & { incomplete: boolean } {
    const direct = items.reduce((s, i) => s + (i.amount ?? 0), 0)
    return { ...totalsFromDirect(direct, rates), incomplete: items.some((i) => i.amount === null) }
  }

  // ---------- Proyectos ----------

  async listProjects(plant: PlantRow) {
    const rows = await this.db
      .select({ id: projects.id, code: projects.code, name: projects.name, description: projects.description, status: projects.status, budgets: sql<number>`(select count(*)::int from ${budgets} b where b.project_id = ${projects.id})` })
      .from(projects)
      .where(eq(projects.plantId, plant.id))
      .orderBy(asc(projects.code))
    return rows
  }

  async createProject(plant: PlantRow, dto: CreateProjectDto, req: AppRequest) {
    const [row] = await this.db
      .insert(projects)
      .values({ plantId: plant.id, ...dto })
      .returning()
      .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException(`Ya existe un proyecto con el código ${dto.code}`)) : Promise.reject(e)))
    await this.audit.record(req, { module: 'budget', entityType: 'project', entityId: row.id, plantId: plant.id, action: 'created', newData: dto })
    return { id: row.id, code: row.code, name: row.name, description: row.description, status: row.status, budgets: 0 }
  }

  async updateProject(plant: PlantRow, id: string, dto: UpdateProjectDto, req: AppRequest) {
    const [row] = await this.db.update(projects).set(dto).where(and(eq(projects.id, id), eq(projects.plantId, plant.id))).returning()
    if (!row) throw new NotFoundException('Proyecto no encontrado')
    await this.audit.record(req, { module: 'budget', entityType: 'project', entityId: id, plantId: plant.id, action: 'updated', newData: dto })
    return { id: row.id, code: row.code, name: row.name, description: row.description, status: row.status }
  }

  // ---------- Presupuestos ----------

  async list(plant: PlantRow, q: ListBudgetsQuery) {
    const conditions: Array<SQL | undefined> = [
      eq(budgets.plantId, plant.id),
      q.status === 'ALL' ? undefined : eq(budgets.status, q.status),
      q.projectId ? eq(budgets.projectId, q.projectId) : undefined,
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(budgets.code, like), ilike(budgets.name, like)))
    }
    const where = and(...conditions)
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ b: budgets, projectCode: projects.code, projectName: projects.name })
        .from(budgets)
        .innerJoin(projects, eq(projects.id, budgets.projectId))
        .where(where)
        .orderBy(desc(budgets.createdAt), asc(budgets.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(budgets).where(where),
    ])
    const items = await Promise.all(
      rows.map(async (r) => {
        const priced = await this.pricedItems(plant, r.b)
        const t = this.totals(priced, ratesOf(r.b))
        return {
          id: r.b.id,
          code: r.b.code,
          name: r.b.name,
          status: r.b.status,
          project: { id: r.b.projectId, code: r.projectCode, name: r.projectName },
          itemCount: priced.length,
          total: t.total,
          direct: t.direct,
          incomplete: t.incomplete,
          approvedAt: r.b.approvedAt,
          createdAt: r.b.createdAt,
        }
      }),
    )
    return { ...pageOf(items, total, q.page, q.pageSize), baseCurrency: await this.pricing.baseCurrency(plant.id) }
  }

  /** Presupuesto completo: capítulos → partidas, con subtotales por capítulo y el panel de totales (design.md §46). */
  async get(plant: PlantRow, id: string) {
    const b = await this.loadBudget(plant, id)
    const [project] = await this.db.select({ code: projects.code, name: projects.name }).from(projects).where(eq(projects.id, b.projectId))
    const [chs, priced, approver] = await Promise.all([
      this.db.select().from(chapters).where(eq(chapters.budgetId, id)).orderBy(asc(chapters.position), asc(chapters.code)),
      this.pricedItems(plant, b),
      b.approvedBy ? this.db.select({ f: users.firstName, l: users.lastName }).from(users).where(eq(users.id, b.approvedBy)) : Promise.resolve([]),
    ])
    const apuMeta = new Map((priced.length ? await this.db.select({ id: apus.id, code: apus.code, name: apus.name }).from(apus).where(inArray(apus.id, [...new Set(priced.map((i) => i.apuId))])) : []).map((a) => [a.id, a]))
    const rates = ratesOf(b)
    return {
      id: b.id,
      code: b.code,
      name: b.name,
      status: b.status,
      project: { id: b.projectId, ...project },
      baseCurrency: await this.pricing.baseCurrency(plant.id),
      rates,
      approvedAt: b.approvedAt,
      approvedBy: approver[0] ? [approver[0].f, approver[0].l].filter(Boolean).join(' ') : null,
      createdAt: b.createdAt,
      totals: this.totals(priced, rates),
      chapters: chs.map((c) => {
        const mine = priced.filter((i) => i.chapterId === c.id)
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          position: c.position,
          subtotal: round2(mine.reduce((s, i) => s + (i.amount ?? 0), 0)),
          items: mine.map((i) => ({ id: i.id, code: i.code, description: i.description, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice, amount: i.amount, missingRates: i.missingRates, apu: { id: i.apuId, code: apuMeta.get(i.apuId)?.code ?? '—', name: apuMeta.get(i.apuId)?.name ?? '—' } })),
        }
      }),
    }
  }

  async create(plant: PlantRow, dto: CreateBudgetDto, req: AppRequest) {
    const [project] = await this.db.select({ status: projects.status }).from(projects).where(and(eq(projects.id, dto.projectId), eq(projects.plantId, plant.id)))
    if (!project) throw validationError('projectId', 'El proyecto no existe en esta planta')
    if (project.status !== 'ACTIVE') throw validationError('projectId', 'El proyecto está cerrado')
    const created = await this.db.transaction(async (tx) => {
      const code = await nextCode(tx, plant.id, 'PRE', 'PRE')
      const [b] = await tx
        .insert(budgets)
        .values({ plantId: plant.id, projectId: dto.projectId, code, name: dto.name, overheadPct: String(dto.overheadPct), utilityPct: String(dto.utilityPct), taxPct: String(dto.taxPct), createdBy: req.user?.id })
        .returning({ id: budgets.id, code: budgets.code })
      return b
    })
    await this.audit.record(req, { module: 'budget', entityType: 'budget', entityId: created.id, plantId: plant.id, action: 'created', newData: { code: created.code, ...dto } })
    return this.get(plant, created.id)
  }

  /** Toda modificación de la estructura se hace con el presupuesto bloqueado y en borrador: aprobar en paralelo no deja cambios a medias. */
  async lockDraft(tx: Tx, plant: PlantRow, id: string): Promise<BudgetRow> {
    const [b] = await tx.select().from(budgets).where(and(eq(budgets.id, id), eq(budgets.plantId, plant.id))).for('update')
    if (!b) throw new NotFoundException('Presupuesto no encontrado')
    if (b.status !== 'DRAFT') throw new ConflictException('El presupuesto ya está aprobado y no se puede modificar: duplícalo para hacer cambios')
    return b
  }

  async update(plant: PlantRow, id: string, dto: UpdateBudgetDto, req: AppRequest) {
    const before = await this.db.transaction(async (tx) => {
      const b = await this.lockDraft(tx, plant, id)
      await tx
        .update(budgets)
        .set({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.overheadPct !== undefined && { overheadPct: String(dto.overheadPct) }),
          ...(dto.utilityPct !== undefined && { utilityPct: String(dto.utilityPct) }),
          ...(dto.taxPct !== undefined && { taxPct: String(dto.taxPct) }),
          updatedAt: new Date(),
        })
        .where(eq(budgets.id, id))
      return b
    })
    await this.audit.record(req, { module: 'budget', entityType: 'budget', entityId: id, plantId: plant.id, action: 'updated', oldData: { name: before.name, overheadPct: before.overheadPct, utilityPct: before.utilityPct, taxPct: before.taxPct }, newData: dto })
    return this.get(plant, id)
  }

  // ---------- Capítulos ----------

  async addChapter(plant: PlantRow, id: string, dto: ChapterDto, req: AppRequest) {
    await this.db.transaction(async (tx) => {
      await this.lockDraft(tx, plant, id)
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(chapters).where(eq(chapters.budgetId, id))
      await tx
        .insert(chapters)
        .values({ budgetId: id, code: dto.code, name: dto.name, position: n })
        .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException(`Ya existe un capítulo con el código ${dto.code}`)) : Promise.reject(e)))
    })
    await this.audit.record(req, { module: 'budget', entityType: 'chapter', entityId: id, plantId: plant.id, action: 'chapter.added', newData: dto })
    return this.get(plant, id)
  }

  async updateChapter(plant: PlantRow, id: string, chapterId: string, dto: UpdateChapterDto, req: AppRequest) {
    await this.db.transaction(async (tx) => {
      await this.lockDraft(tx, plant, id)
      const [c] = await tx.select().from(chapters).where(and(eq(chapters.id, chapterId), eq(chapters.budgetId, id)))
      if (!c) throw new NotFoundException('Capítulo no encontrado')
      if (dto.name !== undefined) await tx.update(chapters).set({ name: dto.name }).where(eq(chapters.id, chapterId))
      if (dto.position !== undefined) {
        const rows = await tx.select({ id: chapters.id }).from(chapters).where(eq(chapters.budgetId, id)).orderBy(asc(chapters.position), asc(chapters.code))
        const order = rows.map((r) => r.id).filter((x) => x !== chapterId)
        order.splice(Math.min(dto.position, order.length), 0, chapterId)
        for (const [i, cid] of order.entries()) await tx.update(chapters).set({ position: i }).where(eq(chapters.id, cid))
      }
    })
    await this.audit.record(req, { module: 'budget', entityType: 'chapter', entityId: chapterId, plantId: plant.id, action: 'chapter.updated', newData: dto })
    return this.get(plant, id)
  }

  async deleteChapter(plant: PlantRow, id: string, chapterId: string, req: AppRequest) {
    await this.db.transaction(async (tx) => {
      await this.lockDraft(tx, plant, id)
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(budgetItems).where(eq(budgetItems.chapterId, chapterId))
      if (n > 0) throw new ConflictException('El capítulo tiene partidas: muévelas o elimínalas primero')
      const removed = await tx.delete(chapters).where(and(eq(chapters.id, chapterId), eq(chapters.budgetId, id))).returning({ id: chapters.id })
      if (removed.length === 0) throw new NotFoundException('Capítulo no encontrado')
    })
    await this.audit.record(req, { module: 'budget', entityType: 'chapter', entityId: chapterId, plantId: plant.id, action: 'chapter.deleted' })
    return this.get(plant, id)
  }

  // ---------- Partidas ----------

  private async activeApu(tx: Tx, plant: PlantRow, apuId: string) {
    const [a] = await tx.select().from(apus).where(and(eq(apus.id, apuId), eq(apus.plantId, plant.id)))
    if (!a) throw validationError('apuId', 'El APU no existe en esta planta')
    if (a.status !== 'ACTIVE') throw validationError('apuId', 'El APU está inactivo')
    return a
  }

  async addItem(plant: PlantRow, id: string, dto: ItemDto, req: AppRequest) {
    const itemId = await this.db.transaction(async (tx) => {
      await this.lockDraft(tx, plant, id)
      const [ch] = await tx.select({ id: chapters.id }).from(chapters).where(and(eq(chapters.id, dto.chapterId), eq(chapters.budgetId, id)))
      if (!ch) throw validationError('chapterId', 'El capítulo no pertenece a este presupuesto')
      const apu = await this.activeApu(tx, plant, dto.apuId)
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(budgetItems).where(eq(budgetItems.chapterId, dto.chapterId))
      const [row] = await tx
        .insert(budgetItems)
        .values({ budgetId: id, chapterId: dto.chapterId, apuId: dto.apuId, code: dto.code, description: dto.description ?? apu.name, unit: apu.unit, quantity: String(dto.quantity), position: n })
        .returning({ id: budgetItems.id })
        .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException(`Ya existe una partida con el código ${dto.code} en este presupuesto`)) : Promise.reject(e)))
      return row.id
    })
    await this.audit.record(req, { module: 'budget', entityType: 'item', entityId: itemId, plantId: plant.id, action: 'item.added', newData: { budgetId: id, ...dto } })
    return this.get(plant, id)
  }

  async updateItem(plant: PlantRow, id: string, itemId: string, dto: UpdateItemDto, req: AppRequest) {
    await this.db.transaction(async (tx) => {
      await this.lockDraft(tx, plant, id)
      const [item] = await tx.select().from(budgetItems).where(and(eq(budgetItems.id, itemId), eq(budgetItems.budgetId, id)))
      if (!item) throw new NotFoundException('Partida no encontrada')
      const patch: Partial<typeof budgetItems.$inferInsert> = {}
      if (dto.apuId !== undefined && dto.apuId !== item.apuId) {
        const apu = await this.activeApu(tx, plant, dto.apuId)
        patch.apuId = apu.id
        patch.unit = apu.unit
      }
      if (dto.chapterId !== undefined && dto.chapterId !== item.chapterId) {
        const [ch] = await tx.select({ id: chapters.id }).from(chapters).where(and(eq(chapters.id, dto.chapterId), eq(chapters.budgetId, id)))
        if (!ch) throw validationError('chapterId', 'El capítulo no pertenece a este presupuesto')
        patch.chapterId = dto.chapterId
      }
      if (dto.description !== undefined) patch.description = dto.description
      if (dto.quantity !== undefined) patch.quantity = String(dto.quantity)
      if (Object.keys(patch).length) await tx.update(budgetItems).set(patch).where(eq(budgetItems.id, itemId))
    })
    await this.audit.record(req, { module: 'budget', entityType: 'item', entityId: itemId, plantId: plant.id, action: 'item.updated', newData: dto })
    return this.get(plant, id)
  }

  async deleteItem(plant: PlantRow, id: string, itemId: string, req: AppRequest) {
    await this.db.transaction(async (tx) => {
      await this.lockDraft(tx, plant, id)
      const removed = await tx.delete(budgetItems).where(and(eq(budgetItems.id, itemId), eq(budgetItems.budgetId, id))).returning({ id: budgetItems.id })
      if (removed.length === 0) throw new NotFoundException('Partida no encontrada')
    })
    await this.audit.record(req, { module: 'budget', entityType: 'item', entityId: itemId, plantId: plant.id, action: 'item.deleted' })
    return this.get(plant, id)
  }

  // ---------- Aprobación, cierre y copia ----------

  /** Congela precios y desglose de cada partida. Quien aprueba no puede ser quien lo creó (salvo el administrador del ecosistema). */
  async approve(plant: PlantRow, id: string, req: AppRequest) {
    await this.db.transaction(async (tx) => {
      const b = await this.lockDraft(tx, plant, id)
      if (b.createdBy && b.createdBy === req.user?.id && !req.user?.isGlobalAdmin) throw new ForbiddenException('No puedes aprobar un presupuesto que tú creaste')
      const rows = await tx.select().from(budgetItems).where(eq(budgetItems.budgetId, id))
      if (rows.length === 0) throw new ConflictException('El presupuesto no tiene partidas')
      const priced = await this.pricing.priceApus(plant.id, [...new Set(rows.map((r) => r.apuId))], tx)
      const problems: string[] = []
      for (const r of rows) {
        const p = priced.get(r.apuId)
        if (!p || !p.ok) problems.push(`${r.code}: falta el tipo de cambio de ${p && !p.ok ? p.missingRates.join(', ') : '?'}`)
        else if (!(p.priced.direct > 0)) problems.push(`${r.code}: el APU no tiene costo (agregue recursos)`)
      }
      if (problems.length) throw new ConflictException(`No se puede aprobar: ${problems.slice(0, 5).join('; ')}`)
      for (const r of rows) {
        const p = priced.get(r.apuId)!
        if (p.ok) await tx.update(budgetItems).set({ frozenUnitPrice: String(p.priced.direct), frozenBreakdown: p.priced.breakdown }).where(eq(budgetItems.id, r.id))
      }
      await tx.update(budgets).set({ status: 'APPROVED', approvedBy: req.user?.id, approvedAt: new Date(), updatedAt: new Date() }).where(eq(budgets.id, id))
    })
    await this.audit.record(req, { module: 'budget', entityType: 'budget', entityId: id, plantId: plant.id, action: 'approved' })
    return this.get(plant, id)
  }

  async close(plant: PlantRow, id: string, req: AppRequest) {
    const changed = await this.db
      .update(budgets)
      .set({ status: 'CLOSED', updatedAt: new Date() })
      .where(and(eq(budgets.id, id), eq(budgets.plantId, plant.id), eq(budgets.status, 'APPROVED')))
      .returning({ id: budgets.id })
    if (changed.length === 0) {
      await this.loadBudget(plant, id)
      throw new ConflictException('Solo se cierra un presupuesto aprobado')
    }
    await this.audit.record(req, { module: 'budget', entityType: 'budget', entityId: id, plantId: plant.id, action: 'closed' })
    return this.get(plant, id)
  }

  /** Copia a un borrador nuevo (estructura, partidas y escenarios) para trabajar una revisión sin tocar el aprobado. */
  async duplicate(plant: PlantRow, id: string, req: AppRequest) {
    const src = await this.loadBudget(plant, id)
    const copyId = await this.db.transaction(async (tx) => {
      const code = await nextCode(tx, plant.id, 'PRE', 'PRE')
      const [copy] = await tx
        .insert(budgets)
        .values({ plantId: plant.id, projectId: src.projectId, code, name: `${src.name} (copia)`.slice(0, 200), overheadPct: src.overheadPct, utilityPct: src.utilityPct, taxPct: src.taxPct, createdBy: req.user?.id })
        .returning({ id: budgets.id })
      const chs = await tx.select().from(chapters).where(eq(chapters.budgetId, id))
      const map = new Map<string, string>()
      for (const c of chs) {
        const [nc] = await tx.insert(chapters).values({ budgetId: copy.id, code: c.code, name: c.name, position: c.position }).returning({ id: chapters.id })
        map.set(c.id, nc.id)
      }
      const its = await tx.select().from(budgetItems).where(eq(budgetItems.budgetId, id))
      if (its.length) await tx.insert(budgetItems).values(its.map((i) => ({ budgetId: copy.id, chapterId: map.get(i.chapterId)!, apuId: i.apuId, code: i.code, description: i.description, unit: i.unit, quantity: i.quantity, position: i.position })))
      const scs = await tx.select().from(scenarios).where(eq(scenarios.budgetId, id))
      if (scs.length) await tx.insert(scenarios).values(scs.map((s) => ({ budgetId: copy.id, name: s.name, adjustments: s.adjustments, createdBy: req.user?.id })))
      return copy.id
    })
    await this.audit.record(req, { module: 'budget', entityType: 'budget', entityId: copyId, plantId: plant.id, action: 'duplicated', newData: { from: id } })
    return this.get(plant, copyId)
  }
}
