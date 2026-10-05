import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq, gte, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { isUniqueViolation } from '../../common/db-errors'
import { validationError } from '../../common/errors'
import { escapeLike, pageOf } from '../../common/pagination'
import type { AppRequest, AuthUser } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { contractorMembers, contractors, serviceStages, services, stageMaster } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from './org-access.service'
import type { CreateContractorDto, CreateServiceDto, ListContractorsQuery, ListServicesQuery, UpdateContractorDto, UpdateServiceDto } from './organizations.schemas'
import { ratingOf } from './providers.service'

type ContractorRow = typeof contractors.$inferSelect
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type Tag = { code: string; name: string }

const ADMIN_ONLY_FIELDS = ['organizationName', 'taxId', 'countryCode', 'status', 'verified', 'rating'] as const

@Injectable()
export class ContractorsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: OrgAccessService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Etiquetas ----------

  private async serviceStagesFor(ids: string[]) {
    const map = new Map<string, Tag[]>()
    if (ids.length === 0) return map
    const rows = await this.db
      .select({ serviceId: serviceStages.serviceId, code: stageMaster.code, name: stageMaster.name })
      .from(serviceStages)
      .innerJoin(stageMaster, eq(stageMaster.id, serviceStages.stageMasterId))
      .where(inArray(serviceStages.serviceId, ids))
      .orderBy(asc(stageMaster.sequenceDefault))
    for (const r of rows) map.set(r.serviceId, [...(map.get(r.serviceId) ?? []), { code: r.code, name: r.name }])
    return map
  }

  /** Etapas atendidas por un contratista = unión de las de sus servicios activos; especialidades, igual. */
  private async coverageFor(ids: string[]) {
    const stages = new Map<string, Tag[]>()
    const specialties = new Map<string, string[]>()
    if (ids.length === 0) return { stages, specialties }
    const stageRows = await this.db
      .selectDistinct({ contractorId: services.contractorId, code: stageMaster.code, name: stageMaster.name, seq: stageMaster.sequenceDefault })
      .from(services)
      .innerJoin(serviceStages, eq(serviceStages.serviceId, services.id))
      .innerJoin(stageMaster, eq(stageMaster.id, serviceStages.stageMasterId))
      .where(and(inArray(services.contractorId, ids), eq(services.status, 'ACTIVE')))
      .orderBy(asc(stageMaster.sequenceDefault))
    for (const r of stageRows) stages.set(r.contractorId, [...(stages.get(r.contractorId) ?? []), { code: r.code, name: r.name }])
    const typeRows = await this.db
      .selectDistinct({ contractorId: services.contractorId, serviceType: services.serviceType })
      .from(services)
      .where(and(inArray(services.contractorId, ids), eq(services.status, 'ACTIVE')))
      .orderBy(asc(services.serviceType))
    for (const r of typeRows) specialties.set(r.contractorId, [...(specialties.get(r.contractorId) ?? []), r.serviceType])
    return { stages, specialties }
  }

  private toItem(r: ContractorRow, cover: Awaited<ReturnType<ContractorsService['coverageFor']>>, user: AuthUser | undefined) {
    return {
      id: r.id,
      organizationName: r.organizationName,
      countryCode: r.countryCode,
      city: r.city,
      description: r.description,
      logoUrl: r.logoUrl,
      certifications: r.certifications,
      availability: r.availability,
      status: r.status,
      verified: r.verified,
      rating: ratingOf(r.rating),
      website: r.website,
      contactEmail: user ? r.contactEmail : null,
      stages: cover.stages.get(r.id) ?? [],
      specialties: cover.specialties.get(r.id) ?? [],
    }
  }

  // ---------- Contratistas ----------

  async list(q: ListContractorsQuery, user: AuthUser | undefined) {
    const status = user?.isGlobalAdmin ? q.status : 'ACTIVE'
    const conditions: Array<SQL | undefined> = [
      status === 'ALL' ? undefined : eq(contractors.status, status),
      q.country ? eq(contractors.countryCode, q.country) : undefined,
      q.location ? ilike(contractors.city, `%${escapeLike(q.location)}%`) : undefined,
      q.availability ? eq(contractors.availability, q.availability) : undefined,
      q.verified === '1' ? eq(contractors.verified, true) : undefined,
      q.ratingMin !== undefined ? gte(contractors.rating, String(q.ratingMin)) : undefined,
      q.certification ? sql`exists (select 1 from unnest(${contractors.certifications}) c where lower(c) = lower(${q.certification}))` : undefined,
      q.specialty ? sql`exists (select 1 from ${services} s where s.contractor_id = ${contractors.id} and s.status = 'ACTIVE' and lower(s.service_type) = lower(${q.specialty}))` : undefined,
      q.stage
        ? sql`exists (select 1 from ${services} s inner join ${serviceStages} ss on ss.service_id = s.id inner join ${stageMaster} sm on sm.id = ss.stage_master_id where s.contractor_id = ${contractors.id} and s.status = 'ACTIVE' and sm.code = ${q.stage})`
        : undefined,
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(contractors.organizationName, like), ilike(contractors.description, like)))
    }
    const where = and(...conditions)
    const order = q.sort === 'rating' ? [sql`${contractors.rating} desc nulls last`, asc(contractors.organizationName)] : [asc(contractors.organizationName)]
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(contractors)
        .where(where)
        .orderBy(...order, asc(contractors.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(contractors).where(where),
    ])
    const cover = await this.coverageFor(rows.map((r) => r.id))
    return pageOf(rows.map((r) => this.toItem(r, cover, user)), total, q.page, q.pageSize)
  }

  async mine(user: AuthUser) {
    const memberships = await this.access.myOrgIds('contractor', user.id)
    if (memberships.size === 0) return []
    const rows = await this.db.select().from(contractors).where(inArray(contractors.id, [...memberships.keys()])).orderBy(asc(contractors.organizationName))
    const cover = await this.coverageFor(rows.map((r) => r.id))
    return rows.map((r) => ({ ...this.toItem(r, cover, user), myRole: memberships.get(r.id) }))
  }

  async loadVisible(id: string, user: AuthUser | undefined): Promise<ContractorRow> {
    const [row] = await this.db.select().from(contractors).where(eq(contractors.id, id))
    if (!row) throw new NotFoundException('Contratista no encontrado')
    if (row.status !== 'ACTIVE') {
      const role = user?.isGlobalAdmin ? 'ADMIN' : await this.access.roleOf('contractor', id, user?.id)
      if (!role) throw new NotFoundException('Contratista no encontrado')
    }
    return row
  }

  async get(id: string, user: AuthUser | undefined) {
    const row = await this.loadVisible(id, user)
    const role = user ? (user.isGlobalAdmin ? 'ADMIN' : await this.access.roleOf('contractor', id, user.id)) : null
    const cover = await this.coverageFor([id])
    // Quien gestiona ve también los servicios inactivos; el público, solo los activos.
    const rows = await this.db
      .select()
      .from(services)
      .where(and(eq(services.contractorId, id), role ? undefined : eq(services.status, 'ACTIVE')))
      .orderBy(asc(services.name))
    const stages = await this.serviceStagesFor(rows.map((s) => s.id))
    return {
      ...this.toItem(row, cover, user),
      taxId: role ? row.taxId : null,
      canManage: !!role,
      myRole: role,
      services: rows.map((s) => ({ id: s.id, name: s.name, description: s.description, serviceType: s.serviceType, status: s.status, stages: stages.get(s.id) ?? [] })),
    }
  }

  async create(dto: CreateContractorDto, user: AuthUser, req: AppRequest) {
    const isAdmin = user.isGlobalAdmin
    if (dto.ownerEmail && !isAdmin) throw new ForbiddenException('Solo el administrador del ecosistema puede asignar un responsable')
    const ownerId = dto.ownerEmail ? await this.access.resolveOwner(dto.ownerEmail) : isAdmin ? null : user.id

    const created = await this.db
      .transaction(async (tx) => {
        const [row] = await tx
          .insert(contractors)
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
            availability: dto.availability,
            status: isAdmin ? 'ACTIVE' : 'PENDING',
            createdBy: user.id,
          })
          .returning()
        if (ownerId) await tx.insert(contractorMembers).values({ contractorId: row.id, userId: ownerId, role: 'OWNER' })
        return row
      })
      .catch((e) => {
        if (isUniqueViolation(e)) throw new ConflictException('Ya existe un contratista con esa identificación tributaria en ese país')
        throw e
      })
    await this.audit.record(req, { module: 'professional', entityType: 'contractor', entityId: created.id, action: isAdmin ? 'created' : 'registered', newData: { organizationName: dto.organizationName, countryCode: dto.countryCode, status: created.status } })
    return this.get(created.id, user)
  }

  async update(id: string, dto: UpdateContractorDto, user: AuthUser, req: AppRequest) {
    const before = await this.loadVisible(id, user)
    const role = await this.access.assertManage('contractor', id, user)
    if (role !== 'ADMIN') {
      const forbidden = ADMIN_ONLY_FIELDS.filter((f) => dto[f] !== undefined)
      if (forbidden.length) throw new ForbiddenException(`Solo el administrador del ecosistema puede cambiar: ${forbidden.join(', ')}`)
      if (before.status === 'SUSPENDED') throw new ConflictException('La organización está suspendida; contacta al administrador')
    }
    const { rating, ...rest } = dto
    await this.db
      .update(contractors)
      .set({ ...rest, ...(rating !== undefined && { rating: rating === null ? null : String(rating) }), updatedAt: new Date() })
      .where(eq(contractors.id, id))
      .catch((e) => {
        if (isUniqueViolation(e)) throw new ConflictException('Ya existe un contratista con esa identificación tributaria en ese país')
        throw e
      })
    await this.audit.record(req, {
      module: 'professional',
      entityType: 'contractor',
      entityId: id,
      action: dto.status && dto.status !== before.status ? 'status.changed' : 'updated',
      oldData: Object.fromEntries(Object.keys(rest).map((k) => [k, (before as Record<string, unknown>)[k]])),
      newData: dto,
    })
    return this.get(id, user)
  }

  // ---------- Servicios ----------

  private async resolveStageIds(tx: Tx | Database, codes: string[]) {
    if (codes.length === 0) return []
    const rows = await tx.select({ id: stageMaster.id, code: stageMaster.code }).from(stageMaster).where(inArray(stageMaster.code, codes))
    const missing = codes.filter((c) => !rows.some((r) => r.code === c))
    if (missing.length) throw validationError('stageCodes', `Etapas inexistentes: ${missing.join(', ')}`)
    return rows.map((r) => r.id)
  }

  private async assertActive(id: string) {
    const [c] = await this.db.select({ status: contractors.status }).from(contractors).where(eq(contractors.id, id))
    if (c?.status !== 'ACTIVE') throw new ConflictException('El contratista debe estar activo para gestionar servicios')
  }

  async createService(contractorId: string, dto: CreateServiceDto, user: AuthUser, req: AppRequest) {
    await this.loadVisible(contractorId, user)
    await this.access.assertManage('contractor', contractorId, user)
    await this.assertActive(contractorId)
    const stageIds = await this.resolveStageIds(this.db, dto.stageCodes)
    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx.insert(services).values({ contractorId, name: dto.name, description: dto.description, serviceType: dto.serviceType.toUpperCase() }).returning({ id: services.id })
      if (stageIds.length) await tx.insert(serviceStages).values([...new Set(stageIds)].map((stageMasterId) => ({ serviceId: row.id, stageMasterId })))
      return row
    })
    await this.audit.record(req, { module: 'professional', entityType: 'service', entityId: created.id, action: 'created', newData: { contractorId, name: dto.name, serviceType: dto.serviceType } })
    return this.get(contractorId, user)
  }

  async updateService(contractorId: string, id: string, dto: UpdateServiceDto, user: AuthUser, req: AppRequest) {
    await this.loadVisible(contractorId, user)
    const role = await this.access.assertManage('contractor', contractorId, user)
    const [before] = await this.db.select().from(services).where(and(eq(services.id, id), eq(services.contractorId, contractorId)))
    if (!before) throw new NotFoundException('Servicio no encontrado')
    if (role !== 'ADMIN') await this.assertActive(contractorId)
    const stageIds = dto.stageCodes ? await this.resolveStageIds(this.db, dto.stageCodes) : undefined
    const { stageCodes: _s, serviceType, ...rest } = dto
    await this.db.transaction(async (tx) => {
      await tx
        .update(services)
        .set({ ...rest, ...(serviceType && { serviceType: serviceType.toUpperCase() }), updatedAt: new Date() })
        .where(eq(services.id, id))
      if (stageIds) {
        await tx.delete(serviceStages).where(eq(serviceStages.serviceId, id))
        if (stageIds.length) await tx.insert(serviceStages).values([...new Set(stageIds)].map((stageMasterId) => ({ serviceId: id, stageMasterId })))
      }
    })
    await this.audit.record(req, { module: 'professional', entityType: 'service', entityId: id, action: 'updated', oldData: { name: before.name, serviceType: before.serviceType, status: before.status }, newData: dto })
    return this.get(contractorId, user)
  }

  // ---------- Servicios públicos (design.md §35) ----------

  async listServices(q: ListServicesQuery, user: AuthUser | undefined) {
    const conditions: Array<SQL | undefined> = [
      eq(services.status, 'ACTIVE'),
      eq(contractors.status, 'ACTIVE'),
      q.contractorId ? eq(services.contractorId, q.contractorId) : undefined,
      q.specialty ? sql`lower(${services.serviceType}) = lower(${q.specialty})` : undefined,
      q.country ? eq(contractors.countryCode, q.country) : undefined,
      q.location ? ilike(contractors.city, `%${escapeLike(q.location)}%`) : undefined,
      q.availability ? eq(contractors.availability, q.availability) : undefined,
      q.ratingMin !== undefined ? gte(contractors.rating, String(q.ratingMin)) : undefined,
      q.certification ? sql`exists (select 1 from unnest(${contractors.certifications}) c where lower(c) = lower(${q.certification}))` : undefined,
      q.stage ? sql`exists (select 1 from ${serviceStages} ss inner join ${stageMaster} sm on sm.id = ss.stage_master_id where ss.service_id = ${services.id} and sm.code = ${q.stage})` : undefined,
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(services.name, like), ilike(services.description, like), ilike(contractors.organizationName, like)))
    }
    const where = and(...conditions)
    const order = q.sort === 'rating' ? [sql`${contractors.rating} desc nulls last`, asc(services.name)] : [asc(services.name)]
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: services.id,
          name: services.name,
          description: services.description,
          serviceType: services.serviceType,
          contractorId: contractors.id,
          contractorName: contractors.organizationName,
          verified: contractors.verified,
          rating: contractors.rating,
          availability: contractors.availability,
          city: contractors.city,
          countryCode: contractors.countryCode,
          certifications: contractors.certifications,
        })
        .from(services)
        .innerJoin(contractors, eq(contractors.id, services.contractorId))
        .where(where)
        .orderBy(...order, asc(services.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: sql<number>`count(*)::int` }).from(services).innerJoin(contractors, eq(contractors.id, services.contractorId)).where(where),
    ])
    const stages = await this.serviceStagesFor(rows.map((r) => r.id))
    void user
    return pageOf(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        serviceType: r.serviceType,
        stages: stages.get(r.id) ?? [],
        contractor: { id: r.contractorId, name: r.contractorName, verified: r.verified, rating: ratingOf(r.rating), availability: r.availability, city: r.city, countryCode: r.countryCode, certifications: r.certifications },
      })),
      total,
      q.page,
      q.pageSize,
    )
  }

  /** Especialidades con servicios activos: alimenta el filtro "Especialidad" sin fijar una lista en el código. */
  async specialties() {
    const rows = await this.db
      .selectDistinct({ serviceType: services.serviceType })
      .from(services)
      .innerJoin(contractors, eq(contractors.id, services.contractorId))
      .where(and(eq(services.status, 'ACTIVE'), eq(contractors.status, 'ACTIVE')))
      .orderBy(asc(services.serviceType))
    return rows.map((r) => r.serviceType)
  }
}
