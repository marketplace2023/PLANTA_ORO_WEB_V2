import { Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isUniqueViolation } from '../../common/db-errors'
import type { AppRequest } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { DB, type Database } from '../../database/database.module'
import { networkMaster, plantNetworks } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { GlobalAdminOnly } from '../iam/decorators'
import { type CreateNetworkDto, createNetworkSchema, type UpdateNetworkDto, updateNetworkSchema } from './networks-admin.schemas'

const deleteQuery = z.object({ force: z.enum(['true', 'false']).default('false') })

/** Administración del maestro de redes transversales: solo el administrador del ecosistema. La lectura es pública (`NetworksController`). */
@GlobalAdminOnly()
@Controller('networks/catalog')
export class NetworksAdminController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  private async find(id: string) {
    const [row] = await this.db.select().from(networkMaster).where(eq(networkMaster.id, id))
    if (!row) throw new NotFoundException('Red no encontrada')
    return row
  }

  /** Dónde se usa cada red: plantas que la habilitan, activos vinculados y tipos del catálogo. */
  private usageOf(id: string) {
    return this.db
      .execute<{ plants: number; assets: number; types: number }>(
        sql`select
          (select count(*)::int from plant.plant_networks where network_master_id = ${id}) as plants,
          (select count(*)::int from asset.asset_networks an join plant.plant_networks pn on pn.id = an.plant_network_id where pn.network_master_id = ${id}) as assets,
          (select count(*)::int from catalog.asset_type_networks where network_master_id = ${id}) as types`,
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
        types: sql<number>`(select count(*)::int from catalog.asset_type_networks atn where atn.network_master_id = plant.network_master.id)`,
      })
      .from(networkMaster)
      .orderBy(asc(networkMaster.code))
    return rows
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createNetworkSchema)) dto: CreateNetworkDto, @Req() req: AppRequest) {
    const [row] = await this.db
      .insert(networkMaster)
      .values(dto)
      .returning()
      .catch((e) => (isUniqueViolation(e) ? Promise.reject(new ConflictException(`Ya existe una red con el código ${dto.code}`)) : Promise.reject(e)))
    await this.audit.record(req, { module: 'networks', entityType: 'network_master', entityId: row.id, action: 'created', newData: dto })
    return row
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateNetworkSchema)) dto: UpdateNetworkDto, @Req() req: AppRequest) {
    const before = await this.find(id)
    const [row] = await this.db.update(networkMaster).set(dto).where(eq(networkMaster.id, id)).returning()
    await this.audit.record(req, {
      module: 'networks',
      entityType: 'network_master',
      entityId: id,
      action: 'updated',
      oldData: { name: before.name, description: before.description, icon: before.icon, colorToken: before.colorToken },
      newData: dto,
    })
    return row
  }

  /**
   * Elimina la red. Si alguna planta la tiene habilitada se rechaza (409) con el detalle de uso, salvo `?force=true`: entonces
   * también se quita de esas plantas y se desvincula de los activos. Los vínculos con tipos del catálogo caen en cascada.
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
      await tx.delete(networkMaster).where(eq(networkMaster.id, id)) // los vínculos con tipos del catálogo caen en cascada
    })
    await this.audit.record(req, {
      module: 'networks',
      entityType: 'network_master',
      entityId: id,
      action: 'deleted',
      oldData: { code: before.code, name: before.name },
      newData: { removedFromPlants: usage.plants, unlinkedAssets: usage.assets, unlinkedTypes: usage.types },
    })
  }
}
