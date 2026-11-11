import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { DB, type Database } from '../../database/database.module'
import { assetModels, assetModelStages, assetModelNetworks, assetTypes, assetTypeStages, catalogRequests, plants, stageMaster, networkMaster } from '../../database/schema'
import { CurrentPlant, GlobalAdminOnly, RequirePermission } from '../iam/decorators'
import type { AppRequest, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { assetRequestSchema, createAssetSchema } from './assets.schemas'
import { AssetsService } from './assets.service'
import { validateFamilySpecifications } from '../catalog/family-specifications'
import { AuditService } from '../audit/audit.service'

const reviewSchema = z.object({ typeCode: z.string().trim().min(1).max(60), modelName: z.string().trim().min(1).max(200), specifications: z.record(z.string(), z.unknown()), components: z.array(z.string().trim().min(1).max(2000)).max(500) })
const decisionSchema = z.object({ note: z.string().trim().max(2000).default('') })

@Controller('plants/:plantId/catalog-requests')
export class PlantCatalogRequestsController {
  constructor(@Inject(DB) private readonly db: Database, private readonly assets: AssetsService, private readonly audit: AuditService) {}

  @RequirePermission('asset.create')
  @Get()
  list(@CurrentPlant() plant: PlantRow) {
    return this.db.select().from(catalogRequests).where(eq(catalogRequests.plantId, plant.id)).orderBy(desc(catalogRequests.createdAt))
  }

  @RequirePermission('asset.create')
  @Post()
  async submit(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(assetRequestSchema)) draft: z.infer<typeof assetRequestSchema>, @Req() req: AppRequest) {
    if (draft.sourceRequestId) {
      const [source] = await this.db.select().from(catalogRequests).where(and(eq(catalogRequests.id, draft.sourceRequestId), eq(catalogRequests.plantId, plant.id)))
      if (!source) throw new NotFoundException('Solicitud de origen no encontrada en esta planta')
      if (source.status !== 'REJECTED') throw new BadRequestException('Solo puedes crear otra solicitud a partir de una rechazada')
    }
    // Valida la clasificación y la ficha sin crear activos ni reservar TAG/FUR.
    await this.assets.tagPreview(plant, { familyId: draft.familyId, stageCode: draft.stageCode, networkCode: draft.networkCodes[0] })
    draft.specifications = await validateFamilySpecifications(this.db, draft.familyId, draft.specifications ?? {})
    const [row] = await this.db.insert(catalogRequests).values({ id: randomUUID(), plantId: plant.id, submittedBy: req.user!.id, draft }).returning()
    await this.audit.record(req, { module: 'assets', entityType: 'catalog_request', entityId: row.id, plantId: plant.id, action: 'submitted', newData: draft })
    return row
  }
}

@GlobalAdminOnly()
@Controller('catalog/requests')
export class AdminCatalogRequestsController {
  constructor(@Inject(DB) private readonly db: Database, private readonly assets: AssetsService, private readonly audit: AuditService) {}

  @Get()
  async list() {
    const rows = await this.db.select({ request: catalogRequests, plantName: plants.name, reviewedModel: assetModels }).from(catalogRequests).innerJoin(plants, eq(plants.id, catalogRequests.plantId)).leftJoin(assetModels, eq(assetModels.id, catalogRequests.modelId)).orderBy(desc(catalogRequests.createdAt))
    return rows.map(r => ({ ...r.request, plantName: r.plantName, reviewedModel: r.reviewedModel }))
  }

