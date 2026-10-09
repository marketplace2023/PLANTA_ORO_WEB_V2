import { and, eq, inArray, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { nextCode } from '../common/sequences'
import { buildFurCode } from '../modules/assets/fur-code'
import * as s from './schema'

type Db = NodePgDatabase<typeof s>

const DAY = 86_400_000
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `D${String(from + i).padStart(2, '0')}`)

/**
 * Plantas de demostración INDEPENDIENTES entre sí: cada una tiene su propia configuración (etapas y redes habilitadas),
 * activos, inventario, mantenimiento y un administrador que solo ve la suya. Los códigos y SKU se repiten a propósito
 * entre plantas (MB-01, ROD-6310…) porque son únicos POR PLANTA. Son datos ILUSTRATIVOS: se corrigen desde la app.
 */
export type PlantProfile = {
  stages: string[]
  networks: string[]
  assets: Array<{ tag: string; name: string; model: string; stage: string | null; networks: string[]; status: string; criticality: string; location: string }>
  warehouse: { code: string; name: string }
  location: { code: string; name: string }
  items: Array<{ sku: string; name: string; itemType: 'SPARE' | 'CONSUMABLE' | 'TOOL'; uom: string; minStock: number; maxStock: number | null; isCritical: boolean; unitCost: number | null; onHand: number }>
  plans: Array<{ name: string; assetTag: string; planType: 'PREVENTIVE' | 'PREDICTIVE' | 'CONDITION'; priority: string; every: number; unit: 'DAYS' | 'WEEKS' | 'MONTHS'; dueInDays: number }>
  orders: Array<{ title: string; description: string; assetTag: string; type: 'CORRECTIVE' | 'PREVENTIVE' | 'PREDICTIVE' | 'INSPECTION'; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'; status: 'REQUESTED' | 'PLANNED'; dueInDays: number }>
}

export const PLANT_PROFILES: Record<string, PlantProfile> = {
  'planta-caratal': {
    stages: range(2, 17),
    networks: ['FUR-PROC', 'FUR-PTE', 'FUR-IOT', 'FUR-MNT', 'FUR-RQ'],
    assets: [
      { tag: 'CH-01', name: 'Chancadora primaria de mandíbulas', model: 'Mandíbulas 42x30 in', stage: 'D02', networks: ['FUR-PROC', 'FUR-MNT'], status: 'OPERATIVE', criticality: 'HIGH', location: 'Chancado' },
      { tag: 'MB-01', name: 'Molino de bolas', model: 'Bolas 20x32 ft', stage: 'D06', networks: ['FUR-PROC', 'FUR-IOT', 'FUR-MNT'], status: 'OPERATIVE', criticality: 'CRITICAL', location: 'Nave de molienda' },
      { tag: 'BP-01', name: 'Bomba de pulpa de clasificación', model: 'Bomba de pulpa 10x8', stage: 'D07', networks: ['FUR-PROC', 'FUR-MNT'], status: 'REPAIR', criticality: 'HIGH', location: 'Nave de molienda' },
      { tag: 'HF-01', name: 'Horno de fundición', model: 'Horno basculante 250 kg', stage: 'D16', networks: ['FUR-PROC', 'FUR-PTE'], status: 'OPERATIVE', criticality: 'HIGH', location: 'Sala de fundición' },
      { tag: 'CCM-01', name: 'Centro de control de motores', model: 'CCM 4160 V 12 celdas', stage: null, networks: ['FUR-PTE'], status: 'OPERATIVE', criticality: 'HIGH', location: 'Sala eléctrica' },
    ],
    warehouse: { code: 'ALM-01', name: 'Almacén Planta Caratal' },
    location: { code: 'R-01', name: 'Rack 1 · Repuestos' },
    items: [
      { sku: 'ROD-6310', name: 'Rodamiento rígido 6310-2RS', itemType: 'SPARE', uom: 'UND', minStock: 4, maxStock: 16, isCritical: false, unitCost: 42.9, onHand: 10 },
      { sku: 'ACE-ISO320', name: 'Aceite lubricante ISO VG 320', itemType: 'CONSUMABLE', uom: 'L', minStock: 200, maxStock: 600, isCritical: false, unitCost: 4.8, onHand: 300 },
      { sku: 'SELLO-60', name: 'Sello mecánico 60 mm para bomba de pulpa', itemType: 'SPARE', uom: 'UND', minStock: 3, maxStock: 8, isCritical: true, unitCost: 640, onHand: 1 }, // crítico bajo mínimo
    ],
    plans: [{ name: 'Lubricación mensual del molino de bolas', assetTag: 'MB-01', planType: 'PREVENTIVE', priority: 'MEDIUM', every: 1, unit: 'MONTHS', dueInDays: 10 }],
    orders: [
      { title: 'Cambio de sellos de la bomba de pulpa', description: 'Fuga por el sello mecánico.', assetTag: 'BP-01', type: 'CORRECTIVE', priority: 'HIGH', status: 'REQUESTED', dueInDays: 4 },
      { title: 'Inspección mensual del molino de bolas', description: 'Revisión de revestimientos y ruidos.', assetTag: 'MB-01', type: 'PREVENTIVE', priority: 'MEDIUM', status: 'PLANNED', dueInDays: 6 },
    ],
  },
  'mina-colombia': {
    stages: range(1, 8),
    networks: ['FUR-PROC', 'FUR-MNT', 'FUR-RQ'],
    assets: [
      { tag: 'CH-01', name: 'Chancadora de mandíbulas', model: 'Mandíbulas 42x30 in', stage: 'D02', networks: ['FUR-PROC', 'FUR-MNT'], status: 'OPERATIVE', criticality: 'HIGH', location: 'Chancado' },
      { tag: 'ZV-01', name: 'Zaranda vibratoria', model: 'Zaranda doble piso 8x20 ft', stage: 'D01', networks: ['FUR-PROC'], status: 'OPERATIVE', criticality: 'MEDIUM', location: 'Chancado' },
      { tag: 'MB-01', name: 'Molino de bolas', model: 'Bolas 16.5x24 ft', stage: 'D06', networks: ['FUR-PROC', 'FUR-MNT'], status: 'OPERATIVE', criticality: 'CRITICAL', location: 'Molienda' },
      { tag: 'MT-01', name: 'Motor del molino de bolas', model: 'Motor 250 kW 4 polos', stage: 'D06', networks: ['FUR-MNT'], status: 'MAINTENANCE', criticality: 'HIGH', location: 'Molienda' },
    ],
    warehouse: { code: 'ALM-01', name: 'Almacén Mina Colombia' },
    location: { code: 'R-01', name: 'Rack 1 · Repuestos' },
    items: [
      { sku: 'ROD-6310', name: 'Rodamiento rígido 6310-2RS', itemType: 'SPARE', uom: 'UND', minStock: 6, maxStock: 20, isCritical: false, unitCost: 45.5, onHand: 6 },
      { sku: 'CORREA-B85', name: 'Correa en V B85', itemType: 'SPARE', uom: 'UND', minStock: 4, maxStock: 10, isCritical: false, unitCost: 21.4, onHand: 2 }, // bajo mínimo
      { sku: 'GRASA-EP2', name: 'Grasa EP-2 (cartucho 400 g)', itemType: 'CONSUMABLE', uom: 'UND', minStock: 12, maxStock: 48, isCritical: false, unitCost: null, onHand: 20 }, // sin costo cargado
    ],
    plans: [{ name: 'Inspección de mandíbulas', assetTag: 'CH-01', planType: 'PREVENTIVE', priority: 'MEDIUM', every: 2, unit: 'WEEKS', dueInDays: -2 }], // vencido
    orders: [
      { title: 'Vibración alta en el motor del molino', description: 'Vibración por encima de lo normal en el lado acople.', assetTag: 'MT-01', type: 'CORRECTIVE', priority: 'URGENT', status: 'REQUESTED', dueInDays: 2 },
      { title: 'Revisión de la zaranda vibratoria', description: 'Revisión de resortes y mallas.', assetTag: 'ZV-01', type: 'INSPECTION', priority: 'LOW', status: 'PLANNED', dueInDays: 9 },
    ],
  },
  'mina-sosa-mendez': {
    stages: range(1, 7),
    networks: ['FUR-PROC', 'FUR-MNT'],
    assets: [
      { tag: 'CH-01', name: 'Chancadora primaria de mandíbulas', model: 'Mandíbulas 42x30 in', stage: 'D02', networks: ['FUR-PROC', 'FUR-MNT'], status: 'REPAIR', criticality: 'HIGH', location: 'Chancado' },
      { tag: 'CC-01', name: 'Chancadora cónica', model: 'Cónica secundaria 4.25 ft', stage: 'D03', networks: ['FUR-PROC', 'FUR-MNT'], status: 'OPERATIVE', criticality: 'HIGH', location: 'Chancado' },
      { tag: 'MB-01', name: 'Molino de bolas', model: 'Bolas 16.5x24 ft', stage: 'D06', networks: ['FUR-PROC'], status: 'STANDBY', criticality: 'CRITICAL', location: 'Molienda' },
      { tag: 'BA-01', name: 'Bomba de agua de proceso', model: 'Bomba de agua 6x4', stage: null, networks: [], status: 'OPERATIVE', criticality: 'LOW', location: 'Casa de bombas' },
    ],
    warehouse: { code: 'ALM-01', name: 'Almacén Mina Sosa Méndez' },
    location: { code: 'R-01', name: 'Rack 1 · Repuestos' },
    items: [
      { sku: 'ROD-6310', name: 'Rodamiento rígido 6310-2RS', itemType: 'SPARE', uom: 'UND', minStock: 4, maxStock: 12, isCritical: false, unitCost: 41, onHand: 14 },
      { sku: 'ACE-ISO320', name: 'Aceite lubricante ISO VG 320', itemType: 'CONSUMABLE', uom: 'L', minStock: 200, maxStock: 500, isCritical: false, unitCost: 4.9, onHand: 120 }, // bajo mínimo
      { sku: 'PLACA-MAND', name: 'Placa de mandíbula fija', itemType: 'SPARE', uom: 'UND', minStock: 2, maxStock: 4, isCritical: true, unitCost: 950, onHand: 2 },
    ],
    plans: [{ name: 'Lubricación semanal de la cónica', assetTag: 'CC-01', planType: 'PREVENTIVE', priority: 'MEDIUM', every: 1, unit: 'WEEKS', dueInDays: 3 }],
    orders: [{ title: 'Reparación de la placa fija de la chancadora', description: 'Desgaste excesivo; evaluar cambio de placa.', assetTag: 'CH-01', type: 'CORRECTIVE', priority: 'HIGH', status: 'REQUESTED', dueInDays: 5 }],
  },
}

/**
 * Siembra la información propia de una planta: etapas y redes habilitadas, activos, almacén con ítems, planes y órdenes.
 * Idempotente (por tag, SKU, nombre y título): se puede ejecutar varias veces.
 */
export async function seedPlantProfile(db: Db, plant: { id: string; code: string; slug: string }, profile: PlantProfile, adminId: string) {
  const now = Date.now()
  const counts = { assets: 0, items: 0, plans: 0, orders: 0 }

  const stageMasters = await db.select().from(s.stageMaster).where(inArray(s.stageMaster.code, profile.stages))
  for (const st of stageMasters) {
    await db.insert(s.plantStages).values({ plantId: plant.id, stageMasterId: st.id, sequence: st.sequenceDefault, isPublic: false }).onConflictDoNothing()
  }
  const networkMasters = await db.select().from(s.networkMaster).where(inArray(s.networkMaster.code, profile.networks))
  for (const n of networkMasters) {
    await db.insert(s.plantNetworks).values({ plantId: plant.id, networkMasterId: n.id, isPublic: false }).onConflictDoNothing()
  }

  const stageByCode = new Map(
    (await db.select({ id: s.plantStages.id, code: s.stageMaster.code }).from(s.plantStages).innerJoin(s.stageMaster, eq(s.stageMaster.id, s.plantStages.stageMasterId)).where(eq(s.plantStages.plantId, plant.id))).map((r) => [r.code, r.id]),
  )
  const networkByCode = new Map(
    (await db.select({ id: s.plantNetworks.id, code: s.networkMaster.code }).from(s.plantNetworks).innerJoin(s.networkMaster, eq(s.networkMaster.id, s.plantNetworks.networkMasterId)).where(eq(s.plantNetworks.plantId, plant.id))).map((r) => [r.code, r.id]),
  )
  const modelByName = new Map((await db.select().from(s.assetModels)).map((m) => [m.modelName, m.id]))

  for (const a of profile.assets) {
    const [exists] = await db.select({ id: s.assets.id }).from(s.assets).where(and(eq(s.assets.plantId, plant.id), eq(s.assets.tag, a.tag))).limit(1)
    if (exists) continue
    const modelId = modelByName.get(a.model)
    if (!modelId) throw new Error(`Modelo de catálogo inexistente: ${a.model}`)
    await db.transaction(async (tx) => {
      const [{ seq }] = await tx
        .insert(s.plantSettings)
        .values({ plantId: plant.id, assetSeq: 1 })
        .onConflictDoUpdate({ target: s.plantSettings.plantId, set: { assetSeq: sql`${s.plantSettings.assetSeq} + 1` } })
        .returning({ seq: s.plantSettings.assetSeq })
      const [asset] = await tx
        .insert(s.assets)
        .values({
          plantId: plant.id,
          plantStageId: a.stage ? stageByCode.get(a.stage) : null,
          assetModelId: modelId,
          furCode: buildFurCode(plant.code, seq),
          tag: a.tag,
          name: a.name,
          status: a.status,
          criticality: a.criticality,
          location: a.location,
          isPublic: false, // información interna de la planta
        })
        .returning()
      const links = a.networks.map((code) => networkByCode.get(code)).filter((id): id is string => !!id)
      if (links.length > 0) await tx.insert(s.assetNetworks).values(links.map((plantNetworkId) => ({ assetId: asset.id, plantNetworkId })))
      await tx.insert(s.assetStatusHistory).values({ assetId: asset.id, newStatus: a.status, reason: 'Alta del activo', changedBy: adminId })
    })
    counts.assets++
  }
  const assetByTag = new Map((await db.select().from(s.assets).where(eq(s.assets.plantId, plant.id))).map((a) => [a.tag, a.id]))

  // Inventario propio: almacén, ubicación e ítems con saldo inicial (ingreso + stock: el libro cuadra con el saldo).
  let [warehouse] = await db.select().from(s.warehouses).where(and(eq(s.warehouses.plantId, plant.id), eq(s.warehouses.code, profile.warehouse.code)))
  if (!warehouse) [warehouse] = await db.insert(s.warehouses).values({ plantId: plant.id, ...profile.warehouse }).returning()
  let [location] = await db.select().from(s.locations).where(and(eq(s.locations.warehouseId, warehouse.id), eq(s.locations.code, profile.location.code)))
  if (!location) [location] = await db.insert(s.locations).values({ plantId: plant.id, warehouseId: warehouse.id, code: profile.location.code, name: profile.location.name, locationType: 'RACK' }).returning()
  for (const i of profile.items) {
    const [exists] = await db.select({ id: s.items.id }).from(s.items).where(and(eq(s.items.plantId, plant.id), eq(s.items.sku, i.sku)))
    if (exists) continue
    const [item] = await db
      .insert(s.items)
      .values({ plantId: plant.id, sku: i.sku, name: i.name, itemType: i.itemType, uom: i.uom, minStock: String(i.minStock), maxStock: i.maxStock === null ? null : String(i.maxStock), isCritical: i.isCritical, unitCost: i.unitCost === null ? null : String(i.unitCost) })
      .returning()
    await db.insert(s.stock).values({ itemId: item.id, locationId: location.id, quantityOnHand: String(i.onHand) })
    await db.insert(s.movements).values({
      plantId: plant.id,
      itemId: item.id,
      toLocationId: location.id,
      quantity: String(i.onHand),
      movementType: 'RECEIPT',
      unitCost: i.unitCost === null ? null : String(i.unitCost),
      note: 'Saldo inicial de demostración',
      performedBy: adminId,
      performedAt: new Date(now - 30 * DAY),
    })
    counts.items++
  }

  for (const p of profile.plans) {
    const assetId = assetByTag.get(p.assetTag)
    if (!assetId) continue
    const [exists] = await db.select({ id: s.maintenancePlans.id }).from(s.maintenancePlans).where(and(eq(s.maintenancePlans.plantId, plant.id), eq(s.maintenancePlans.name, p.name))).limit(1)
    if (exists) continue
    await db.insert(s.maintenancePlans).values({ plantId: plant.id, assetId, planType: p.planType, name: p.name, priority: p.priority, frequencyValue: p.every, frequencyUnit: p.unit, nextDueAt: new Date(now + p.dueInDays * DAY), createdBy: adminId })
    counts.plans++
  }

  for (const o of profile.orders) {
    const assetId = assetByTag.get(o.assetTag)
    if (!assetId) continue
    const [exists] = await db.select({ id: s.workOrders.id }).from(s.workOrders).where(and(eq(s.workOrders.plantId, plant.id), eq(s.workOrders.title, o.title))).limit(1)
    if (exists) continue
    await db.transaction(async (tx) => {
      const code = await nextCode(tx, plant.id, 'OT', 'OT')
      const [wo] = await tx
        .insert(s.workOrders)
        .values({
          plantId: plant.id,
          assetId,
          code,
          type: o.type,
          priority: o.priority,
          status: o.status,
          title: o.title,
          description: o.description,
          requestedBy: adminId,
          plannedStart: new Date(now + (o.dueInDays - 1) * DAY),
          plannedEnd: new Date(now + o.dueInDays * DAY),
        })
        .returning()
      const steps = o.status === 'PLANNED' ? ['REQUESTED', 'PLANNED'] : ['REQUESTED']
      await tx.insert(s.workOrderHistory).values(
        steps.map((to, i) => ({ workOrderId: wo.id, fromStatus: i === 0 ? null : steps[i - 1], toStatus: to, note: i === 0 ? 'Solicitud creada' : null, changedBy: adminId, changedAt: new Date(now - (steps.length - i) * 3_600_000) })),
      )
    })
    counts.orders++
  }
  return counts
}

/**
 * Retira plantas de demostración que ya no se usan, SOLO si siguen vacías (sin activos, órdenes, documentos, ítems,
 * presupuestos ni requisiciones): si alguien cargó datos en ellas, no se tocan.
 */
export async function retireEmptyDemoPlants(db: Db, slugs: string[]): Promise<{ removed: string[]; kept: string[] }> {
  const removed: string[] = []
  const kept: string[] = []
  for (const slug of slugs) {
    const [plant] = await db.select().from(s.plants).where(eq(s.plants.slug, slug))
    if (!plant) continue
    // Tablas con datos propios de la planta (identificadores fijos; solo el id de la planta va como parámetro).
    const tables = ['asset.assets', 'maintenance.work_orders', 'document.documents', 'inventory.items', 'budget.budgets', 'procurement.requisitions']
    let inUse = false
    for (const t of tables) {
      const { rows } = await db.execute(sql`select count(*)::int as n from ${sql.raw(t)} where plant_id = ${plant.id}`)
      if (Number((rows[0] as { n: number }).n) > 0) inUse = true
    }
    if (inUse) {
      kept.push(slug)
      continue
    }
    await db.delete(s.plants).where(eq(s.plants.id, plant.id))
    removed.push(slug)
  }
  return { removed, kept }
}
