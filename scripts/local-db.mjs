// Postgres 17 local embebido: sin Docker, sin cuentas, sin costo.
// Uso: npm run db:local   (déjalo corriendo en una terminal; Ctrl+C lo detiene limpio)
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const databaseDir = path.join(root, '.local', 'pgdata')
const PORT = 54320
const DATABASES = ['fur_dev', 'fur_test']

// Si ya hay un Postgres local escuchando (otra terminal, una prueba), se reutiliza: arrancar un segundo sobre el mismo
// directorio falla con "postmaster.pid already exists" y, bajo `npm run dev`, tumbaría también la API y la web.
const alreadyRunning = await new Promise((resolve) => {
  const socket = net.connect({ port: PORT, host: '127.0.0.1' })
  socket.once('connect', () => (socket.destroy(), resolve(true)))
  socket.once('error', () => resolve(false))
})
if (alreadyRunning) {
  console.log(`Ya hay un Postgres local en el puerto ${PORT}: se reutiliza (no se inicia otro).`)
  process.exit(0)
}

const pgServer = new EmbeddedPostgres({
  databaseDir,
  user: 'fur',
  password: 'fur',
  port: PORT,
  persistent: true,
  // UTF8 como en Neon: sin esto, Windows crea el clúster en WIN1252 y cualquier texto con caracteres fuera de
  // Latin-1 (el signo "−", emojis, otros alfabetos) falla con un 500 solo en local.
  initdbFlags: ['--encoding=UTF8'],
})

if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) {
  console.log('Inicializando clúster en', databaseDir)
  await pgServer.initialise()
}

await pgServer.start()

/**
 * Garantiza que cada base exista y sea UTF8. Un clúster viejo (creado en WIN1252) no se puede convertir en el sitio:
 *  - fur_test es desechable (las pruebas la migran y siembran solas): se recrea.
 *  - fur_dev se CONSERVA renombrada (fur_dev_old_AAAAMMDD) y se crea una nueva y vacía: corre `npm run setup:local`.
 */
const admin = new pg.Client({ connectionString: `postgresql://fur:fur@localhost:${PORT}/postgres` })
await admin.connect()
const quote = (name) => `"${name.replace(/"/g, '""')}"`
const create = async (name) => {
  // En Windows UTF8 es válido con la configuración regional del sistema; se hereda la del clúster.
  const { rows } = await admin.query("select datcollate from pg_database where datname = 'template0'")
  const locale = rows[0].datcollate.replace(/'/g, "''")
  await admin.query(`create database ${quote(name)} encoding 'UTF8' lc_collate '${locale}' lc_ctype '${locale}' template template0`)
}

for (const name of DATABASES) {
  const { rows } = await admin.query("select pg_encoding_to_char(encoding) as enc from pg_database where datname = $1", [name])
  if (rows.length === 0) {
    await create(name)
    console.log(`Base de datos creada: ${name} (UTF8)`)
    continue
  }
  if (rows[0].enc === 'UTF8') continue

  await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [name])
  if (name === 'fur_test') {
    await admin.query(`drop database ${quote(name)}`)
    await create(name)
    console.log(`Base de datos ${name} recreada en UTF8 (era ${rows[0].enc}).`)
  } else {
    const old = `${name}_old_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`
    await admin.query(`alter database ${quote(name)} rename to ${quote(old)}`)
    await create(name)
    console.log(`\n${name} estaba en ${rows[0].enc}: se conservó como ${old} y se creó una nueva en UTF8.`)
    console.log('Ejecuta `npm run setup:local` para migrar y sembrar la nueva.\n')
  }
}
await admin.end()

console.log(`\nPostgres local listo en postgresql://fur:fur@localhost:${PORT}/fur_dev`)
console.log('Ctrl+C para detener.\n')

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  console.log('\nDeteniendo Postgres...')
  await pgServer.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
setInterval(() => {}, 1 << 30)
