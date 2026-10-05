import path from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

export async function runMigrations(url: string) {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 30_000 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, '../../drizzle') })
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  try {
    process.loadEnvFile('.env')
  } catch {
    /* sin .env: se usan las variables del entorno (Render) */
  }

  // Neon: las migraciones deben usar la conexión directa (sin pooler) cuando exista.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('Falta DATABASE_URL')
    process.exit(1)
  }

  runMigrations(url)
    .then(() => console.log('Migraciones aplicadas'))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
