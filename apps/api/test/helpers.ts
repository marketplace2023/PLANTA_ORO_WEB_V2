import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import { eq, inArray, like, or, sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'
import * as schema from '../src/database/schema'
import { TEST_DATABASE_URL } from './test-url'

export const PASSWORD = 'correcto-caballo-12'
/** Todo lo que crean los tests lleva estos prefijos, para limpiarlo sin tocar el resto de la base. */
export const EMAIL_DOMAIN = '@e2e.fur.local'
export const SLUG_PREFIX = 'e2e-'

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = moduleRef.createNestApplication()
  configureApp(app)
  await app.init()
  return app
}

export type Visibility = 'PUBLIC' | 'AUTHENTICATED' | 'PRIVATE'

/** Acceso directo a la base de pruebas para armar escenarios sin pasar por la API. */
export class TestDb {
  readonly pool = new Pool({ connectionString: TEST_DATABASE_URL })
  readonly db: NodePgDatabase<typeof schema> = drizzle(this.pool, { schema })
  private passwordHash?: Promise<string>
  private ecosystemId?: string

  /** Un único hash Argon2 compartido: crear usuarios cuesta ~0 ms tras el primero. */
  private hashed() {
    this.passwordHash ??= hash(PASSWORD)
    return this.passwordHash
  }

  async user(name: string, opts: { isGlobalAdmin?: boolean; status?: string } = {}) {
    const email = `${name}${EMAIL_DOMAIN}`
    const [user] = await this.db
      .insert(schema.users)
      .values({
        email,
        passwordHash: await this.hashed(),
        firstName: name,
        lastName: 'E2E',
        isGlobalAdmin: opts.isGlobalAdmin ?? false,
        status: opts.status ?? 'ACTIVE',
      })
      .returning()
    return user
  }

  async plant(slugSuffix: string, visibility: Visibility, extra: Partial<typeof schema.plants.$inferInsert> = {}) {
    if (!this.ecosystemId) {
      const [eco] = await this.db
        .insert(schema.ecosystems)
        .values({ code: 'FUR', name: 'Ecosistema FUR' })
        .onConflictDoNothing({ target: schema.ecosystems.code })
        .returning()
      this.ecosystemId =
        eco?.id ?? (await this.db.select().from(schema.ecosystems).where(eq(schema.ecosystems.code, 'FUR')))[0].id
    }
    const [plant] = await this.db
      .insert(schema.plants)
      .values({
        ecosystemId: this.ecosystemId,
        code: `E2E-${slugSuffix.toUpperCase()}`,
        name: `E2E ${slugSuffix}`,
        slug: `${SLUG_PREFIX}${slugSuffix}`,
        visibility,
        ...extra,
      })
      .returning()
    await this.db.insert(schema.plantSettings).values({ plantId: plant.id })
    return plant
  }

  async assign(userId: string, plantId: string, roleCode: string, extra: Partial<typeof schema.userPlantRoles.$inferInsert> = {}) {
    const [role] = await this.db.select().from(schema.roles).where(eq(schema.roles.code, roleCode))
    const [row] = await this.db
      .insert(schema.userPlantRoles)
      .values({ userId, plantId, roleId: role.id, ...extra })
      .returning()
    return row
  }

  async enableStage(plantId: string, code: string, extra: Partial<typeof schema.plantStages.$inferInsert> = {}) {
    const [master] = await this.db.select().from(schema.stageMaster).where(eq(schema.stageMaster.code, code))
    const [row] = await this.db
      .insert(schema.plantStages)
      .values({ plantId, stageMasterId: master.id, sequence: master.sequenceDefault, ...extra })
      .returning()
    return row
  }

  async enableNetwork(plantId: string, code: string, extra: Partial<typeof schema.plantNetworks.$inferInsert> = {}) {
    const [master] = await this.db.select().from(schema.networkMaster).where(eq(schema.networkMaster.code, code))
    const [row] = await this.db.insert(schema.plantNetworks).values({ plantId, networkMasterId: master.id, ...extra }).returning()
    return row
  }

