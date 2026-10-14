import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Res, StreamableFile } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'
import type { Response } from 'express'
import { DB, type Database } from '../../database/database.module'
import { networkMaster } from '../../database/schema'
import { setImageHeaders } from '../documents/image-upload'
import { StorageService } from '../documents/storage.service'
import { Public } from '../iam/decorators'

/** Ruta (relativa a la API) de la imagen de una red; `v` evita servir de caché una imagen reemplazada. */
export const networkImagePath = (id: string, updatedAt: Date | string | null): string | null =>
  updatedAt ? `/networks/catalog/${id}/layout?v=${new Date(updatedAt).getTime()}` : null

/** Columnas públicas del maestro de redes: sin la clave interna del almacenamiento. */
export const networkSelect = {
  id: networkMaster.id,
  code: networkMaster.code,
  name: networkMaster.name,
  description: networkMaster.description,
  icon: networkMaster.icon,
  colorToken: networkMaster.colorToken,
  sequence: networkMaster.sequence,
  layoutImageUrl: sql<string | null>`case when ${networkMaster.layoutImageKey} is null then null else '/networks/catalog/' || ${networkMaster.id}::text || '/layout?v=' || (extract(epoch from ${networkMaster.layoutImageUpdatedAt}) * 1000)::bigint::text end`,
}

@Public()
@Controller('networks')
export class NetworksController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  /** Catálogo maestro global de redes transversales. Lectura pública. */
  @Get('catalog')
  catalog() {
    return this.db.select(networkSelect).from(networkMaster).orderBy(asc(networkMaster.sequence), asc(networkMaster.code))
  }

  /** Imagen de la red. Pública como el resto del catálogo; el tipo sale de lo que validó el servidor al subirla. */
  @Get('catalog/:id/layout')
  async layout(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const [n] = await this.db.select({ key: networkMaster.layoutImageKey, mime: networkMaster.layoutImageMime }).from(networkMaster).where(eq(networkMaster.id, id))
    if (!n?.key || !n.mime) throw new NotFoundException('La red no tiene imagen')
    const stream = await this.storage.open(n.key).catch(() => {
      throw new NotFoundException('La red no tiene imagen')
    })
    setImageHeaders(res, n.mime)
    return new StreamableFile(stream)
  }
}
