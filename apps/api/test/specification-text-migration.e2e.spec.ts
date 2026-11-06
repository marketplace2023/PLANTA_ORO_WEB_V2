import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { TEST_DATABASE_URL, assertTestDatabase } from './test-url'

it('convierte números a texto en catálogo, planta, predeterminados y solicitudes sin alterar otros datos', async () => {
  assertTestDatabase(TEST_DATABASE_URL)
  const db = new Client({ connectionString: TEST_DATABASE_URL }); await db.connect()
  try {
    await db.query('begin')
    const family = (await db.query("insert into catalog.asset_families (id,code,tag_code,name) values (gen_random_uuid(),'E2E_TEXT','TXS','E2E Texto') returning id")).rows[0].id
    await db.query("insert into catalog.family_specifications (id,family_id,label,unit,value_type,required,sort_order) values (gen_random_uuid(),$1,'Potencia','kW','NUMBER',true,4),(gen_random_uuid(),$1,'Cero',null,'NUMBER',false,5),(gen_random_uuid(),$1,'Rango',null,'RANGE',false,6),(gen_random_uuid(),$1,'Superior',null,'RANGE',false,7),(gen_random_uuid(),$1,'Inferior',null,'RANGE',false,8)", [family])
    const raw = { 'Potencia (kW)': 12.5, Cero: 0, Rango: { min: 1, max: 3 }, Superior: { max: 0 }, Inferior: { min: -10 }, Desconocido: 9, Nulo: null, Texto: '≈ 16' }
    const expected = { ...raw, 'Potencia (kW)': '12.5', Cero: '0' }
    const type = (await db.query("insert into catalog.asset_types (id,family_id,code,name,default_specs) values (gen_random_uuid(),$1,'E2E_TEXT_TYPE','E2E Texto',$2) returning id", [family, JSON.stringify(raw)])).rows[0].id
    const model = (await db.query("insert into catalog.asset_models (id,asset_type_id,model_name,specifications) values (gen_random_uuid(),$1,'E2E Texto',$2) returning id", [type, JSON.stringify(raw)])).rows[0].id
    const ecosystem = (await db.query("select id from core.ecosystems where code='FUR'")).rows[0].id
    const plant = (await db.query("insert into core.plants (id,ecosystem_id,code,name,slug) values (gen_random_uuid(),$1,'E2E-TEXT','E2E Texto','e2e-text') returning id", [ecosystem])).rows[0].id
    const asset = (await db.query("insert into asset.assets (id,plant_id,family_id,asset_model_id,fur_code,tag,name,specifications) values (gen_random_uuid(),$1,$2,$3,'E2E-FUR-TEXT','E2E-TAG-TEXT','E2E Texto',$4) returning id", [plant, family, model, JSON.stringify(raw)])).rows[0].id
    const user = (await db.query("insert into iam.users (id,email,password_hash,first_name,last_name) values (gen_random_uuid(),'text@e2e.fur.local','hash','E2E','Texto') returning id")).rows[0].id
    const draft = { familyId: family, name: 'Equipo solicitado', specifications: raw, components: ['Motor'], stageCode: 'D01', networkCodes: ['FUR-PROC'] }
    const pending = (await db.query("insert into asset.catalog_requests(id,plant_id,submitted_by,draft) values(gen_random_uuid(),$1,$2,$3) returning id", [plant, user, JSON.stringify(draft)])).rows[0].id
    const before = (await db.query('select id,label,unit,required,sort_order from catalog.family_specifications where family_id=$1 order by sort_order', [family])).rows
    const migrate = readFileSync(path.resolve(__dirname, '../drizzle/0046_specification_numbers_as_text.sql'), 'utf8')
    await db.query(migrate)
    await db.query(migrate)
    expect((await db.query('select specifications from catalog.asset_models where id=$1', [model])).rows[0].specifications).toEqual(expected)
    expect((await db.query('select specifications,tag,fur_code from asset.assets where id=$1', [asset])).rows[0]).toEqual({ specifications: expected, tag: 'E2E-TAG-TEXT', fur_code: 'E2E-FUR-TEXT' })
    expect((await db.query('select default_specs from catalog.asset_types where id=$1', [type])).rows[0].default_specs).toEqual(expected)
    expect((await db.query('select draft from asset.catalog_requests where id=$1', [pending])).rows[0].draft).toEqual({ ...draft, specifications: expected })
    expect((await db.query('select id,label,unit,required,sort_order from catalog.family_specifications where family_id=$1 order by sort_order', [family])).rows).toEqual(before)
    expect((await db.query('select value_type from catalog.family_specifications where family_id=$1 order by sort_order', [family])).rows.map(r => r.value_type)).toEqual(['TEXT', 'TEXT', 'RANGE', 'RANGE', 'RANGE'])
    const rangeMigration = readFileSync(path.resolve(__dirname, '../drizzle/0047_specification_ranges_as_text.sql'), 'utf8')
    await db.query(rangeMigration)
    await db.query(rangeMigration)
    const final = { ...expected, Rango: '1–3', Superior: '≤ 0', Inferior: '≥ -10' }
    expect((await db.query('select specifications from catalog.asset_models where id=$1', [model])).rows[0].specifications).toEqual(final)
    expect((await db.query('select specifications from asset.assets where id=$1', [asset])).rows[0].specifications).toEqual(final)
    expect((await db.query('select default_specs from catalog.asset_types where id=$1', [type])).rows[0].default_specs).toEqual(final)
    expect((await db.query('select draft from asset.catalog_requests where id=$1', [pending])).rows[0].draft).toEqual({ ...draft, specifications: final })
    expect((await db.query('select value_type from catalog.family_specifications where family_id=$1', [family])).rows.every(r => r.value_type === 'TEXT')).toBe(true)
  } finally { await db.query('rollback'); await db.end() }
})
