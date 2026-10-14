import { randomUUID } from 'node:crypto'
import { Body, Controller, Delete, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { AppRequest } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { DB, type Database } from '../../database/database.module'
import { stageMaster } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { inspectImage } from '../documents/image-upload'
import { StorageService } from '../documents/storage.service'
import { GlobalAdminOnly } from '../iam/decorators'
import { stageLayoutPath, stageSelect } from './stages.controller'

/** Solo la descripción es editable: el código, el nombre y el orden son los de las 19 etapas oficiales. */
const updateStageSchema = z.object({ description: z.string().trim().max(2000).nullable() })
type UpdateStageDto = z.infer<typeof updateStageSchema>

/** Edición del maestro de etapas (descripción e imagen del layout): solo el administrador del ecosistema. */
@GlobalAdminOnly()
@Controller('stages/catalog')
export class StagesAdminController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private async find(id: string) {
    const [row] = await this.db.select().from(stageMaster).where(eq(stageMaster.id, id))
    if (!row) throw new NotFoundException('Etapa no encontrada')
    return row
  }

  private async view(id: string) {
    const [row] = await this.db.select(stageSelect).from(stageMaster).where(eq(stageMaster.id, id))
    return row
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateStageSchema)) dto: UpdateStageDto, @Req() req: AppRequest) {
    const before = await this.find(id)
    const description = dto.description === '' ? null : dto.description
    await this.db.update(stageMaster).set({ description }).where(eq(stageMaster.id, id))
    await this.audit.record(req, { module: 'process', entityType: 'stage_master', entityId: id, action: 'updated', oldData: { code: before.code, description: before.description }, newData: { description } })
    return this.view(id)
  }

  /** multipart/form-data con el campo `file`. Los guards corren antes que multer: sin ser administrador no se procesa el archivo. */
  @Post(':id/layout')
  @UseInterceptors(FileInterceptor('file'))
  async setLayout(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: AppRequest) {
    const before = await this.find(id)
    const image = inspectImage(file)
    // Clave nueva por subida: la imagen anterior solo se borra cuando la nueva ya quedó registrada.
    const key = `catalog/stages/${id}/${randomUUID()}.${image.extension}`
    await this.storage.put(key, image.data)
    const updatedAt = new Date()
    try {
      await this.db.update(stageMaster).set({ layoutImageKey: key, layoutImageMime: image.mimeType, layoutImageUpdatedAt: updatedAt }).where(eq(stageMaster.id, id))
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined)
      throw e
    }
    if (before.layoutImageKey) await this.storage.delete(before.layoutImageKey).catch(() => undefined)
    await this.audit.record(req, {
      module: 'process',
      entityType: 'stage_master',
      entityId: id,
      action: 'layout.updated',
      oldData: { code: before.code, hadImage: !!before.layoutImageKey },
      newData: { mimeType: image.mimeType, sizeBytes: image.data.length },
    })
    return { id, layoutImageUrl: stageLayoutPath(id, updatedAt) }
  }

  @Delete(':id/layout')
  @HttpCode(204)
  async removeLayout(@Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    const before = await this.find(id)
    if (!before.layoutImageKey) return
    await this.db.update(stageMaster).set({ layoutImageKey: null, layoutImageMime: null, layoutImageUpdatedAt: null }).where(eq(stageMaster.id, id))
    await this.storage.delete(before.layoutImageKey).catch(() => undefined)
    await this.audit.record(req, { module: 'process', entityType: 'stage_master', entityId: id, action: 'layout.removed', oldData: { code: before.code, hadImage: true } })
  }
}
