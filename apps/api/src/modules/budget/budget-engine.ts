/**
 * Motor de cálculo de presupuestos (LULO/APU). Módulo PURO (sin base de datos) para poder probar cada fórmula.
 *
 * Convenciones (documentadas porque son dinero):
 *  - Material y transporte: subtotal = cantidad × (1 + desperdicio %) × precio.
 *  - Mano de obra y equipo (cuadrilla): subtotal = cantidad × horas por jornada ÷ rendimiento × precio por hora.
 *    El rendimiento es lo que la cuadrilla produce por jornada, en la unidad de la partida.
 *  - Redondeo: precios y subtotales de APU a 4 decimales; importes de partidas y totales a 2 decimales.
 *    Cada nivel se redondea antes de sumar, así los totales mostrados siempre cuadran con sus renglones.
 */

export const RESOURCE_TYPES = ['MATERIAL', 'LABOR', 'EQUIPMENT', 'TRANSPORT'] as const
export type ResourceType = (typeof RESOURCE_TYPES)[number]

export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
export const round4 = (v: number) => Math.round((v + Number.EPSILON) * 10_000) / 10_000

export type Breakdown = Record<ResourceType, number>
export const emptyBreakdown = (): Breakdown => ({ MATERIAL: 0, LABOR: 0, EQUIPMENT: 0, TRANSPORT: 0 })

export type ApuLineInput = {
  type: ResourceType
  quantity: number
  /** Desperdicio en %, solo se aplica a material y transporte. */
  wastePct: number
  /** Precio unitario del recurso YA convertido a la moneda base. */
  unitPrice: number
}

const crewBased = (t: ResourceType) => t === 'LABOR' || t === 'EQUIPMENT'

export function lineSubtotal(line: ApuLineInput, yieldValue: number, hoursPerDay: number): number {
  if (!(yieldValue > 0)) throw new RangeError('El rendimiento debe ser mayor que cero')
  const base = crewBased(line.type) ? (line.quantity * hoursPerDay) / yieldValue : line.quantity * (1 + line.wastePct / 100)
  return round4(base * line.unitPrice)
}

export type PricedApu = { lines: number[]; direct: number; breakdown: Breakdown }

/** Precio unitario de un APU: suma de subtotales (ya redondeados) y su desglose por tipo de recurso. */
export function priceApu(lines: ApuLineInput[], yieldValue: number, hoursPerDay: number): PricedApu {
  const breakdown = emptyBreakdown()
  const subtotals = lines.map((l) => {
    const s = lineSubtotal(l, yieldValue, hoursPerDay)
    breakdown[l.type] = round4(breakdown[l.type] + s)
    return s
  })
  return { lines: subtotals, direct: round4(subtotals.reduce((a, b) => a + b, 0)), breakdown }
}

export type Rates = { overheadPct: number; utilityPct: number; taxPct: number }
export type Totals = { direct: number; overhead: number; utility: number; subtotal: number; tax: number; total: number }

export const itemAmount = (quantity: number, unitPrice: number) => round2(quantity * unitPrice)

/** Costo directo = suma de importes de partidas; sobre él, gastos generales y utilidad; el impuesto grava el subtotal. */
export function totalsFromDirect(direct: number, rates: Rates): Totals {
  const d = round2(direct)
  const overhead = round2((d * rates.overheadPct) / 100)
  const utility = round2((d * rates.utilityPct) / 100)
  const subtotal = round2(d + overhead + utility)
  const tax = round2((subtotal * rates.taxPct) / 100)
  return { direct: d, overhead, utility, subtotal, tax, total: round2(subtotal + tax) }
}

export function budgetTotals(items: Array<{ quantity: number; unitPrice: number }>, rates: Rates): Totals {
  return totalsFromDirect(items.reduce((sum, i) => sum + itemAmount(i.quantity, i.unitPrice), 0), rates)
}

/** Ajustes de escenario: % por tipo de recurso (p. ej. { MATERIAL: 10, LABOR: -5 }). Los tipos omitidos no cambian. */
export type Adjustments = Partial<Record<ResourceType, number>>

export const adjustedUnitPrice = (breakdown: Breakdown, adj: Adjustments) =>
  round4(RESOURCE_TYPES.reduce((sum, t) => sum + breakdown[t] * (1 + (adj[t] ?? 0) / 100), 0))

export function scenarioTotals(items: Array<{ quantity: number; breakdown: Breakdown }>, rates: Rates, adj: Adjustments): Totals {
  return budgetTotals(
    items.map((i) => ({ quantity: i.quantity, unitPrice: adjustedUnitPrice(i.breakdown, adj) })),
    rates,
  )
}

export type SensitivityRow = { type: ResourceType; deltaPct: number; total: number; change: number; changePct: number | null }

/** Qué tanto se mueve el total si UN tipo de recurso sube o baja `step` %. Ordenado por impacto. */
export function sensitivity(items: Array<{ quantity: number; breakdown: Breakdown }>, rates: Rates, step = 10): { base: number; rows: SensitivityRow[] } {
  const base = scenarioTotals(items, rates, {}).total
  const rows: SensitivityRow[] = []
  for (const type of RESOURCE_TYPES) {
    for (const deltaPct of [step, -step]) {
      const total = scenarioTotals(items, rates, { [type]: deltaPct }).total
      const change = round2(total - base)
      rows.push({ type, deltaPct, total, change, changePct: base === 0 ? null : Math.round((change / base) * 10_000) / 100 })
    }
  }
  return { base, rows: rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)) }
}
