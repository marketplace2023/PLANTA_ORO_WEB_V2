import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from 'pg'
import { assertTestDatabase, TEST_DATABASE_URL } from './test-url'

it('0033 conserva las redes de todos los modelos y elimina la asignación al tipo', async () => {
  assertTestDatabase(TEST_DATABASE_URL)
  const client = new Client({ connectionString: TEST_DATABASE_URL })
  await client.connect()
  await client.query('begin')
  try {
    // Simula el esquema anterior dentro de una transacción que siempre se revierte.
    await client.query('drop schema if exists odoo cascade')
    await client.query('drop table catalog.asset_model_networks')
    await client.query('create table catalog.asset_type_networks (asset_type_id uuid, network_master_id uuid, primary key(asset_type_id, network_master_id))')
    const family = (await client.query('select id from catalog.asset_families limit 1')).rows[0].id
    const [typeA, typeB, modelA, modelB, modelC] = Array.from({ length: 5 }, () => randomUUID())
    await client.query("insert into catalog.asset_types (id, family_id, code, name) values ($1, $3, 'E2E_MIG_NET_A', 'E2E migration A'), ($2, $3, 'E2E_MIG_NET_B', 'E2E migration B')", [typeA, typeB, family])
    await client.query("insert into catalog.asset_models (id, asset_type_id, model_name) values ($1, $4, 'E2E migration A'), ($2, $4, 'E2E migration B'), ($3, $5, 'E2E migration C')", [modelA, modelB, modelC, typeA, typeB])
    await client.query("insert into catalog.asset_type_networks select $1, id from plant.network_master where code in ('FUR-PROC', 'FUR-PTE')", [typeA])
    const migration = await readFile(path.resolve(__dirname, '../drizzle/0033_model_networks.sql'), 'utf8')
    for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) await client.query(statement)
    const rows = (await client.query('select asset_model_id, count(*)::int as n from catalog.asset_model_networks where asset_model_id = any($1::uuid[]) group by asset_model_id order by asset_model_id', [[modelA, modelB, modelC]])).rows
    expect(rows).toEqual([modelA, modelB].sort().map(id => ({ asset_model_id: id, n: 2 })))
    expect((await client.query("select to_regclass('catalog.asset_type_networks') as old")).rows[0].old).toBeNull()
    await client.query('delete from catalog.asset_models where id = $1', [modelA])
    expect((await client.query('select count(*)::int as n from catalog.asset_model_networks where asset_model_id = $1', [modelA])).rows[0].n).toBe(0)
    expect((await client.query('select count(*)::int as n from catalog.asset_model_networks where asset_model_id = $1', [modelB])).rows[0].n).toBe(2)
  } finally {
    await client.query('rollback')
    await client.end()
  }
})