  @Patch(':id')
  async review(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(reviewSchema)) dto: z.infer<typeof reviewSchema>, @Req() req: AppRequest) {
    const row = await this.db.transaction(async tx => {
      const [request] = await tx.select().from(catalogRequests).where(eq(catalogRequests.id, id)).for('update')
      if (!request) throw new NotFoundException('Solicitud no encontrada')
      if (request.status !== 'PENDING') throw new ConflictException('La solicitud ya fue resuelta')
      const draft = assetRequestSchema.parse(request.draft)
      const [type] = await tx.select().from(assetTypes).where(and(eq(assetTypes.code, dto.typeCode), eq(assetTypes.familyId, draft.familyId)))
      if (!type) throw new BadRequestException('El tipo debe pertenecer a la familia solicitada')
      const [stage] = await tx.select().from(stageMaster).where(eq(stageMaster.code, draft.stageCode))
      const [network] = await tx.select().from(networkMaster).where(eq(networkMaster.code, draft.networkCodes[0]))
      if (!stage || !network) throw new BadRequestException('La etapa o la red de la solicitud ya no está disponible')
      const specifications = await validateFamilySpecifications(tx as unknown as Database, draft.familyId, dto.specifications)
      const modelId = request.modelId ?? randomUUID()
      if (request.modelId) {
        const [model] = await tx.select().from(assetModels).where(eq(assetModels.id, modelId)).for('update')
        await tx.update(assetModels).set({ assetTypeId: type.id, modelName: dto.modelName, specifications, technicalData: { ...model.technicalData as object, componentes: dto.components }, status: 'INACTIVE' }).where(eq(assetModels.id, modelId))
      } else {
        await tx.insert(assetModels).values({ id: modelId, assetTypeId: type.id, modelName: dto.modelName, specifications, technicalData: { componentes: dto.components }, status: 'INACTIVE' })
      }
      await tx.delete(assetModelStages).where(eq(assetModelStages.assetModelId, modelId))
      await tx.insert(assetModelStages).values({ assetModelId: modelId, stageMasterId: stage.id })
      await tx.delete(assetModelNetworks).where(eq(assetModelNetworks.assetModelId, modelId))
      await tx.insert(assetModelNetworks).values({ assetModelId: modelId, networkMasterId: network.id })
      const [saved] = await tx.update(catalogRequests).set({ modelId }).where(eq(catalogRequests.id, id)).returning()
      return saved
    })
    await this.audit.record(req, { module: 'catalog', entityType: 'catalog_request', entityId: id, action: 'reviewed', newData: dto })
    return row
  }

  @Post(':id/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(decisionSchema)) dto: z.infer<typeof decisionSchema>, @Req() req: AppRequest) {
    const result = await this.db.transaction(async tx => {
      const [request] = await tx.select().from(catalogRequests).where(eq(catalogRequests.id, id)).for('update')
      if (!request) throw new NotFoundException('Solicitud no encontrada')
      if (request.status !== 'PENDING') throw new ConflictException('La solicitud ya fue resuelta')
      if (!request.modelId) throw new BadRequestException('Completa y guarda primero la ficha de catálogo')
      const [plant] = await tx.select().from(plants).where(eq(plants.id, request.plantId))
      const [model] = await tx.select().from(assetModels).where(eq(assetModels.id, request.modelId)).for('update')
      const [type] = await tx.select().from(assetTypes).where(eq(assetTypes.id, model.assetTypeId))
      await validateFamilySpecifications(tx as unknown as Database, type.familyId, model.specifications as Record<string, unknown>)
      const draft = createAssetSchema.parse({ ...request.draft as object, assetModelId: model.id })
      const [stage] = await tx.select().from(stageMaster).where(eq(stageMaster.code, draft.stageCode))
      const [network] = await tx.select().from(networkMaster).where(eq(networkMaster.code, draft.networkCodes[0]))
      if (!stage || !network) throw new BadRequestException('La etapa o la red de la solicitud ya no está disponible')
      // La aprobación amplía las etapas posibles del tipo; guardar o rechazar no modifica esa configuración.
      // Todo se confirma junto con la publicación y el alta de planta, sin asociaciones parciales si falla el alta.
      await tx.insert(assetTypeStages).values({ assetTypeId: type.id, stageMasterId: stage.id }).onConflictDoNothing()
      await tx.insert(assetModelStages).values({ assetModelId: model.id, stageMasterId: stage.id }).onConflictDoNothing()
      await tx.insert(assetModelNetworks).values({ assetModelId: model.id, networkMasterId: network.id }).onConflictDoNothing()
      await tx.update(assetModels).set({ status: 'ACTIVE' }).where(eq(assetModels.id, model.id))
      const asset = await this.assets.inTransaction(tx).create(plant, draft, req, true)
      const [saved] = await tx.update(catalogRequests).set({ status: 'APPROVED', assetId: asset.id, decidedBy: req.user!.id, decidedAt: new Date(), decisionNote: dto.note || null }).where(eq(catalogRequests.id, id)).returning()
      return saved
    })
    await this.audit.record(req, { module: 'catalog', entityType: 'catalog_request', entityId: id, plantId: result.plantId, action: 'approved', newData: { assetId: result.assetId, modelId: result.modelId } })
    return result
  }

  @Post(':id/reject')
  async reject(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(decisionSchema.refine(v => !!v.note, 'Indica el motivo del rechazo'))) dto: z.infer<typeof decisionSchema>, @Req() req: AppRequest) {
    const result = await this.db.transaction(async tx => {
      const [request] = await tx.select().from(catalogRequests).where(eq(catalogRequests.id, id)).for('update')
      if (!request) throw new NotFoundException('Solicitud no encontrada')
      if (request.status !== 'PENDING') throw new ConflictException('La solicitud ya fue resuelta')
      const [saved] = await tx.update(catalogRequests).set({ status: 'REJECTED', decisionNote: dto.note, decidedBy: req.user!.id, decidedAt: new Date() }).where(eq(catalogRequests.id, id)).returning()
      return saved
    })
    await this.audit.record(req, { module: 'catalog', entityType: 'catalog_request', entityId: id, action: 'rejected', newData: { note: dto.note } })
    return result
  }
}
