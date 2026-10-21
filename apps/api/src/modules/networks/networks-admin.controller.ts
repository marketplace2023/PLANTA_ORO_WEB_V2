import { randomUUID } from 'node:crypto'
import { Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isUniqueViolation } from '../../common/db-errors'
import type { AppRequest } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { DB, type Database } from '../../database/database.module'
import { networkMaster, plantNetworks } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { inspectImage } from '../documents/image-upload'
import { StorageService } from '../documents/storage.service'
import { GlobalAdminOnly } from '../iam/decorators'
import { networkImagePath, networkSelect } from './networks.controller'
import { type CreateNetworkDto, createNetworkSchema, type UpdateNetworkDto, updateNetworkSchema } from './networks-admin.schemas'

const deleteQuery = z.object({ force: z.enum(['true', 'false']).default('false') })

/** Administración del maestro de redes transversales: solo el administrador del ecosistema. La lectura es pública (`NetworksController`). */
@GlobalAdminOnly()
@Controller('networks/catalog')
export class NetworksAdminController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private async find(id: string) {
    const [row] = await this.db.select().from(networkMaster).where(eq(networkMaster.id, id))
    if (!row) throw new NotFoundException('Red no encontrada')
    return row
  }

  private async view(id: string) {
    const [row] = await this.db.select(networkSelect).from(networkMaster).where(eq(networkMaster.id, id))
    return row
  }

  /** Dónde se usa cada red: plantas que la habilitan, activos vinculados y modelos del catálogo. */
  private usageOf(id: string) {
    return this.db
      .execute<{ plants: number; assets: number; models: number }>(
        sql`select
          (select count(*)::int from plant.plant_networks where network_master_id = ${id}) as plants,
          (select count(*)::int from asset.asset_networks an join plant.plant_networks pn on pn.id = an.plant_network_id where pn.network_master_id = ${id}) as assets,
          (select count(*)::int from catalog.asset_model_networks where network_master_id = ${id}) as models`,
      )
      .then((r) => r.rows[0])
  }

  /** Uso de todas las redes, para mostrar en el listado de administración. */
  @Get('usage')
  async usage() {
    const rows = await this.db
      .select({
        id: networkMaster.id,
        // Referencia calificada a mano: en un select de una sola tabla drizzle omite el prefijo y `id` se confundiría con el de la subconsulta.
        plants: sql<number>`(select count(*)::int from plant.plant_networks pn where pn.network_master_id = plant.network_master.id)`,
        assets: sql<number>`(select count(*)::int from asset.asset_networks an join plant.plant_networks pn on pn.id = an.plant_network_id where pn.network_master_id = plant.network_master.id)`,
        models: sql<number>`(select count(*)::int from catalog.asset_model_networks atn where atn.network_master_id = plant.network_master.id)`,
      })
      .from(networkMaster)
      .orderBy(asc(networkMaster.sequence), asc(networkMaster.code))
    return rows
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createNetworkSchema)) dto: CreateNetworkDto, @Req() req: AppRequest) {
    // Sin orden indicado, la red nueva va al final.
    const sequence = dto.sequence ?? ((await this.db.select({ n: sql<number>`coalesce(max(${networkMaster.sequence}), 0)::int` }).from(networkMaster))[0].n + 1)
    const [created] = await this.db
      .insert(networkMaster)
      .values({ ...dto, sequence })
      .returning({ id: networkMaster.id })
      .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException(`Ya existe una red con el código ${dto.code}`)) : Promise.reject(e)))
    await this.audit.record(req, { module: 'networks', entityType: 'network_master', entityId: created.id, action: 'created', newData: dto })
    return this.view(created.id)
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateNetworkSchema)) dto: UpdateNetworkDto, @Req() req: AppRequest) {
    const before = await this.find(id)
    await this.db.update(networkMaster).set(dto).where(eq(networkMaster.id, id))
    await this.audit.record(req, {
      module: 'networks',
      entityType: 'network_master',
      entityId: id,
      action: 'updated',
      oldData: { name: before.name, description: before.description, icon: before.icon, colorToken: before.colorToken },
      newData: dto,
    })
    return this.view(id)
  }

  /** multipart/form-data con el campo `file`. Los guards corren antes que multer: sin ser administrador no se procesa el archivo. */
  @Post(':id/layout')
  @UseInterceptors(FileInterceptor('file'))
  async setImage(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: AppRequest) {
    const before = await this.find(id)
    const image = inspectImage(file)
    // Clave nueva por subida: la imagen anterior solo se borra cuando la nueva ya quedó registrada.
    const key = `catalog/networks/${id}/${randomUUID()}.${image.extension}`
    await this.storage.put(key, image.data)
    const updatedAt = new Date()
    try {
      await this.db.update(networkMaster).set({ layoutImageKey: key, layoutImageMime: image.mimeType, layoutImageUpdatedAt: updatedAt }).where(eq(networkMaster.id, id))
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined)
      throw e
    }
    if (before.layoutImageKey) await this.storage.delete(before.layoutImageKey).catch(() => undefined)
    await this.audit.record(req, {
      module: 'networks',
      entityType: 'network_master',
      entityId: id,
      action: 'layout.updated',
      oldData: { code: before.code, hadImage: !!before.layoutImageKey },
      newData: { mimeType: image.mimeType, sizeBytes: image.data.length },
    })
    return { id, layoutImageUrl: networkImagePath(id, updatedAt) }
  }

  @Delete(':id/layout')
  @HttpCode(204)
  async removeImage(@Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    const before = await this.find(id)
    if (!before.layoutImageKey) return
    await this.db.update(networkMaster).set({ layoutImageKey: null, layoutImageMime: null, layoutImageUpdatedAt: null }).where(eq(networkMaster.id, id))
    await this.storage.delete(before.layoutImageKey).catch(() => undefined)
    await this.audit.record(req, { module: 'networks', entityType: 'network_master', entityId: id, action: 'layout.removed', oldData: { code: before.code, hadImage: true } })
  }

  /**
   * Elimina la red. Si alguna planta la tiene habilitada se rechaza (409) con el detalle de uso, salvo `?force=true`: entonces
   * también se quita de esas plantas y se desvincula de los activos. Los vínculos con modelos del catálogo caen en cascada.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(deleteQuery)) q: z.infer<typeof deleteQuery>, @Req() req: AppRequest) {
    const before = await this.find(id)
    const usage = await this.usageOf(id)
    if (usage.plants > 0 && q.force !== 'true') {
      throw new ConflictException(
        `La red ${before.code} está habilitada en ${usage.plants} planta${usage.plants === 1 ? '' : 's'}${usage.assets > 0 ? ` y vinculada a ${usage.assets} activo${usage.assets === 1 ? '' : 's'}` : ''}. Confirma la eliminación para quitarla también de ellas.`,
      )
    }
    await this.db.transaction(async (tx) => {
      await tx.delete(plantNetworks).where(eq(plantNetworks.networkMasterId, id)) // los vínculos con activos caen en cascada
      await tx.delete(networkMaster).where(eq(networkMaster.id, id)) // los vínculos con modelos del catálogo caen en cascada
    })
    if (before.layoutImageKey) await this.storage.delete(before.layoutImageKey).catch(() => undefined)
    await this.audit.record(req, {
      module: 'networks',
      entityType: 'network_master',
      entityId: id,
      action: 'deleted',
      oldData: { code: before.code, name: before.name },
      newData: { removedFromPlants: usage.plants, unlinkedAssets: usage.assets, unlinkedModels: usage.models },
    })
  }
}
