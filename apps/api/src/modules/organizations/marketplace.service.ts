import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm'
import { validationError } from '../../common/errors'
import { escapeLike, pageOf } from '../../common/pagination'
import type { AppRequest, AuthUser } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { assetFamilies, assetModels, assetTypes, listings, listingStages, manufacturers, providers, stageMaster } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { inspectImage } from '../documents/image-upload'
import { StorageService } from '../documents/storage.service'
import { OrgAccessService } from './org-access.service'
import type { CreateListingDto, ListListingsQuery, ListProviderListingsQuery, UpdateListingDto } from './organizations.schemas'
import { ProvidersService, ratingOf } from './providers.service'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

@Injectable()
export class MarketplaceService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: OrgAccessService,
    private readonly providersSvc: ProvidersService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private select() {
    return this.db
      .select({
        id: listings.id,
        title: listings.title,
        description: listings.description,
        price: listings.price,
        currency: listings.currency,
        availability: listings.availability,
        stockText: listings.stockText,
        imageUrl: listings.imageUrl,
        status: listings.status,
        isFeatured: listings.isFeatured,
        createdAt: listings.createdAt,
        updatedAt: listings.updatedAt,
        familyCode: assetFamilies.code,
        familyName: assetFamilies.name,
        modelId: assetModels.id,
        modelName: assetModels.modelName,
        typeCode: assetTypes.code,
        typeName: assetTypes.name,
        manufacturerId: manufacturers.id,
        manufacturerName: manufacturers.name,
        providerId: providers.id,
        providerName: providers.organizationName,
        providerVerified: providers.verified,
        providerRating: providers.rating,
        providerCountry: providers.countryCode,
        providerStatus: providers.status,
      })
      .from(listings)
      .innerJoin(providers, eq(providers.id, listings.providerId))
      .innerJoin(assetFamilies, eq(assetFamilies.id, listings.assetFamilyId))
      .leftJoin(assetModels, eq(assetModels.id, listings.assetModelId))
      .leftJoin(assetTypes, eq(assetTypes.id, assetModels.assetTypeId))
      .leftJoin(manufacturers, eq(manufacturers.id, assetModels.manufacturerId))
  }

  private async stagesFor(ids: string[]) {
    const map = new Map<string, Array<{ code: string; name: string }>>()
    if (ids.length === 0) return map
    const rows = await this.db
      .select({ listingId: listingStages.listingId, code: stageMaster.code, name: stageMaster.name })
      .from(listingStages)
      .innerJoin(stageMaster, eq(stageMaster.id, listingStages.stageMasterId))
      .where(inArray(listingStages.listingId, ids))
      .orderBy(asc(stageMaster.sequenceDefault))
    for (const r of rows) map.set(r.listingId, [...(map.get(r.listingId) ?? []), { code: r.code, name: r.name }])
    return map
  }

  private toItem(r: Awaited<ReturnType<MarketplaceService['select']>>[number], stages: Map<string, Array<{ code: string; name: string }>>) {
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      price: r.price === null ? null : Number(r.price),
      currency: r.currency,
      availability: r.availability,
      stockText: r.stockText,
      imageUrl: r.imageUrl,
      status: r.status,
      isFeatured: r.isFeatured,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      family: { code: r.familyCode, name: r.familyName },
      type: r.typeCode ? { code: r.typeCode, name: r.typeName } : null,
      model: r.modelId ? { id: r.modelId, name: r.modelName, manufacturer: r.manufacturerName ? { id: r.manufacturerId, name: r.manufacturerName } : null } : null,
      provider: { id: r.providerId, name: r.providerName, verified: r.providerVerified, rating: ratingOf(r.providerRating), countryCode: r.providerCountry },
      stages: stages.get(r.id) ?? [],
    }
  }

  private async page(where: SQL | undefined, order: SQL[], page: number, pageSize: number) {
    const [rows, [{ total }]] = await Promise.all([
      this.select()
        .where(where)
        .orderBy(...order, asc(listings.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(listings)
        .innerJoin(providers, eq(providers.id, listings.providerId))
        .leftJoin(assetModels, eq(assetModels.id, listings.assetModelId))
        .leftJoin(assetTypes, eq(assetTypes.id, assetModels.assetTypeId))
        .innerJoin(assetFamilies, eq(assetFamilies.id, listings.assetFamilyId))
        .where(where),
    ])
    const stages = await this.stagesFor(rows.map((r) => r.id))
    return pageOf(rows.map((r) => this.toItem(r, stages)), total, page, pageSize)
  }

  // ---------- Público ----------

  /** El mercado solo muestra ofertas ACTIVAS de proveedores ACTIVOS: suspender un proveedor lo oculta sin tocar sus datos. */
  async listPublic(q: ListListingsQuery) {
    const priced = q.priceMin !== undefined || q.priceMax !== undefined
    const conditions: Array<SQL | undefined> = [
      eq(listings.status, 'ACTIVE'),
      eq(providers.status, 'ACTIVE'),
      q.family ? eq(assetFamilies.code, q.family) : undefined,
      q.type ? eq(assetTypes.code, q.type) : undefined,
      q.manufacturerId ? eq(assetModels.manufacturerId, q.manufacturerId) : undefined,
      q.providerId ? eq(listings.providerId, q.providerId) : undefined,
      q.currency ? eq(listings.currency, q.currency) : undefined,
      q.availability ? eq(listings.availability, q.availability) : undefined,
      q.featured === '1' ? eq(listings.isFeatured, true) : undefined,
      // Un filtro de precio excluye las ofertas "a cotizar" (no tienen precio que comparar).
      priced ? sql`${listings.price} is not null` : undefined,
      q.priceMin !== undefined ? gte(listings.price, String(q.priceMin)) : undefined,
      q.priceMax !== undefined ? lte(listings.price, String(q.priceMax)) : undefined,
      q.stage ? sql`exists (select 1 from ${listingStages} ls inner join ${stageMaster} sm on sm.id = ls.stage_master_id where ls.listing_id = ${listings.id} and sm.code = ${q.stage})` : undefined,
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(listings.title, like), ilike(listings.description, like), ilike(providers.organizationName, like)))
    }
    const order =
      q.sort === 'price_asc'
        ? [sql`${listings.price} asc nulls last`]
        : q.sort === 'price_desc'
          ? [sql`${listings.price} desc nulls last`]
          : q.sort === 'title'
            ? [asc(listings.title)]
            : [desc(listings.isFeatured), desc(listings.createdAt)]
    return this.page(and(...conditions), order, q.page, q.pageSize)
  }

  async getPublic(id: string, user: AuthUser | undefined) {
    const [row] = await this.select().where(eq(listings.id, id))
    if (!row) throw new NotFoundException('Producto no encontrado')
    const visible = row.status === 'ACTIVE' && row.providerStatus === 'ACTIVE'
    if (!visible) {
      // Borradores, archivados o de proveedores no activos: solo para quien gestiona al proveedor.
      const role = user?.isGlobalAdmin ? 'ADMIN' : await this.access.roleOf('provider', row.providerId, user?.id)
      if (!role) throw new NotFoundException('Producto no encontrado')
    }
    return this.toItem(row, await this.stagesFor([id]))
  }

  // ---------- Gestión del proveedor ----------

  async listForProvider(providerId: string, q: ListProviderListingsQuery, user: AuthUser | undefined) {
    await this.providersSvc.loadVisible(providerId, user)
    await this.access.assertManage('provider', providerId, user)
    const conditions: Array<SQL | undefined> = [eq(listings.providerId, providerId), q.status === 'ALL' ? undefined : eq(listings.status, q.status)]
    if (q.search) conditions.push(ilike(listings.title, `%${escapeLike(q.search)}%`))
    return this.page(and(...conditions), [desc(listings.updatedAt)], q.page, q.pageSize)
  }

  private async resolveStageIds(tx: Tx | Database, codes: string[]) {
    if (codes.length === 0) return []
    const rows = await tx.select({ id: stageMaster.id, code: stageMaster.code }).from(stageMaster).where(inArray(stageMaster.code, codes))
    const missing = codes.filter((c) => !rows.some((r) => r.code === c))
    if (missing.length) throw validationError('stageCodes', `Etapas inexistentes: ${missing.join(', ')}`)
    return rows.map((r) => r.id)
  }

  /** La familia se deduce del modelo; si además se indica, debe coincidir (no se publican productos en la familia equivocada). */
  private async resolveFamily(modelId: string | null | undefined, familyCode: string | undefined) {
    let familyId: string | undefined
    if (familyCode) {
      const [f] = await this.db.select({ id: assetFamilies.id }).from(assetFamilies).where(eq(assetFamilies.code, familyCode))
      if (!f) throw validationError('assetFamilyCode', 'La familia no existe en el catálogo')
      familyId = f.id
    }
    if (modelId) {
      const [m] = await this.db
        .select({ familyId: assetTypes.familyId, status: assetModels.status })
        .from(assetModels)
        .innerJoin(assetTypes, eq(assetTypes.id, assetModels.assetTypeId))
        .where(eq(assetModels.id, modelId))
      if (!m) throw validationError('assetModelId', 'El modelo no existe en el catálogo')
      if (familyId && familyId !== m.familyId) throw validationError('assetFamilyCode', 'La familia no corresponde al modelo elegido')
      familyId = m.familyId
    }
    return familyId
  }

  private async assertProviderActive(providerId: string) {
    const [p] = await this.db.select({ status: providers.status }).from(providers).where(eq(providers.id, providerId))
    if (p?.status !== 'ACTIVE') throw new ConflictException('El proveedor debe estar activo para gestionar productos')
  }

  async create(providerId: string, dto: CreateListingDto, user: AuthUser, req: AppRequest) {
    await this.providersSvc.loadVisible(providerId, user)
    await this.access.assertManage('provider', providerId, user)
    await this.assertProviderActive(providerId)

    const familyId = await this.resolveFamily(dto.assetModelId, dto.assetFamilyCode)
    if (!familyId) throw validationError('assetFamilyCode', 'Indica la familia o el modelo del catálogo')
    const stageIds = await this.resolveStageIds(this.db, dto.stageCodes)

    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(listings)
        .values({
          providerId,
          assetModelId: dto.assetModelId,
          assetFamilyId: familyId,
          title: dto.title,
          description: dto.description,
          price: dto.price === undefined ? null : String(dto.price),
          currency: dto.currency,
          availability: dto.availability,
          stockText: dto.stockText,
          imageUrl: dto.imageUrl,
        })
        .returning({ id: listings.id })
      if (stageIds.length) await tx.insert(listingStages).values([...new Set(stageIds)].map((stageMasterId) => ({ listingId: row.id, stageMasterId })))
      return row
    })
    await this.audit.record(req, { module: 'marketplace', entityType: 'listing', entityId: created.id, action: 'created', newData: { providerId, title: dto.title } })
    return this.getManaged(providerId, created.id)
  }

  private async getManaged(providerId: string, id: string) {
    const [row] = await this.select().where(and(eq(listings.id, id), eq(listings.providerId, providerId)))
    if (!row) throw new NotFoundException('Producto no encontrado')
    return this.toItem(row, await this.stagesFor([id]))
  }

  async update(providerId: string, id: string, dto: UpdateListingDto, user: AuthUser, req: AppRequest) {
    await this.providersSvc.loadVisible(providerId, user)
    const role = await this.access.assertManage('provider', providerId, user)
    if (dto.isFeatured !== undefined && role !== 'ADMIN') throw new ForbiddenException('Solo el administrador del ecosistema puede destacar productos')
    const [before] = await this.db.select().from(listings).where(and(eq(listings.id, id), eq(listings.providerId, providerId)))
    if (!before) throw new NotFoundException('Producto no encontrado')
    if (role !== 'ADMIN') await this.assertProviderActive(providerId)

    const familyId = dto.assetModelId !== undefined || dto.assetFamilyCode !== undefined ? await this.resolveFamily(dto.assetModelId ?? (dto.assetModelId === null ? null : before.assetModelId), dto.assetFamilyCode) : undefined
    const stageIds = dto.stageCodes ? await this.resolveStageIds(this.db, dto.stageCodes) : undefined

    const nextStatus = dto.status ?? before.status
    if (nextStatus === 'ACTIVE' && before.status !== 'ACTIVE') {
      const stageCount = stageIds ? new Set(stageIds).size : (await this.db.select({ n: sql<number>`count(*)::int` }).from(listingStages).where(eq(listingStages.listingId, id)))[0].n
      // Sin etapa no aparecería en el filtro principal del mercado: se exige para publicar.
      if (stageCount === 0) throw validationError('stageCodes', 'Indica al menos una etapa para publicar el producto')
    }

    const { stageCodes: _s, assetFamilyCode: _f, price, ...rest } = dto
    // Una URL externa (o quitarla) reemplaza la foto subida: se descarta para no dejar un archivo huérfano.
    const dropUploaded = dto.imageUrl !== undefined && !!before.imageKey
    await this.db.transaction(async (tx) => {
      await tx
        .update(listings)
        .set({
          ...rest,
          ...(dropUploaded && { imageKey: null, imageMime: null }),
          ...(price !== undefined && { price: price === null ? null : String(price) }),
          ...(familyId && { assetFamilyId: familyId }),
          updatedAt: new Date(),
        })
        .where(eq(listings.id, id))
      if (stageIds) {
        await tx.delete(listingStages).where(eq(listingStages.listingId, id))
        if (stageIds.length) await tx.insert(listingStages).values([...new Set(stageIds)].map((stageMasterId) => ({ listingId: id, stageMasterId })))
      }
    })
    if (dropUploaded && before.imageKey) await this.storage.delete(before.imageKey).catch(() => undefined)
    await this.audit.record(req, {
      module: 'marketplace',
      entityType: 'listing',
      entityId: id,
      action: dto.status && dto.status !== before.status ? 'status.changed' : 'updated',
      oldData: { title: before.title, price: before.price, status: before.status, isFeatured: before.isFeatured },
      newData: dto,
    })
    return this.getManaged(providerId, id)
  }

  // ---------- Foto del producto ----------

  private async loadManaged(providerId: string, id: string, user: AuthUser) {
    await this.providersSvc.loadVisible(providerId, user)
    const role = await this.access.assertManage('provider', providerId, user)
    const [row] = await this.db.select({ id: listings.id, imageKey: listings.imageKey }).from(listings).where(and(eq(listings.id, id), eq(listings.providerId, providerId)))
    if (!row) throw new NotFoundException('Producto no encontrado')
    if (role !== 'ADMIN') await this.assertProviderActive(providerId)
    return row
  }

  /** Sube (o reemplaza) la foto del producto. La clave es nueva en cada subida: la anterior se borra solo cuando la nueva ya quedó registrada. */
  async setImage(providerId: string, id: string, file: Express.Multer.File | undefined, user: AuthUser, req: AppRequest) {
    const before = await this.loadManaged(providerId, id, user)
    const image = inspectImage(file)
    const key = `marketplace/listings/${id}/${randomUUID()}.${image.extension}`
    await this.storage.put(key, image.data)
    const now = new Date()
    try {
      await this.db.update(listings).set({ imageKey: key, imageMime: image.mimeType, imageUrl: `/marketplace/listings/${id}/image?v=${now.getTime()}`, updatedAt: now }).where(eq(listings.id, id))
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined)
      throw e
    }
    if (before.imageKey) await this.storage.delete(before.imageKey).catch(() => undefined)
    await this.audit.record(req, { module: 'marketplace', entityType: 'listing', entityId: id, action: 'image.updated', oldData: { hadImage: !!before.imageKey }, newData: { mimeType: image.mimeType, sizeBytes: image.data.length } })
    return this.getManaged(providerId, id)
  }

  async removeImage(providerId: string, id: string, user: AuthUser, req: AppRequest) {
    const before = await this.loadManaged(providerId, id, user)
    await this.db.update(listings).set({ imageKey: null, imageMime: null, imageUrl: null, updatedAt: new Date() }).where(eq(listings.id, id))
    if (before.imageKey) await this.storage.delete(before.imageKey).catch(() => undefined)
    await this.audit.record(req, { module: 'marketplace', entityType: 'listing', entityId: id, action: 'image.removed', oldData: { hadImage: !!before.imageKey } })
  }

  /** Foto pública del producto (el identificador no es adivinable y la foto no es información sensible). */
  async openImage(id: string) {
    const [row] = await this.db.select({ key: listings.imageKey, mime: listings.imageMime }).from(listings).where(eq(listings.id, id))
    if (!row?.key || !row.mime) throw new NotFoundException('El producto no tiene foto subida')
    const stream = await this.storage.open(row.key).catch(() => {
      throw new NotFoundException('El producto no tiene foto subida')
    })
    return { stream, mime: row.mime }
  }
}
