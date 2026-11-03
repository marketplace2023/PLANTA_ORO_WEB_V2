import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from 'pg'
import { assertTestDatabase, TEST_DATABASE_URL } from './test-url'

it('0038 asigna códigos únicos a familias existentes sin cambiar TAG, FUR o identidad de los activos', async () => {
  assertTestDatabase(TEST_DATABASE_URL)
  const client = new Client({ connectionString: TEST_DATABASE_URL })
  await client.connect()
  await client.query('begin')
  try {
    await client.query('drop table asset.tag_sequences')
    await client.query('drop trigger asset_families_assign_tag_code on catalog.asset_families')
    await client.query('drop function catalog.assign_family_tag_code()')
    await client.query('alter table catalog.asset_families drop column tag_code cascade')
    const ecosystemId = (await client.query("select id from core.ecosystems where code='FUR'")).rows[0].id
    const typeId = (await client.query("select id from catalog.asset_types where code='MOLINO_BOLAS'")).rows[0].id
    const plantId = randomUUID(), modelId = randomUUID(), assetId = randomUUID()
    await client.query("insert into core.plants (id,ecosystem_id,code,name,slug) values ($1,$2,'E2E-MIG-TAG','E2E migración TAG','e2e-mig-tag')", [plantId, ecosystemId])
    await client.query("insert into catalog.asset_models (id,asset_type_id,model_name) values ($1,$2,'E2E migración TAG')", [modelId, typeId])
    await client.query("insert into asset.assets (id,plant_id,asset_model_id,fur_code,tag,name) values ($1,$2,$3,'FUR-LEGADO-001','MOTOR-ANTIGUO','Unidad anterior')", [assetId, plantId, modelId])
    const before = (await client.query('select * from asset.assets where id=$1', [assetId])).rows[0]
    const familyIds = (await client.query('select id,code from catalog.asset_families order by code')).rows
    const migration = await readFile(path.resolve(__dirname, '../drizzle/0038_asset_generated_tags.sql'), 'utf8')
    for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) await client.query(statement)
    expect((await client.query('select * from asset.assets where id=$1', [assetId])).rows[0]).toEqual(before)
    expect((await client.query('select id,code from catalog.asset_families order by code')).rows).toEqual(familyIds)
    const families = (await client.query('select tag_code from catalog.asset_families')).rows
    expect(new Set(families.map(family => family.tag_code)).size).toBe(families.length)
    expect((await client.query("select tag_code from catalog.asset_families where code='N4_18'")).rows[0].tag_code).toBe('MOT')
  } finally {
    await client.query('rollback')
    await client.end()
  }
})
