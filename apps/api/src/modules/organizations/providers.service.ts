import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, gte, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { isUniqueViolation } from '../../common/db-errors'
import { validationError } from '../../common/errors'
import { escapeLike, pageOf } from '../../common/pagination'
import type { AppRequest, AuthUser } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { assetFamilies, listings, providerAssetFamilies, providerMembers, providers, providerStageCapabilities, stageMaster } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { inspectImage } from '../documents/image-upload'
import { StorageService } from '../documents/storage.service'
import { OrgAccessService } from './org-access.service'
import type { CreateProviderDto, ListProvidersQuery, UpdateProviderDto } from './organizations.schemas'

type ProviderRow = typeof providers.$inferSelect
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Campos de identidad y confianza: solo el administrador del ecosistema los cambia. */
const ADMIN_ONLY_FIELDS = ['organizationName', 'taxId', 'countryCode', 'status', 'verified', 'rating'] as const

export const ratingOf = (v: string | null) => (v === null ? null : Number(v))

@Injectable()
export class ProvidersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: OrgAccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ---------- Lectura ----------

  private async tagsFor(ids: string[]) {
    if (ids.length === 0) return { stages: new Map<string, Array<{ code: string; name: string }>>(), families: new Map<string, Array<{ code: string; name: string }>>(), counts: new Map<string, number>() }
    const stageRows = await this.db
      .select({ providerId: providerStageCapabilities.providerId, code: stageMaster.code, name: stageMaster.name, seq: stageMaster.sequenceDefault })
      .from(providerStageCapabilities)
      .innerJoin(stageMaster, eq(stageMaster.id, providerStageCapabilities.stageMasterId))
      .where(inArray(providerStageCapabilities.providerId, ids))
      .orderBy(asc(stageMaster.sequenceDefault))
    const familyRows = await this.db
      .select({ providerId: providerAssetFamilies.providerId, code: assetFamilies.code, name: assetFamilies.name })
      .from(providerAssetFamilies)
      .innerJoin(assetFamilies, eq(assetFamilies.id, providerAssetFamilies.assetFamilyId))
      .where(inArray(providerAssetFamilies.providerId, ids))
      .orderBy(asc(assetFamilies.name))
    const countRows = await this.db
      .select({ providerId: listings.providerId, n: sql<number>`count(*)::int` })
      .from(listings)
      .where(and(inArray(listings.providerId, ids), eq(listings.status, 'ACTIVE')))
      .groupBy(listings.providerId)

    const group = <T extends { providerId: string }>(rows: T[]) => {
      const m = new Map<string, Array<{ code: string; name: string }>>()
      for (const r of rows as Array<T & { code: string; name: string }>) m.set(r.providerId, [...(m.get(r.providerId) ?? []), { code: r.code, name: r.name }])
      return m
    }
    return { stages: group(stageRows), families: group(familyRows), counts: new Map(countRows.map((c) => [c.providerId, c.n])) }
  }

  private toItem(r: ProviderRow, tags: Awaited<ReturnType<ProvidersService['tagsFor']>>, user: AuthUser | undefined) {
    return {
      id: r.id,
      organizationName: r.organizationName,
      countryCode: r.countryCode,
      city: r.city,
      description: r.description,
      logoUrl: r.logoUrl,
      certifications: r.certifications,
      status: r.status,
      verified: r.verified,
      rating: ratingOf(r.rating),
      website: r.website,
      // El correo de contacto no se publica a anónimos (evita el scraping masivo).
      contactEmail: user ? r.contactEmail : null,
      stages: tags.stages.get(r.id) ?? [],
      families: tags.families.get(r.id) ?? [],
      activeListings: tags.counts.get(r.id) ?? 0,
    }
  }

  async list(q: ListProvidersQuery, user: AuthUser | undefined) {
    const status = user?.isGlobalAdmin ? q.status : 'ACTIVE'
    const conditions: Array<SQL | undefined> = [
      status === 'ALL' ? undefined : eq(providers.status, status),
      q.country ? eq(providers.countryCode, q.country) : undefined,
      q.verified === '1' ? eq(providers.verified, true) : undefined,
      q.ratingMin !== undefined ? gte(providers.rating, String(q.ratingMin)) : undefined,
      q.certification ? sql`exists (select 1 from unnest(${providers.certifications}) c where lower(c) = lower(${q.certification}))` : undefined,
      q.stage
        ? sql`exists (select 1 from ${providerStageCapabilities} psc inner join ${stageMaster} sm on sm.id = psc.stage_master_id where psc.provider_id = ${providers.id} and sm.code = ${q.stage})`
        : undefined,
      q.family
        ? sql`exists (select 1 from ${providerAssetFamilies} paf inner join ${assetFamilies} af on af.id = paf.asset_family_id where paf.provider_id = ${providers.id} and af.code = ${q.family})`
        : undefined,
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(providers.organizationName, like), ilike(providers.description, like)))
    }
    const where = and(...conditions)
    const order = q.sort === 'rating' ? [sql`${providers.rating} desc nulls last`, asc(providers.organizationName)] : [asc(providers.organizationName)]

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(providers)
        .where(where)
        .orderBy(...order, asc(providers.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(providers).where(where),
    ])
    const tags = await this.tagsFor(rows.map((r) => r.id))
    return pageOf(rows.map((r) => this.toItem(r, tags, user)), total, q.page, q.pageSize)
  }

  async mine(user: AuthUser) {
    const memberships = await this.access.myOrgIds('provider', user.id)
    if (memberships.size === 0) return []
    const rows = await this.db.select().from(providers).where(inArray(providers.id, [...memberships.keys()])).orderBy(asc(providers.organizationName))
    const tags = await this.tagsFor(rows.map((r) => r.id))
    return rows.map((r) => ({ ...this.toItem(r, tags, user), myRole: memberships.get(r.id) }))
  }

  /** Una organización no activa solo existe para sus miembros y el administrador; para el resto es un 404. */
  async loadVisible(id: string, user: AuthUser | undefined): Promise<ProviderRow> {
    const [row] = await this.db.select().from(providers).where(eq(providers.id, id))
    if (!row) throw new NotFoundException('Proveedor no encontrado')
    if (row.status !== 'ACTIVE') {
      const role = user?.isGlobalAdmin ? 'ADMIN' : await this.access.roleOf('provider', id, user?.id)
      if (!role) throw new NotFoundException('Proveedor no encontrado')
    }
    return row
  }

  async get(id: string, user: AuthUser | undefined) {
    const row = await this.loadVisible(id, user)
    const tags = await this.tagsFor([id])
    const role = user ? (user.isGlobalAdmin ? 'ADMIN' : await this.access.roleOf('provider', id, user.id)) : null
    return { ...this.toItem(row, tags, user), taxId: role ? row.taxId : null, canManage: !!role, myRole: role }
  }

  /** Indicadores del proveedor (design.md §24). Cotizaciones/RFQ/pedidos se suman con compras. */
  async dashboard(id: string, user: AuthUser | undefined) {
    await this.loadVisible(id, user)
    await this.access.assertManage('provider', id, user)
    const rows = await this.db
      .select({ status: listings.status, n: sql<number>`count(*)::int`, featured: sql<number>`count(*) filter (where ${listings.isFeatured})::int`, quoted: sql<number>`count(*) filter (where ${listings.price} is null)::int` })
      .from(listings)
      .where(eq(listings.providerId, id))
      .groupBy(listings.status)
    const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0
    return {
      listingsActive: n('ACTIVE'),
      listingsDraft: n('DRAFT'),
      listingsArchived: n('ARCHIVED'),
      featured: rows.reduce((sum, r) => sum + r.featured, 0),
      onRequestPricing: rows.reduce((sum, r) => sum + r.quoted, 0),
    }
  }

  // ---------- Escritura ----------

  private async resolveStages(tx: Tx | Database, codes: string[]) {
    if (codes.length === 0) return []
    const rows = await tx.select({ id: stageMaster.id, code: stageMaster.code }).from(stageMaster).where(inArray(stageMaster.code, codes))
    const missing = codes.filter((c) => !rows.some((r) => r.code === c))
    if (missing.length) throw validationError('stageCodes', `Etapas inexistentes: ${missing.join(', ')}`)
    return rows.map((r) => r.id)
  }

  private async resolveFamilies(tx: Tx | Database, codes: string[]) {
    if (codes.length === 0) return []
    const rows = await tx.select({ id: assetFamilies.id, code: assetFamilies.code }).from(assetFamilies).where(inArray(assetFamilies.code, codes))
    const missing = codes.filter((c) => !rows.some((r) => r.code === c))
    if (missing.length) throw validationError('familyCodes', `Familias inexistentes: ${missing.join(', ')}`)
    return rows.map((r) => r.id)
  }

  private async replaceTags(tx: Tx, id: string, stageIds?: string[], familyIds?: string[]) {
    if (stageIds) {
      await tx.delete(providerStageCapabilities).where(eq(providerStageCapabilities.providerId, id))
      if (stageIds.length) await tx.insert(providerStageCapabilities).values([...new Set(stageIds)].map((stageMasterId) => ({ providerId: id, stageMasterId })))
    }
    if (familyIds) {
      await tx.delete(providerAssetFamilies).where(eq(providerAssetFamilies.providerId, id))
      if (familyIds.length) await tx.insert(providerAssetFamilies).values([...new Set(familyIds)].map((assetFamilyId) => ({ providerId: id, assetFamilyId })))
    }
  }

  async create(dto: CreateProviderDto, user: AuthUser, req: AppRequest) {
    // Un autorregistro es siempre una solicitud: pendiente y con quien la hace como responsable (administrador incluido).
    if (dto.selfRegistration && dto.ownerEmail) throw validationError('ownerEmail', 'Un autorregistro no puede asignar a otra persona como responsable')
    const isAdmin = user.isGlobalAdmin && !dto.selfRegistration
    if (dto.ownerEmail && !isAdmin) throw new ForbiddenException('Solo el administrador del ecosistema puede asignar un responsable')
    const ownerId = dto.ownerEmail ? await this.access.resolveOwner(dto.ownerEmail) : isAdmin ? null : user.id
    const stageIds = await this.resolveStages(this.db, dto.stageCodes)
    const familyIds = await this.resolveFamilies(this.db, dto.familyCodes)

    const created = await this.db
      .transaction(async (tx) => {
        const [row] = await tx
          .insert(providers)
          .values({
            organizationName: dto.organizationName,
            taxId: dto.taxId,
            countryCode: dto.countryCode,
            city: dto.city,
            description: dto.description,
            website: dto.website,
            contactEmail: dto.contactEmail,
            logoUrl: dto.logoUrl,
            certifications: dto.certifications,
            // Quien se registra solo queda como solicitud: el administrador la aprueba (y verifica) después.
            status: isAdmin ? 'ACTIVE' : 'PENDING',
            createdBy: user.id,
          })
          .returning()
        if (ownerId) await tx.insert(providerMembers).values({ providerId: row.id, userId: ownerId, role: 'OWNER' })
        await this.replaceTags(tx, row.id, stageIds, familyIds)
        return row
      })
      .catch((e) => {
        if (isUniqueViolation(e)) throw new ConflictException('Ya existe un proveedor con esa identificación tributaria en ese país')
        throw e
      })

    await this.audit.record(req, { module: 'provider', entityType: 'provider', entityId: created.id, action: isAdmin ? 'created' : 'registered', newData: { organizationName: dto.organizationName, countryCode: dto.countryCode, status: created.status } })
    return this.get(created.id, user)
  }

  async update(id: string, dto: UpdateProviderDto, user: AuthUser, req: AppRequest) {
    const before = await this.loadVisible(id, user)
    const role = await this.access.assertManage('provider', id, user)

    if (role !== 'ADMIN') {
      const forbidden = ADMIN_ONLY_FIELDS.filter((f) => dto[f] !== undefined)
      if (forbidden.length) throw new ForbiddenException(`Solo el administrador del ecosistema puede cambiar: ${forbidden.join(', ')}`)
      if (before.status === 'SUSPENDED') throw new ConflictException('La organización está suspendida; contacta al administrador')
    }

    const stageIds = dto.stageCodes ? await this.resolveStages(this.db, dto.stageCodes) : undefined
    const familyIds = dto.familyCodes ? await this.resolveFamilies(this.db, dto.familyCodes) : undefined
    const { stageCodes: _s, familyCodes: _f, ...fields } = dto
    // Una URL externa (o quitarla) reemplaza el logo subido: se descarta para no dejar un archivo huérfano.
    const dropUploaded = fields.logoUrl !== undefined && !!before.logoKey

    await this.db
      .transaction(async (tx) => {
        if (Object.keys(fields).length) await tx.update(providers).set({ ...fields, ...(dropUploaded && { logoKey: null, logoMime: null }), rating: fields.rating === undefined ? undefined : fields.rating === null ? null : String(fields.rating) }).where(eq(providers.id, id))
        else await tx.update(providers).set({ updatedAt: new Date() }).where(eq(providers.id, id))
        await this.replaceTags(tx, id, stageIds, familyIds)
      })
      .catch((e) => {
        if (isUniqueViolation(e)) throw new ConflictException('Ya existe un proveedor con esa identificación tributaria en ese país')
        throw e
      })

    if (dropUploaded && before.logoKey) await this.storage.delete(before.logoKey).catch(() => undefined)
    await this.audit.record(req, {
      module: 'provider',
      entityType: 'provider',
      entityId: id,
      action: dto.status && dto.status !== before.status ? 'status.changed' : 'updated',
      oldData: Object.fromEntries(Object.keys(fields).map((k) => [k, (before as Record<string, unknown>)[k]])),
      newData: dto,
    })
    return this.get(id, user)
  }

  // ---------- Logo ----------

  private async loadForLogo(id: string, user: AuthUser) {
    const before = await this.loadVisible(id, user)
    const role = await this.access.assertManage('provider', id, user)
    if (role !== 'ADMIN' && before.status === 'SUSPENDED') throw new ConflictException('La organización está suspendida; contacta al administrador')
    return before
  }

  /** Sube (o reemplaza) el logo. La clave es nueva en cada subida: el anterior se borra solo cuando el nuevo ya quedó registrado. */
  async setLogo(id: string, file: Express.Multer.File | undefined, user: AuthUser, req: AppRequest) {
    const before = await this.loadForLogo(id, user)
    const image = inspectImage(file)
    const key = `providers/${id}/logo-${randomUUID()}.${image.extension}`
    await this.storage.put(key, image.data)
    const now = new Date()
    try {
      await this.db.update(providers).set({ logoKey: key, logoMime: image.mimeType, logoUrl: `/providers/${id}/logo?v=${now.getTime()}`, updatedAt: now }).where(eq(providers.id, id))
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined)
      throw e
    }
    if (before.logoKey) await this.storage.delete(before.logoKey).catch(() => undefined)
    await this.audit.record(req, { module: 'provider', entityType: 'provider', entityId: id, action: 'logo.updated', oldData: { hadLogo: !!before.logoKey }, newData: { mimeType: image.mimeType, sizeBytes: image.data.length } })
    return this.get(id, user)
  }

  async removeLogo(id: string, user: AuthUser, req: AppRequest) {
    const before = await this.loadForLogo(id, user)
    await this.db.update(providers).set({ logoKey: null, logoMime: null, logoUrl: null, updatedAt: new Date() }).where(eq(providers.id, id))
    if (before.logoKey) await this.storage.delete(before.logoKey).catch(() => undefined)
    await this.audit.record(req, { module: 'provider', entityType: 'provider', entityId: id, action: 'logo.removed', oldData: { hadLogo: !!before.logoKey } })
  }

  /** Logo público de un proveedor (solo de los activos: una solicitud pendiente no es visible). */
  async openLogo(id: string) {
    const [row] = await this.db.select({ key: providers.logoKey, mime: providers.logoMime, status: providers.status }).from(providers).where(eq(providers.id, id))
    if (!row?.key || !row.mime || row.status !== 'ACTIVE') throw new NotFoundException('El proveedor no tiene logo')
    const stream = await this.storage.open(row.key).catch(() => {
      throw new NotFoundException('El proveedor no tiene logo')
    })
    return { stream, mime: row.mime }
  }
}
