import { Inject, Injectable } from '@nestjs/common'
import { and, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm'
import type { AuthUser, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { permissions, plants, rolePermissions, roles, userPlantOverrides, userPlantRoles } from '../../database/schema'
import { PERMISSIONS } from './permissions.catalog'

export type PlantAccess = {
  roles: string[]
  permissions: Set<string>
  /** Tiene al menos una asignación activa (o un permiso excepcional) en la planta. */
  isMember: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Autorización: USUARIO + PLANTA + ROL + MÓDULO + ACCIÓN (arquitectura §6).
 * La base de datos es la fuente de verdad; nada de permisos dentro del JWT.
 */
@Injectable()
export class AuthzService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Resuelve una planta por UUID o por slug. */
  async findPlant(ref: string): Promise<PlantRow | null> {
    const [plant] = await this.db
      .select()
      .from(plants)
      .where(UUID_RE.test(ref) ? eq(plants.id, ref) : eq(plants.slug, ref))
      .limit(1)
    return plant ?? null
  }

  /** Accesos del usuario por planta (roles + permisos efectivos), solo plantas donde tiene asignación. */
  async accessByPlant(userId: string, onlyPlantId?: string): Promise<Map<string, PlantAccess>> {
    const now = new Date()
    const result = new Map<string, PlantAccess>()
    const ensure = (plantId: string) => {
      let entry = result.get(plantId)
      if (!entry) {
        entry = { roles: [], permissions: new Set(), isMember: true }
        result.set(plantId, entry)
      }
      return entry
    }

    const rows = await this.db
      .select({ plantId: userPlantRoles.plantId, roleCode: roles.code, permission: permissions.code })
      .from(userPlantRoles)
      .innerJoin(roles, eq(roles.id, userPlantRoles.roleId))
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        and(
          eq(userPlantRoles.userId, userId),
          onlyPlantId ? eq(userPlantRoles.plantId, onlyPlantId) : undefined,
          eq(userPlantRoles.status, 'ACTIVE'),
          or(isNull(userPlantRoles.startsAt), lte(userPlantRoles.startsAt, now)),
          or(isNull(userPlantRoles.endsAt), gt(userPlantRoles.endsAt, now)),
        ),
      )
    for (const row of rows) {
      const entry = ensure(row.plantId)
      if (!entry.roles.includes(row.roleCode)) entry.roles.push(row.roleCode)
      if (row.permission) entry.permissions.add(row.permission)
    }

    // Permisos excepcionales: ALLOW añade, DENY quita (y DENY gana siempre).
    const overrides = await this.db
      .select({ plantId: userPlantOverrides.plantId, effect: userPlantOverrides.effect, code: permissions.code })
      .from(userPlantOverrides)
      .innerJoin(permissions, eq(permissions.id, userPlantOverrides.permissionId))
      .where(
        and(
          eq(userPlantOverrides.userId, userId),
          onlyPlantId ? eq(userPlantOverrides.plantId, onlyPlantId) : undefined,
        ),
      )
    for (const o of overrides.filter((o) => o.effect === 'ALLOW')) ensure(o.plantId).permissions.add(o.code)
    for (const o of overrides.filter((o) => o.effect === 'DENY')) ensure(o.plantId).permissions.delete(o.code)

    return result
  }

  /** Acceso del usuario (o anónimo) a una planta concreta. */
  async access(user: AuthUser | undefined, plantId: string): Promise<PlantAccess> {
    if (!user) return { roles: [], permissions: new Set(), isMember: false }
    if (user.isGlobalAdmin) return { roles: ['ECOSYSTEM_ADMIN'], permissions: new Set(PERMISSIONS), isMember: true }
    const entry = (await this.accessByPlant(user.id, plantId)).get(plantId)
    return entry ?? { roles: [], permissions: new Set(), isMember: false }
  }

  /** Visibilidad de la planta (core.plants.visibility): PUBLIC | AUTHENTICATED | PRIVATE. */
  canView(user: AuthUser | undefined, plant: PlantRow, access: PlantAccess): boolean {
    if (user?.isGlobalAdmin) return true
    if (plant.visibility === 'PUBLIC') return true
    if (plant.visibility === 'AUTHENTICATED') return !!user
    return access.isMember
  }

  /** Plantas que el usuario (o anónimo) puede ver. */
  async visiblePlants(user: AuthUser | undefined): Promise<PlantRow[]> {
    if (user?.isGlobalAdmin) return this.db.select().from(plants).orderBy(plants.name)
    if (!user) return this.db.select().from(plants).where(eq(plants.visibility, 'PUBLIC')).orderBy(plants.name)

    const memberOf = [...(await this.accessByPlant(user.id)).keys()]
    return this.db
      .select()
      .from(plants)
      .where(
        or(
          inArray(plants.visibility, ['PUBLIC', 'AUTHENTICATED']),
          memberOf.length > 0 ? inArray(plants.id, memberOf) : undefined,
        ),
      )
      .orderBy(plants.name)
  }
}
