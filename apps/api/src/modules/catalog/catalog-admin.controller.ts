import { randomUUID } from 'node:crypto'
import { Body, ConflictException, Controller, Delete, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { eq } from 'drizzle-orm'
import { validationError } from '../../common/errors'
import { isUniqueViolation } from '../../common/db-errors'
import type { AppRequest } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { DB, type Database } from '../../database/database.module'
import { assetFamilies, assetModels, assetTypes, manufacturers } from '../../database/schema'
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

  // ---------- Tipos ----------

  private async familyId(code: string) {
    const [f] = await this.db.select({ id: assetFamilies.id }).from(assetFamilies).where(eq(assetFamilies.code, code))
    if (!f) throw validationError('familyCode', `La familia ${code} no existe`)
    return f.id
  }

  @Post('types')
  async createType(@Body(new ZodValidationPipe(createTypeSchema)) dto: CreateTypeDto, @Req() req: AppRequest) {
    const familyId = await this.familyId(dto.familyCode)
    const [row] = await this.db
      .insert(assetTypes)
      .values({ familyId, code: dto.code, name: dto.name, description: dto.description })
      .returning()
      .catch((e) => (isUniqueViolation(e) ? this.conflict(`un tipo con el código ${dto.code}`) : Promise.reject(e)))
    await this.record(req, 'asset_type', row.id, 'created', { new: dto })
    return row
  }

  @Patch('types/:id')
  async updateType(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateTypeSchema)) dto: UpdateTypeDto, @Req() req: AppRequest) {
    const [before] = await this.db.select().from(assetTypes).where(eq(assetTypes.id, id))
    if (!before) throw new NotFoundException('Tipo no encontrado')
    const { familyCode, ...rest } = dto
    const [row] = await this.db
      .update(assetTypes)
      .set({ ...rest, ...(familyCode && { familyId: await this.familyId(familyCode) }) })
      .where(eq(assetTypes.id, id))
      .returning()
    await this.record(req, 'asset_type', id, 'updated', { old: before, new: dto })
    return row
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

  // ---------- Modelos ----------

  private async assertManufacturer(id: string | null | undefined) {
    if (!id) return
    const [m] = await this.db.select({ id: manufacturers.id }).from(manufacturers).where(eq(manufacturers.id, id))
    if (!m) throw validationError('manufacturerId', 'El fabricante no existe')
  }

  @Post('models')
  async createModel(@Body(new ZodValidationPipe(createModelSchema)) dto: CreateModelDto, @Req() req: AppRequest) {
    const [type] = await this.db.select({ id: assetTypes.id }).from(assetTypes).where(eq(assetTypes.code, dto.typeCode))
    if (!type) throw validationError('typeCode', `El tipo ${dto.typeCode} no existe`)
    await this.assertManufacturer(dto.manufacturerId)

    const [row] = await this.db
      .insert(assetModels)
      .values({ assetTypeId: type.id, manufacturerId: dto.manufacturerId, modelName: dto.modelName, specifications: dto.specifications, technicalData: dto.technicalData })
      .returning()
      .catch((e) => (isUniqueViolation(e) ? this.conflict(`el modelo ${dto.modelName} para ese tipo y fabricante`) : Promise.reject(e)))
    await this.record(req, 'asset_model', row.id, 'created', { new: { typeCode: dto.typeCode, modelName: dto.modelName, manufacturerId: dto.manufacturerId } })
    return row
  }

  @Patch('models/:id')
  async updateModel(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateModelSchema)) dto: UpdateModelDto, @Req() req: AppRequest) {
    const [before] = await this.db.select().from(assetModels).where(eq(assetModels.id, id))
    if (!before) throw new NotFoundException('Modelo no encontrado')
    await this.assertManufacturer(dto.manufacturerId)
    const [row] = await this.db
      .update(assetModels)
      .set(dto)
      .where(eq(assetModels.id, id))
      .returning()
      .catch((e) => (isUniqueViolation(e) ? this.conflict(`el modelo ${dto.modelName} para ese tipo y fabricante`) : Promise.reject(e)))
    await this.record(req, 'asset_model', id, dto.status && dto.status !== before.status ? `status.${dto.status.toLowerCase()}` : 'updated', {
      old: { modelName: before.modelName, status: before.status },
      new: dto,
    })
    return row
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
