import { Client } from 'pg'
import { runMigrations } from '../src/database/migrate'
import { runSeed } from '../src/database/seed'
import { assertTestDatabase, TEST_DATABASE_URL } from './test-url'

export default async function globalSetup() {
  assertTestDatabase(TEST_DATABASE_URL)

  // Falla con un mensaje útil si el Postgres local no está levantado.
  const probe = new Client({ connectionString: TEST_DATABASE_URL, connectionTimeoutMillis: 3_000 })
  try {
    await probe.connect()
  } catch {
    throw new Error('No hay Postgres local en el puerto 54320. Ejecuta `npm run db:local` en otra terminal.')
  } finally {
    await probe.end().catch(() => undefined)
  }

  await runMigrations(TEST_DATABASE_URL)
  await runSeed(TEST_DATABASE_URL)
}
