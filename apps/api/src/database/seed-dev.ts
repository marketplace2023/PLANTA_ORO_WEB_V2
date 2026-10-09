import { createHash, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { hash } from '@node-rs/argon2'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { buildFurCode } from '../modules/assets/fur-code'
import { runSeed } from './seed'
import { nextCode } from '../common/sequences'
import {
  DAY,
  DEMO_ASSETS,
  DEMO_CONTRACTORS,
  DEMO_COURSES,
  DEMO_DOCS,
  DEMO_ITEMS,
  DEMO_LOCATIONS,
  DEMO_PLANS,
  DEMO_PROVIDERS,
  DEMO_REQUISITIONS,
  DEMO_WAREHOUSE,
  DEMO_WO_PARTS,
  DEMO_WORK_ORDERS,
  HOUR,
  makePdf,
  MANUFACTURERS,
  MODELS,
} from './seed-dev-data'
import { seedBudgetDemo, seedWorkOrderCostsDemo } from './seed-dev-budget'
import { PLANT_PROFILES, retireEmptyDemoPlants, seedPlantProfile } from './seed-dev-plants'
import * as s from './schema'
import { uuidv7 } from './schema/common'

/**
 * Datos de DEMOSTRACIÓN para desarrollo local. Nunca se ejecuta con NODE_ENV=production.
 * Todos los usuarios comparten la contraseña de DEV_SEED_PASSWORD (por defecto, la de abajo).
 */
export const DEV_PASSWORD = 'fur-local-2026'

const USERS = [
  { email: 'admin@fur.local', firstName: 'Ana', lastName: 'Administradora', isGlobalAdmin: true },
  { email: 'gerente@fur.local', firstName: 'Gabriel', lastName: 'Gerente' },
  { email: 'mantenimiento@fur.local', firstName: 'Marta', lastName: 'Mantenimiento' },
  { email: 'almacen@fur.local', firstName: 'Alberto', lastName: 'Almacén' },
  { email: 'lector@fur.local', firstName: 'Lucía', lastName: 'Lectora' }, // usuario común: sin asignaciones
  { email: 'compras@fur.local', firstName: 'Camilo', lastName: 'Compras' }, // PROCUREMENT en REVEMIN II
  { email: 'proveedor@fur.local', firstName: 'Pablo', lastName: 'Proveedor' }, // responsable de un proveedor (sin acceso a plantas)
  { email: 'contratista@fur.local', firstName: 'Carla', lastName: 'Contratista' }, // responsable de un contratista
  { email: 'presupuestos@fur.local', firstName: 'Patricia', lastName: 'Presupuestos' }, // BUDGET en REVEMIN II: edita, no aprueba
  // Un administrador por planta, que solo ve la suya (las plantas son independientes entre sí).
  { email: 'caratal@fur.local', firstName: 'Cristina', lastName: 'Caratal' },
  { email: 'colombia@fur.local', firstName: 'Camilo', lastName: 'Colombia' },
  { email: 'sosamendez@fur.local', firstName: 'Sergio', lastName: 'Sosa' },
]

const PLANTS = [
  {
    code: 'REV-II',
    name: 'REVEMIN II',
    slug: 'revemin-ii',
    visibility: 'PUBLIC',
    description: 'Planta de beneficio de oro con circuito de molienda, lixiviación CIL y fundición.',
    countryCode: 'PE',
    timezone: 'America/Lima',
    publicProcesses: true,
  },
  // Plantas independientes: su ficha pública es visible, pero su información operativa (procesos, activos, documentos)
  // no se publica; se abre desde "Editar planta" si se desea. País y huso horario quedan por completar.
  {
    code: 'CAR-01',
    name: 'Planta Caratal',
    slug: 'planta-caratal',
    visibility: 'PUBLIC',
    description: 'Planta de beneficio de oro. Datos de demostración: edítalos desde “Editar planta”.',
    countryCode: null,
    timezone: 'UTC',
    publicProcesses: false,
  },
  {
    code: 'MCO-01',
    name: 'Mina Colombia',
    slug: 'mina-colombia',
    visibility: 'PUBLIC',
    description: 'Mina con circuito de chancado y molienda. Datos de demostración: edítalos desde “Editar planta”.',
    countryCode: null,
    timezone: 'UTC',
    publicProcesses: false,
  },
  {
    code: 'MSM-01',
    name: 'Mina Sosa Méndez',
    slug: 'mina-sosa-mendez',
    visibility: 'PUBLIC',
    description: 'Mina con circuito de chancado y molienda. Datos de demostración: edítalos desde “Editar planta”.',
    countryCode: null,
    timezone: 'UTC',
    publicProcesses: false,
  },
] as const

// [email, plantSlug, roleCode]
const ASSIGNMENTS: Array<[string, string, string]> = [
  ['gerente@fur.local', 'revemin-ii', 'PLANT_ADMIN'],
  ['mantenimiento@fur.local', 'revemin-ii', 'MAINTENANCE_LEAD'],
  ['almacen@fur.local', 'revemin-ii', 'WAREHOUSE'],
  ['compras@fur.local', 'revemin-ii', 'PROCUREMENT'],
  ['presupuestos@fur.local', 'revemin-ii', 'BUDGET'],
  ['caratal@fur.local', 'planta-caratal', 'PLANT_ADMIN'],
  ['colombia@fur.local', 'mina-colombia', 'PLANT_ADMIN'],
  ['sosamendez@fur.local', 'mina-sosa-mendez', 'PLANT_ADMIN'],
]

export async function runSeedDev(url: string, password = DEV_PASSWORD) {
  if (process.env.NODE_ENV === 'production') throw new Error('seed-dev no puede ejecutarse con NODE_ENV=production')

  // El catálogo, los roles y los permisos son requisito.
  await runSeed(url)

  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 30_000 })
  const db = drizzle(pool, { schema: s })
  try {
    const passwordHash = await hash(password)
    for (const u of USERS) {
      await db
        .insert(s.users)
        .values({ ...u, passwordHash })
        .onConflictDoUpdate({ target: s.users.email, set: { passwordHash, status: 'ACTIVE' } })
    }

    const [eco] = await db.select().from(s.ecosystems).where(eq(s.ecosystems.code, 'FUR'))
    for (const { publicProcesses, ...p } of PLANTS) {
      // REVEMIN II es la planta de demostración: se restablece en cada corrida. Las demás plantas son del usuario: si ya
      // existen no se tocan (nombre, descripción, visibilidad ni publicación se conservan aunque se vuelva a sembrar).
      const resettable = p.slug === 'revemin-ii'
      const insert = db.insert(s.plants).values({ ...p, ecosystemId: eco.id })
      const [plant] = resettable
        ? await insert.onConflictDoUpdate({ target: s.plants.slug, set: { name: p.name, description: p.description, visibility: p.visibility } }).returning()
        : await insert.onConflictDoNothing({ target: s.plants.slug }).returning()
      if (!plant) continue // planta existente que no se restablece
      const flags = { publicProcesses, publicDashboard: publicProcesses, publicAssets: publicProcesses, publicDocuments: publicProcesses }
      const settings = db.insert(s.plantSettings).values({ plantId: plant.id, ...flags })
      if (resettable) await settings.onConflictDoUpdate({ target: s.plantSettings.plantId, set: flags })
      else await settings.onConflictDoNothing({ target: s.plantSettings.plantId })
    }

    const plantBySlug = new Map((await db.select().from(s.plants)).map((p) => [p.slug, p]))
    const userByEmail = new Map(
      (await db.select().from(s.users).where(inArray(s.users.email, USERS.map((u) => u.email)))).map((u) => [u.email, u]),
    )
    const roleByCode = new Map((await db.select().from(s.roles)).map((r) => [r.code, r]))
    for (const [email, slug, roleCode] of ASSIGNMENTS) {
      await db
        .insert(s.userPlantRoles)
        .values({ userId: userByEmail.get(email)!.id, plantId: plantBySlug.get(slug)!.id, roleId: roleByCode.get(roleCode)!.id })
        .onConflictDoNothing()
    }

    // REVEMIN II: circuito completo y redes principales; las etapas D05-D10 y las redes de procesos/IoT son públicas.
    const revemin = plantBySlug.get('revemin-ii')!
    const stages = await db.select().from(s.stageMaster)
    const publicStageCodes = new Set(['D05', 'D06', 'D07', 'D08', 'D09', 'D10'])
    for (const st of stages) {
      await db
        .insert(s.plantStages)
        .values({ plantId: revemin.id, stageMasterId: st.id, sequence: st.sequenceDefault, isPublic: publicStageCodes.has(st.code) })
        .onConflictDoNothing()
    }
    const networks = await db.select().from(s.networkMaster)
    const enabled = new Set(['FUR-PROC', 'FUR-PTE', 'FUR-IOT', 'FUR-MNT', 'FUR-RQ', 'FUR-LAB'])
    const publicNetworks = new Set(['FUR-PROC', 'FUR-IOT'])
    for (const n of networks.filter((n) => enabled.has(n.code))) {
      await db
        .insert(s.plantNetworks)
        .values({ plantId: revemin.id, networkMasterId: n.id, isPublic: publicNetworks.has(n.code) })
        .onConflictDoNothing()
    }

    // Catálogo de demostración: fabricantes y modelos (global).
    await db
      .insert(s.manufacturers)
      .values(MANUFACTURERS.map(([name, countryCode]) => ({ name, countryCode })))
      .onConflictDoNothing({ target: s.manufacturers.name })
    const manufacturerId = new Map((await db.select().from(s.manufacturers)).map((m) => [m.name, m.id]))
    const typeId = new Map((await db.select().from(s.assetTypes)).map((t) => [t.code, t.id]))
    for (const [typeCode, maker, modelName, specifications] of MODELS) {
      const [existing] = await db
        .select({ id: s.assetModels.id })
        .from(s.assetModels)
        .where(and(eq(s.assetModels.assetTypeId, typeId.get(typeCode)!), eq(s.assetModels.modelName, modelName)))
        .limit(1)
      if (existing) continue
      await db
        .insert(s.assetModels)
        .values({ assetTypeId: typeId.get(typeCode)!, manufacturerId: maker ? manufacturerId.get(maker) : null, modelName, specifications })
    }

    // Activos de demostración de REVEMIN II (idempotente por tag).
    const modelByName = new Map((await db.select().from(s.assetModels)).map((m) => [m.modelName, m.id]))
    const stageByCode = new Map(
      (
        await db
          .select({ id: s.plantStages.id, code: s.stageMaster.code })
          .from(s.plantStages)
          .innerJoin(s.stageMaster, eq(s.stageMaster.id, s.plantStages.stageMasterId))
          .where(eq(s.plantStages.plantId, revemin.id))
      ).map((r) => [r.code, r.id]),
    )
    const networkByCode = new Map(
      (
        await db
          .select({ id: s.plantNetworks.id, code: s.networkMaster.code })
          .from(s.plantNetworks)
          .innerJoin(s.networkMaster, eq(s.networkMaster.id, s.plantNetworks.networkMasterId))
          .where(eq(s.plantNetworks.plantId, revemin.id))
      ).map((r) => [r.code, r.id]),
    )
    const gerente = userByEmail.get('gerente@fur.local')!
    let created = 0
    for (const a of DEMO_ASSETS) {
      const [exists] = await db
        .select({ id: s.assets.id })
        .from(s.assets)
        .where(and(eq(s.assets.plantId, revemin.id), eq(s.assets.tag, a.tag)))
        .limit(1)
      if (exists) continue
      await db.transaction(async (tx) => {
        const [{ seq }] = await tx
          .insert(s.plantSettings)
          .values({ plantId: revemin.id, assetSeq: 1 })
          .onConflictDoUpdate({ target: s.plantSettings.plantId, set: { assetSeq: sql`${s.plantSettings.assetSeq} + 1` } })
          .returning({ seq: s.plantSettings.assetSeq })
        const [asset] = await tx
          .insert(s.assets)
          .values({
            plantId: revemin.id,
            plantStageId: a.stage ? stageByCode.get(a.stage) : null,
            assetModelId: modelByName.get(a.model)!,
            furCode: buildFurCode(revemin.code, seq),
            tag: a.tag,
            name: a.name,
            status: a.status,
            criticality: a.criticality,
            location: a.location,
            isPublic: a.isPublic,
            installationDate: '2022-03-15',
          })
          .returning()
        const links = a.networks.map((code) => networkByCode.get(code)).filter((id): id is string => !!id)
        if (links.length > 0) await tx.insert(s.assetNetworks).values(links.map((plantNetworkId) => ({ assetId: asset.id, plantNetworkId })))
        await tx.insert(s.assetStatusHistory).values({ assetId: asset.id, newStatus: a.status, reason: 'Alta del activo', changedBy: gerente.id })
      })
      created++
    }

    // Documentos de demostración con PDFs reales escritos en STORAGE_DIR (idempotente por título).
    const storageRoot = path.resolve(process.env.STORAGE_DIR || './.local/storage')
    const assetByTag = new Map((await db.select().from(s.assets).where(eq(s.assets.plantId, revemin.id))).map((a) => [a.tag, a.id]))
    let docsCreated = 0
    for (const d of DEMO_DOCS) {
      const [exists] = await db
        .select({ id: s.documents.id })
        .from(s.documents)
        .where(and(eq(s.documents.plantId, revemin.id), eq(s.documents.title, d.title)))
        .limit(1)
      if (exists) continue

      const buffer = makePdf(d.lines)
      const documentId = uuidv7()
      const storageKey = `${revemin.id}/${documentId}/v1-${randomBytes(8).toString('hex')}.pdf`
      await mkdir(path.dirname(path.join(storageRoot, storageKey)), { recursive: true })
      await writeFile(path.join(storageRoot, storageKey), buffer)

      await db.transaction(async (tx) => {
        await tx.insert(s.documents).values({ id: documentId, plantId: revemin.id, title: d.title, documentType: d.type, visibility: d.visibility, createdBy: gerente.id })
        await tx.insert(s.documentVersions).values({
          documentId,
          version: 1,
          originalName: d.fileName,
          mimeType: 'application/pdf',
          sizeBytes: buffer.length,
          checksum: createHash('sha256').update(buffer).digest('hex'),
          storageKey,
          note: 'Documento de demostración',
          uploadedBy: gerente.id,
        })
        const assetId = d.assetTag ? assetByTag.get(d.assetTag) : undefined
        if (assetId) await tx.insert(s.assetDocuments).values({ documentId, assetId })
        const stageId = d.stage ? stageByCode.get(d.stage) : undefined
        if (stageId) await tx.insert(s.stageDocuments).values({ documentId, plantStageId: stageId })
      })
      docsCreated++
    }

    // Mantenimiento de demostración: planes y órdenes en todos los estados, con historial (idempotente por título/nombre).
    const lead = userByEmail.get('mantenimiento@fur.local')!
    const now = Date.now()
    let plansCreated = 0
    for (const p of DEMO_PLANS) {
      const assetId = assetByTag.get(p.assetTag)
      if (!assetId) continue
      const [exists] = await db.select({ id: s.maintenancePlans.id }).from(s.maintenancePlans).where(and(eq(s.maintenancePlans.plantId, revemin.id), eq(s.maintenancePlans.name, p.name))).limit(1)
      if (exists) continue
      await db.insert(s.maintenancePlans).values({
        plantId: revemin.id,
        assetId,
        planType: p.planType,
        name: p.name,
        priority: p.priority,
        frequencyValue: p.every,
        frequencyUnit: p.unit,
        nextDueAt: new Date(now + p.dueInDays * DAY),
        createdBy: lead.id,
      })
      plansCreated++
    }

    // Camino de estados hasta el estado final, para construir un historial coherente.
    const PATH = ['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED']
    let ordersCreated = 0
    for (const o of DEMO_WORK_ORDERS) {
      const assetId = assetByTag.get(o.assetTag)
      if (!assetId) continue
      const [exists] = await db.select({ id: s.workOrders.id }).from(s.workOrders).where(and(eq(s.workOrders.plantId, revemin.id), eq(s.workOrders.title, o.title))).limit(1)
      if (exists) continue

      const ended = o.endedDaysAgo !== undefined ? new Date(now - o.endedDaysAgo * DAY) : null
      const started = ended && o.workedHours ? new Date(ended.getTime() - o.workedHours * HOUR) : o.status === 'IN_PROGRESS' || o.status === 'ON_HOLD' ? new Date(now - 2 * DAY) : null
      await db.transaction(async (tx) => {
        const code = await nextCode(tx, revemin.id, 'OT', 'OT')
        const [wo] = await tx
          .insert(s.workOrders)
          .values({
            plantId: revemin.id,
            assetId,
            code,
            type: o.type,
            priority: o.priority,
            status: o.status,
            title: o.title,
            description: o.description,
            requestedBy: gerente.id,
            assignedTo: o.assigned ? lead.id : null,
            plannedStart: o.dueInDays === null ? null : new Date(now + (o.dueInDays - 1) * DAY),
            plannedEnd: o.dueInDays === null ? null : new Date(now + o.dueInDays * DAY),
            actualStart: started,
            actualEnd: ended,
            completionNotes: o.notes ?? null,
            closedAt: o.status === 'CLOSED' ? ended : null,
            closedBy: o.status === 'CLOSED' ? gerente.id : null,
          })
          .returning()
        const steps = o.status === 'ON_HOLD' ? ['REQUESTED', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'] : PATH.slice(0, PATH.indexOf(o.status) + 1)
        await tx.insert(s.workOrderHistory).values(
          steps.map((to, i) => ({
            workOrderId: wo.id,
            fromStatus: i === 0 ? null : steps[i - 1],
            toStatus: to,
            note: i === 0 ? 'Solicitud creada' : to === 'ON_HOLD' ? 'Falta repuesto' : to === 'COMPLETED' ? o.notes ?? null : null,
            changedBy: i === 0 ? gerente.id : lead.id,
            changedAt: new Date(now - (steps.length - i) * HOUR),
          })),
        )
      })
      ordersCreated++
    }

    // Inventario de demostración: almacén, ubicaciones, ítems con saldo inicial (ingreso) y consumos en órdenes.
    const keeper = userByEmail.get('almacen@fur.local')!
    let itemsCreated = 0
    let [warehouse] = await db.select().from(s.warehouses).where(and(eq(s.warehouses.plantId, revemin.id), eq(s.warehouses.code, DEMO_WAREHOUSE.code)))
    if (!warehouse) [warehouse] = await db.insert(s.warehouses).values({ plantId: revemin.id, ...DEMO_WAREHOUSE }).returning()
    const locationByCode = new Map<string, string>()
    for (const l of DEMO_LOCATIONS) {
      let [loc] = await db.select().from(s.locations).where(and(eq(s.locations.warehouseId, warehouse.id), eq(s.locations.code, l.code)))
      if (!loc) [loc] = await db.insert(s.locations).values({ plantId: revemin.id, warehouseId: warehouse.id, code: l.code, name: l.name, locationType: l.type }).returning()
      locationByCode.set(l.code, loc.id)
    }
    const itemBySku = new Map<string, { id: string; unitCost: string | null }>()
    for (const i of DEMO_ITEMS) {
      const [exists] = await db.select().from(s.items).where(and(eq(s.items.plantId, revemin.id), eq(s.items.sku, i.sku)))
      if (exists) {
        itemBySku.set(i.sku, { id: exists.id, unitCost: exists.unitCost })
        continue
      }
      const locationId = locationByCode.get(i.location)!
      const [item] = await db
        .insert(s.items)
        .values({
          plantId: revemin.id,
          sku: i.sku,
          name: i.name,
          itemType: i.itemType,
          uom: i.uom,
          minStock: String(i.minStock),
          maxStock: i.maxStock === null ? null : String(i.maxStock),
          isCritical: i.isCritical,
          unitCost: i.unitCost === null ? null : String(i.unitCost),
        })
        .returning()
      // Saldo inicial = ingreso fechado hace 40 días + stock; el libro de movimientos cuadra con el saldo.
      await db.insert(s.stock).values({ itemId: item.id, locationId, quantityOnHand: String(i.onHand) })
      await db.insert(s.movements).values({
        plantId: revemin.id,
        itemId: item.id,
        toLocationId: locationId,
        quantity: String(i.onHand),
        movementType: 'RECEIPT',
        unitCost: i.unitCost === null ? null : String(i.unitCost),
        note: 'Saldo inicial de demostración',
        performedBy: keeper.id,
        performedAt: new Date(now - 40 * DAY),
      })
      itemBySku.set(i.sku, { id: item.id, unitCost: item.unitCost })
      itemsCreated++
    }
    let partsCreated = 0
    for (const p of DEMO_WO_PARTS) {
      const [wo] = await db.select({ id: s.workOrders.id, endedAt: s.workOrders.actualEnd }).from(s.workOrders).where(and(eq(s.workOrders.plantId, revemin.id), eq(s.workOrders.title, p.workOrderTitle)))
      const item = itemBySku.get(p.sku)
      if (!wo || !item) continue
      const [done] = await db.select({ id: s.workOrderParts.id }).from(s.workOrderParts).where(and(eq(s.workOrderParts.workOrderId, wo.id), eq(s.workOrderParts.itemId, item.id)))
      if (done) continue
      const [stockRow] = await db.select().from(s.stock).where(eq(s.stock.itemId, item.id))
      if (!stockRow || Number(stockRow.quantityOnHand) < p.quantity) continue
      await db.transaction(async (tx) => {
        await tx
          .update(s.stock)
          .set({ quantityOnHand: sql`${s.stock.quantityOnHand} - ${String(p.quantity)}::numeric` })
          .where(and(eq(s.stock.itemId, item.id), eq(s.stock.locationId, stockRow.locationId)))
        await tx.insert(s.movements).values({
          plantId: revemin.id,
          itemId: item.id,
          fromLocationId: stockRow.locationId,
          quantity: String(p.quantity),
          movementType: 'ISSUE',
          unitCost: item.unitCost,
          referenceType: 'WORK_ORDER',
          referenceId: wo.id,
          note: 'Consumo en orden de trabajo',
          performedBy: lead.id,
          performedAt: wo.endedAt ?? new Date(now - DAY),
        })
        await tx.insert(s.workOrderParts).values({ workOrderId: wo.id, itemId: item.id, locationId: stockRow.locationId, quantity: String(p.quantity), unitCost: item.unitCost, createdBy: lead.id })
      })
      partsCreated++
    }

    // Organizaciones externas de demostración: proveedores con productos y contratistas con servicios (idempotente por nombre).
    const stageIdByCode = new Map((await db.select({ id: s.stageMaster.id, code: s.stageMaster.code }).from(s.stageMaster)).map((r) => [r.code, r.id]))
    const familyIdByCode = new Map((await db.select({ id: s.assetFamilies.id, code: s.assetFamilies.code }).from(s.assetFamilies)).map((r) => [r.code, r.id]))
    let providersCreated = 0
    for (const p of DEMO_PROVIDERS) {
      const [exists] = await db.select({ id: s.providers.id }).from(s.providers).where(eq(s.providers.organizationName, p.name))
      if (exists) continue
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(s.providers)
          .values({ organizationName: p.name, taxId: p.taxId, countryCode: p.country, city: p.city, description: p.description, certifications: p.certifications, status: 'ACTIVE', verified: p.verified, rating: p.rating === null ? null : String(p.rating) })
          .returning()
        if (p.owner) await tx.insert(s.providerMembers).values({ providerId: row.id, userId: userByEmail.get(p.owner)!.id, role: 'OWNER' })
        await tx.insert(s.providerStageCapabilities).values(p.stages.map((c) => ({ providerId: row.id, stageMasterId: stageIdByCode.get(c)! })))
        await tx.insert(s.providerAssetFamilies).values(p.families.map((c) => ({ providerId: row.id, assetFamilyId: familyIdByCode.get(c)! })))
        for (const l of p.listings) {
          const [model] = l.model ? await tx.select({ id: s.assetModels.id }).from(s.assetModels).where(eq(s.assetModels.modelName, l.model)) : []
          const [created] = await tx
            .insert(s.listings)
            .values({
              providerId: row.id,
              assetModelId: model?.id,
              assetFamilyId: familyIdByCode.get(l.family)!,
              title: l.title,
              description: l.description,
              price: l.price === null ? null : String(l.price),
              currency: l.currency,
              availability: l.availability,
              stockText: l.stockText,
              status: l.status ?? 'ACTIVE',
              isFeatured: l.featured ?? false,
            })
            .returning({ id: s.listings.id })
          await tx.insert(s.listingStages).values(l.stages.map((c) => ({ listingId: created.id, stageMasterId: stageIdByCode.get(c)! })))
        }
      })
      providersCreated++
    }
    let contractorsCreated = 0
    for (const c of DEMO_CONTRACTORS) {
      const [exists] = await db.select({ id: s.contractors.id }).from(s.contractors).where(eq(s.contractors.organizationName, c.name))
      if (exists) continue
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(s.contractors)
          .values({ organizationName: c.name, taxId: c.taxId, countryCode: c.country, city: c.city, description: c.description, certifications: c.certifications, availability: c.availability, status: 'ACTIVE', verified: c.verified, rating: c.rating === null ? null : String(c.rating) })
          .returning()
        if (c.owner) await tx.insert(s.contractorMembers).values({ contractorId: row.id, userId: userByEmail.get(c.owner)!.id, role: 'OWNER' })
        for (const sv of c.services) {
          const [created] = await tx.insert(s.services).values({ contractorId: row.id, name: sv.name, description: sv.description, serviceType: sv.type }).returning({ id: s.services.id })
          await tx.insert(s.serviceStages).values(sv.stages.map((code) => ({ serviceId: created.id, stageMasterId: stageIdByCode.get(code)! })))
        }
      })
      contractorsCreated++
    }

    // Compras de demostración: requisiciones en distintos estados, con una RFQ cotizada y una orden adjudicada.
    const buyer = userByEmail.get('compras@fur.local')!
    const [demoProvider] = await db.select({ id: s.providers.id }).from(s.providers).where(eq(s.providers.organizationName, DEMO_PROVIDERS[0].name))
    const FLOW = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RFQ', 'ORDERED']
    let requisitionsCreated = 0
    for (const r of DEMO_REQUISITIONS) {
      const [exists] = await db.select({ id: s.requisitions.id }).from(s.requisitions).where(and(eq(s.requisitions.plantId, revemin.id), eq(s.requisitions.justification, r.justification)))
      if (exists) continue
      await db.transaction(async (tx) => {
        const code = await nextCode(tx, revemin.id, 'RQ', 'RQ')
        const requester = r.requestedBy === 'lead' ? lead : gerente
        const decided = r.status !== 'DRAFT' && r.status !== 'SUBMITTED'
        const [rq] = await tx
          .insert(s.requisitions)
          .values({
            plantId: revemin.id,
            code,
            requestedBy: requester.id,
            assetId: r.assetTag ? assetByTag.get(r.assetTag) : undefined,
            status: r.status,
            priority: r.priority,
            neededBy: new Date(now + r.neededInDays * DAY).toISOString().slice(0, 10),
            justification: r.justification,
            approvedBy: decided && r.status !== 'REJECTED' ? buyer.id : null,
            approvedAt: decided && r.status !== 'REJECTED' ? new Date(now - 2 * DAY) : null,
            decisionNote: r.status === 'REJECTED' ? (r.note ?? null) : null,
          })
          .returning()
        await tx.insert(s.requisitionLines).values(
          r.lines.map((l, i) => ({
            requisitionId: rq.id,
            position: i,
            itemId: l.sku ? itemBySku.get(l.sku)?.id : undefined,
            description: l.description,
            quantity: String(l.quantity),
            uom: l.uom,
            estimatedPrice: l.price === undefined ? null : String(l.price),
          })),
        )
        const steps = r.status === 'REJECTED' ? ['DRAFT', 'SUBMITTED', 'REJECTED'] : FLOW.slice(0, FLOW.indexOf(r.status) + 1)
        await tx.insert(s.requisitionHistory).values(
          steps.map((to, i) => ({
            requisitionId: rq.id,
            fromStatus: i === 0 ? null : steps[i - 1],
            toStatus: to,
            changedBy: to === 'APPROVED' || to === 'REJECTED' ? buyer.id : requester.id,
            changedAt: new Date(now - (steps.length - i) * 6 * HOUR),
          })),
        )
        if (r.status === 'RFQ' || r.status === 'ORDERED') {
          const rfqCode = await nextCode(tx, revemin.id, 'RFQ', 'RFQ')
          const [rfq] = await tx
            .insert(s.rfqs)
            .values({ plantId: revemin.id, requisitionId: rq.id, code: rfqCode, status: r.status === 'RFQ' ? 'OPEN' : 'AWARDED', deadlineAt: new Date(now + (r.status === 'RFQ' ? 4 : -2) * DAY), createdBy: buyer.id })
            .returning()
          await tx.insert(s.rfqInvitations).values({ rfqId: rfq.id, providerId: demoProvider.id })
          if (r.quote) {
            await tx.insert(s.supplierQuotes).values({ rfqId: rfq.id, providerId: demoProvider.id, currency: 'USD', totalAmount: String(r.quote.total), deliveryDays: r.quote.days, conditions: 'Pago a 30 días', status: r.status === 'RFQ' ? 'SUBMITTED' : 'AWARDED' })
          }
        }
      })
      requisitionsCreated++
    }

    // Flujo de proceso de demostración (ilustrativo): circuito principal, agua de proceso y retornos de carbón / sobretamaño.
    const FLOWS: Array<[string, string, 'MATERIAL' | 'SOLUTION' | 'WATER' | 'REAGENT', boolean]> = [
      ['D01', 'D02', 'MATERIAL', false],
      ['D02', 'D03', 'MATERIAL', false],
      ['D03', 'D04', 'MATERIAL', false],
      ['D04', 'D05', 'MATERIAL', false],
      ['D05', 'D06', 'MATERIAL', false],
      ['D06', 'D07', 'MATERIAL', false],
      ['D07', 'D06', 'MATERIAL', true], // sobretamaño de los hidrociclones vuelve a molienda secundaria
      ['D07', 'D08', 'MATERIAL', false],
      ['D08', 'D09', 'MATERIAL', false],
      ['D09', 'D10', 'MATERIAL', false],
      ['D10', 'D11', 'MATERIAL', false],
      ['D11', 'D12', 'MATERIAL', false],
      ['D12', 'D13', 'MATERIAL', false],
      ['D13', 'D14', 'SOLUTION', false],
      ['D14', 'D15', 'SOLUTION', false],
      ['D15', 'D16', 'MATERIAL', false],
      ['D13', 'D17', 'MATERIAL', false],
      ['D17', 'D10', 'MATERIAL', true], // carbón regenerado regresa al CIL
      ['D15', 'D18', 'SOLUTION', false],
      ['D11', 'D19', 'MATERIAL', false],
      ['D19', 'D09', 'WATER', true], // agua recuperada de relaves
    ]
    const connectionsHere = await db.select({ id: s.stageConnections.id }).from(s.stageConnections).where(eq(s.stageConnections.plantId, revemin.id))
    let connectionsCreated = 0
    if (connectionsHere.length === 0) {
      for (const [from, to, flowType, isReturnFlow] of FLOWS) {
        const sourceStageId = stageByCode.get(from)
        const targetStageId = stageByCode.get(to)
        if (!sourceStageId || !targetStageId) continue
        await db.insert(s.stageConnections).values({ plantId: revemin.id, sourceStageId, targetStageId, flowType, isReturnFlow })
        connectionsCreated++
      }
    }

    // Cursos de demostración (idempotente por título). `lector` queda inscrito con avance parcial en el primero.
    const adminUser = userByEmail.get('admin@fur.local')!
    const reader = userByEmail.get('lector@fur.local')!
    const [prov] = await db.select({ id: s.providers.id, name: s.providers.organizationName }).from(s.providers).where(eq(s.providers.organizationName, DEMO_PROVIDERS[0].name))
    const [contr] = await db.select({ id: s.contractors.id, name: s.contractors.organizationName }).from(s.contractors).where(eq(s.contractors.organizationName, DEMO_CONTRACTORS[0].name))
    let coursesCreated = 0
    for (const c of DEMO_COURSES) {
      const [exists] = await db.select({ id: s.courses.id }).from(s.courses).where(eq(s.courses.title, c.title))
      if (exists) continue
      const ownerType = c.owner.type
      const providerId = ownerType === 'PROVIDER' ? prov?.id : undefined
      const contractorId = ownerType === 'CONTRACTOR' ? contr?.id : undefined
      if ((ownerType === 'PROVIDER' && !providerId) || (ownerType === 'CONTRACTOR' && !contractorId)) continue
      await db.transaction(async (tx) => {
        const [course] = await tx
          .insert(s.courses)
          .values({
            title: c.title,
            description: c.description,
            providerType: ownerType,
            providerId,
            contractorId,
            level: c.level,
            instructorName: c.instructor,
            certificate: c.certificate,
            status: c.status,
            durationMinutes: c.lessons.reduce((sum, l) => sum + l.minutes, 0),
            createdBy: adminUser.id,
          })
          .returning()
        await tx.insert(s.courseStages).values(c.stages.map((code) => ({ courseId: course.id, stageMasterId: stageIdByCode.get(code)! })))
        const lessonRows = await tx
          .insert(s.lessons)
          .values(c.lessons.map((l, i) => ({ courseId: course.id, position: i, title: l.title, content: l.content, videoUrl: l.videoUrl, durationMinutes: l.minutes })))
          .returning({ id: s.lessons.id, position: s.lessons.position })
        if (c.title.startsWith('Seguridad operativa')) {
          const [enr] = await tx.insert(s.enrollments).values({ courseId: course.id, userId: reader.id, progressPercent: '33.33' }).returning()
          const first = lessonRows.find((l) => l.position === 0)!
          await tx.insert(s.lessonProgress).values({ enrollmentId: enr.id, lessonId: first.id })
        }
      })
      coursesCreated++
    }

    // Presupuestos (LULO): libro de precios, APU, un presupuesto aprobado con valorizaciones y uno en borrador.
    const budgetDemo = await seedBudgetDemo(db, revemin.id, adminUser.id, userByEmail.get('gerente@fur.local')!.id)
    const woCostsDemo = await seedWorkOrderCostsDemo(db, revemin.id, adminUser.id)

    // Plantas independientes (cada una con su propia configuración, activos, inventario y mantenimiento) y retiro de las
    // plantas de ejemplo antiguas (Norte y Piloto) si siguen vacías.
    const retired = await retireEmptyDemoPlants(db, ['planta-norte', 'planta-piloto'])
    const plantData: string[] = []
    for (const [slug, profile] of Object.entries(PLANT_PROFILES)) {
      const plant = plantBySlug.get(slug)!
      const adminEmail = ASSIGNMENTS.find(([, assignedSlug]) => assignedSlug === slug)![0]
      const c = await seedPlantProfile(db, plant, profile, userByEmail.get(adminEmail)!.id)
      plantData.push(`${plant.name}: ${c.assets} activos, ${c.items} ítems, ${c.plans} planes, ${c.orders} órdenes nuevos`)
    }

    const count = await db.select({ id: s.plantStages.id }).from(s.plantStages).where(and(eq(s.plantStages.plantId, revemin.id)))
    console.log(
      `Seed dev OK: ${USERS.length} usuarios, ${PLANTS.length} plantas, REVEMIN II con ${count.length} etapas, ${MODELS.length} modelos, ${DEMO_ASSETS.length} activos (${created} nuevos), ${DEMO_DOCS.length} documentos (${docsCreated} nuevos), ${DEMO_PLANS.length} planes (${plansCreated} nuevos), ${DEMO_WORK_ORDERS.length} órdenes (${ordersCreated} nuevas), ${DEMO_ITEMS.length} ítems de inventario (${itemsCreated} nuevos), ${partsCreated} consumos en órdenes, ${DEMO_PROVIDERS.length} proveedores (${providersCreated} nuevos), ${DEMO_CONTRACTORS.length} contratistas (${contractorsCreated} nuevos), ${DEMO_REQUISITIONS.length} requisiciones (${requisitionsCreated} nuevas), ${connectionsCreated} conexiones de proceso, ${DEMO_COURSES.length} cursos (${coursesCreated} nuevos), presupuestos de demo ${budgetDemo.created ? 'creados' : 'ya existían'}, ${woCostsDemo.created} costos de órdenes nuevos. Plantas: ${plantData.join(' | ')}${retired.removed.length ? `. Retiradas (vacías): ${retired.removed.join(', ')}` : ''}${retired.kept.length ? `. NO retiradas (tienen datos): ${retired.kept.join(', ')}` : ''}`,
    )
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  try {
    process.loadEnvFile('.env')
  } catch {
    /* sin .env */
  }
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('Falta DATABASE_URL')
    process.exit(1)
  }
  runSeedDev(url, process.env.DEV_SEED_PASSWORD || DEV_PASSWORD)
    .then(() => {
      console.log(`\nUsuarios de demo (contraseña: ${process.env.DEV_SEED_PASSWORD || DEV_PASSWORD}):`)
      for (const u of USERS) console.log(`  ${u.email}`)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
