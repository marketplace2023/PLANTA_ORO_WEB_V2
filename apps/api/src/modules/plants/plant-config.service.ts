import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { assetNetworks, assets, networkMaster, plantNetworks, plantSettings, plantStages, stageMaster } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { AuthzService } from '../iam/authz.service'
import type { EnableNetworkDto, EnableStageDto, UpdateNetworkDto, UpdateStageDto } from './plants.schemas'
import { PlantsService } from './plants.service'

/**
 * Etapas (§11) y redes transversales (§12) habilitadas por planta.
 * El catálogo maestro es global; cada planta habilita solo lo que realmente usa.
 */
@Injectable()
export class PlantConfigService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly authz: AuthzService,
    private readonly plants: PlantsService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Etapas ----------

  private stageView() {
    return this.db
      .select({
        id: plantStages.id,
        stageMasterId: stageMaster.id,
        code: stageMaster.code,
        name: stageMaster.name,
        nameOverride: plantStages.nameOverride,
        stageGroup: stageMaster.stageGroup,
        colorToken: stageMaster.colorToken,
        sequence: plantStages.sequence,
        isEnabled: plantStages.isEnabled,
        isPublic: plantStages.isPublic,
        configuration: plantStages.configuration,
      })
      .from(plantStages)
      .innerJoin(stageMaster, eq(stageMaster.id, plantStages.stageMasterId))
  }

  async listStages(ref: string, user: AuthUser | undefined) {
    const plant = await this.plants.getVisible(ref, user)
    const access = await this.authz.access(user, plant.id)
    const internal = access.permissions.has('plant.read')

    if (!internal) {
      // Visitantes: solo si la planta publica sus procesos, y únicamente etapas habilitadas y públicas.
      const [settings] = await this.db.select().from(plantSettings).where(eq(plantSettings.plantId, plant.id)).limit(1)
      if (!settings?.publicProcesses) return []
    }

    const rows = await this.stageView()
      .where(
        internal
          ? eq(plantStages.plantId, plant.id)
          : and(eq(plantStages.plantId, plant.id), eq(plantStages.isEnabled, true), eq(plantStages.isPublic, true)),
      )
      .orderBy(asc(plantStages.sequence))
    return rows.map((r) => ({ ...r, displayName: r.nameOverride ?? r.name }))
  }

  async enableStage(plant: PlantRow, dto: EnableStageDto, req: AppRequest) {
    const [master] = await this.db.select().from(stageMaster).where(eq(stageMaster.code, dto.stageCode)).limit(1)
    if (!master) throw new NotFoundException(`La etapa ${dto.stageCode} no existe en el catálogo`)

    const [existing] = await this.db
      .select()
      .from(plantStages)
      .where(and(eq(plantStages.plantId, plant.id), eq(plantStages.stageMasterId, master.id)))
      .limit(1)

    const values = {
      isEnabled: true,
      ...(dto.sequence !== undefined && { sequence: dto.sequence }),
      ...(dto.nameOverride !== undefined && { nameOverride: dto.nameOverride }),
      ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
    }
    const [row] = existing
      ? await this.db.update(plantStages).set(values).where(eq(plantStages.id, existing.id)).returning()
      : await this.db
          .insert(plantStages)
          .values({ plantId: plant.id, stageMasterId: master.id, sequence: master.sequenceDefault, ...values })
          .returning()

    await this.audit.record(req, {
      module: 'plants',
      entityType: 'plant_stage',
      entityId: row.id,
      plantId: plant.id,
      action: 'stage.enabled',
      oldData: existing ?? null,
      newData: row,
    })
    return (await this.stageView().where(eq(plantStages.id, row.id)))[0]
  }

  async updateStage(plant: PlantRow, stageId: string, dto: UpdateStageDto, req: AppRequest) {
    const [before] = await this.db
      .select()
      .from(plantStages)
      .where(and(eq(plantStages.id, stageId), eq(plantStages.plantId, plant.id)))
      .limit(1)
    if (!before) throw new NotFoundException('Etapa no encontrada en esta planta')

    // §47: no se puede deshabilitar una etapa que aún tiene activos (los dados de baja no cuentan).
    if (dto.isEnabled === false && before.isEnabled) {
      const [{ n }] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(assets)
        .where(and(eq(assets.plantStageId, stageId), ne(assets.status, 'DECOMMISSIONED')))
      if (n > 0) throw new ConflictException(`No se puede deshabilitar la etapa: tiene ${n} activo(s) asignado(s)`)
    }
    const [after] = await this.db.update(plantStages).set(dto).where(eq(plantStages.id, stageId)).returning()
    await this.audit.record(req, {
      module: 'plants',
      entityType: 'plant_stage',
      entityId: stageId,
      plantId: plant.id,
      action: 'stage.updated',
      oldData: before,
      newData: after,
    })
    return (await this.stageView().where(eq(plantStages.id, stageId)))[0]
  }

  // ---------- Redes transversales ----------

  private networkView() {
    return this.db
      .select({
        id: plantNetworks.id,
        networkMasterId: networkMaster.id,
        code: networkMaster.code,
        name: networkMaster.name,
        icon: networkMaster.icon,
        colorToken: networkMaster.colorToken,
        isEnabled: plantNetworks.isEnabled,
        isPublic: plantNetworks.isPublic,
        configuration: plantNetworks.configuration,
      })
      .from(plantNetworks)
      .innerJoin(networkMaster, eq(networkMaster.id, plantNetworks.networkMasterId))
  }

  async listNetworks(ref: string, user: AuthUser | undefined) {
    const plant = await this.plants.getVisible(ref, user)
    const access = await this.authz.access(user, plant.id)
    const internal = access.permissions.has('plant.read')

    return this.networkView()
      .where(
        internal
          ? eq(plantNetworks.plantId, plant.id)
          : and(eq(plantNetworks.plantId, plant.id), eq(plantNetworks.isEnabled, true), eq(plantNetworks.isPublic, true)),
      )
      .orderBy(asc(networkMaster.code))
  }

  async enableNetwork(plant: PlantRow, dto: EnableNetworkDto, req: AppRequest) {
    const [master] = await this.db.select().from(networkMaster).where(eq(networkMaster.code, dto.networkCode)).limit(1)
    if (!master) throw new NotFoundException(`La red ${dto.networkCode} no existe en el catálogo`)

    const [existing] = await this.db
      .select()
      .from(plantNetworks)
      .where(and(eq(plantNetworks.plantId, plant.id), eq(plantNetworks.networkMasterId, master.id)))
      .limit(1)

    const values = { isEnabled: true, ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }) }
    const [row] = existing
      ? await this.db.update(plantNetworks).set(values).where(eq(plantNetworks.id, existing.id)).returning()
      : await this.db.insert(plantNetworks).values({ plantId: plant.id, networkMasterId: master.id, ...values }).returning()

    await this.audit.record(req, {
      module: 'plants',
      entityType: 'plant_network',
      entityId: row.id,
      plantId: plant.id,
      action: 'network.enabled',
      oldData: existing ?? null,
      newData: row,
    })
    return (await this.networkView().where(eq(plantNetworks.id, row.id)))[0]
  }

  async updateNetwork(plant: PlantRow, networkId: string, dto: UpdateNetworkDto, req: AppRequest) {
    const [before] = await this.db
      .select()
      .from(plantNetworks)
      .where(and(eq(plantNetworks.id, networkId), eq(plantNetworks.plantId, plant.id)))
      .limit(1)
    if (!before) throw new NotFoundException('Red no encontrada en esta planta')

    // §47: no se puede deshabilitar una red que aún tiene activos relacionados.
    if (dto.isEnabled === false && before.isEnabled) {
      const [{ n }] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(assetNetworks)
        .innerJoin(assets, eq(assets.id, assetNetworks.assetId))
        .where(and(eq(assetNetworks.plantNetworkId, networkId), ne(assets.status, 'DECOMMISSIONED')))
      if (n > 0) throw new ConflictException(`No se puede deshabilitar la red: tiene ${n} activo(s) relacionado(s)`)
    }
    const [after] = await this.db.update(plantNetworks).set(dto).where(eq(plantNetworks.id, networkId)).returning()
    await this.audit.record(req, {
      module: 'plants',
      entityType: 'plant_network',
      entityId: networkId,
      plantId: plant.id,
      action: 'network.updated',
      oldData: before,
      newData: after,
    })
    return (await this.networkView().where(eq(plantNetworks.id, networkId)))[0]
  }
}
