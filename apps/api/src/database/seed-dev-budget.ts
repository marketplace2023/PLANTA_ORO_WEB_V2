import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { nextCode } from '../common/sequences'
import { priceApu, round4, type ApuLineInput, type ResourceType } from '../modules/budget/budget-engine'
import * as s from './schema'

type Db = NodePgDatabase<typeof s>

// [code, name, type, unit, price, currency]
const RESOURCES: Array<[string, string, ResourceType, string, number, string]> = [
  ['MAT-CEM', 'Cemento Portland tipo I (42.5 kg)', 'MATERIAL', 'bol', 9.5, 'USD'],
  ['MAT-ARE', 'Arena gruesa', 'MATERIAL', 'm3', 22, 'USD'],
  ['MAT-PIE', 'Piedra chancada 3/4"', 'MATERIAL', 'm3', 28, 'USD'],
  ['MAT-ACE', 'Acero corrugado fy=4200 (proveedor local)', 'MATERIAL', 'kg', 3.8, 'PEN'], // en soles: usa el tipo de cambio
  ['LAB-OPE', 'Operario', 'LABOR', 'hh', 4.5, 'USD'],
  ['LAB-OFI', 'Oficial', 'LABOR', 'hh', 3.8, 'USD'],
  ['LAB-PEO', 'Peón', 'LABOR', 'hh', 3.2, 'USD'],
  ['EQ-MEZ', 'Mezcladora de concreto 11 p3', 'EQUIPMENT', 'hm', 6, 'USD'],
  ['EQ-RET', 'Retroexcavadora 120 HP', 'EQUIPMENT', 'hm', 38, 'USD'],
  ['TR-VOL', 'Volquete 15 m3 (viaje)', 'TRANSPORT', 'viaje', 25, 'USD'],
]

// [code, name, unit, yield, [resourceCode, quantity, wastePct][]]
const APUS: Array<[string, string, string, number, Array<[string, number, number]>]> = [
  ['APU-EXC', 'Excavación masiva con retroexcavadora', 'm3', 320, [['EQ-RET', 1, 0], ['LAB-PEO', 2, 0], ['TR-VOL', 0.05, 0]]],
  ['APU-CONC', 'Concreto f’c 210 kg/cm² para cimentación', 'm3', 12, [['MAT-CEM', 8.5, 5], ['MAT-ARE', 0.55, 8], ['MAT-PIE', 0.8, 5], ['LAB-OPE', 1, 0], ['LAB-PEO', 4, 0], ['EQ-MEZ', 1, 0]]],
  ['APU-ACE', 'Acero corrugado fy=4200 habilitado y colocado', 'kg', 250, [['MAT-ACE', 1, 5], ['LAB-OPE', 1, 0], ['LAB-OFI', 1, 0]]],
]

const PEN_RATE = 0.27

/**
 * Presupuestos de demostración para REVEMIN II (idempotente: si ya hay recursos, no hace nada):
 * libro de precios con un recurso en soles, tres APU, un presupuesto APROBADO con una valorización aprobada y otra en borrador,
 * un cambio posterior del precio del cemento (para ver la desviación) y un presupuesto en BORRADOR con un escenario.
 */
