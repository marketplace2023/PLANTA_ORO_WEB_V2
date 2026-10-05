import { Controller, Get, Inject } from '@nestjs/common'
import { desc, eq, gte, sql, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import { DB, type Database } from '../../database/database.module'
import {
  assetFamilies,
  assetModels,
  assetTypes,
  auditEvents,
  contractors,
  courses,
  manufacturers,
  networkMaster,
  permissions,
  plants,
  providers,
  roles,
  stageMaster,
  userPlantRoles,
  users,
} from '../../database/schema'
import { GlobalAdminOnly } from '../iam/decorators'

const DAY = 86_400_000

type Counted = { key: string; n: number }
const asRecord = (rows: Counted[]) => Object.fromEntries(rows.map((r) => [r.key, r.n])) as Record<string, number>

/** Dashboard del Administrador del Ecosistema (arquitectura §35.1). Solo el administrador global. */
@GlobalAdminOnly()
@Controller('admin/dashboard')
export class EcosystemDashboardController {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async count(table: PgTable, where?: SQL): Promise<number> {
    const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(table).where(where)
    return row?.n ?? 0
  }

  private async grouped(table: PgTable, column: PgColumn): Promise<Record<string, number>> {
    const rows = (await this.db.select({ key: column, n: sql<number>`count(*)::int` }).from(table).groupBy(column)) as Counted[]
    return asRecord(rows)
  }

  @Get()
  async overview() {
    const now = Date.now()
    const since24h = new Date(now - DAY)
    const since7d = new Date(now - 7 * DAY)
    const since30d = new Date(now - 30 * DAY)

    let database: 'up' | 'down' = 'up'
    const started = Date.now()
    try {
      await this.db.execute(sql`select 1`)
    } catch {
      database = 'down'
    }
    const latencyMs = Date.now() - started

    const [
      plantsByStatus,
      plantsByVisibility,
      usersByStatus,
      admins,
      activeLast30,
      roleCount,
      permissionCount,
      assignments,
      families,
      types,
      makers,
      models,
      stages,
      networks,
      providersByStatus,
      contractorsByStatus,
      publishedCourses,
      events24h,
      events7d,
      recent,
    ] = await Promise.all([
      this.grouped(plants, plants.status),
      this.grouped(plants, plants.visibility),
      this.grouped(users, users.status),
      this.count(users, eq(users.isGlobalAdmin, true)),
      this.count(users, gte(users.lastLoginAt, since30d)),
      this.count(roles),
      this.count(permissions),
      this.count(userPlantRoles),
      this.count(assetFamilies),
      this.count(assetTypes),
      this.count(manufacturers),
      this.count(assetModels),
      this.count(stageMaster),
      this.count(networkMaster),
      this.grouped(providers, providers.status),
      this.grouped(contractors, contractors.status),
      this.count(courses, eq(courses.status, 'PUBLISHED')),
      this.count(auditEvents, gte(auditEvents.occurredAt, since24h)),
      this.count(auditEvents, gte(auditEvents.occurredAt, since7d)),
      this.db
        .select({
          id: auditEvents.id,
          occurredAt: auditEvents.occurredAt,
          module: auditEvents.module,
          entityType: auditEvents.entityType,
          action: auditEvents.action,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(auditEvents)
        .leftJoin(users, eq(users.id, auditEvents.userId))
        .where(gte(auditEvents.occurredAt, since7d))
        .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
        .limit(10),
    ])

    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
    return {
      generatedAt: new Date().toISOString(),
      plants: { total: sum(plantsByStatus), byStatus: plantsByStatus, byVisibility: plantsByVisibility },
      users: { total: sum(usersByStatus), byStatus: usersByStatus, globalAdmins: admins, activeLast30Days: activeLast30 },
      access: { roles: roleCount, permissions: permissionCount, assignments },
      catalog: { families, types, manufacturers: makers, models },
      masters: { stages, networks },
      organizations: {
        providers: { total: sum(providersByStatus), pending: providersByStatus.PENDING ?? 0 },
        contractors: { total: sum(contractorsByStatus), pending: contractorsByStatus.PENDING ?? 0 },
      },
      courses: { published: publishedCourses },
      audit: {
        last24Hours: events24h,
        last7Days: events7d,
        recent: recent.map((e) => ({
          id: e.id,
          occurredAt: e.occurredAt,
          module: e.module,
          entityType: e.entityType,
          action: e.action,
          actor: e.firstName ? `${e.firstName} ${e.lastName ?? ''}`.trim() : null,
        })),
      },
      health: { database, latencyMs },
      // Aún no existen integraciones externas: se informa como no disponible, no como cero.
      integrations: null,
    }
  }
}
