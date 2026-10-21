import { randomUUID } from 'node:crypto'
import { Body, ConflictException, Controller, Delete, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { and, count, eq, inArray, notInArray, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import { validationError } from '../../common/errors'
import { isUniqueViolation } from '../../common/db-errors'
import type { AppRequest } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { DB, type Database } from '../../database/database.module'
import { assetFamilies, assetModels, assetModelStages, assetModelNetworks, assets, assetTypes, assetTypeStages, items as inventoryItems, listings, manufacturers, networkMaster, stageMaster } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { StorageService } from '../documents/storage.service'
import { GlobalAdminOnly } from '../iam/decorators'
import { inspectModelImage, modelImagePath } from './model-image'
import {
  type CreateFamilyDto,
  createFamilySchema,
  type CreateManufacturerDto,
  createManufacturerSchema,
  type CreateModelDto,
  createModelSchema,
  type CreateTypeDto,
  createTypeSchema,
  type UpdateFamilyDto,
  updateFamilySchema,
  type UpdateManufacturerDto,
  updateManufacturerSchema,
  type UpdateModelDto,
  updateModelSchema,
  type UpdateTypeDto,
  updateTypeSchema,
} from './catalog-admin.schemas'

/** Administración del catálogo maestro global (arquitectura §5.1): solo el administrador del ecosistema. */
@GlobalAdminOnly()
@Controller('catalog')
export class CatalogAdminController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private async record(req: AppRequest, entityType: string, entityId: string, action: string, data: { old?: unknown; new?: unknown }) {
    await this.audit.record(req, { module: 'catalog', entityType, entityId, action, oldData: data.old, newData: data.new })
  }

  private conflict(what: string): never {
    throw new ConflictException(`Ya existe ${what}`)
  }

  /**
   * Un registro del catálogo solo se elimina si nada lo usa: cada dependencia con filas bloquea con un mensaje que dice
   * qué lo usa y qué hacer. Lo que cuelga del registro y no tiene sentido sin él (valores, etapas, redes) se borra solo.
   */
  private async assertUnused(label: string, uses: Array<{ table: PgTable; column: PgColumn; id: string; text: (n: number) => string }>) {
    for (const u of uses) {
      const [{ n }] = await this.db.select({ n: count() }).from(u.table).where(eq(u.column, u.id) as SQL)
      if (n > 0) throw new ConflictException(`${label} ${u.text(n)}`)
    }
  }

  // ---------- Familias ----------

  @Post('families')
  async createFamily(@Body(new ZodValidationPipe(createFamilySchema)) dto: CreateFamilyDto, @Req() req: AppRequest) {
    const [row] = await this.db.insert(assetFamilies).values(dto).returning().catch((e) => (isUniqueViolation(e) ? this.conflict(`una familia con el código ${dto.code}`) : Promise.reject(e)))
    await this.record(req, 'asset_family', row.id, 'created', { new: dto })
    return row
  }

  @Patch('families/:id')
  async updateFamily(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateFamilySchema)) dto: UpdateFamilyDto, @Req() req: AppRequest) {
    const [before] = await this.db.select().from(assetFamilies).where(eq(assetFamilies.id, id))
    if (!before) throw new NotFoundException('Familia no encontrada')
    const [row] = await this.db.update(assetFamilies).set(dto).where(eq(assetFamilies.id, id)).returning()
    await this.record(req, 'asset_family', id, 'updated', { old: before, new: dto })
    return row
  }

  @Delete('families/:id')
  @HttpCode(204)
  async deleteFamily(@Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    const [before] = await this.db.select().from(assetFamilies).where(eq(assetFamilies.id, id))
    if (!before) throw new NotFoundException('Familia no encontrada')
    await this.assertUnused(`No se puede eliminar la familia «${before.name}»:`, [
      { table: assetTypes, column: assetTypes.familyId, id, text: (n) => `tiene ${n} tipo(s). Elimina o mueve esos tipos a otra familia primero.` },
      { table: listings, column: listings.assetFamilyId, id, text: (n) => `la usan ${n} publicación(es) del marketplace.` },
    ])
    await this.db.delete(assetFamilies).where(eq(assetFamilies.id, id))
    await this.record(req, 'asset_family', id, 'deleted', { old: before })
  }

  // ---------- Tipos ----------

  private async familyId(code: string) {
    const [f] = await this.db.select({ id: assetFamilies.id }).from(assetFamilies).where(eq(assetFamilies.code, code))
    if (!f) throw validationError('familyCode', `La familia ${code} no existe`)
    return f.id
  }

  /** Resuelve códigos de un maestro (etapas o redes) a ids; un código que no existe es un error de validación del campo. */
  private async masterIds(field: 'stageCodes' | 'networkCodes', codes: string[]): Promise<string[]> {
    if (codes.length === 0) return []
    const table = field === 'stageCodes' ? stageMaster : networkMaster
    const rows = await this.db.select({ id: table.id, code: table.code }).from(table).where(inArray(table.code, codes))
    const missing = codes.filter((c) => !rows.some((r) => r.code === c))
    if (missing.length > 0) throw validationError(field, `${field === 'stageCodes' ? 'La etapa' : 'La red'} ${missing.join(', ')} no existe`)
    return rows.map((r) => r.id)
  }

  /** Reemplaza las etapas posibles del tipo (lo que no viene en el cuerpo no se toca). */
  private async replaceLinks(typeId: string, dto: { stageCodes?: string[] }) {
    const stageIds = dto.stageCodes ? await this.masterIds('stageCodes', dto.stageCodes) : undefined
    await this.db.transaction(async (tx) => {
      if (stageIds) {
        await tx.delete(assetTypeStages).where(eq(assetTypeStages.assetTypeId, typeId))
        if (stageIds.length > 0) await tx.insert(assetTypeStages).values(stageIds.map((stageMasterId) => ({ assetTypeId: typeId, stageMasterId })))
        // Las etapas del tipo son las posibles: un modelo no puede conservar una que el tipo ya no admite.
        const modelIds = tx.select({ id: assetModels.id }).from(assetModels).where(eq(assetModels.assetTypeId, typeId))
        await tx.delete(assetModelStages).where(and(inArray(assetModelStages.assetModelId, modelIds), stageIds.length > 0 ? notInArray(assetModelStages.stageMasterId, stageIds) : undefined))
      }
    })
  }

  @Post('types')
  async createType(@Body(new ZodValidationPipe(createTypeSchema)) dto: CreateTypeDto, @Req() req: AppRequest) {
    const familyId = await this.familyId(dto.familyCode)
    // Valida los códigos antes de crear nada.
    await this.masterIds('stageCodes', dto.stageCodes ?? [])
    const [row] = await this.db
      .insert(assetTypes)
      .values({ familyId, code: dto.code, name: dto.name, description: dto.description })
      .returning()
      .catch((e) => (isUniqueViolation(e) ? this.conflict(`un tipo con el código ${dto.code}`) : Promise.reject(e)))
    await this.replaceLinks(row.id, dto)
    await this.record(req, 'asset_type', row.id, 'created', { new: dto })
    return { ...row, stageCodes: dto.stageCodes ?? [] }
  }

  @Patch('types/:id')
  async updateType(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateTypeSchema)) dto: UpdateTypeDto, @Req() req: AppRequest) {
    const [before] = await this.db.select().from(assetTypes).where(eq(assetTypes.id, id))
    if (!before) throw new NotFoundException('Tipo no encontrado')
    const { familyCode, stageCodes, ...rest } = dto
    const familyId = familyCode ? await this.familyId(familyCode) : undefined
    await this.masterIds('stageCodes', stageCodes ?? [])
    const fields = { ...rest, ...(familyId && { familyId }) }
    const [row] = Object.keys(fields).length > 0 ? await this.db.update(assetTypes).set(fields).where(eq(assetTypes.id, id)).returning() : [before]
    await this.replaceLinks(id, { stageCodes })
    await this.record(req, 'asset_type', id, 'updated', { old: before, new: dto })
    return row
  }

  @Delete('types/:id')
  @HttpCode(204)
  async deleteType(@Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    const [before] = await this.db.select().from(assetTypes).where(eq(assetTypes.id, id))
    if (!before) throw new NotFoundException('Tipo no encontrado')
    await this.assertUnused(`No se puede eliminar el tipo «${before.name}»:`, [
      { table: assetModels, column: assetModels.assetTypeId, id, text: (n) => `tiene ${n} modelo(s). Elimina esos modelos o cámbialos de tipo primero.` },
    ])
    // Sus etapas y la asociación con variables caen en cascada.
    await this.db.delete(assetTypes).where(eq(assetTypes.id, id))
    await this.record(req, 'asset_type', id, 'deleted', { old: before })
  }

  // ---------- Fabricantes ----------

  @Post('manufacturers')
  async createManufacturer(@Body(new ZodValidationPipe(createManufacturerSchema)) dto: CreateManufacturerDto, @Req() req: AppRequest) {
    const [row] = await this.db.insert(manufacturers).values(dto).returning().catch((e) => (isUniqueViolation(e) ? this.conflict(`un fabricante llamado ${dto.name}`) : Promise.reject(e)))
    await this.record(req, 'manufacturer', row.id, 'created', { new: dto })
    return row
  }

  @Patch('manufacturers/:id')
  async updateManufacturer(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateManufacturerSchema)) dto: UpdateManufacturerDto, @Req() req: AppRequest) {
    const [before] = await this.db.select().from(manufacturers).where(eq(manufacturers.id, id))
    if (!before) throw new NotFoundException('Fabricante no encontrado')
    const [row] = await this.db
      .update(manufacturers)
      .set(dto)
      .where(eq(manufacturers.id, id))
      .returning()
      .catch((e) => (isUniqueViolation(e) ? this.conflict(`un fabricante llamado ${dto.name}`) : Promise.reject(e)))
    await this.record(req, 'manufacturer', id, 'updated', { old: before, new: dto })
    return row
  }

  @Delete('manufacturers/:id')
  @HttpCode(204)
  async deleteManufacturer(@Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    const [before] = await this.db.select().from(manufacturers).where(eq(manufacturers.id, id))
    if (!before) throw new NotFoundException('Fabricante no encontrado')
    await this.assertUnused(`No se puede eliminar el fabricante «${before.name}»:`, [
      { table: assetModels, column: assetModels.manufacturerId, id, text: (n) => `lo usan ${n} modelo(s). Cámbialos de fabricante o elimínalos primero.` },
      { table: assets, column: assets.manufacturerId, id, text: (n) => `lo usan ${n} activo(s) de planta.` },
    ])
    await this.db.delete(manufacturers).where(eq(manufacturers.id, id))
    await this.record(req, 'manufacturer', id, 'deleted', { old: before })
  }

  // ---------- Modelos ----------

  private async assertManufacturer(id: string | null | undefined) {
    if (!id) return
    const [m] = await this.db.select({ id: manufacturers.id }).from(manufacturers).where(eq(manufacturers.id, id))
    if (!m) throw validationError('manufacturerId', 'El fabricante no existe')
  }

  /**
   * Etapas donde participa un modelo: deben ser un subconjunto de las posibles del tipo. Devuelve los ids a guardar; vacío =
   * hereda todas las del tipo (también cuando se marcan todas, para que siga heredando si el tipo agrega etapas).
   */
  private async modelStageIds(typeId: string, codes: string[]): Promise<string[]> {
    if (codes.length === 0) return []
    const typeStages = await this.db
      .select({ id: stageMaster.id, code: stageMaster.code })
      .from(assetTypeStages)
      .innerJoin(stageMaster, eq(stageMaster.id, assetTypeStages.stageMasterId))
      .where(eq(assetTypeStages.assetTypeId, typeId))
    const outside = codes.filter((c) => !typeStages.some((s) => s.code === c))
    if (outside.length > 0) {
      throw validationError('stageCodes', `Las etapas ${outside.join(', ')} no están entre las posibles del tipo (${typeStages.map((s) => s.code).join(', ') || 'ninguna'}). Agrégalas primero al tipo.`)
    }
    return codes.length === typeStages.length ? [] : typeStages.filter((s) => codes.includes(s.code)).map((s) => s.id)
  }

  private async replaceModelLinks(tx: Pick<Database, 'delete' | 'insert'>, modelId: string, stageIds?: string[], networkIds?: string[]) {
    if (stageIds) {
      await tx.delete(assetModelStages).where(eq(assetModelStages.assetModelId, modelId))
      if (stageIds.length > 0) await tx.insert(assetModelStages).values(stageIds.map((stageMasterId) => ({ assetModelId: modelId, stageMasterId })))
    }
    if (networkIds) {
      await tx.delete(assetModelNetworks).where(eq(assetModelNetworks.assetModelId, modelId))
      if (networkIds.length > 0) await tx.insert(assetModelNetworks).values(networkIds.map((networkMasterId) => ({ assetModelId: modelId, networkMasterId })))
    }
  }

  private async networksOf(modelId: string) {
    const rows = await this.db.select({ code: networkMaster.code }).from(assetModelNetworks)
      .innerJoin(networkMaster, eq(networkMaster.id, assetModelNetworks.networkMasterId))
      .where(eq(assetModelNetworks.assetModelId, modelId))
    return rows.map(row => row.code).sort()
  }

  /** Etapas efectivas del modelo (las suyas o, si no declaró, las del tipo) y si las hereda. */
  private async stagesOf(modelId: string, typeId: string) {
    const own = await this.db
      .select({ code: stageMaster.code })
      .from(assetModelStages)
      .innerJoin(stageMaster, eq(stageMaster.id, assetModelStages.stageMasterId))
      .where(eq(assetModelStages.assetModelId, modelId))
    if (own.length > 0) return { stageCodes: own.map((s) => s.code).sort(), stageInherited: false }
    const inherited = await this.db
      .select({ code: stageMaster.code })
      .from(assetTypeStages)
      .innerJoin(stageMaster, eq(stageMaster.id, assetTypeStages.stageMasterId))
      .where(eq(assetTypeStages.assetTypeId, typeId))
    return { stageCodes: inherited.map((s) => s.code).sort(), stageInherited: true }
  }

  @Post('models')
  async createModel(@Body(new ZodValidationPipe(createModelSchema)) dto: CreateModelDto, @Req() req: AppRequest) {
    const [type] = await this.db.select({ id: assetTypes.id }).from(assetTypes).where(eq(assetTypes.code, dto.typeCode))
    if (!type) throw validationError('typeCode', `El tipo ${dto.typeCode} no existe`)
    await this.assertManufacturer(dto.manufacturerId)
    const stageIds = await this.modelStageIds(type.id, dto.stageCodes ?? []) // valida antes de crear nada
    const networkIds = await this.masterIds('networkCodes', dto.networkCodes ?? [])

    const row = await this.db.transaction(async tx => {
      const [created] = await tx.insert(assetModels)
        .values({ assetTypeId: type.id, manufacturerId: dto.manufacturerId, modelName: dto.modelName, specifications: dto.specifications, technicalData: dto.technicalData })
        .returning()
      await this.replaceModelLinks(tx, created.id, stageIds, networkIds)
      return created
    }).catch((e) => (isUniqueViolation(e) ? this.conflict(`el modelo ${dto.modelName} para ese tipo y fabricante`) : Promise.reject(e)))
    await this.record(req, 'asset_model', row.id, 'created', { new: { typeCode: dto.typeCode, modelName: dto.modelName, manufacturerId: dto.manufacturerId, stageCodes: dto.stageCodes, networkCodes: dto.networkCodes ?? [] } })
    return { ...row, ...(await this.stagesOf(row.id, type.id)), networkCodes: await this.networksOf(row.id) }
  }

  @Patch('models/:id')
  async updateModel(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateModelSchema)) dto: UpdateModelDto, @Req() req: AppRequest) {
    const [before] = await this.db.select().from(assetModels).where(eq(assetModels.id, id))
    if (!before) throw new NotFoundException('Modelo no encontrado')
    await this.assertManufacturer(dto.manufacturerId)
    const { stageCodes, networkCodes, ...fields } = dto
    const stageIds = stageCodes ? await this.modelStageIds(before.assetTypeId, stageCodes) : undefined
    const networkIds = networkCodes ? await this.masterIds('networkCodes', networkCodes) : undefined
    const oldNetworkCodes = await this.networksOf(id)
    const row = await this.db.transaction(async tx => {
      // Serializa también las ediciones que cambian solo vínculos y ninguna columna del modelo.
      const [current] = await tx.select().from(assetModels).where(eq(assetModels.id, id)).for('update')
      if (!current) throw new NotFoundException('Modelo no encontrado')
      const [updated] = Object.keys(fields).length ? await tx.update(assetModels).set(fields).where(eq(assetModels.id, id)).returning() : [current]
      await this.replaceModelLinks(tx, id, stageIds, networkIds)
      return updated
    }).catch((e) => (isUniqueViolation(e) ? this.conflict(`el modelo ${dto.modelName} para ese tipo y fabricante`) : Promise.reject(e)))
    await this.record(req, 'asset_model', id, dto.status && dto.status !== before.status ? `status.${dto.status.toLowerCase()}` : 'updated', {
      old: { modelName: before.modelName, status: before.status, networkCodes: oldNetworkCodes },
      new: dto,
    })
    return { ...row, ...(await this.stagesOf(id, before.assetTypeId)), networkCodes: await this.networksOf(id) }
  }

  @Delete('models/:id')
  @HttpCode(204)
  async deleteModel(@Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    const [before] = await this.db.select().from(assetModels).where(eq(assetModels.id, id))
    if (!before) throw new NotFoundException('Modelo no encontrado')
    await this.assertUnused(`No se puede eliminar el modelo «${before.modelName}»:`, [
      { table: assets, column: assets.assetModelId, id, text: (n) => `lo usan ${n} activo(s) de planta. Desactívalo, o cambia el modelo de esos activos, antes de eliminarlo.` },
      { table: inventoryItems, column: inventoryItems.assetModelId, id, text: (n) => `está vinculado a ${n} ítem(s) de inventario.` },
    ])
    // Los valores de «Datos del fabricante» caen en cascada; las publicaciones del marketplace quedan sin modelo.
    await this.db.delete(assetModels).where(eq(assetModels.id, id))
    if (before.imageKey) await this.storage.delete(before.imageKey).catch(() => undefined)
    await this.record(req, 'asset_model', id, 'deleted', { old: { modelName: before.modelName, status: before.status, manufacturerId: before.manufacturerId } })
  }

  // ---------- Foto del modelo ----------

  /** multipart/form-data con el campo `file`. Los guards corren antes que multer: sin ser administrador no se procesa el archivo. */
  @Post('models/:id/image')
  @UseInterceptors(FileInterceptor('file'))
  async setModelImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: AppRequest) {
    const [before] = await this.db.select({ id: assetModels.id, imageKey: assetModels.imageKey }).from(assetModels).where(eq(assetModels.id, id))
    if (!before) throw new NotFoundException('Modelo no encontrado')

    const image = inspectModelImage(file)
    // Clave nueva por subida (el driver nunca sobrescribe): la foto anterior solo se borra cuando la nueva ya quedó registrada.
    const key = `catalog/models/${id}/${randomUUID()}.${image.extension}`
    await this.storage.put(key, image.data)
    const updatedAt = new Date()
    try {
      await this.db.update(assetModels).set({ imageKey: key, imageMime: image.mimeType, imageUpdatedAt: updatedAt }).where(eq(assetModels.id, id))
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined)
      throw e
    }
    if (before.imageKey) await this.storage.delete(before.imageKey).catch(() => undefined)

    await this.record(req, 'asset_model', id, 'image.updated', { old: { hadImage: !!before.imageKey }, new: { mimeType: image.mimeType, sizeBytes: image.data.length } })
    return { id, imageUrl: modelImagePath(id, updatedAt) }
  }

  @Delete('models/:id/image')
  @HttpCode(204)
  async removeModelImage(@Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    const [before] = await this.db.select({ imageKey: assetModels.imageKey }).from(assetModels).where(eq(assetModels.id, id))
    if (!before) throw new NotFoundException('Modelo no encontrado')
    if (!before.imageKey) return
    await this.db.update(assetModels).set({ imageKey: null, imageMime: null, imageUpdatedAt: null }).where(eq(assetModels.id, id))
    await this.storage.delete(before.imageKey).catch(() => undefined)
    await this.record(req, 'asset_model', id, 'image.removed', { old: { hadImage: true } })
  }
}