export async function seedBudgetDemo(db: Db, plantId: string, adminId: string, managerId: string): Promise<{ created: boolean }> {
  const [exists] = await db.select({ id: s.resources.id }).from(s.resources).where(eq(s.resources.plantId, plantId)).limit(1)
  if (exists) return { created: false }

  await db.transaction(async (tx) => {
    await tx.insert(s.exchangeRates).values({ plantId, currency: 'PEN', rate: String(PEN_RATE) })
    const resourceRows = await tx
      .insert(s.resources)
      .values(RESOURCES.map(([code, name, resourceType, unit, price, currency]) => ({ plantId, code, name, resourceType, unit, unitPrice: String(price), currency })))
      .returning()
    await tx.insert(s.priceHistory).values(resourceRows.map((r) => ({ resourceId: r.id, unitPrice: r.unitPrice, currency: r.currency, note: 'Precio inicial', changedBy: adminId })))
    const res = new Map(resourceRows.map((r) => [r.code, r]))

    const apuRows = new Map<string, { id: string; unit: string; name: string; direct: number; breakdown: ReturnType<typeof priceApu>['breakdown'] }>()
    for (const [code, name, unit, yieldValue, lines] of APUS) {
      const [apu] = await tx.insert(s.apus).values({ plantId, code, name, unit, yieldValue: String(yieldValue), hoursPerDay: '8' }).returning()
      await tx.insert(s.apuResources).values(lines.map(([rc, quantity, wastePct], position) => ({ apuId: apu.id, resourceId: res.get(rc)!.id, position, quantity: String(quantity), wastePct: String(wastePct) })))
      const inputs: ApuLineInput[] = lines.map(([rc, quantity, wastePct]) => {
        const r = res.get(rc)!
        const rate = r.currency === 'PEN' ? PEN_RATE : 1
        return { type: r.resourceType as ResourceType, quantity, wastePct, unitPrice: round4(Number(r.unitPrice) * rate) }
      })
      const priced = priceApu(inputs, yieldValue, 8)
      apuRows.set(code, { id: apu.id, unit, name, direct: priced.direct, breakdown: priced.breakdown })
    }

    const [project] = await tx.insert(s.projects).values({ plantId, code: 'PRJ-AMP', name: 'Ampliación del circuito de molienda', description: 'Cimentaciones y movimiento de tierras para el nuevo molino.' }).returning()

    // --- Presupuesto aprobado (precios congelados) ---
    const approvedCode = await nextCode(tx, plantId, 'PRE', 'PRE')
    const [approved] = await tx
      .insert(s.budgets)
      .values({ plantId, projectId: project.id, code: approvedCode, name: 'Ampliación de molienda – línea base', status: 'APPROVED', overheadPct: '10', utilityPct: '8', taxPct: '18', createdBy: adminId, approvedBy: managerId, approvedAt: new Date(Date.now() - 20 * 86_400_000) })
      .returning()
    const [ch1, ch2] = await tx
      .insert(s.chapters)
      .values([
        { budgetId: approved.id, code: '01', name: 'Movimiento de tierras', position: 0 },
        { budgetId: approved.id, code: '02', name: 'Obras de concreto', position: 1 },
      ])
      .returning()
    const lineItems: Array<[typeof ch1, string, string, number]> = [
      [ch1, '01.01', 'APU-EXC', 1500],
      [ch2, '02.01', 'APU-CONC', 120],
      [ch2, '02.02', 'APU-ACE', 9000],
    ]
    const itemRows = await tx
      .insert(s.budgetItems)
      .values(
        lineItems.map(([ch, code, apuCode, quantity], position) => {
          const a = apuRows.get(apuCode)!
          return { budgetId: approved.id, chapterId: ch.id, apuId: a.id, code, description: a.name, unit: a.unit, quantity: String(quantity), position, frozenUnitPrice: String(a.direct), frozenBreakdown: a.breakdown }
        }),
      )
      .returning()
    const item = new Map(itemRows.map((i) => [i.code, i]))
    await tx.insert(s.scenarios).values([
      { budgetId: approved.id, name: 'Materiales +10 %', adjustments: { MATERIAL: 10 }, createdBy: adminId },
      { budgetId: approved.id, name: 'Mano de obra +8 % y acero +15 %', adjustments: { LABOR: 8, MATERIAL: 15 }, createdBy: adminId },
    ])

    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
    const [v1, v2] = await tx
      .insert(s.valuations)
      .values([
        { budgetId: approved.id, number: 1, periodStart: day(-19), periodEnd: day(-10), status: 'APPROVED', note: 'Primer avance: movimiento de tierras y cimentación', approvedBy: managerId, approvedAt: new Date(Date.now() - 9 * 86_400_000), createdBy: adminId },
        { budgetId: approved.id, number: 2, periodStart: day(-9), periodEnd: day(0), status: 'DRAFT', createdBy: adminId },
      ])
      .returning()
    await tx.insert(s.valuationLines).values([
      { valuationId: v1.id, itemId: item.get('01.01')!.id, quantity: '600' },
      { valuationId: v1.id, itemId: item.get('02.01')!.id, quantity: '40' },
      { valuationId: v1.id, itemId: item.get('02.02')!.id, quantity: '3000' },
      { valuationId: v2.id, itemId: item.get('01.01')!.id, quantity: '400' },
      { valuationId: v2.id, itemId: item.get('02.01')!.id, quantity: '30' },
    ])

    // El cemento sube después de aprobar: el presupuesto aprobado conserva su precio y la desviación lo muestra.
    const cement = res.get('MAT-CEM')!
    await tx.update(s.resources).set({ unitPrice: '10.2', updatedAt: new Date() }).where(eq(s.resources.id, cement.id))
    await tx.insert(s.priceHistory).values({ resourceId: cement.id, unitPrice: '10.2', currency: 'USD', note: 'Alza del proveedor', changedBy: adminId })

    // --- Presupuesto en borrador (precios vigentes, editable) ---
    const draftCode = await nextCode(tx, plantId, 'PRE', 'PRE')
    const [draft] = await tx
      .insert(s.budgets)
      .values({ plantId, projectId: project.id, code: draftCode, name: 'Ampliación de molienda – alternativa B', status: 'DRAFT', overheadPct: '12', utilityPct: '6', taxPct: '18', createdBy: adminId })
      .returning()
    const [dch] = await tx.insert(s.chapters).values({ budgetId: draft.id, code: '01', name: 'Obras de concreto', position: 0 }).returning()
    await tx.insert(s.budgetItems).values([
      { budgetId: draft.id, chapterId: dch.id, apuId: apuRows.get('APU-CONC')!.id, code: '01.01', description: apuRows.get('APU-CONC')!.name, unit: 'm3', quantity: '80', position: 0 },
      { budgetId: draft.id, chapterId: dch.id, apuId: apuRows.get('APU-ACE')!.id, code: '01.02', description: apuRows.get('APU-ACE')!.name, unit: 'kg', quantity: '6500', position: 1 },
    ])
  })
  return { created: true }
}

