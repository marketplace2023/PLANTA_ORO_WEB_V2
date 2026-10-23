import { randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { eq, inArray, sql } from 'drizzle-orm'
import type { AppRequest } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { assetModels, auditEvents } from '../../database/schema'
import { StorageService } from '../documents/storage.service'
import { IMAGE_MAX_BYTES } from '../documents/image-upload'
import { inspectModelImage, modelImagePath } from './model-image'
import { imageFilenameTag, type PreviewCatalogImagesDto, type UploadCatalogImageDto } from './catalog-images.schemas'

type ImageState = 'READY' | 'EXISTING' | 'NOT_FOUND' | 'DUPLICATE' | 'INVALID' | 'AMBIGUOUS'
type ImageModel = Pick<typeof assetModels.$inferSelect, 'id' | 'catalogTag' | 'modelName' | 'imageKey' | 'imageUpdatedAt'>
const normalizedTag = sql<string>`upper(trim(${assetModels.catalogTag}))`
const version = (model: ImageModel) => model.imageUpdatedAt?.toISOString() ?? 'NONE'

@Injectable()
export class CatalogImagesService {
  private readonly logger = new Logger(CatalogImagesService.name)
  constructor(@Inject(DB) private readonly db: Database, private readonly storage: StorageService) {}

  async preview(dto: PreviewCatalogImagesDto) {
    const tags = dto.files.map(file => imageFilenameTag(file.name))
    const unique = [...new Set(tags.filter((tag): tag is string => tag !== null))]
    const models = unique.length ? await this.db.select({
      id: assetModels.id, catalogTag: assetModels.catalogTag, modelName: assetModels.modelName,
      imageKey: assetModels.imageKey, imageUpdatedAt: assetModels.imageUpdatedAt,
    }).from(assetModels).where(inArray(normalizedTag, unique)) : []
    return { rows: dto.files.map((file, index) => {
      const tag = tags[index]
      const matches = tag ? models.filter(model => model.catalogTag?.trim().toUpperCase() === tag) : []
      const model = matches.length === 1 ? matches[0] : null
      let state: ImageState, message: string
      if (!tag) { state = 'INVALID'; message = 'Usa el TAG como nombre y una extensión PNG, JPG o WebP.' }
      else if (!file.size || file.size > IMAGE_MAX_BYTES) { state = 'INVALID'; message = 'La imagen debe tener contenido y pesar como máximo 5 MB.' }
      else if (tags.filter(other => other === tag).length > 1) { state = 'DUPLICATE'; message = 'Hay más de una imagen para este TAG. Deja un solo archivo.' }
      else if (matches.length > 1) { state = 'AMBIGUOUS'; message = 'Más de un modelo coincide con este TAG. Revisa el catálogo.' }
      else if (!model) { state = 'NOT_FOUND'; message = 'No existe un modelo del catálogo con este TAG.' }
      else if (model.imageKey) { state = 'EXISTING'; message = 'Ya tiene imagen. Se conservará salvo que actives el reemplazo.' }
      else { state = 'READY'; message = 'Listo para adjuntar.' }
      return { index, filename: file.name, tag, state, message, modelId: model?.id ?? null,
        modelName: model?.modelName ?? null, imageUrl: model ? modelImagePath(model.id, model.imageUpdatedAt) : null,
        imageVersion: model ? version(model) : '' }
    }) }
  }

  /** Una petición por archivo mantiene el límite de 5 MB y permite continuar si otra imagen falla. */
  async upload(file: Express.Multer.File | undefined, dto: UploadCatalogImageDto, req: AppRequest) {
    const image = inspectModelImage(file)
    const tag = imageFilenameTag(file!.originalname)
    if (!tag) throw new BadRequestException('El nombre del archivo debe ser el TAG del modelo seguido de su extensión de imagen.')
    let newKey: string | undefined
    let saved: { id: string; previousKey: string | null; updatedAt: Date }
    try {
      saved = await this.db.transaction(async tx => {
        const matches = await tx.select().from(assetModels).where(eq(normalizedTag, tag)).for('update')
        if (!matches.length) throw new NotFoundException('No existe un modelo con este TAG. Vuelve a analizar las imágenes.')
        if (matches.length !== 1) throw new ConflictException('El TAG coincide con varios modelos. Revisa el catálogo.')
        const model = matches[0]
        if (model.id !== dto.modelId || version(model) !== dto.imageVersion) {
          throw new ConflictException('El modelo o su imagen cambió desde el análisis. Vuelve a analizar las imágenes.')
        }
        if (model.imageKey && !dto.replaceExisting) throw new ConflictException('El modelo ya tiene imagen. Activa el reemplazo para cambiarla.')
        const key = `catalog/models/${model.id}/${randomUUID()}.${image.extension}`
        newKey = key
        await this.storage.put(key, image.data)
        const updatedAt = new Date(Math.max(Date.now(), (model.imageUpdatedAt?.getTime() ?? 0) + 1))
        await tx.update(assetModels).set({ imageKey: key, imageMime: image.mimeType, imageUpdatedAt: updatedAt }).where(eq(assetModels.id, model.id))
        await tx.insert(auditEvents).values({ module: 'catalog', entityType: 'asset_model', entityId: model.id,
          action: 'image.updated', userId: req.user?.id, oldData: { hadImage: !!model.imageKey },
          newData: { source: 'bulk-tag', tag, filename: file!.originalname, mimeType: image.mimeType, sizeBytes: image.data.length },
          ipAddress: req.ip, userAgent: req.headers['user-agent'], correlationId: req.correlationId })
        return { id: model.id, previousKey: model.imageKey, updatedAt }
      })
    } catch (error) {
      if (newKey) await this.storage.delete(newKey).catch(() => this.logger.warn('No se pudo limpiar una imagen que no se guardó.'))
      throw error
    }
    if (saved.previousKey) await this.storage.delete(saved.previousKey).catch(() => this.logger.warn('No se pudo limpiar la imagen reemplazada.'))
    return { id: saved.id, tag, imageUrl: modelImagePath(saved.id, saved.updatedAt) }
  }
}
