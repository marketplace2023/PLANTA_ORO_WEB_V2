import path from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { runOdooViews } from './odoo-views'

export async function runMigrations(url: string) {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 30_000 })
  // Las vistas del esquema `odoo` (solo presentación) impiden cambiar el tipo de una columna o borrarla. Si existen, se
  // quitan antes de migrar y se vuelven a crear al terminar, con las columnas nuevas.
  let hadOdooViews = false
  try {
    hadOdooViews = ((await pool.query(`select 1 from information_schema.schemata where schema_name = 'odoo'`)).rowCount ?? 0) > 0
    if (hadOdooViews) await pool.query('drop schema odoo cascade')
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, '../../drizzle') })
  } finally {
    await pool.end()
    if (hadOdooViews) await runOdooViews(url).catch((err) => console.error('No se pudo recrear el esquema odoo (ejecuta `npm run db:odoo`):', err.message))
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
