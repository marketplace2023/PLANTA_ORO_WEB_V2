import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import { isUniqueViolation } from '../../common/db-errors'
import { readMapPosition, withMapPosition } from '../../common/map-position'
import { escapeLike, pageOf } from '../../common/pagination'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import {
  assetFamilies,
  assetModels,
  assetNetworks,
  assets,
  assetStatusHistory,
  assetTypes,
  manufacturers,
  networkMaster,
  plantNetworks,
  plantSettings,
  plantStages,
  stageMaster,
  users,
} from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { DocumentsService } from '../documents/documents.service'
import { AuthzService } from '../iam/authz.service'
import { PlansService } from '../maintenance/plans.service'
import { InventoryService } from '../inventory/inventory.service'
import { WorkOrdersService } from '../maintenance/work-orders.service'
import { PlantsService, toPlantSummary } from '../plants/plants.service'
import type { CreateAssetDto, ListAssetsQuery, UpdateAssetDto } from './assets.schemas'
import { buildFurCode } from './fur-code'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type Row = Awaited<ReturnType<AssetsService['selectRows']>>[number]
type NetworkRef = { code: string; name: string; colorToken: string | null }

export { buildFurCode }

const SORTS = {
  tag: assets.tag,
  name: assets.name,
  status: assets.status,
  criticality: assets.criticality,
  updatedAt: assets.updatedAt,
} as const

