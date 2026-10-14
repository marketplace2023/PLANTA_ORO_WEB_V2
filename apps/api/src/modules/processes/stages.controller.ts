import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Res, StreamableFile } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'
import type { Response } from 'express'
import { DB, type Database } from '../../database/database.module'
import { stageMaster } from '../../database/schema'
import { setImageHeaders } from '../documents/image-upload'
import { StorageService } from '../documents/storage.service'
import { Public } from '../iam/decorators'

/** Ruta (relativa a la API) del layout de una etapa; `v` evita servir de caché una imagen reemplazada. */
export const stageLayoutPath = (id: string, updatedAt: Date | string | null): string | null =>
  updatedAt ? `/stages/catalog/${id}/layout?v=${new Date(updatedAt).getTime()}` : null

/** Columnas públicas del maestro de etapas: sin la clave interna del almacenamiento. */
export const stageSelect = {
  id: stageMaster.id,
  code: stageMaster.code,
  name: stageMaster.name,
  sequenceDefault: stageMaster.sequenceDefault,
  description: stageMaster.description,
  stageGroup: stageMaster.stageGroup,
  colorToken: stageMaster.colorToken,
  layoutImageUrl: sql<string | null>`case when ${stageMaster.layoutImageKey} is null then null else '/stages/catalog/' || ${stageMaster.id}::text || '/layout?v=' || (extract(epoch from ${stageMaster.layoutImageUpdatedAt}) * 1000)::bigint::text end`,
}

@Public()
@Controller('stages')
export class StagesController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  /** Catálogo maestro global de etapas (D01…D19). Lectura pública. */
  @Get('catalog')
  catalog() {
    return this.db.select(stageSelect).from(stageMaster).orderBy(asc(stageMaster.sequenceDefault))
  }

  /** Imagen del layout de la etapa. Pública como el resto del catálogo; el tipo sale de lo que validó el servidor al subirla. */
  @Get('catalog/:id/layout')
  async layout(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const [s] = await this.db.select({ key: stageMaster.layoutImageKey, mime: stageMaster.layoutImageMime }).from(stageMaster).where(eq(stageMaster.id, id))
    if (!s?.key || !s.mime) throw new NotFoundException('La etapa no tiene imagen de layout')
    const stream = await this.storage.open(s.key).catch(() => {
      throw new NotFoundException('La etapa no tiene imagen de layout')
    })
    setImageHeaders(res, s.mime)
    return new StreamableFile(stream)
  }
}
