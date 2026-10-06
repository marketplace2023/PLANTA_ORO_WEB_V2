import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Query, Res, StreamableFile } from '@nestjs/common'
import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import type { Response } from 'express'
import { z } from 'zod'
import { escapeLike, pageOf, paginationShape } from '../../common/pagination'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { DB, type Database } from '../../database/database.module'
import { assetFamilies, assetModels, assetTypes, manufacturers } from '../../database/schema'
import type { AuthUser } from '../../common/types'
import { setImageHeaders } from '../documents/image-upload'
import { StorageService } from '../documents/storage.service'
import { CurrentUser, Public } from '../iam/decorators'

const modelsQuery = z.object({
  ...paginationShape,
  family: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  manufacturerId: z.uuid().optional(),
  search: z.string().trim().min(1).max(100).optional(),
  /** INACTIVE/ALL solo se respetan para el administrador del ecosistema. */
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
})
type ModelsQuery = z.infer<typeof modelsQuery>

/** Catálogo maestro global (arquitectura §10): qué tipos y modelos existen. Lectura pública. */
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  @Get('families')
  families() {
    return this.db.select().from(assetFamilies).orderBy(asc(assetFamilies.name))
  }

  @Get('types')
  types(@Query('family') family?: string) {
    return this.db
      .select({
        id: assetTypes.id,
        code: assetTypes.code,
        name: assetTypes.name,
        familyCode: assetFamilies.code,
        familyName: assetFamilies.name,
      })
      .from(assetTypes)
      .innerJoin(assetFamilies, eq(assetFamilies.id, assetTypes.familyId))
      .where(family ? eq(assetFamilies.code, family) : undefined)
      .orderBy(asc(assetFamilies.name), asc(assetTypes.name))
  }

  @Get('manufacturers')
  manufacturers() {
    return this.db.select().from(manufacturers).orderBy(asc(manufacturers.name))
  }

  private modelSelect() {
    return this.db
      .select({
        id: assetModels.id,
        modelName: assetModels.modelName,
        status: assetModels.status,
        specifications: assetModels.specifications,
        technicalData: assetModels.technicalData,
        /** Ruta (relativa a la API) de la foto del modelo; null si no tiene. */
        imageUrl: sql<string | null>`case when ${assetModels.imageKey} is null then null else '/catalog/models/' || ${assetModels.id}::text || '/image?v=' || (extract(epoch from ${assetModels.imageUpdatedAt}) * 1000)::bigint::text end`,
        type: { id: assetTypes.id, code: assetTypes.code, name: assetTypes.name },
        family: { id: assetFamilies.id, code: assetFamilies.code, name: assetFamilies.name, icon: assetFamilies.icon },
        manufacturer: { id: manufacturers.id, name: manufacturers.name, countryCode: manufacturers.countryCode },
      })
      .from(assetModels)
      .innerJoin(assetTypes, eq(assetTypes.id, assetModels.assetTypeId))
      .innerJoin(assetFamilies, eq(assetFamilies.id, assetTypes.familyId))
      .leftJoin(manufacturers, eq(manufacturers.id, assetModels.manufacturerId))
  }

  /** Modelos del catálogo con filtros (arquitectura §34): familia, tipo, fabricante y búsqueda. */
  @Get('assets')
  async models(@Query(new ZodValidationPipe(modelsQuery)) q: ModelsQuery, @CurrentUser() user?: AuthUser) {
    const status = user?.isGlobalAdmin ? q.status : 'ACTIVE'
    const conditions: Array<SQL | undefined> = [
      status === 'ALL' ? undefined : eq(assetModels.status, status),
      q.family ? eq(assetFamilies.code, q.family) : undefined,
      q.type ? eq(assetTypes.code, q.type) : undefined,
      q.manufacturerId ? eq(assetModels.manufacturerId, q.manufacturerId) : undefined,
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(assetModels.modelName, like), ilike(assetTypes.name, like), ilike(manufacturers.name, like)))
    }
    const where = and(...conditions)

    const [items, [{ total }]] = await Promise.all([
      this.modelSelect()
        .where(where)
        .orderBy(asc(assetFamilies.name), asc(assetTypes.name), asc(assetModels.modelName))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(assetModels)
        .innerJoin(assetTypes, eq(assetTypes.id, assetModels.assetTypeId))
        .innerJoin(assetFamilies, eq(assetFamilies.id, assetTypes.familyId))
        .leftJoin(manufacturers, eq(manufacturers.id, assetModels.manufacturerId))
        .where(where),
    ])
    return pageOf(items, total, q.page, q.pageSize)
  }

  @Get('assets/:id')
  async model(@Param('id', ParseUUIDPipe) id: string) {
    const [row] = await this.modelSelect().where(eq(assetModels.id, id)).limit(1)
    if (!row) throw new NotFoundException('Modelo no encontrado')
    return row
  }

  /** Foto del modelo. Pública como el resto del catálogo; el tipo sale de lo que validó el servidor al subirla. */
  @Get('models/:id/image')
  async modelImage(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const [m] = await this.db.select({ key: assetModels.imageKey, mime: assetModels.imageMime }).from(assetModels).where(eq(assetModels.id, id))
    if (!m?.key || !m.mime) throw new NotFoundException('El modelo no tiene imagen')
    const stream = await this.storage.open(m.key).catch(() => {
      throw new NotFoundException('El modelo no tiene imagen')
    })
    setImageHeaders(res, m.mime)
    return new StreamableFile(stream)
  }
}
