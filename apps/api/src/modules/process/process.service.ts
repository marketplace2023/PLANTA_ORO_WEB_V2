import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm'
import { isUniqueViolation } from '../../common/db-errors'
import { validationError } from '../../common/errors'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import {
  assetNetworks,
  assets,
  networkMaster,
  plantNetworks,
  plantSettings,
  plantStages,
  stageConnections,
  stageMaster,
  workOrders,
} from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { AuthzService } from '../iam/authz.service'
import { OPEN_STATUSES as OPEN_WORK_ORDER_STATUSES } from '../maintenance/workflow'
import { PlantsService } from '../plants/plants.service'
import type { CreateConnectionDto } from './process.schemas'

/** Estados que piden atención del equipo (design.md §37): se resumen aparte del conteo por estado. */
const ATTENTION = ['CRITICAL', 'OUT_OF_SERVICE', 'REPAIR', 'MAINTENANCE'] as const

type Scope = { internal: boolean; canSeeAssets: boolean; canSeeMaintenance: boolean; publicOnly: boolean }

@Injectable()
export class ProcessService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly plants: PlantsService,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Qué puede ver quien consulta. Interno = plant.read; los visitantes ven solo lo publicado: sus conteos de activos
   * incluyen únicamente activos públicos y solo si la planta publica sus activos.
   */
  private async scope(plant: PlantRow, user: AuthUser | undefined): Promise<Scope> {
    const access = await this.authz.access(user, plant.id)
    const internal = access.permissions.has('plant.read')
    const [settings] = await this.db.select().from(plantSettings).where(eq(plantSettings.plantId, plant.id)).limit(1)
    const canSeeAssets = access.permissions.has('asset.read') || !!settings?.publicAssets
    return {
      internal,
      canSeeAssets,
      canSeeMaintenance: access.permissions.has('maintenance.read'),
      publicOnly: !access.permissions.has('asset.read'),
    }
  }

  private assetFilter(plantId: string, scope: Scope): SQL {
    return and(eq(assets.plantId, plantId), ne(assets.status, 'DECOMMISSIONED'), scope.publicOnly ? eq(assets.isPublic, true) : undefined) as SQL
  }

  // ---------- Procesos ----------

  async overview(ref: string, user: AuthUser | undefined) {
    const plant = await this.plants.getVisible(ref, user)
    const scope = await this.scope(plant, user)
    const [settings] = await this.db.select().from(plantSettings).where(eq(plantSettings.plantId, plant.id)).limit(1)
    // Visitantes: solo si la planta publica sus procesos (misma regla que el listado de etapas).
    if (!scope.internal && !settings?.publicProcesses) return { stages: [], connections: [], totals: null }

    const stageRows = await this.db
      .select({
        id: plantStages.id,
        code: stageMaster.code,
        name: stageMaster.name,
        nameOverride: plantStages.nameOverride,
        stageGroup: stageMaster.stageGroup,
        colorToken: stageMaster.colorToken,
        sequence: plantStages.sequence,
        isPublic: plantStages.isPublic,
      })
      .from(plantStages)
      .innerJoin(stageMaster, eq(stageMaster.id, plantStages.stageMasterId))
      .where(and(eq(plantStages.plantId, plant.id), eq(plantStages.isEnabled, true), scope.internal ? undefined : eq(plantStages.isPublic, true)))
      .orderBy(asc(plantStages.sequence))
    const ids = stageRows.map((s) => s.id)

    const counts = new Map<string, Record<string, number>>()
    const criticals = new Map<string, number>()
    if (scope.canSeeAssets && ids.length) {
      const rows = await this.db
        .select({ stageId: assets.plantStageId, status: assets.status, criticality: assets.criticality, n: sql<number>`count(*)::int` })
        .from(assets)
        .where(and(this.assetFilter(plant.id, scope), inArray(assets.plantStageId, ids)))
        .groupBy(assets.plantStageId, assets.status, assets.criticality)
      for (const r of rows) {
        if (!r.stageId) continue
        const byStatus = counts.get(r.stageId) ?? {}
        byStatus[r.status] = (byStatus[r.status] ?? 0) + r.n
        counts.set(r.stageId, byStatus)
        if (r.criticality === 'CRITICAL') criticals.set(r.stageId, (criticals.get(r.stageId) ?? 0) + r.n)
      }
    }

    const openWo = new Map<string, number>()
    if (scope.canSeeMaintenance && ids.length) {
      const rows = await this.db
        .select({ stageId: assets.plantStageId, n: sql<number>`count(*)::int` })
        .from(workOrders)
        .innerJoin(assets, eq(assets.id, workOrders.assetId))
        .where(and(eq(workOrders.plantId, plant.id), inArray(workOrders.status, [...OPEN_WORK_ORDER_STATUSES]), inArray(assets.plantStageId, ids)))
        .groupBy(assets.plantStageId)
      for (const r of rows) if (r.stageId) openWo.set(r.stageId, r.n)
    }

    const stages = stageRows.map((s) => {
      const byStatus = scope.canSeeAssets ? (counts.get(s.id) ?? {}) : null
      const total = byStatus ? Object.values(byStatus).reduce((a, b) => a + b, 0) : null
      return {
        id: s.id,
        code: s.code,
        name: s.nameOverride ?? s.name,
        stageGroup: s.stageGroup,
        colorToken: s.colorToken,
        sequence: s.sequence,
        isPublic: s.isPublic,
        /** null = no visible para quien consulta (distinto de 0 activos). */
        assetCount: total,
        statusCounts: byStatus,
        criticalAssets: byStatus ? (criticals.get(s.id) ?? 0) : null,
        attentionAssets: byStatus ? ATTENTION.reduce((sum, st) => sum + (byStatus[st] ?? 0), 0) : null,
        openWorkOrders: scope.canSeeMaintenance ? (openWo.get(s.id) ?? 0) : null,
      }
    })

    // Una conexión solo se muestra si sus dos etapas son visibles para quien consulta.
    const visible = new Set(ids)
    const conns = ids.length ? await this.db.select().from(stageConnections).where(eq(stageConnections.plantId, plant.id)) : []
    const connections = conns
      .filter((c) => visible.has(c.sourceStageId) && visible.has(c.targetStageId))
      .map((c) => ({ id: c.id, sourceStageId: c.sourceStageId, targetStageId: c.targetStageId, flowType: c.flowType, isReturnFlow: c.isReturnFlow }))

    return {
      stages,
      connections,
      totals: scope.canSeeAssets ? { assets: stages.reduce((s, x) => s + (x.assetCount ?? 0), 0), attention: stages.reduce((s, x) => s + (x.attentionAssets ?? 0), 0) } : null,
    }
  }

  /** Un ciclo solo se admite como recirculación explícita (isReturnFlow): el flujo principal es acíclico. */
  private async wouldCycle(plantId: string, flowType: string, source: string, target: string) {
    const edges = await this.db
      .select({ s: stageConnections.sourceStageId, t: stageConnections.targetStageId })
      .from(stageConnections)
      .where(and(eq(stageConnections.plantId, plantId), eq(stageConnections.flowType, flowType), eq(stageConnections.isReturnFlow, false)))
    const next = new Map<string, string[]>()
    for (const e of edges) next.set(e.s, [...(next.get(e.s) ?? []), e.t])
    const seen = new Set<string>()
    const stack = [target]
    while (stack.length) {
      const cur = stack.pop()!
      if (cur === source) return true
      if (seen.has(cur)) continue
      seen.add(cur)
      stack.push(...(next.get(cur) ?? []))
    }
    return false
  }

  async createConnection(plant: PlantRow, dto: CreateConnectionDto, req: AppRequest) {
    const found = await this.db
      .select({ id: plantStages.id, isEnabled: plantStages.isEnabled })
      .from(plantStages)
      .where(and(eq(plantStages.plantId, plant.id), inArray(plantStages.id, [dto.sourceStageId, dto.targetStageId])))
    const find = (id: string) => found.find((f) => f.id === id)
    if (!find(dto.sourceStageId)) throw validationError('sourceStageId', 'La etapa de origen no existe en esta planta')
    if (!find(dto.targetStageId)) throw validationError('targetStageId', 'La etapa de destino no existe en esta planta')
    if (!find(dto.sourceStageId)!.isEnabled || !find(dto.targetStageId)!.isEnabled) throw validationError('sourceStageId', 'Ambas etapas deben estar habilitadas')
    if (dto.sourceStageId === dto.targetStageId) throw validationError('targetStageId', 'El origen y el destino deben ser distintos')
    if (!dto.isReturnFlow && (await this.wouldCycle(plant.id, dto.flowType, dto.sourceStageId, dto.targetStageId))) {
      throw validationError('isReturnFlow', 'La conexión cerraría un ciclo en el flujo principal; márcala como flujo de retorno')
    }

    const [row] = await this.db
      .insert(stageConnections)
      .values({ plantId: plant.id, sourceStageId: dto.sourceStageId, targetStageId: dto.targetStageId, flowType: dto.flowType, isReturnFlow: dto.isReturnFlow })
      .returning()
      .catch((e) => {
        if (isUniqueViolation(e)) throw new ConflictException('Ya existe esa conexión entre las dos etapas')
        throw e
      })
    await this.audit.record(req, { module: 'process', entityType: 'stage_connection', entityId: row.id, plantId: plant.id, action: 'created', newData: dto })
    return { id: row.id, sourceStageId: row.sourceStageId, targetStageId: row.targetStageId, flowType: row.flowType, isReturnFlow: row.isReturnFlow }
  }

  async deleteConnection(plant: PlantRow, id: string, req: AppRequest) {
    const [row] = await this.db
      .delete(stageConnections)
      .where(and(eq(stageConnections.id, id), eq(stageConnections.plantId, plant.id)))
      .returning()
    if (!row) throw new NotFoundException('Conexión no encontrada')
    await this.audit.record(req, { module: 'process', entityType: 'stage_connection', entityId: id, plantId: plant.id, action: 'deleted', oldData: { sourceStageId: row.sourceStageId, targetStageId: row.targetStageId, flowType: row.flowType } })
  }

  // ---------- Redes transversales ----------

  private networkRows(plantId: string, scope: Scope) {
    return this.db
      .select({
        id: plantNetworks.id,
        code: networkMaster.code,
        name: networkMaster.name,
        description: networkMaster.description,
        icon: networkMaster.icon,
        colorToken: networkMaster.colorToken,
        isPublic: plantNetworks.isPublic,
      })
      .from(plantNetworks)
      .innerJoin(networkMaster, eq(networkMaster.id, plantNetworks.networkMasterId))
      .where(and(eq(plantNetworks.plantId, plantId), eq(plantNetworks.isEnabled, true), scope.internal ? undefined : eq(plantNetworks.isPublic, true)))
      .orderBy(asc(networkMaster.code))
  }

  /** Solo redes HABILITADAS (design.md §37), cada una con el resumen de sus activos. */
  async networks(ref: string, user: AuthUser | undefined) {
    const plant = await this.plants.getVisible(ref, user)
    const scope = await this.scope(plant, user)
    const nets = await this.networkRows(plant.id, scope)
    const ids = nets.map((n) => n.id)

    const counts = new Map<string, Record<string, number>>()
    if (scope.canSeeAssets && ids.length) {
      const rows = await this.db
        .select({ networkId: assetNetworks.plantNetworkId, status: assets.status, n: sql<number>`count(*)::int` })
        .from(assetNetworks)
        .innerJoin(assets, eq(assets.id, assetNetworks.assetId))
        .where(and(this.assetFilter(plant.id, scope), inArray(assetNetworks.plantNetworkId, ids)))
        .groupBy(assetNetworks.plantNetworkId, assets.status)
      for (const r of rows) counts.set(r.networkId, { ...(counts.get(r.networkId) ?? {}), [r.status]: r.n })
    }
    return nets.map((n) => {
      const byStatus = scope.canSeeAssets ? (counts.get(n.id) ?? {}) : null
      return {
        ...n,
        assetCount: byStatus ? Object.values(byStatus).reduce((a, b) => a + b, 0) : null,
        statusCounts: byStatus,
        attentionAssets: byStatus ? ATTENTION.reduce((s, st) => s + (byStatus[st] ?? 0), 0) : null,
      }
    })
  }

  /** Dashboard propio de una red (§34): estado, criticidad, etapas, activos que requieren atención y órdenes abiertas. */
  async networkDashboard(ref: string, code: string, user: AuthUser | undefined) {
    const plant = await this.plants.getVisible(ref, user)
    const scope = await this.scope(plant, user)
    const net = (await this.networkRows(plant.id, scope)).find((n) => n.code === code.toUpperCase())
    // Red no habilitada o no publicada para este visitante: indistinguible de inexistente.
    if (!net) throw new NotFoundException('Red no encontrada en esta planta')
    if (!scope.canSeeAssets) return { network: net, assets: null }

    const base = and(this.assetFilter(plant.id, scope), eq(assetNetworks.plantNetworkId, net.id)) as SQL
    const from = () => this.db.select({ n: sql<number>`count(*)::int` }).from(assetNetworks).innerJoin(assets, eq(assets.id, assetNetworks.assetId))

    const byStatus = await this.db
      .select({ k: assets.status, n: sql<number>`count(*)::int` })
      .from(assetNetworks)
      .innerJoin(assets, eq(assets.id, assetNetworks.assetId))
      .where(base)
      .groupBy(assets.status)
    const byCriticality = await this.db
      .select({ k: assets.criticality, n: sql<number>`count(*)::int` })
      .from(assetNetworks)
      .innerJoin(assets, eq(assets.id, assetNetworks.assetId))
      .where(base)
      .groupBy(assets.criticality)
    const byStage = await this.db
      .select({ code: stageMaster.code, name: stageMaster.name, n: sql<number>`count(*)::int` })
      .from(assetNetworks)
      .innerJoin(assets, eq(assets.id, assetNetworks.assetId))
      .leftJoin(plantStages, eq(plantStages.id, assets.plantStageId))
      .leftJoin(stageMaster, eq(stageMaster.id, plantStages.stageMasterId))
      .where(base)
      .groupBy(stageMaster.code, stageMaster.name, stageMaster.sequenceDefault)
      .orderBy(asc(stageMaster.sequenceDefault))
    const attention = await this.db
      .select({ id: assets.id, tag: assets.tag, name: assets.name, status: assets.status, criticality: assets.criticality })
      .from(assetNetworks)
      .innerJoin(assets, eq(assets.id, assetNetworks.assetId))
      .where(and(base, inArray(assets.status, [...ATTENTION])))
      .orderBy(sql`array_position(array['CRITICAL','HIGH','MEDIUM','LOW'], ${assets.criticality})`, asc(assets.tag))
      .limit(10)
    const [{ n: total }] = await from().where(base)

    let workOrdersSummary: { open: number; overdue: number } | null = null
    if (scope.canSeeMaintenance) {
      const [r] = await this.db
        .select({ open: sql<number>`count(*)::int`, overdue: sql<number>`count(*) filter (where ${workOrders.plannedEnd} < now())::int` })
        .from(workOrders)
        .innerJoin(assets, eq(assets.id, workOrders.assetId))
        .innerJoin(assetNetworks, eq(assetNetworks.assetId, assets.id))
        .where(and(eq(workOrders.plantId, plant.id), inArray(workOrders.status, [...OPEN_WORK_ORDER_STATUSES]), eq(assetNetworks.plantNetworkId, net.id)))
      workOrdersSummary = r
    }

    return {
      network: net,
      assets: {
        total,
        byStatus: Object.fromEntries(byStatus.map((r) => [r.k, r.n])),
        byCriticality: Object.fromEntries(byCriticality.map((r) => [r.k, r.n])),
        byStage: byStage.map((r) => ({ code: r.code, name: r.name, count: r.n })),
        attention,
      },
      workOrders: workOrdersSummary,
    }
  }
}
