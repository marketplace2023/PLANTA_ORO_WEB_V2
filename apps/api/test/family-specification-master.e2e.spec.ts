import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { SEEDED_FAMILY_SPECIFICATIONS } from '../src/database/seed-family-specifications'
import { assertTestDatabase, TEST_DATABASE_URL } from './test-url'

describe('Actualización del maestro de especificaciones v3', () => {
  it('reemplaza definiciones obsoletas, conserva IDs y datos propios, y admite una segunda aplicación', async () => {
    assertTestDatabase(TEST_DATABASE_URL)
    const client = new Client({ connectionString: TEST_DATABASE_URL })
    await client.connect()
    try {
      await client.query('begin')
      const familyId = (await client.query("select id from catalog.asset_families where code = 'N4_30'")).rows[0].id
      const protection = (await client.query("select id from catalog.family_specifications where family_id = $1 and label = 'Grado de protección'", [familyId])).rows[0]
      await client.query("update catalog.family_specifications set value_type = 'NUMBER', required = false where id = $1", [protection.id])
      await client.query("insert into catalog.family_specifications (id,family_id,label,value_type) values (gen_random_uuid(),$1,'E2E Parámetro retirado','TEXT')", [familyId])
      // Simular una definición nueva aún ausente y una familia manual ajena al maestro.
      const absent = SEEDED_FAMILY_SPECIFICATIONS.find(([, code]) => code === 'N4_66')!
      await client.query('delete from catalog.family_specifications where id = $1', [absent[0]])
      const otherId = (await client.query("insert into catalog.asset_families (id,code,tag_code,name) values (gen_random_uuid(),'E2E_MASTER_OTHER','TMS','E2E Familia manual') returning id")).rows[0].id
      await client.query("insert into catalog.family_specifications (id,family_id,label,value_type) values (gen_random_uuid(),$1,'Parámetro manual','TEXT')", [otherId])
      const typeId = (await client.query("insert into catalog.asset_types (id,family_id,code,name) values (gen_random_uuid(),$1,'E2E_MASTER_CAM','E2E Tipo maestro') returning id", [familyId])).rows[0].id
      const raw = { 'E2E Parámetro retirado': 'valor histórico', 'Grado de protección (IP (código))': 68 }
      const modelId = (await client.query("insert into catalog.asset_models (id,asset_type_id,model_name,specifications) values (gen_random_uuid(),$1,'E2E Modelo histórico',$2) returning id", [typeId, JSON.stringify(raw)])).rows[0].id
      const ecosystemId = (await client.query("select id from core.ecosystems where code = 'FUR'")).rows[0].id
      const plantId = (await client.query("insert into core.plants (id,ecosystem_id,code,name,slug) values (gen_random_uuid(),$1,'E2E-MASTER','E2E Planta maestro','e2e-master') returning id", [ecosystemId])).rows[0].id
      const assetId = (await client.query("insert into asset.assets (id,plant_id,family_id,asset_model_id,fur_code,tag,name,specifications) values (gen_random_uuid(),$1,$2,$3,'E2E-FUR-MASTER','E2E-TAG-MASTER','E2E Activo histórico',$4) returning id", [plantId, familyId, modelId, JSON.stringify(raw)])).rows[0].id
      const snapshot = async () => Promise.all([
        client.query('select * from catalog.asset_models where id = $1', [modelId]),
        client.query('select * from asset.assets where id = $1', [assetId]),
      ]).then(results => results.map(result => result.rows))
      const before = await snapshot()
      const migration = readFileSync(path.resolve(__dirname, '../drizzle/0044_registration_family_specifications.sql'), 'utf8')
      await client.query(migration)
      await client.query(migration)
      expect(await snapshot()).toEqual(before)
      await client.query(readFileSync(path.resolve(__dirname, '../drizzle/0046_specification_numbers_as_text.sql'), 'utf8'))
      await client.query(readFileSync(path.resolve(__dirname, '../drizzle/0047_specification_ranges_as_text.sql'), 'utf8'))
      const definitions = (await client.query(`select s.id,f.code,s.label,s.unit,s.value_type,s.required,s.sort_order
        from catalog.family_specifications s join catalog.asset_families f on f.id=s.family_id
        where f.code <> 'E2E_MASTER_OTHER' and f.code = any($1::text[])`, [[...new Set(SEEDED_FAMILY_SPECIFICATIONS.map(([, code]) => code))]])).rows
      const actual = new Map(definitions.map(d => [`${d.code}:${d.label}`, d]))
      expect(actual.size).toBe(810)
      for (const [, code, label, unit, valueType, required, sortOrder] of SEEDED_FAMILY_SPECIFICATIONS) {
        expect(actual.get(`${code}:${label}`)).toMatchObject({ unit, value_type: valueType, required, sort_order: sortOrder })
      }
      expect(actual.get('N4_30:Grado de protección')?.id).toBe(protection.id)
      expect(actual.get('N4_66:' + absent[2])?.id).toBe(absent[0])
      expect((await client.query('select label from catalog.family_specifications where family_id = $1', [otherId])).rows).toEqual([{ label: 'Parámetro manual' }])
    } finally {
      await client.query('rollback')
      await client.end()
    }
  })
})
