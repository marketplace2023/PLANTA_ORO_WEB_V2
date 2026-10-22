import { createHash } from 'node:crypto'
import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common'
import { asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import type { AppRequest } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { assetFamilies, assetModels, assetModelStages, assetModelNetworks, assetTypes, auditEvents, listings, manufacturers, modelVariableValues } from '../../database/schema'
import { StorageService } from '../documents/storage.service'
import { parseCatalogDeleteWorkbook } from './catalog-delete.xlsx'
import type { ImportIssue } from './catalog-import.xlsx'

type Connection = Pick<Database, 'select'>
type DeleteBook = Awaited<ReturnType<typeof parseCatalogDeleteWorkbook>>
export type CatalogDeletePreview = {
  fingerprint: string
  issues: ImportIssue[]
  summary: { listed: number; found: number; missing: number; blocked: number; deletable: number; unlinkedListings: number }
  rows: Array<{ tag: string; row: number; modelId: string | null; modelName: string | null; family: string | null; type: string | null; state: 'DELETE' | 'NOT_FOUND' | 'BLOCKED'; assets: number; inventoryItems: number; listings: number }>
}

async function snapshot(db: Connection, tags: string[]) {
  const models = await db.select({
    model: getTableColumns(assetModels), family: assetFamilies.name, type: assetTypes.name, manufacturer: manufacturers.name,
    assets: sql<number>`(select count(*)::int from asset.assets a where a.asset_model_id = ${assetModels.id})`,
    inventoryItems: sql<number>`(select count(*)::int from inventory.items i where i.catalog_item_id = ${assetModels.id})`,
    listings: sql<number>`(select count(*)::int from marketplace.listings l where l.asset_model_id = ${assetModels.id})`,
  }).from(assetModels).innerJoin(assetTypes, eq(assetTypes.id, assetModels.assetTypeId))
    .innerJoin(assetFamilies, eq(assetFamilies.id, assetTypes.familyId)).leftJoin(manufacturers, eq(manufacturers.id, assetModels.manufacturerId))
    .where(inArray(assetModels.catalogTag, tags)).orderBy(asc(assetModels.id))
  const ids = models.map(row => row.model.id)
  const stages = ids.length ? await db.select().from(assetModelStages).where(inArray(assetModelStages.assetModelId, ids)) : []
  const networks = ids.length ? await db.select().from(assetModelNetworks).where(inArray(assetModelNetworks.assetModelId, ids)) : []
  const values = ids.length ? await db.select().from(modelVariableValues).where(inArray(modelVariableValues.assetModelId, ids)) : []
  const publications = ids.length ? await db.select().from(listings).where(inArray(listings.assetModelId, ids)) : []
  return { models, stages, networks, values, publications }
}

function plan(book: DeleteBook, state: Awaited<ReturnType<typeof snapshot>>): CatalogDeletePreview {
  const byTag = new Map(state.models.map(row => [row.model.catalogTag, row]))
  const rows: CatalogDeletePreview['rows'] = book.tags.map(({ tag, row }) => {
    const found = byTag.get(tag)
    return { tag, row, modelId: found?.model.id ?? null, modelName: found?.model.modelName ?? null,
      family: found?.family ?? null, type: found?.type ?? null,
      state: !found ? 'NOT_FOUND' : found.assets || found.inventoryItems ? 'BLOCKED' : 'DELETE',
      assets: found?.assets ?? 0, inventoryItems: found?.inventoryItems ?? 0, listings: found?.listings ?? 0 }
  })
  const stateKey = Object.values(state).map(records => records.map(record => JSON.stringify(record)).sort())
  return {
    fingerprint: createHash('sha256').update(`catalog-delete:${book.fileHash}:${JSON.stringify(stateKey)}`).digest('hex'),
    issues: book.issues,
    summary: { listed: rows.length, found: state.models.length, missing: rows.filter(row => row.state === 'NOT_FOUND').length,
      blocked: rows.filter(row => row.state === 'BLOCKED').length, deletable: rows.filter(row => row.state === 'DELETE').length,
      unlinkedListings: rows.filter(row => row.state === 'DELETE').reduce((sum, row) => sum + row.listings, 0) },
    rows,
  }
}

@Injectable()
export class CatalogDeleteService {
  private readonly logger = new Logger(CatalogDeleteService.name)
  constructor(@Inject(DB) private readonly db: Database, private readonly storage: StorageService) {}

  async preview(buffer: Buffer) {
    const book = await parseCatalogDeleteWorkbook(buffer)
    return plan(book, await snapshot(this.db, book.tags.map(row => row.tag)))
  }

  async apply(buffer: Buffer, fingerprint: string, req: AppRequest) {
    const book = await parseCatalogDeleteWorkbook(buffer)
    const result = await this.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('catalog-master-import'))`)
      // Revalida el listado y bloquea altas o vínculos nuevos durante la eliminación completa.
      await tx.execute(sql`lock table catalog.asset_models, catalog.asset_types, catalog.asset_families, catalog.manufacturers,
        catalog.asset_model_stages, catalog.asset_model_networks, catalog.model_variable_values,
        asset.assets, inventory.items, marketplace.listings in share row exclusive mode`)
      const state = await snapshot(tx, book.tags.map(row => row.tag)), preview = plan(book, state)
      if (preview.issues.length) throw new BadRequestException({ message: 'Corrige los TAG del Excel antes de eliminar', errors: preview.issues.map(i => ({ path: `${i.sheet}:${i.row}`, message: i.message })) })
      if (preview.fingerprint !== fingerprint) throw new ConflictException('El archivo o los modelos cambiaron desde la vista previa. Vuelve a analizar el Excel.')
      if (preview.summary.blocked) throw new ConflictException('Hay modelos utilizados por activos de planta o inventario. Desvincúlalos antes de eliminar este listado. No se eliminó ningún modelo.')
      if (!preview.summary.deletable) throw new BadRequestException('El listado no contiene modelos del catálogo que se puedan eliminar')
      const ids = state.models.map(row => row.model.id)
      await tx.delete(assetModels).where(inArray(assetModels.id, ids))
      await tx.insert(auditEvents).values({ module: 'catalog', entityType: 'master_delete', action: 'deleted', userId: req.user?.id,
        oldData: state, newData: { fileHash: book.fileHash, deleted: ids.length, tags: preview.rows.filter(row => row.modelId).map(row => row.tag), summary: preview.summary },
        ipAddress: req.ip, userAgent: req.headers['user-agent'], correlationId: req.correlationId })
      return { preview, keys: state.models.flatMap(row => row.model.imageKey ? [row.model.imageKey] : []) }
    })
    // Los objetos se eliminan solo después del commit: un rechazo nunca afecta las fotos existentes.
    for (const key of result.keys) await this.storage.delete(key).catch(() => this.logger.warn(`No se pudo eliminar la foto del modelo: ${key}`))
    return { ...result.preview, deleted: result.preview.summary.deletable }
  }
}
