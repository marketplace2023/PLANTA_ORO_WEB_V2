import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { AppRequest, AuthUser } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { plantAccessRequests, plants, roles, userPlantRoles, users } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { AuthzService } from '../iam/authz.service'
import type { ApproveAccessRequestDto, CreateAccessRequestDto, RejectAccessRequestDto } from './plants.schemas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Solicitudes de acceso a plantas. Una persona con cuenta pide entrar a una planta que puede ver; el administrador del
 * ecosistema aprueba (eligiendo el rol) o rechaza. Una solicitud pendiente no concede ningún permiso.
 */
@Injectable()
export class AccessRequestsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
  ) {}

  private view() {
    const decider = alias(users, 'decider')
    return this.db
      .select({
        id: plantAccessRequests.id,
        status: plantAccessRequests.status,
        message: plantAccessRequests.message,
        roleCode: plantAccessRequests.roleCode,
        decisionNote: plantAccessRequests.decisionNote,
        decidedAt: plantAccessRequests.decidedAt,
        decidedByEmail: decider.email,
        createdAt: plantAccessRequests.createdAt,
        plantId: plants.id,
        plantName: plants.name,
        plantSlug: plants.slug,
        userId: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(plantAccessRequests)
      .innerJoin(plants, eq(plants.id, plantAccessRequests.plantId))
      .innerJoin(users, eq(users.id, plantAccessRequests.userId))
      .leftJoin(decider, eq(decider.id, plantAccessRequests.decidedBy))
  }

  private async one(id: string) {
    const [row] = await this.view().where(eq(plantAccessRequests.id, id))
    if (!row) throw new NotFoundException('Solicitud no encontrada')
    return row
  }

  mine(user: AuthUser) {
    return this.view().where(eq(plantAccessRequests.userId, user.id)).orderBy(desc(plantAccessRequests.createdAt))
  }

  list(status: string | undefined) {
    const st = (status ?? 'PENDING').toUpperCase()
    return this.view()
      .where(st === 'ALL' ? undefined : eq(plantAccessRequests.status, st))
      .orderBy(desc(plantAccessRequests.createdAt))
      .limit(200)
  }

  async create(user: AuthUser, dto: CreateAccessRequestDto, req: AppRequest) {
    // Solo se puede pedir acceso a una planta que la persona ya puede ver (las privadas no se revelan).
    const visible = await this.authz.visiblePlants(user)
    const plant = visible.find((p) => (UUID.test(dto.plant) ? p.id === dto.plant : p.slug === dto.plant))
    if (!plant) throw new NotFoundException('Planta no encontrada')

    if (user.isGlobalAdmin) throw new BadRequestException('El administrador del ecosistema ya tiene acceso a todas las plantas')
    const access = await this.authz.accessByPlant(user.id, plant.id)
    if (access.has(plant.id)) throw new ConflictException('Ya tienes acceso a esa planta')

    const [row] = await this.db
      .insert(plantAccessRequests)
      .values({ userId: user.id, plantId: plant.id, message: dto.message || null })
      .returning()
      .catch((err: { code?: string; cause?: { code?: string } }) => {
        if ((err.code ?? err.cause?.code) === '23505') throw new ConflictException('Ya tienes una solicitud pendiente para esa planta')
        throw err
      })
    await this.audit.record(req, { module: 'iam', entityType: 'plant_access_request', entityId: row.id, plantId: plant.id, action: 'access_request.created' })
    return this.one(row.id)
  }

  /** La persona retira su propia solicitud mientras siga pendiente. */
  async cancel(user: AuthUser, id: string, req: AppRequest) {
    const row = await this.one(id)
    if (row.userId !== user.id) throw new NotFoundException('Solicitud no encontrada')
    if (row.status !== 'PENDING') throw new ConflictException('La solicitud ya fue resuelta')
    await this.db.update(plantAccessRequests).set({ status: 'CANCELLED', decidedAt: new Date() }).where(eq(plantAccessRequests.id, id))
    await this.audit.record(req, { module: 'iam', entityType: 'plant_access_request', entityId: id, plantId: row.plantId, action: 'access_request.cancelled' })
    return this.one(id)
  }

  async approve(admin: AuthUser, id: string, dto: ApproveAccessRequestDto, req: AppRequest) {
    const row = await this.one(id)
    if (row.status !== 'PENDING') throw new ConflictException('La solicitud ya fue resuelta')

    const [role] = await this.db.select().from(roles).where(eq(roles.code, dto.roleCode)).limit(1)
    if (!role) throw new NotFoundException(`El rol ${dto.roleCode} no existe`)
    // Mismos roles asignables que en «Equipo»: roles de planta o el de consumidor.
    if (role.scope !== 'PLANT' && role.code !== 'CONSUMER') throw new BadRequestException(`El rol ${role.code} no se puede asignar a una planta`)

    await this.db.transaction(async (tx) => {
      await tx.insert(userPlantRoles).values({ userId: row.userId, plantId: row.plantId, roleId: role.id }).onConflictDoNothing()
      await tx
        .update(plantAccessRequests)
        .set({ status: 'APPROVED', roleCode: role.code, decidedBy: admin.id, decidedAt: new Date(), decisionNote: dto.note || null })
        .where(and(eq(plantAccessRequests.id, id), eq(plantAccessRequests.status, 'PENDING')))
    })
    await this.audit.record(req, {
      module: 'iam',
      entityType: 'plant_access_request',
      entityId: id,
      plantId: row.plantId,
      action: 'access_request.approved',
      newData: { userId: row.userId, roleCode: role.code },
    })
    return this.one(id)
  }

  async reject(admin: AuthUser, id: string, dto: RejectAccessRequestDto, req: AppRequest) {
    const row = await this.one(id)
    if (row.status !== 'PENDING') throw new ConflictException('La solicitud ya fue resuelta')
    await this.db
      .update(plantAccessRequests)
      .set({ status: 'REJECTED', decidedBy: admin.id, decidedAt: new Date(), decisionNote: dto.note || null })
      .where(and(eq(plantAccessRequests.id, id), eq(plantAccessRequests.status, 'PENDING')))
    await this.audit.record(req, { module: 'iam', entityType: 'plant_access_request', entityId: id, plantId: row.plantId, action: 'access_request.rejected' })
    return this.one(id)
  }
}
