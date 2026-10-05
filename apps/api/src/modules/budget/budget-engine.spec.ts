import { adjustedUnitPrice, budgetTotals, emptyBreakdown, itemAmount, lineSubtotal, priceApu, round2, round4, scenarioTotals, sensitivity, totalsFromDirect } from './budget-engine'

const rates = { overheadPct: 10, utilityPct: 5, taxPct: 18 }

describe('redondeo', () => {
  it('half-up sin errores de coma flotante', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(round4(1.00005)).toBe(1.0001)
  })
})

describe('subtotal de una línea de APU', () => {
  it('material: cantidad × (1 + desperdicio) × precio', () => {
    expect(lineSubtotal({ type: 'MATERIAL', quantity: 7, wastePct: 5, unitPrice: 25 }, 1, 8)).toBe(183.75)
  })

  it('transporte también aplica desperdicio', () => {
    expect(lineSubtotal({ type: 'TRANSPORT', quantity: 2, wastePct: 10, unitPrice: 10 }, 1, 8)).toBe(22)
  })

  it('mano de obra: cuadrilla × horas ÷ rendimiento × precio por hora (ignora desperdicio)', () => {
    // 2 oficiales, 8 h/jornada, rinde 16 m3/jornada, S/ 18 por hora → 2×8/16×18 = 18
    expect(lineSubtotal({ type: 'LABOR', quantity: 2, wastePct: 50, unitPrice: 18 }, 16, 8)).toBe(18)
  })

  it('equipo: mismo tratamiento que mano de obra', () => {
    expect(lineSubtotal({ type: 'EQUIPMENT', quantity: 1, wastePct: 0, unitPrice: 120 }, 10, 8)).toBe(96)
  })

  it('rendimiento cero o negativo → error, no infinito', () => {
    expect(() => lineSubtotal({ type: 'LABOR', quantity: 1, wastePct: 0, unitPrice: 1 }, 0, 8)).toThrow(RangeError)
    expect(() => lineSubtotal({ type: 'LABOR', quantity: 1, wastePct: 0, unitPrice: 1 }, -2, 8)).toThrow(RangeError)
  })

  it('una jornada más corta encarece la mano de obra por unidad (menos horas pagadas por m3 → más barato)', () => {
    const l = { type: 'LABOR' as const, quantity: 2, wastePct: 0, unitPrice: 20 }
    expect(lineSubtotal(l, 10, 8)).toBe(32)
    expect(lineSubtotal(l, 10, 4)).toBe(16)
  })
})

describe('precio de un APU', () => {
  const lines = [
    { type: 'MATERIAL' as const, quantity: 7, wastePct: 5, unitPrice: 25 }, // 183.75
    { type: 'LABOR' as const, quantity: 2, wastePct: 0, unitPrice: 18 }, // 2×8/10×18 = 28.8
    { type: 'EQUIPMENT' as const, quantity: 1, wastePct: 0, unitPrice: 60 }, // 8/10×60 = 48
    { type: 'TRANSPORT' as const, quantity: 1, wastePct: 0, unitPrice: 12.3456 },
  ]

  it('suma subtotales y los desglosa por tipo', () => {
    const p = priceApu(lines, 10, 8)
    expect(p.lines).toEqual([183.75, 28.8, 48, 12.3456])
    expect(p.direct).toBe(272.8956)
    expect(p.breakdown).toEqual({ MATERIAL: 183.75, LABOR: 28.8, EQUIPMENT: 48, TRANSPORT: 12.3456 })
  })

  it('el desglose siempre suma el costo directo', () => {
    const p = priceApu(lines, 7, 8)
    const sum = Object.values(p.breakdown).reduce((a, b) => a + b, 0)
    expect(Math.abs(sum - p.direct)).toBeLessThan(0.0002)
  })

  it('sin líneas: costo cero', () => {
    expect(priceApu([], 1, 8)).toEqual({ lines: [], direct: 0, breakdown: emptyBreakdown() })
  })

  it('varias líneas del mismo tipo se acumulan', () => {
    const p = priceApu([{ type: 'MATERIAL', quantity: 1, wastePct: 0, unitPrice: 10 }, { type: 'MATERIAL', quantity: 2, wastePct: 0, unitPrice: 5 }], 1, 8)
    expect(p.breakdown.MATERIAL).toBe(20)
  })
})

