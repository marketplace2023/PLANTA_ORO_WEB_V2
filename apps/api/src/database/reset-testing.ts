import { Client } from 'pg'

/**
 * Deja la base de DESARROLLO en un estado mínimo para pruebas: un solo usuario, una sola planta (REVEMIN II) con las
 * 19 etapas y las 10 redes habilitadas, y un solo activo. Conserva los datos maestros (roles, permisos, etapas y redes
 * maestras, ecosistema y catálogo de activos) y borra todo lo demás: usuarios, plantas, proveedores, contratistas,
 * cursos, inventario, mantenimiento, compras, presupuestos, documentos y auditoría.
 *
 *   npm run db:reset-testing -- --dry-run   # muestra el resultado y no guarda nada
 *   npm run db:reset-testing -- --yes       # lo aplica
 *
 * No se puede deshacer: haz una copia antes (`create database fur_dev_respaldo template fur_dev` sin conexiones abiertas).
 */
const KEEP_USER = 'admin@fur.local'
const KEEP_PLANT = 'REV-II'
const KEEP_ASSET_TAG = 'SAG-601'

/** Tablas que se conservan enteras (datos maestros). */
const KEEP_WHOLE = new Set([
  'iam.roles',
  'iam.permissions',
  'iam.role_permissions',
  'process.stage_master',
  'plant.network_master',
  'core.ecosystems',
  'catalog.asset_families',
  'catalog.asset_types',
  'catalog.asset_models',
  'catalog.manufacturers',
  'catalog.asset_type_stages',
  'catalog.asset_type_networks',
])
/** Tablas que se filtran a mano (se conserva solo lo de la planta, el usuario o el activo elegidos). */
const HANDLED = new Set([
  'iam.users',
  'core.plants',
  'core.plant_settings',
  'core.code_sequences',
  'process.plant_stages',
  'plant.plant_networks',
  'asset.assets',
  'asset.asset_networks',
  'asset.asset_status_history',
])

export async function resetForTesting(url: string, { dryRun }: { dryRun: boolean }) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 30_000 })
  await client.connect()
  const q = async <T extends object = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as T[]
  try {
    await client.query('begin')

    const tables = (
      await q<{ t: string }>(
        `select table_schema || '.' || table_name as t from information_schema.tables
         where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema', 'drizzle', 'odoo') order by 1`,
      )
    ).map((r) => r.t)
    const wipe = tables.filter((t) => !KEEP_WHOLE.has(t) && !HANDLED.has(t))

    const [user] = await q<{ id: string }>(`select id from iam.users where email = $1`, [KEEP_USER])
    const [plant] = await q<{ id: string }>(`select id from core.plants where code = $1`, [KEEP_PLANT])
    if (!user) throw new Error(`No existe el usuario ${KEEP_USER}`)
    if (!plant) throw new Error(`No existe la planta ${KEEP_PLANT}`)
    const [asset] = await q<{ id: string }>(`select id from asset.assets where plant_id = $1 and tag = $2`, [plant.id, KEEP_ASSET_TAG])
    if (!asset) throw new Error(`No existe el activo ${KEEP_ASSET_TAG} en ${KEEP_PLANT}`)

    // 1) Todo lo que depende de usuarios, plantas y activos (negocio, accesos, auditoría).
    await client.query(`truncate ${wipe.join(', ')} restart identity cascade`)

    // 2) Un solo activo (sin padre ni hijos), una sola planta y un solo usuario.
    await client.query(`update asset.assets set parent_asset_id = null where id = $1`, [asset.id])
    await client.query(`delete from asset.assets where id <> $1`, [asset.id])
    await client.query(`update asset.asset_status_history set changed_by = null where changed_by is not null`)
    await client.query(`delete from core.plants where id <> $1`, [plant.id])
    await client.query(`delete from core.code_sequences`) // los consecutivos de OT, requisiciones, etc. empiezan de cero
    await client.query(`delete from iam.users where id <> $1`, [user.id])
    await client.query(`update iam.users set status = 'ACTIVE', is_global_admin = true where id = $1`, [user.id])

    // 3) Todas las etapas y todas las redes habilitadas (y públicas) en la planta.
    await client.query(
      `insert into process.plant_stages (id, plant_id, stage_master_id, sequence, is_enabled, is_public)
       select gen_random_uuid(), $1, sm.id, sm.sequence_default, true, true from process.stage_master sm
       where not exists (select 1 from process.plant_stages ps where ps.plant_id = $1 and ps.stage_master_id = sm.id)`,
      [plant.id],
    )
    await client.query(`update process.plant_stages set is_enabled = true, is_public = true where plant_id = $1`, [plant.id])
    await client.query(
      `insert into plant.plant_networks (id, plant_id, network_master_id, is_enabled, is_public)
       select gen_random_uuid(), $1, nm.id, true, true from plant.network_master nm
       where not exists (select 1 from plant.plant_networks pn where pn.plant_id = $1 and pn.network_master_id = nm.id)`,
      [plant.id],
    )
    await client.query(`update plant.plant_networks set is_enabled = true, is_public = true where plant_id = $1`, [plant.id])

    const count = async (sql: string) => (await q<{ n: number }>(sql))[0].n
    const summary = {
      usuarios: await count(`select count(*)::int n from iam.users`),
      plantas: await count(`select count(*)::int n from core.plants`),
      etapas_habilitadas: await count(`select count(*)::int n from process.plant_stages where is_enabled`),
      etapas_maestras: await count(`select count(*)::int n from process.stage_master`),
      redes_habilitadas: await count(`select count(*)::int n from plant.plant_networks where is_enabled`),
      redes_maestras: await count(`select count(*)::int n from plant.network_master`),
      activos: await count(`select count(*)::int n from asset.assets`),
      modelos_catalogo: await count(`select count(*)::int n from catalog.asset_models`),
    }
    if (summary.usuarios !== 1 || summary.plantas !== 1 || summary.activos !== 1 || summary.etapas_habilitadas !== summary.etapas_maestras || summary.redes_habilitadas !== summary.redes_maestras) {
      throw new Error(`El resultado no es el esperado: ${JSON.stringify(summary)}`)
    }

    await client.query(dryRun ? 'rollback' : 'commit')
    return { summary, wiped: wipe.length, dryRun }
  } catch (err) {
    await client.query('rollback').catch(() => undefined)
    throw err
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  try {
    process.loadEnvFile('.env')
  } catch {
    /* sin .env: se usan las variables del entorno */
  }
  const url = process.env.DATABASE_URL
  const dryRun = process.argv.includes('--dry-run')
  if (!url) {
    console.error('Falta DATABASE_URL')
    process.exit(1)
  }
  // Solo la base local de desarrollo: nunca una base alojada ni la de pruebas.
  if (!/@(localhost|127\.0\.0\.1):\d+\/fur_dev$/.test(url)) {
    console.error('Por seguridad solo se ejecuta contra la base local `fur_dev`.')
    process.exit(1)
  }
  if (!dryRun && !process.argv.includes('--yes')) {
    console.error('Esto borra datos y no se puede deshacer. Usa --dry-run para ver el resultado o --yes para aplicarlo.')
    process.exit(1)
  }
  resetForTesting(url, { dryRun })
    .then((r) => {
      console.log(`${r.dryRun ? '[SIMULACIÓN, no se guardó nada] ' : ''}Limpieza lista (${r.wiped} tablas vaciadas):`)
      console.log(JSON.stringify(r.summary, null, 2))
    })
    .catch((err) => {
      console.error('No se aplicó ningún cambio:', err.message)
      process.exit(1)
    })
}
