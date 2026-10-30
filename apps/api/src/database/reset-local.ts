import { Client } from 'pg'
import { runMigrations } from './migrate'
import { runSeedDev, DEV_PASSWORD } from './seed-dev'
import { DEFAULT_STAGE_COUNT } from './seed'

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`

/** Construye una base nueva y conserva la anterior completa como respaldo, sin borrar el clúster ni fur_test. */
export async function resetLocalDatabase(connection: string) {
  const url = new URL(connection)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '54320' || url.pathname !== '/fur_dev') {
    throw new Error('El reinicio solo admite fur_dev en PostgreSQL local, puerto 54320.')
  }
  if (process.env.NODE_ENV === 'production') throw new Error('El reinicio local no se ejecuta en producción.')
  const stamp = new Date().toISOString().replace(/\D/g, '')
  const fresh = `fur_dev_new_${stamp}`, backup = `fur_dev_backup_${stamp}`
  const adminUrl = new URL(connection)
  adminUrl.pathname = '/postgres'
  const admin = new Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  let oldRenamed = false, swapped = false
  try {
    await admin.query(`create database ${quote(fresh)} encoding 'UTF8' template template0`)
    const freshUrl = new URL(connection)
    freshUrl.pathname = `/${fresh}`
    await runMigrations(freshUrl.toString())
    await runSeedDev(freshUrl.toString(), process.env.DEV_SEED_PASSWORD || DEV_PASSWORD)
    // Repetir ambos seeders debe seguir dejando vacíos el catálogo y los datos operativos.
    await runSeedDev(freshUrl.toString(), process.env.DEV_SEED_PASSWORD || DEV_PASSWORD)
    const check = new Client({ connectionString: freshUrl.toString() })
    await check.connect()
    let summary: Record<string, number>
    try {
      summary = (await check.query<Record<string, number>>(`select
        (select count(*)::int from catalog.asset_models) as modelos,
        (select count(*)::int from catalog.asset_types) as tipos,
        (select count(*)::int from catalog.asset_families) as familias,
        (select count(*)::int from catalog.manufacturers) as fabricantes,
        (select count(*)::int from catalog.variable_definitions) as variables,
        (select count(*)::int from asset.assets) as activos,
        (select count(*)::int from maintenance.work_orders) as ordenes,
        (select count(*)::int from inventory.items) as inventario,
        (select count(*)::int from marketplace.listings) as publicaciones,
        (select count(*)::int from iam.users) as usuarios,
        (select count(*)::int from core.plants) as plantas,
        (select count(*)::int from process.stage_master) as etapas,
        (select count(*)::int from plant.network_master) as redes,
        (select count(*)::int from iam.users where email = 'admin@fur.local' and is_global_admin and status = 'ACTIVE') as administradores`)).rows[0]
      const empty = ['modelos', 'tipos', 'familias', 'fabricantes', 'variables', 'activos', 'ordenes', 'inventario', 'publicaciones']
      if (empty.some(k => summary[k] !== 0) || summary.administradores !== 1 || summary.etapas !== DEFAULT_STAGE_COUNT || summary.redes !== 10) {
        throw new Error(`La base nueva no cumple la configuración vacía esperada: ${JSON.stringify(summary)}`)
      }
    } finally { await check.end() }
    // Se impide que una conexión nueva vuelva a entrar a la base vieja durante el cambio de nombre.
    await admin.query('alter database fur_dev allow_connections false')
    await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = 'fur_dev'")
    await admin.query(`alter database fur_dev rename to ${quote(backup)}`)
    oldRenamed = true
    await admin.query(`alter database ${quote(fresh)} rename to fur_dev`)
    swapped = true
    await admin.query(`alter database ${quote(backup)} allow_connections true`)
    return { database: 'fur_dev', backup, summary }
  } catch (error) {
    if (!swapped) {
      if (oldRenamed) await admin.query(`alter database ${quote(backup)} rename to fur_dev`)
      await admin.query('alter database fur_dev allow_connections true')
    }
    throw error
  } finally { await admin.end() }
}

if (require.main === module) {
  try { process.loadEnvFile('.env') } catch { /* configuración por variables de entorno */ }
  if (!process.argv.includes('--yes')) {
    console.error('Reinicia fur_dev local y conserva la base anterior como respaldo. Usa --yes para ejecutarlo.')
    process.exit(1)
  }
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL')
  resetLocalDatabase(url).then(r => console.log(JSON.stringify(r, null, 2))).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