  /** Modelo de catálogo propio de los tests (nombre con prefijo E2E, limpiado al final). */
  async model(typeCode: string, modelName: string, maker?: string) {
    const [type] = await this.db.select().from(schema.assetTypes).where(eq(schema.assetTypes.code, typeCode))
    let manufacturerId: string | undefined
    if (maker) {
      const [m] = await this.db
        .insert(schema.manufacturers)
        .values({ name: maker, countryCode: 'PE' })
        .onConflictDoNothing({ target: schema.manufacturers.name })
        .returning()
      manufacturerId = m?.id ?? (await this.db.select().from(schema.manufacturers).where(eq(schema.manufacturers.name, maker)))[0].id
    }
    const [row] = await this.db
      .insert(schema.assetModels)
      .values({ assetTypeId: type.id, manufacturerId, modelName, specifications: { powerKw: 100 } })
      .returning()
    return row
  }

  async override(userId: string, plantId: string, permission: string, effect: 'ALLOW' | 'DENY') {
    const [perm] = await this.db.select().from(schema.permissions).where(eq(schema.permissions.code, permission))
    await this.db.insert(schema.userPlantOverrides).values({ userId, plantId, permissionId: perm.id, effect })
  }

  /** Elimina todo lo creado por los tests (cascada a asignaciones, etapas, redes y tokens). */
  async cleanup() {
    const testUsers = await this.db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, `%${EMAIL_DOMAIN}`))
    const testPlants = await this.db.select({ id: schema.plants.id }).from(schema.plants).where(like(schema.plants.slug, `${SLUG_PREFIX}%`))
    const userIds = testUsers.map((u) => u.id)
    const plantIds = testPlants.map((p) => p.id)

    if (userIds.length || plantIds.length) {
      await this.db
        .delete(schema.auditEvents)
        .where(
          or(
            userIds.length ? inArray(schema.auditEvents.userId, userIds) : undefined,
            plantIds.length ? inArray(schema.auditEvents.plantId, plantIds) : undefined,
          ),
        )
    }
    // Intentos de login de correos inexistentes: no tienen usuario ni planta, solo el correo en new_data.
    await this.db
      .delete(schema.auditEvents)
      .where(sql`${schema.auditEvents.newData}->>'email' like ${'%' + EMAIL_DOMAIN}`)
    // Cursos del ecosistema creados por las pruebas (los de organizaciones caen con ellas).
    await this.db.delete(schema.courses).where(like(schema.courses.title, 'E2E %'))
    // Organizaciones externas de prueba (sus productos, servicios y miembros caen en cascada).
    await this.db.delete(schema.providers).where(like(schema.providers.organizationName, 'E2E %'))
    await this.db.delete(schema.contractors).where(like(schema.contractors.organizationName, 'E2E %'))
    await this.db.delete(schema.plants).where(like(schema.plants.slug, `${SLUG_PREFIX}%`))
    await this.db.delete(schema.users).where(like(schema.users.email, `%${EMAIL_DOMAIN}`))
    // Los activos ya cayeron en cascada con sus plantas; ahora se pueden borrar los modelos de prueba.
    await this.db.delete(schema.assetModels).where(like(schema.assetModels.modelName, 'E2E %'))
    await this.db.delete(schema.manufacturers).where(like(schema.manufacturers.name, 'E2E %'))
    // Catálogo creado por las pruebas de administración (tipos antes que familias).
    await this.db.delete(schema.assetTypes).where(like(schema.assetTypes.code, 'E2E\_%'))
    await this.db.delete(schema.assetFamilies).where(like(schema.assetFamilies.code, 'E2E\_%'))
  }

  async close() {
    await this.pool.end()
  }
}

export type Session = { accessToken: string; cookie: string; body: { user: { id: string; email: string } } }

/** Cookie `fur_rt=…` lista para reenviar. */
export function refreshCookie(res: request.Response): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('fur_rt='))
  if (!raw) throw new Error('La respuesta no trae la cookie fur_rt')
  return raw.split(';')[0]
}

export async function login(app: INestApplication, name: string, password = PASSWORD): Promise<Session> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: `${name}${EMAIL_DOMAIN}`, password })
    .expect(200)
  return { accessToken: res.body.accessToken, cookie: refreshCookie(res), body: res.body }
}

export const bearer = (s: Session | string) => `Bearer ${typeof s === 'string' ? s : s.accessToken}`