// [título de la OT demo, [tipo, código de recurso | null, descripción, cantidad, costo unitario manual | null][]]
const WO_COSTS: Array<[string, Array<['LABOR' | 'EQUIPMENT' | 'TRANSPORT' | 'SERVICE' | 'OTHER', string | null, string, number, number | null]>]> = [
  [
    'Reparación de mandíbula de la chancadora',
    [
      ['LABOR', 'LAB-OPE', 'Operario mecánico', 16, null],
      ['LABOR', 'LAB-OFI', 'Oficial soldador', 16, null],
      ['SERVICE', null, 'Rectificado de placa fija (taller externo)', 1, 850],
    ],
  ],
  [
    'Cambio de rodamiento del agitador CIL 1',
    [
      ['LABOR', 'LAB-OPE', 'Operario mecánico', 6, null],
      ['TRANSPORT', 'TR-VOL', 'Traslado del repuesto importado', 2, null],
    ],
  ],
  ['Reemplazo de manguera del hidrociclón', [['LABOR', 'LAB-OPE', 'Operario mecánico', 4, null], ['LABOR', 'LAB-OFI', 'Oficial', 4, null]]],
  ['Ajuste de tensión de la correa', [['LABOR', 'LAB-OPE', 'Operario mecánico', 2, null]]],
  ['Lubricación mensual de rodamientos (agosto)', [['LABOR', 'LAB-OFI', 'Lubricador', 1, null]]],
]

/**
 * Costos (mano de obra, equipos, transporte y servicios) en las órdenes de trabajo de demostración de la planta, con precios
 * del libro de precios de Presupuestos (idempotente: si la planta ya tiene costos de OT, no hace nada).
 */
export async function seedWorkOrderCostsDemo(db: Db, plantId: string, userId: string): Promise<{ created: number }> {
  const [existing] = await db
    .select({ id: s.workOrderCosts.id })
    .from(s.workOrderCosts)
    .innerJoin(s.workOrders, eq(s.workOrders.id, s.workOrderCosts.workOrderId))
    .where(eq(s.workOrders.plantId, plantId))
    .limit(1)
  if (existing) return { created: 0 }

  const res = new Map((await db.select().from(s.resources).where(eq(s.resources.plantId, plantId))).map((r) => [r.code, r]))
  const orders = new Map((await db.select().from(s.workOrders).where(eq(s.workOrders.plantId, plantId))).map((w) => [w.title, w]))
  let created = 0
  for (const [title, lines] of WO_COSTS) {
    const wo = orders.get(title)
    if (!wo) continue
    for (const [kind, code, description, quantity, manual] of lines) {
      const r = code ? res.get(code) : undefined
      if (code && !r) continue // sin el libro de precios demo no se inventa un precio
      await db.insert(s.workOrderCosts).values({
        workOrderId: wo.id,
        kind,
        description,
        resourceId: r?.id,
        quantity: String(quantity),
        unitCost: String(r ? r.unitPrice : manual ?? 0),
        createdBy: userId,
        createdAt: wo.actualEnd ?? new Date(),
      })
      created++
    }
  }
  return { created }
}
