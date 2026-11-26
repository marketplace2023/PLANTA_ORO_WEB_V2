import path from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Pool } from 'pg'
import { runOdooViews } from './odoo-views'

export async function runMigrations(url: string) {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 30_000 })
  // Las vistas del esquema `odoo` (solo presentación) impiden cambiar el tipo de una columna o borrarla. Si existen, se
  // quitan antes de migrar y se vuelven a crear al terminar, con las columnas nuevas.
  let hadOdooViews = false
  try {
    const migrations = readMigrationFiles({ migrationsFolder: path.resolve(__dirname, '../../drizzle') })
    const client = await pool.connect()
    try {
      await client.query('begin')
      // Las dos ramas tienen historias intercaladas. El último timestamp por sí solo omite migraciones pendientes.
      // El bloqueo serializa también dos arranques simultáneos de la API sobre la misma base.
      await client.query("select pg_advisory_xact_lock(hashtext('fur:migrations'))")
      hadOdooViews = ((await client.query(`select 1 from information_schema.schemata where schema_name = 'odoo'`)).rowCount ?? 0) > 0
      if (hadOdooViews) await client.query('drop schema odoo cascade')
      await client.query('create schema if not exists drizzle')
      await client.query('create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)')
      const applied = (await client.query<{ hash: string; created_at: string }>('select hash, created_at from drizzle.__drizzle_migrations')).rows
      const hashes = new Set(applied.map(row => row.hash))
      // Se conservan los timestamps originales como identidad, también entre checkouts LF y CRLF.
      const timestamps = new Set(applied.map(row => Number(row.created_at)))
      for (const migration of migrations) {
        if (hashes.has(migration.hash) || timestamps.has(migration.folderMillis)) continue
        for (const statement of migration.sql) if (statement.trim()) await client.query(statement)
        await client.query('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [migration.hash, migration.folderMillis])
        hashes.add(migration.hash); timestamps.add(migration.folderMillis)
      }
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally { client.release() }
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