@Injectable()
export class AssetsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly authz: AuthzService,
    private readonly plants: PlantsService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
    private readonly workOrders: WorkOrdersService,
    private readonly plans: PlansService,
    private readonly inventory: InventoryService,
  ) {}

  // ---------- Lectura ----------

  /** Quien tiene asset.read ve todo; el resto solo lo marcado como público si la planta publica sus activos. */
  private async scope(plant: PlantRow, user: AuthUser | undefined) {
    const access = await this.authz.access(user, plant.id)
    const internal = access.permissions.has('asset.read')
    if (internal) return { internal, publicAssets: true }
    const [settings] = await this.db.select().from(plantSettings).where(eq(plantSettings.plantId, plant.id)).limit(1)
    return { internal, publicAssets: !!settings?.publicAssets }
  }

  /** Activo + modelo, tipo, familia, fabricante efectivo y etapa. */
  private selectRows() {
    return this.db
      .select({
        id: assets.id,
        furCode: assets.furCode,
        tag: assets.tag,
        name: assets.name,
        status: assets.status,
        criticality: assets.criticality,
        location: assets.location,
        isPublic: assets.isPublic,
        serialNumber: assets.serialNumber,
        installationDate: assets.installationDate,
        commissionDate: assets.commissionDate,
        parentAssetId: assets.parentAssetId,
        metadata: assets.metadata,
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
        modelId: assetModels.id,
        modelName: assetModels.modelName,
        /** Ruta (relativa a la API) de la foto del modelo; null si no tiene. */
        modelImageUrl: sql<string | null>`case when ${assetModels.imageKey} is null then null else '/catalog/models/' || ${assetModels.id}::text || '/image?v=' || (extract(epoch from ${assetModels.imageUpdatedAt}) * 1000)::bigint::text end`,
        specifications: assetModels.specifications,
        technicalData: assetModels.technicalData,
        typeCode: assetTypes.code,
        typeName: assetTypes.name,
        familyCode: assetFamilies.code,
        familyName: assetFamilies.name,
        manufacturerName: manufacturers.name,
        stageCode: stageMaster.code,
        stageName: stageMaster.name,
        stageOverride: plantStages.nameOverride,
        stageGroup: stageMaster.stageGroup,
      })
      .from(assets)
      .innerJoin(assetModels, eq(assetModels.id, assets.assetModelId))
      .innerJoin(assetTypes, eq(assetTypes.id, assetModels.assetTypeId))
      .innerJoin(assetFamilies, eq(assetFamilies.id, assetTypes.familyId))
      .leftJoin(manufacturers, eq(manufacturers.id, sql`coalesce(${assets.manufacturerId}, ${assetModels.manufacturerId})`))
      .leftJoin(plantStages, eq(plantStages.id, assets.plantStageId))
      .leftJoin(stageMaster, eq(stageMaster.id, plantStages.stageMasterId))
  }

  private async networksOf(assetIds: string[]): Promise<Map<string, NetworkRef[]>> {
    const map = new Map<string, NetworkRef[]>()
    if (assetIds.length === 0) return map
    const rows = await this.db
      .select({ assetId: assetNetworks.assetId, code: networkMaster.code, name: networkMaster.name, colorToken: networkMaster.colorToken })
      .from(assetNetworks)
      .innerJoin(plantNetworks, eq(plantNetworks.id, assetNetworks.plantNetworkId))
      .innerJoin(networkMaster, eq(networkMaster.id, plantNetworks.networkMasterId))
      .where(inArray(assetNetworks.assetId, assetIds))
      .orderBy(asc(networkMaster.code))
    for (const r of rows) map.set(r.assetId, [...(map.get(r.assetId) ?? []), { code: r.code, name: r.name, colorToken: r.colorToken }])
    return map
  }

  private toItem(r: Row, networks: NetworkRef[]) {
    return {
      id: r.id,
      furCode: r.furCode,
      tag: r.tag,
      name: r.name,
      status: r.status,
      criticality: r.criticality,
      location: r.location,
      isPublic: r.isPublic,
      updatedAt: r.updatedAt,
      stage: r.stageCode ? { code: r.stageCode, name: r.stageOverride ?? r.stageName!, group: r.stageGroup! } : null,
      mapPosition: readMapPosition(r.metadata),
      model: { id: r.modelId, name: r.modelName, imageUrl: r.modelImageUrl },
      type: { code: r.typeCode, name: r.typeName },
      family: { code: r.familyCode, name: r.familyName },
      manufacturer: r.manufacturerName,
      networks,
    }
  }

  /** El detalle público omite datos internos (serie, metadatos, jerarquía, datos técnicos del modelo). */
  private toDetail(r: Row, networks: NetworkRef[], internal: boolean) {
    return {
      ...this.toItem(r, networks),
      specifications: r.specifications,
      installationDate: r.installationDate,
      commissionDate: r.commissionDate,
      createdAt: r.createdAt,
      ...(internal && {
        serialNumber: r.serialNumber,
        parentAssetId: r.parentAssetId,
        metadata: r.metadata,
        technicalData: r.technicalData,
      }),
    }
  }

  async list(ref: string, q: ListAssetsQuery, user: AuthUser | undefined) {
    const plant = await this.plants.getVisible(ref, user)
    const { internal, publicAssets } = await this.scope(plant, user)
    if (!internal && !publicAssets) return pageOf([], 0, q.page, q.pageSize)

    const conditions: Array<SQL | undefined> = [
      eq(assets.plantId, plant.id),
      internal ? undefined : eq(assets.isPublic, true),
      // Los dados de baja solo aparecen si se piden explícitamente.
      q.status ? inArray(assets.status, q.status) : ne(assets.status, 'DECOMMISSIONED'),
      q.criticality ? inArray(assets.criticality, q.criticality) : undefined,
      q.stage ? eq(stageMaster.code, q.stage) : undefined,
      q.family ? eq(assetFamilies.code, q.family) : undefined,
      q.type ? eq(assetTypes.code, q.type) : undefined,
      q.location ? ilike(assets.location, `%${escapeLike(q.location)}%`) : undefined,
      q.network
        ? sql`exists (select 1 from ${assetNetworks} an
            inner join ${plantNetworks} pn on pn.id = an.plant_network_id
            inner join ${networkMaster} nm on nm.id = pn.network_master_id
            where an.asset_id = ${assets.id} and nm.code = ${q.network})`
        : undefined,
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(
        or(ilike(assets.tag, like), ilike(assets.name, like), ilike(assets.furCode, like), ilike(assets.location, like), ilike(assetModels.modelName, like)),
      )
    }
    const where = and(...conditions)
    const order = q.dir === 'desc' ? desc(SORTS[q.sort]) : asc(SORTS[q.sort])

    const [rows, [{ total }]] = await Promise.all([
      this.selectRows()
        .where(where)
        .orderBy(order, asc(assets.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(assets)
        .innerJoin(assetModels, eq(assetModels.id, assets.assetModelId))
        .innerJoin(assetTypes, eq(assetTypes.id, assetModels.assetTypeId))
        .innerJoin(assetFamilies, eq(assetFamilies.id, assetTypes.familyId))
        .leftJoin(plantStages, eq(plantStages.id, assets.plantStageId))
        .leftJoin(stageMaster, eq(stageMaster.id, plantStages.stageMasterId))
        .where(where),
    ])

    const networks = await this.networksOf(rows.map((r) => r.id))
    return pageOf(
      rows.map((r) => this.toItem(r, networks.get(r.id) ?? [])),
      total,
      q.page,
      q.pageSize,
    )
  }

  /**
   * Conteos de la planta para el geoportal: totales por estado, criticidad, etapa y red. Mismo alcance que el listado
   * (quien no tiene asset.read solo cuenta lo público) y sin los dados de baja.
   */
  async summary(ref: string, user: AuthUser | undefined) {
    const plant = await this.plants.getVisible(ref, user)
    const { internal, publicAssets } = await this.scope(plant, user)
    const empty = { total: 0, byStatus: {} as Record<string, number>, byCriticality: {} as Record<string, number>, byStage: {} as Record<string, number>, byNetwork: {} as Record<string, number> }
    if (!internal && !publicAssets) return empty

    const where = and(eq(assets.plantId, plant.id), ne(assets.status, 'DECOMMISSIONED'), internal ? undefined : eq(assets.isPublic, true))
    const toRecord = (rows: Array<{ key: string | null; n: number }>) => Object.fromEntries(rows.filter((r) => r.key).map((r) => [r.key as string, r.n]))

    const [byStatus, byCriticality, byStage, byNetwork] = await Promise.all([
      this.db.select({ key: assets.status, n: sql<number>`count(*)::int` }).from(assets).where(where).groupBy(assets.status),
      this.db.select({ key: assets.criticality, n: sql<number>`count(*)::int` }).from(assets).where(where).groupBy(assets.criticality),
      this.db
        .select({ key: stageMaster.code, n: sql<number>`count(*)::int` })
        .from(assets)
        .leftJoin(plantStages, eq(plantStages.id, assets.plantStageId))
        .leftJoin(stageMaster, eq(stageMaster.id, plantStages.stageMasterId))
        .where(where)
        .groupBy(stageMaster.code),
      this.db
        .select({ key: networkMaster.code, n: sql<number>`count(distinct ${assets.id})::int` })
        .from(assets)
        .innerJoin(assetNetworks, eq(assetNetworks.assetId, assets.id))
        .innerJoin(plantNetworks, eq(plantNetworks.id, assetNetworks.plantNetworkId))
        .innerJoin(networkMaster, eq(networkMaster.id, plantNetworks.networkMasterId))
        .where(where)
        .groupBy(networkMaster.code),
    ])
    return {
      total: byStatus.reduce((sum, r) => sum + r.n, 0),
      byStatus: toRecord(byStatus),
      byCriticality: toRecord(byCriticality),
      byStage: toRecord(byStage),
      byNetwork: toRecord(byNetwork),
    }
  }

  private async findVisible(ref: string, assetId: string, user: AuthUser | undefined) {
    const plant = await this.plants.getVisible(ref, user)
    const { internal, publicAssets } = await this.scope(plant, user)
    const [row] = await this.selectRows().where(and(eq(assets.id, assetId), eq(assets.plantId, plant.id))).limit(1)
    // Un activo no público es indistinguible de uno inexistente para quien no tiene acceso interno.
    const hidden = !row || (!internal && !(publicAssets && row.isPublic && row.status !== 'DECOMMISSIONED'))
    if (hidden) throw new NotFoundException('Activo no encontrado')
    return { plant, internal, row }
  }

  async get(ref: string, assetId: string, user: AuthUser | undefined) {
    const { internal, row } = await this.findVisible(ref, assetId, user)
    return this.toDetail(row, (await this.networksOf([row.id])).get(row.id) ?? [], internal)
  }

  /** Ficha Única de Registro consolidada (arquitectura §14.2). Los módulos futuros devuelven vacío por ahora. */
  async fur(ref: string, assetId: string, user: AuthUser | undefined) {
    const { plant, internal, row } = await this.findVisible(ref, assetId, user)
    const networks = (await this.networksOf([row.id])).get(row.id) ?? []
    const asset = this.toDetail(row, networks, internal)

    const history = internal
      ? await this.db
          .select({
            id: assetStatusHistory.id,
            oldStatus: assetStatusHistory.oldStatus,
            newStatus: assetStatusHistory.newStatus,
            reason: assetStatusHistory.reason,
            changedAt: assetStatusHistory.changedAt,
            changedBy: sql<string | null>`nullif(trim(${users.firstName} || ' ' || ${users.lastName}), '')`,
          })
          .from(assetStatusHistory)
          .leftJoin(users, eq(users.id, assetStatusHistory.changedBy))
          .where(eq(assetStatusHistory.assetId, row.id))
          .orderBy(desc(assetStatusHistory.changedAt), desc(assetStatusHistory.id))
      : []

    // Documentos vinculados al activo, con las mismas reglas de visibilidad que el módulo de documentos.
    const linkedDocuments = await this.documents.listForPlant(
      plant,
      { page: 1, pageSize: 100, assetId: row.id, status: 'ACTIVE', sort: 'updatedAt' },
      user,
    )

    // Mantenimiento es información interna: solo con maintenance.read. Los demás reciben un objeto vacío.
    const canSeeMaintenance = (await this.authz.access(user, plant.id)).permissions.has('maintenance.read')
    const maintenance = canSeeMaintenance
      ? {
          ...(await this.workOrders.assetSummary(plant.id, row.id)),
          nextMaintenanceAt: await this.plans.nextDueAt(plant.id, row.id),
        }
      : {}

    // Inventario también es interno: solo con inventory.read.
    const canSeeInventory = (await this.authz.access(user, plant.id)).permissions.has('inventory.read')
    const inventory = canSeeInventory ? await this.inventory.assetSummary(plant.id, row.modelId, row.id) : {}

    return {
      asset,
      plant: toPlantSummary(plant),
      stage: asset.stage,
      networks,
      documents: linkedDocuments.items,
      maintenance,
      inventory,
      telemetry: {},
      kpis: [],
      history,
    }
  }

  // ---------- Escritura ----------

  /** §47.2: un activo solo puede pertenecer a una etapa HABILITADA de su misma planta. */
  private async resolveStage(plantId: string, code: string): Promise<string> {
    const [row] = await this.db
      .select({ id: plantStages.id })
      .from(plantStages)
      .innerJoin(stageMaster, eq(stageMaster.id, plantStages.stageMasterId))
      .where(and(eq(plantStages.plantId, plantId), eq(stageMaster.code, code), eq(plantStages.isEnabled, true)))
      .limit(1)
    if (!row) throw new BadRequestException(`La etapa ${code} no está habilitada en esta planta`)
    return row.id
  }

  /** §47.3: un activo no puede relacionarse con una red no habilitada en la planta. */
  private async resolveNetworks(plantId: string, codes: string[]): Promise<string[]> {
    const unique = [...new Set(codes)]
    if (unique.length === 0) return []
    const rows = await this.db
      .select({ id: plantNetworks.id, code: networkMaster.code })
      .from(plantNetworks)
      .innerJoin(networkMaster, eq(networkMaster.id, plantNetworks.networkMasterId))
      .where(and(eq(plantNetworks.plantId, plantId), eq(plantNetworks.isEnabled, true), inArray(networkMaster.code, unique)))
    const missing = unique.filter((c) => !rows.some((r) => r.code === c))
    if (missing.length > 0) throw new BadRequestException(`Redes no habilitadas en esta planta: ${missing.join(', ')}`)
    return rows.map((r) => r.id)
  }

  private async assertModel(modelId: string) {
    const [model] = await this.db.select({ id: assetModels.id }).from(assetModels).where(and(eq(assetModels.id, modelId), eq(assetModels.status, 'ACTIVE'))).limit(1)
    if (!model) throw new BadRequestException('El modelo de catálogo no existe o está inactivo')
  }

  /** El padre debe ser de la misma planta y no puede crear ciclos en la jerarquía. */
  private async assertParent(plantId: string, parentId: string, selfId?: string) {
    let cursor: string | null = parentId
    for (let depth = 0; cursor && depth < 50; depth++) {
      if (cursor === selfId) throw new BadRequestException('El activo padre crearía un ciclo en la jerarquía')
      const [node] = await this.db
        .select({ parentAssetId: assets.parentAssetId })
        .from(assets)
        .where(and(eq(assets.id, cursor), eq(assets.plantId, plantId)))
        .limit(1)
      if (!node) throw new BadRequestException('El activo padre no existe en esta planta')
      cursor = node.parentAssetId
    }
  }

  private async setNetworks(tx: Tx, assetId: string, plantNetworkIds: string[]) {
    await tx.delete(assetNetworks).where(eq(assetNetworks.assetId, assetId))
    if (plantNetworkIds.length > 0) {
      await tx.insert(assetNetworks).values(plantNetworkIds.map((plantNetworkId) => ({ assetId, plantNetworkId })))
    }
  }

  async create(plant: PlantRow, dto: CreateAssetDto, req: AppRequest) {
    await this.assertModel(dto.assetModelId)
    const plantStageId = dto.stageCode ? await this.resolveStage(plant.id, dto.stageCode) : null
    const networkIds = await this.resolveNetworks(plant.id, dto.networkCodes)
    if (dto.parentAssetId) await this.assertParent(plant.id, dto.parentAssetId)

    const created = await this.db
      .transaction(async (tx) => {
        // Contador atómico por planta: dos altas simultáneas nunca obtienen el mismo FUR.
        const [{ seq }] = await tx
          .insert(plantSettings)
          .values({ plantId: plant.id, assetSeq: 1 })
          .onConflictDoUpdate({ target: plantSettings.plantId, set: { assetSeq: sql`${plantSettings.assetSeq} + 1` } })
          .returning({ seq: plantSettings.assetSeq })

        const [asset] = await tx
          .insert(assets)
          .values({
            plantId: plant.id,
            plantStageId,
            assetModelId: dto.assetModelId,
            furCode: buildFurCode(plant.code, seq),
            tag: dto.tag,
            name: dto.name,
            serialNumber: dto.serialNumber,
            installationDate: dto.installationDate,
            commissionDate: dto.commissionDate,
            status: dto.status,
            criticality: dto.criticality,
            location: dto.location,
            parentAssetId: dto.parentAssetId,
            isPublic: dto.isPublic,
            metadata: dto.metadata,
          })
          .returning()
        await this.setNetworks(tx, asset.id, networkIds)
        await tx.insert(assetStatusHistory).values({
          assetId: asset.id,
          oldStatus: null,
          newStatus: asset.status,
          reason: 'Alta del activo',
          changedBy: req.user?.id,
        })
        return asset
      })
      .catch((err) => {
        if (isUniqueViolation(err)) throw new ConflictException(`Ya existe un activo con el tag ${dto.tag} en esta planta`)
        throw err
      })

    await this.audit.record(req, {
      module: 'assets',
      entityType: 'asset',
      entityId: created.id,
      plantId: plant.id,
      action: 'created',
      newData: { furCode: created.furCode, tag: created.tag, name: created.name, status: created.status, stageCode: dto.stageCode ?? null },
    })
    return this.get(plant.id, created.id, req.user)
  }

  async update(plant: PlantRow, assetId: string, dto: UpdateAssetDto, req: AppRequest) {
    const [before] = await this.db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.plantId, plant.id))).limit(1)
    if (!before) throw new NotFoundException('Activo no encontrado')
    if (before.status === 'DECOMMISSIONED') throw new ConflictException('El activo está dado de baja y no se puede modificar')
    // La baja es una acción propia (DELETE, permiso asset.delete), no un cambio de estado cualquiera.
    if (dto.status === 'DECOMMISSIONED') throw new BadRequestException('Para dar de baja un activo use la acción de baja')

    const patch: Partial<typeof assets.$inferInsert> = { updatedAt: new Date() }
    if (dto.tag !== undefined) patch.tag = dto.tag
    if (dto.name !== undefined) patch.name = dto.name
    if (dto.serialNumber !== undefined) patch.serialNumber = dto.serialNumber
    if (dto.installationDate !== undefined) patch.installationDate = dto.installationDate
    if (dto.commissionDate !== undefined) patch.commissionDate = dto.commissionDate
    if (dto.criticality !== undefined) patch.criticality = dto.criticality
    if (dto.location !== undefined) patch.location = dto.location
    if (dto.isPublic !== undefined) patch.isPublic = dto.isPublic
    if (dto.metadata !== undefined || dto.mapPosition !== undefined) {
      // La posición en el mapa vive dentro de `metadata`: reemplazar los metadatos no debe borrarla, y moverla no debe tocar el resto.
      const current = (before.metadata ?? {}) as Record<string, unknown>
      const base = dto.metadata !== undefined ? { ...dto.metadata, ...(current.map !== undefined && { map: current.map }) } : current
      patch.metadata = withMapPosition(base, dto.mapPosition)
    }
    if (dto.assetModelId !== undefined) {
      await this.assertModel(dto.assetModelId)
      patch.assetModelId = dto.assetModelId
    }
    if (dto.stageCode !== undefined) patch.plantStageId = dto.stageCode === null ? null : await this.resolveStage(plant.id, dto.stageCode)
    if (dto.parentAssetId !== undefined) {
      if (dto.parentAssetId !== null) await this.assertParent(plant.id, dto.parentAssetId, assetId)
      patch.parentAssetId = dto.parentAssetId
    }
    const networkIds = dto.networkCodes !== undefined ? await this.resolveNetworks(plant.id, dto.networkCodes) : undefined
    const statusChanged = dto.status !== undefined && dto.status !== before.status
    if (statusChanged) patch.status = dto.status

    await this.db
      .transaction(async (tx) => {
        await tx.update(assets).set(patch).where(eq(assets.id, assetId))
        if (networkIds) await this.setNetworks(tx, assetId, networkIds)
        if (statusChanged) {
          await tx.insert(assetStatusHistory).values({
            assetId,
            oldStatus: before.status,
            newStatus: dto.status!,
            reason: dto.statusReason ?? null,
            changedBy: req.user?.id,
          })
        }
      })
      .catch((err) => {
        if (isUniqueViolation(err)) throw new ConflictException(`Ya existe un activo con el tag ${dto.tag} en esta planta`)
        throw err
      })

    const { updatedAt: _u, ...changed } = patch
    await this.audit.record(req, {
      module: 'assets',
      entityType: 'asset',
      entityId: assetId,
      plantId: plant.id,
      action: statusChanged ? 'status.changed' : 'updated',
      oldData: Object.fromEntries(Object.keys(changed).map((k) => [k, (before as Record<string, unknown>)[k]])),
      newData: { ...changed, ...(networkIds && { networkCodes: dto.networkCodes }), ...(statusChanged && { statusReason: dto.statusReason ?? null }) },
    })
    return this.get(plant.id, assetId, req.user)
  }

  /** Baja lógica: el activo se conserva con su historial (§47.10), solo cambia a DECOMMISSIONED. */
  async decommission(plant: PlantRow, assetId: string, req: AppRequest) {
    const [before] = await this.db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.plantId, plant.id))).limit(1)
    if (!before) throw new NotFoundException('Activo no encontrado')
    if (before.status === 'DECOMMISSIONED') return

    await this.db.transaction(async (tx) => {
      await tx.update(assets).set({ status: 'DECOMMISSIONED', updatedAt: new Date() }).where(eq(assets.id, assetId))
      await tx.insert(assetStatusHistory).values({
        assetId,
        oldStatus: before.status,
        newStatus: 'DECOMMISSIONED',
        reason: 'Baja del activo',
        changedBy: req.user?.id,
      })
    })
    await this.audit.record(req, {
      module: 'assets',
      entityType: 'asset',
      entityId: assetId,
      plantId: plant.id,
      action: 'decommissioned',
      oldData: { status: before.status },
      newData: { status: 'DECOMMISSIONED' },
    })
  }
}
