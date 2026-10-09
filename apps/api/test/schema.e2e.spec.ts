import { eq } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../src/database/schema'
import { TEST_DATABASE_URL } from './test-url'

const { ecosystems, plants, plantStages, plantNetworks, stageMaster, networkMaster, userPlantRoles, users, roles } = schema

/** Reglas de integridad del modelo (arquitectura §47) aplicadas en la propia base de datos. */
describe('Integridad del esquema (e2e)', () => {
  let pool: Pool
  let db: NodePgDatabase<typeof schema>
  let ecosystemId: string
  let plantId: string

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL })
    db = drizzle(pool, { schema })
    const [eco] = await db.insert(ecosystems).values({ code: 'ECO-TEST', name: 'Ecosistema de pruebas' }).returning()
    ecosystemId = eco.id
    const [plant] = await db
      .insert(plants)
      .values({ ecosystemId, code: 'P-TEST', name: 'Planta de pruebas', slug: 'planta-pruebas' })
      .returning()
    plantId = plant.id
  })

  afterAll(async () => {
    // El borrado de la planta cascada a sus etapas, redes y asignaciones.
    await db.delete(users).where(eq(users.email, 'test@fur.local'))
    await db.delete(plants).where(eq(plants.id, plantId))
    await db.delete(ecosystems).where(eq(ecosystems.id, ecosystemId))
    await pool.end()
  })

  it('una planta no puede habilitar dos veces la misma etapa', async () => {
    const [stage] = await db.select().from(stageMaster).where(eq(stageMaster.code, 'D06'))
    await db.insert(plantStages).values({ plantId, stageMasterId: stage.id, sequence: 1 })
    await expect(db.insert(plantStages).values({ plantId, stageMasterId: stage.id, sequence: 2 })).rejects.toThrow()
  })

  it('una planta no puede habilitar dos veces la misma red', async () => {
    const [network] = await db.select().from(networkMaster).where(eq(networkMaster.code, 'FUR-IOT'))
    await db.insert(plantNetworks).values({ plantId, networkMasterId: network.id })
    await expect(db.insert(plantNetworks).values({ plantId, networkMasterId: network.id })).rejects.toThrow()
  })

  it('el slug de planta es único', async () => {
    await expect(
      db.insert(plants).values({ ecosystemId, code: 'P-OTRA', name: 'Otra', slug: 'planta-pruebas' }),
    ).rejects.toThrow()
  })

  it('un usuario puede tener varios roles en la misma planta', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: 'test@fur.local', passwordHash: 'x', firstName: 'Test', lastName: 'User' })
      .returning()
    const [maintenance] = await db.select().from(roles).where(eq(roles.code, 'MAINTENANCE_LEAD'))
    const [warehouse] = await db.select().from(roles).where(eq(roles.code, 'WAREHOUSE'))

    await db.insert(userPlantRoles).values([
      { userId: user.id, plantId, roleId: maintenance.id },
      { userId: user.id, plantId, roleId: warehouse.id },
    ])
    const rows = await db.select().from(userPlantRoles).where(eq(userPlantRoles.userId, user.id))
    expect(rows).toHaveLength(2)
  })

  it('el seed es idempotente: re-ejecutarlo no duplica el catálogo', async () => {
    const { runSeed } = await import('../src/database/seed')
    await runSeed(TEST_DATABASE_URL)
    expect(await db.select().from(stageMaster)).toHaveLength(19)
    expect(await db.select().from(networkMaster)).toHaveLength(10)
  })
})
