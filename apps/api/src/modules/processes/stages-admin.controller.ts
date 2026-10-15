import { randomUUID } from 'node:crypto'
import { Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isUniqueViolation } from '../../common/db-errors'
import type { AppRequest } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { DB, type Database } from '../../database/database.module'
import { plantStages, stageMaster } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { inspectImage } from '../documents/image-upload'
import { StorageService } from '../documents/storage.service'
import { GlobalAdminOnly } from '../iam/decorators'
import { stageLayoutPath, stageSelect } from './stages.controller'

/** Colores que ya definen las hojas de estilo de todos los portales (`--fur-<color>-500`). */
export const STAGE_COLOR_TOKENS = ['orange', 'blue', 'green', 'purple', 'yellow', 'cyan'] as const

/** Mismo formato que ya exige el resto de la API para referirse a una etapa (`D06`). */
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^D\d{2}$/, 'Formato D seguido de 2 dígitos (p. ej. D20)')
const name = z.string().trim().min(2).max(200)
/** Los grupos se guardan en mayúsculas (`TRITURACION`) y sirven de clave para agrupar etapas. */
const stageGroup = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .transform((s) => s.replace(/\s+/g, ' ').toUpperCase())
const description = z.string().trim().max(2000)
const sequence = z.number().int().min(1).max(999)
const colorToken = z.enum(STAGE_COLOR_TOKENS)

const createStageSchema = z.object({ code, name, stageGroup, colorToken: colorToken.optional(), description: description.optional(), sequenceDefault: sequence.optional() })
const updateStageSchema = z
  .object({ name, stageGroup, colorToken: colorToken.nullable(), description: description.nullable(), sequenceDefault: sequence })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')
const deleteQuery = z.object({ force: z.enum(['true', 'false']).default('false') })

type CreateStageDto = z.infer<typeof createStageSchema>
type UpdateStageDto = z.infer<typeof updateStageSchema>

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Administración del maestro de etapas: solo el administrador del ecosistema. El código es inmutable una vez creada la etapa;
 * nombre, grupo, color, orden, descripción e imagen del layout se editan. La lectura es pública (`StagesController`).
 */
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

  /** Dónde se usa cada etapa: plantas que la habilitan, activos asignados a ella y tipos del catálogo. */
  private usageOf(id: string) {
    return this.db
      .execute<{ plants: number; assets: number; types: number }>(
        sql`select
          (select count(*)::int from process.plant_stages where stage_master_id = ${id}) as plants,
          (select count(*)::int from asset.assets a join process.plant_stages ps on ps.id = a.plant_stage_id where ps.stage_master_id = ${id}) as assets,
          (select count(*)::int from catalog.asset_type_stages where stage_master_id = ${id}) as types`,
      )
      .then((r) => r.rows[0])
  }

  /** Uso de todas las etapas, para mostrar en el listado de administración. */
  @Get('usage')
  usage() {
    return this.db
      .select({
        id: stageMaster.id,
        // Referencia calificada a mano: en un select de una sola tabla drizzle omite el prefijo y `id` se confundiría con el de la subconsulta.
        plants: sql<number>`(select count(*)::int from process.plant_stages ps where ps.stage_master_id = process.stage_master.id)`,
        assets: sql<number>`(select count(*)::int from asset.assets a join process.plant_stages ps on ps.id = a.plant_stage_id where ps.stage_master_id = process.stage_master.id)`,
        types: sql<number>`(select count(*)::int from catalog.asset_type_stages ats where ats.stage_master_id = process.stage_master.id)`,
      })
      .from(stageMaster)
      .orderBy(asc(stageMaster.sequenceDefault))
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createStageSchema)) dto: CreateStageDto, @Req() req: AppRequest) {
    // Sin orden indicado, la etapa nueva va al final.
    const sequenceDefault = dto.sequenceDefault ?? ((await this.db.select({ n: sql<number>`coalesce(max(${stageMaster.sequenceDefault}), 0)::int` }).from(stageMaster))[0].n + 1)
    const [created] = await this.db
      .insert(stageMaster)
      .values({ code: dto.code, name: dto.name, stageGroup: dto.stageGroup, colorToken: dto.colorToken ?? null, description: dto.description || null, sequenceDefault })
      .returning({ id: stageMaster.id })
      .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException(`Ya existe una etapa con el código ${dto.code}`)) : Promise.reject(e)))
    await this.audit.record(req, { module: 'process', entityType: 'stage_master', entityId: created.id, action: 'created', newData: { ...dto, sequenceDefault } })
    return this.view(created.id)
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateStageSchema)) dto: UpdateStageDto, @Req() req: AppRequest) {
    const before = await this.find(id)
    const changes = { ...dto, ...(dto.description !== undefined && { description: dto.description === '' ? null : dto.description }) }
    await this.db.update(stageMaster).set(changes).where(eq(stageMaster.id, id))
    await this.audit.record(req, {
      module: 'process',
      entityType: 'stage_master',
      entityId: id,
      action: 'updated',
      oldData: { code: before.code, name: before.name, stageGroup: before.stageGroup, colorToken: before.colorToken, sequenceDefault: before.sequenceDefault, description: before.description },
      newData: changes,
    })
    return this.view(id)
  }

  /**
   * Elimina la etapa. Si alguna planta la tiene habilitada se rechaza (409) con el detalle de uso, salvo `?force=true`: entonces
   * también se quita de esas plantas (sus conexiones de flujo caen en cascada y los activos quedan sin etapa). Los vínculos con
   * tipos del catálogo, variables, cursos y productos caen en cascada.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(deleteQuery)) q: z.infer<typeof deleteQuery>, @Req() req: AppRequest) {
    const before = await this.find(id)
    const usage = await this.usageOf(id)
    if (usage.plants > 0 && q.force !== 'true') {
      throw new ConflictException(
        `La etapa ${before.code} está habilitada en ${plural(usage.plants, 'planta', 'plantas')}${usage.assets > 0 ? ` y asignada a ${plural(usage.assets, 'activo', 'activos')}` : ''}. Confirma la eliminación para quitarla también de ellas.`,
      )
    }
    await this.db.transaction(async (tx) => {
      await tx.delete(plantStages).where(eq(plantStages.stageMasterId, id)) // las conexiones de flujo caen en cascada; los activos quedan sin etapa
      await tx.delete(stageMaster).where(eq(stageMaster.id, id))
    })
    if (before.layoutImageKey) await this.storage.delete(before.layoutImageKey).catch(() => undefined)
    await this.audit.record(req, {
      module: 'process',
      entityType: 'stage_master',
      entityId: id,
      action: 'deleted',
      oldData: { code: before.code, name: before.name },
      newData: { removedFromPlants: usage.plants, unassignedAssets: usage.assets, unlinkedTypes: usage.types },
    })
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
