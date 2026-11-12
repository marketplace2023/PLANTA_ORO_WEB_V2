import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { runMigrations } from '../src/database/migrate'
import { assertTestDatabase, TEST_DATABASE_URL } from './test-url'

describe('Integración de historias de migración de main y activos', () => {
  it.each(['assets', 'main'])('actualiza desde %s sin omitir migraciones ni repetir las aplicadas', async history => {
    assertTestDatabase(TEST_DATABASE_URL)
    const adminUrl = new URL(TEST_DATABASE_URL); adminUrl.pathname = '/postgres'
    const name = `fur_merge_${randomUUID().replaceAll('-', '')}_test`
    const target = new URL(TEST_DATABASE_URL); target.pathname = `/${name}`
    const admin = new Client({ connectionString: adminUrl.href }); await admin.connect()
    const folder = mkdtempSync(path.join(tmpdir(), 'fur-migration-history-'))
    let created = false
    try {
      await admin.query(`create database "${name}"`); created = true
      const journal = JSON.parse(readFileSync(path.resolve(__dirname, `fixtures/migration-history-${history}.json`), 'utf8'))
      mkdirSync(path.join(folder, 'meta'))
      writeFileSync(path.join(folder, 'meta/_journal.json'), JSON.stringify(journal))
      for (const entry of journal.entries) writeFileSync(path.join(folder, entry.tag + '.sql'), readFileSync(path.resolve(__dirname, '../drizzle', entry.tag + '.sql')))
      const db = new Client({ connectionString: target.href }); await db.connect()
      try {
        await migrate(drizzle(db), { migrationsFolder: folder })
        await db.query("insert into iam.users(id,email,password_hash,first_name,last_name) values(gen_random_uuid(),'merge-preserve@fur.local','test','Prueba','Historial')")
        const before = (await db.query('select * from drizzle.__drizzle_migrations order by id')).rows
        await runMigrations(target.href)
        const complete = (await db.query('select * from drizzle.__drizzle_migrations order by id')).rows
        expect(complete).toHaveLength(68)
        expect(new Set(complete.map(r => r.created_at)).size).toBe(68)
        expect(complete.slice(0, before.length)).toEqual(before)
        expect((await db.query("select count(*)::int n from iam.users where email='merge-preserve@fur.local'")).rows[0].n).toBe(1)
        expect((await db.query("select to_regclass('asset.catalog_requests') as requests,to_regclass('catalog.family_specifications') as specifications,to_regclass('lms.instructor_profiles') as instructors")).rows[0]).toEqual({ requests: 'asset.catalog_requests', specifications: 'catalog.family_specifications', instructors: 'lms.instructor_profiles' })
        await runMigrations(target.href)
        expect((await db.query('select * from drizzle.__drizzle_migrations order by id')).rows).toEqual(complete)
      } finally { await db.end() }
    } finally {
      if (created) await admin.query(`drop database "${name}" with (force)`)
      await admin.end()
      if (!folder.startsWith(path.join(tmpdir(), 'fur-migration-history-'))) throw new Error('Ruta temporal inválida')
      rmSync(folder, { recursive: true, force: true })
    }
  }, 120_000)
})
