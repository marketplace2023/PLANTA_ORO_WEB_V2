import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq, or } from 'drizzle-orm'
import type { AppRequest, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { roles, userPlantRoles, users } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import type { AssignMemberDto } from './plants.schemas'

/** Asignaciones usuario ↔ planta ↔ rol (tabla iam.user_plant_roles, arquitectura §8.5). */
@Injectable()
export class MembersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  private view() {
    return this.db
      .select({
        id: userPlantRoles.id,
        userId: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        roleCode: roles.code,
        roleName: roles.name,
        status: userPlantRoles.status,
        startsAt: userPlantRoles.startsAt,
        endsAt: userPlantRoles.endsAt,
      })
      .from(userPlantRoles)
      .innerJoin(users, eq(users.id, userPlantRoles.userId))
      .innerJoin(roles, eq(roles.id, userPlantRoles.roleId))
  }

  assignableRoles() {
    return this.db
      .select({ code: roles.code, name: roles.name, scope: roles.scope })
      .from(roles)
      .where(or(eq(roles.scope, 'PLANT'), eq(roles.code, 'CONSUMER')))
      .orderBy(asc(roles.scope), asc(roles.name))
  }

  list(plant: PlantRow) {
    return this.view().where(eq(userPlantRoles.plantId, plant.id)).orderBy(users.email, roles.code)
  }

  async assign(plant: PlantRow, dto: AssignMemberDto, req: AppRequest) {
    const [user] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, dto.email)).limit(1)
    if (!user) throw new NotFoundException('No existe un usuario con ese correo')

    const [role] = await this.db.select().from(roles).where(eq(roles.code, dto.roleCode)).limit(1)
    if (!role) throw new NotFoundException(`El rol ${dto.roleCode} no existe`)
    // Solo roles de planta (o el de consumidor): los roles globales y externos no se asignan por planta.
    if (role.scope !== 'PLANT' && role.code !== 'CONSUMER') {
      throw new BadRequestException(`El rol ${role.code} no se puede asignar a una planta`)
    }

    const [row] = await this.db
      .insert(userPlantRoles)
      .values({ userId: user.id, plantId: plant.id, roleId: role.id })
      .returning()
      .catch((err: { code?: string; cause?: { code?: string } }) => {
        if ((err.code ?? err.cause?.code) === '23505') throw new ConflictException('El usuario ya tiene ese rol en la planta')
        throw err
      })

    await this.audit.record(req, {
      module: 'iam',
      entityType: 'user_plant_role',
      entityId: row.id,
      plantId: plant.id,
      action: 'member.assigned',
      newData: { userId: user.id, roleCode: role.code },
    })
    return (await this.view().where(eq(userPlantRoles.id, row.id)))[0]
  }

  async remove(plant: PlantRow, assignmentId: string, req: AppRequest) {
    const [row] = await this.view().where(and(eq(userPlantRoles.id, assignmentId), eq(userPlantRoles.plantId, plant.id)))
    if (!row) throw new NotFoundException('Asignación no encontrada en esta planta')

    await this.db.delete(userPlantRoles).where(eq(userPlantRoles.id, assignmentId))
    await this.audit.record(req, {
      module: 'iam',
      entityType: 'user_plant_role',
      entityId: assignmentId,
      plantId: plant.id,
      action: 'member.removed',
      oldData: { userId: row.userId, roleCode: row.roleCode },
    })
  }
}