describe('totales del presupuesto', () => {
  it('el importe de cada partida se redondea a 2 decimales antes de sumar', () => {
    expect(itemAmount(3, 33.3333)).toBe(100)
    // 3 partidas de 0.005 → cada una 0.01 (half-up), suman 0.03; sumar sin redondear daría 0.02
    const t = budgetTotals([{ quantity: 1, unitPrice: 0.005 }, { quantity: 1, unitPrice: 0.005 }, { quantity: 1, unitPrice: 0.005 }], { overheadPct: 0, utilityPct: 0, taxPct: 0 })
    expect(t.direct).toBe(0.03)
  })

  it('gastos generales y utilidad sobre el directo; el impuesto sobre el subtotal', () => {
    expect(totalsFromDirect(1000, rates)).toEqual({ direct: 1000, overhead: 100, utility: 50, subtotal: 1150, tax: 207, total: 1357 })
  })

  it('tasas en cero: total = directo', () => {
    expect(totalsFromDirect(123.45, { overheadPct: 0, utilityPct: 0, taxPct: 0 }).total).toBe(123.45)
  })

  it('sin partidas: todo en cero', () => {
    expect(budgetTotals([], rates)).toEqual({ direct: 0, overhead: 0, utility: 0, subtotal: 0, tax: 0, total: 0 })
  })

  it('el total siempre cuadra con sus componentes', () => {
    const t = budgetTotals([{ quantity: 12.5, unitPrice: 87.1234 }, { quantity: 3.3, unitPrice: 910.0049 }], { overheadPct: 12.34, utilityPct: 7.5, taxPct: 18 })
    expect(round2(t.direct + t.overhead + t.utility + t.tax)).toBe(t.total)
    expect(round2(t.direct + t.overhead + t.utility)).toBe(t.subtotal)
  })
})

describe('escenarios y sensibilidad', () => {
  const items = [
    { quantity: 10, breakdown: { MATERIAL: 100, LABOR: 50, EQUIPMENT: 30, TRANSPORT: 20 } }, // 200 por unidad
    { quantity: 5, breakdown: { MATERIAL: 40, LABOR: 160, EQUIPMENT: 0, TRANSPORT: 0 } }, // 200 por unidad
  ]
  const none = { overheadPct: 0, utilityPct: 0, taxPct: 0 }

  it('sin ajustes reproduce el presupuesto base', () => {
    expect(scenarioTotals(items, none, {}).total).toBe(3000)
    expect(adjustedUnitPrice(items[0].breakdown, {})).toBe(200)
  })

  it('+10 % en materiales mueve solo la parte de materiales', () => {
    // materiales: 10×100 + 5×40 = 1200 → +120
    expect(scenarioTotals(items, none, { MATERIAL: 10 }).total).toBe(3120)
  })

  it('ajustes combinados y negativos', () => {
    // MATERIAL +10 % (+120), LABOR −10 % (50×10 + 160×5 = 1300 → −130)
    expect(scenarioTotals(items, none, { MATERIAL: 10, LABOR: -10 }).total).toBe(2990)
  })

  it('las tasas se aplican sobre el costo ajustado', () => {
    expect(scenarioTotals(items, rates, { MATERIAL: 10 }).total).toBe(totalsFromDirect(3120, rates).total)
  })

  it('sensibilidad: filas ordenadas por impacto, simétricas y con porcentaje', () => {
    const s = sensitivity(items, none, 10)
    expect(s.base).toBe(3000)
    expect(s.rows).toHaveLength(8)
    expect(s.rows[0]).toMatchObject({ type: 'LABOR', change: 130 }) // labor pesa 1300 → ±130
    expect(Math.abs(s.rows[0].change)).toBeGreaterThanOrEqual(Math.abs(s.rows.at(-1)!.change))
    const mat = s.rows.filter((r) => r.type === 'MATERIAL')
    expect(mat.map((r) => r.change).sort((a, b) => a - b)).toEqual([-120, 120])
    expect(s.rows.find((r) => r.type === 'LABOR' && r.deltaPct === 10)!.changePct).toBe(4.33)
  })

  it('sensibilidad de un presupuesto vacío: sin división por cero', () => {
    const s = sensitivity([], none, 10)
    expect(s.base).toBe(0)
    expect(s.rows.every((r) => r.change === 0 && r.changePct === null)).toBe(true)
  })
})
