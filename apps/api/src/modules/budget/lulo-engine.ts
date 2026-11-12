import Decimal from 'decimal.js'
import { LULO_PROFILE, type LuloInput } from './lulo.schemas'

const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP })
export type LuloResource = { id: string; code: string; name: string; type: 'MATERIAL' | 'EQUIPMENT' | 'LABOR'; unit: string; amount: string; costBasis: 'UNIT' | 'HOUR' | 'DAY'; baseDate: string; validUntil: string; evidence: string; currency: string; denomination: string; priceStatus?: 'HISTORICAL' | 'VERIFIED'; priceId?: string; priceListId?: string; priceRevision?: number; supplier?: string; zeroReason?: string }
export type LuloApu = { id: string; code: string; name: string; unit: string; yieldValue: string; yieldBasis: 'ITEM' | 'HOUR' | 'DAY'; hoursPerDay: string | null; methodNote: string; publicationId: string; components: { resource: LuloResource; quantity: string; wastePct: string }[] }
export type LuloCatalog = { profile: typeof LULO_PROFILE; publicationId: string | null; label: string; version: number; demo: boolean; currency: string; denomination: string; hash: string; apus: LuloApu[]; historical?: boolean }

export function calculateLulo(input: LuloInput, catalog: LuloCatalog) {
  if (catalog.profile !== LULO_PROFILE || input.currency !== catalog.currency) throw new Error('La moneda o el perfil no coincide con la biblioteca seleccionada')
  const money = (n: Decimal.Value) => new D(n).toFixed(input.precision)
  const detail = (n: Decimal.Value) => new D(n).toFixed(8)
  const apus = new Map(catalog.apus.map(a => [a.id, a]))
  const overrides = new Map(input.overrides.map(o => [o.resourceId, o]))
  const used = new Set<string>()
  const resourceRows = new Map<string, { resourceId: string; code: string; name: string; type: string; unit: string; price: string; quantity: Decimal; cost: Decimal; privatePrice: boolean }>()
  let componentCount = 0
  const lines = input.lines.map(line => {
    if (line.pendingReason?.trim()) return { ...line, price: money(0), amount: money(0), apu: null }
    let apuResult: ReturnType<typeof priceApu> | null = null
    function priceApu(apu: LuloApu) {
      const totals = { MATERIAL: new D(0), EQUIPMENT: new D(0), LABOR: new D(0) }
      const components = apu.components.map(c => {
        if (++componentCount > 10000) throw new Error('El presupuesto excede 10.000 renglones de composición')
        const r = c.resource; used.add(r.id)
        if (r.currency !== input.currency || new D(c.quantity).lte(0) || new D(r.amount).lt(0) || !catalog.historical && new D(r.amount).isZero()) throw new Error(`Datos de composición inválidos: ${r.code}`)
        const override = overrides.get(r.id)
        const rate = new D(override?.amount ?? r.amount)
        let consumption = new D(c.quantity)
        if (r.type === 'MATERIAL') {
          if (r.costBasis !== 'UNIT') throw new Error(`Base de material incompatible: ${r.code}`)
          consumption = consumption.mul(new D(1).plus(new D(c.wastePct).div(100)))
        } else {
          if (r.costBasis === 'UNIT') throw new Error(`Falta la base temporal de ${r.code}`)
          if (apu.yieldBasis !== 'ITEM') {
            if (new D(apu.yieldValue).lte(0)) throw new Error('Rendimiento inválido')
            if (apu.yieldBasis === 'DAY' && r.costBasis === 'HOUR') {
              if (!apu.hoursPerDay || new D(apu.hoursPerDay).lte(0)) throw new Error(`Defina la jornada de ${apu.code}`)
              consumption = consumption.mul(apu.hoursPerDay)
            }
            if (apu.yieldBasis === 'HOUR' && r.costBasis === 'DAY') {
              if (!apu.hoursPerDay || new D(apu.hoursPerDay).lte(0)) throw new Error(`Defina la jornada para convertir la tarifa de ${r.code}`)
              consumption = consumption.div(apu.hoursPerDay)
            }
            consumption = consumption.div(apu.yieldValue)
          }
          if (new D(c.wastePct).gt(0)) throw new Error(`El desperdicio solo se aplica a materiales: ${r.code}`)
        }
        let cost = consumption.mul(rate)
        if (r.type === 'LABOR') cost = cost.mul(new D(1).plus(new D(input.rates.fcasPct).div(100)))
        totals[r.type] = totals[r.type].plus(cost)
        // Assumed prices retain the APU as reference, but are not treated as its actual resource consumption.
        if (line.mode === 'CALCULATED') {
          const key = JSON.stringify([r.id, rate.toString(), r.unit])
          const row = resourceRows.get(key) ?? { resourceId: r.id, code: r.code, name: r.name, type: r.type, unit: r.unit, price: rate.toFixed(8), quantity: new D(0), cost: new D(0), privatePrice: !!override }
          row.quantity = row.quantity.plus(consumption.mul(line.quantity)); row.cost = row.cost.plus(cost.mul(line.quantity)); resourceRows.set(key, row)
        }
        return { resourceId: r.id, code: r.code, name: r.name, type: r.type, unit: r.unit, quantity: c.quantity, wastePct: c.wastePct, consumption: detail(consumption), price: detail(rate), cost: detail(cost), privatePrice: !!override }
      })
      const direct = totals.MATERIAL.plus(totals.EQUIPMENT).plus(totals.LABOR)
      const overhead = direct.mul(input.rates.overheadPct).div(100)
      const utility = direct.plus(overhead).mul(input.rates.utilityPct).div(100)
      const finance = direct.plus(overhead).plus(utility).mul(input.rates.financePct).div(100)
      return { id: apu.id, code: apu.code, name: apu.name, unit: apu.unit, publicationId: apu.publicationId, yieldValue: apu.yieldValue, yieldBasis: apu.yieldBasis, hoursPerDay: apu.hoursPerDay, methodNote: apu.methodNote, components,
        breakdown: { material: detail(totals.MATERIAL), equipment: detail(totals.EQUIPMENT), labor: detail(totals.LABOR), direct: detail(direct), overhead: detail(overhead), utility: detail(utility), finance: detail(finance) }, price: money(direct.plus(overhead).plus(utility).plus(finance)) }
    }
    if (line.mode !== 'MANUAL') {
      const apu = apus.get(line.apuId!)
      if (!apu) throw new Error(`El APU de ${line.code} no pertenece al catálogo seleccionado`)
      if (line.unit !== apu.unit) throw new Error(`La unidad de ${line.code} debe ser ${apu.unit}`)
      apuResult = priceApu(apu)
    }
    const adopted = line.mode === 'CALCULATED' ? apuResult!.price : money(line.manualPrice!)
    return { ...line, price: adopted, amount: money(new D(line.quantity).mul(adopted)), apu: apuResult }
  })
  for (const override of input.overrides) if (!used.has(override.resourceId)) throw new Error('Hay un ajuste de precio que no corresponde a ningún insumo del presupuesto')
  const chapterTotals = new Map(input.chapters.map(c => [c.id, new D(0)]))
  for (const l of lines) {
    let chapter: string | null = l.chapterId
    while (chapter) { chapterTotals.set(chapter, chapterTotals.get(chapter)!.plus(l.amount)); chapter = input.chapters.find(c => c.id === chapter)!.parentId }
  }
  const subtotal = lines.reduce((a, l) => a.plus(l.amount), new D(0))
  const taxable = lines.filter(l => l.taxable).reduce((a, l) => a.plus(l.amount), new D(0))
  const tax = new D(money(taxable.mul(input.rates.taxPct).div(100)))
  if (subtotal.plus(tax).gt('999999999999999999999999')) throw new Error('El importe excede el límite del presupuesto')
  return { profile: LULO_PROFILE, currency: input.currency, precision: input.precision, demo: catalog.demo, lines,
    chapters: input.chapters.map(c => ({ ...c, subtotal: money(chapterTotals.get(c.id)!) })),
    resources: [...resourceRows.values()].map(r => ({ ...r, quantity: detail(r.quantity), cost: detail(r.cost) })),
    totals: { subtotal: money(subtotal), taxable: money(taxable), tax: money(tax), total: money(subtotal.plus(tax)) } }
}
export type LuloResult = ReturnType<typeof calculateLulo>

export function luloValidity(input: LuloInput, catalog: LuloCatalog, today: string): string[] {
  const overrides = new Map(input.overrides.map(o => [o.resourceId, o]))
  const selected = new Set(input.lines.filter(l => l.mode !== 'MANUAL').map(l => l.apuId))
  const errors = new Set<string>()
  for (const l of input.lines) if (l.pendingReason?.trim()) errors.add(`Partida pendiente ${l.code}: ${l.pendingReason}`)
  if (catalog.historical && input.lines.some(l => l.mode === 'MANUAL' && l.sourceMasterId && l.reason.startsWith('PU histórico original'))) errors.add('PU histórico original: confirma un precio propio y documenta su fuente antes de emitir')
  for (const a of catalog.apus.filter(a => selected.has(a.id))) for (const c of a.components) {
    const p = overrides.get(c.resource.id) ?? c.resource
    if (!overrides.has(c.resource.id) && c.resource.priceStatus === 'HISTORICAL') errors.add(`Precio histórico de ${c.resource.code}: pendiente de actualización en planta`)
    else if (!p.baseDate || !p.validUntil || p.baseDate > today || p.validUntil < today) errors.add(`Verifique la vigencia del precio de ${c.resource.code}`)
  }
  return [...errors]
}
