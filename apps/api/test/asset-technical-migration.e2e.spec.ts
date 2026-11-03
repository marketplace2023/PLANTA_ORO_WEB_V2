import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from 'pg'
import { assertTestDatabase, TEST_DATABASE_URL } from './test-url'

it('0037 copia la ficha de activos existentes sin alterar su identidad, metadatos ni el modelo', async () => {
  assertTestDatabase(TEST_DATABASE_URL)
  const client = new Client({ connectionString: TEST_DATABASE_URL })
  await client.connect()
  await client.query('begin')
  try {
    await client.query('alter table asset.assets drop column specifications, drop column technical_data')
    const plantId = randomUUID(), modelId = randomUUID(), assetId = randomUUID()
    const typeId = (await client.query("select id from catalog.asset_types where code='MOLINO_BOLAS'")).rows[0].id
    const ecosystemId = (await client.query("select id from core.ecosystems where code='FUR'")).rows[0].id
    const specs = { 'Potencia (kW)': '30–37', rango: { min: 30, max: 37 } }
    const technicalData = { componentes: ['Impulsor', 'Rodamientos'], descripcion: 'Referencia' }
    await client.query("insert into core.plants (id,ecosystem_id,code,name,slug) values ($1,$2,'E2E-MIG-SNAPSHOT','E2E migración','e2e-mig-snapshot')", [plantId, ecosystemId])
    await client.query("insert into catalog.asset_models (id,asset_type_id,model_name,specifications,technical_data) values ($1,$2,'E2E migración snapshot',$3,$4)", [modelId, typeId, JSON.stringify(specs), JSON.stringify(technicalData)])
    await client.query("insert into asset.assets (id,plant_id,asset_model_id,fur_code,tag,name,metadata) values ($1,$2,$3,'FUR-E2E-MIG-00001','MIG-01','Unidad existente',$4)", [assetId, plantId, modelId, JSON.stringify({ map: { x: 20, y: 40 } })])
    const migration = await readFile(path.resolve(__dirname, '../drizzle/0037_asset_technical_snapshot.sql'), 'utf8')
    for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) await client.query(statement)
    const asset = (await client.query('select * from asset.assets where id=$1', [assetId])).rows[0]
    expect(asset).toMatchObject({ id: assetId, plant_id: plantId, asset_model_id: modelId, tag: 'MIG-01', fur_code: 'FUR-E2E-MIG-00001', specifications: specs, technical_data: technicalData, metadata: { map: { x: 20, y: 40 } } })
    await client.query("update catalog.asset_models set specifications='{}',technical_data='{}' where id=$1", [modelId])
    const independent = (await client.query('select specifications,technical_data from asset.assets where id=$1', [assetId])).rows[0]
    expect(independent).toEqual({ specifications: specs, technical_data: technicalData })
  } finally {
    await client.query('rollback')
    await client.end()
  }
})
