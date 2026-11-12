import Decimal from 'decimal.js'
import type { luloContracts, luloContractItems, luloWorkRecords } from '../../database/schema/lulo-works'
import { luloHash } from './lulo-hash'
import type { WorkRecordInput } from './lulo-works.schemas'

export const WD = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP })
export type Contract = typeof luloContracts.$inferSelect
export type ContractItem = typeof luloContractItems.$inferSelect
export type WorkRecord = typeof luloWorkRecords.$inferSelect
export type WorkContext = { contract: Contract; items: ContractItem[]; records: WorkRecord[] }
export const accepted = (r: WorkRecord) => r.status === 'APPROVED' || r.status === 'ISSUED'
export const unitCode = (v: string) => v.toUpperCase().replaceAll('²', '2').replaceAll('³', '3').replaceAll('^', '').replace(/\s/g, '')
export const moneyOf = (ctx: WorkContext, n: Decimal.Value) => new WD(n).toFixed(ctx.contract.input.precision)
export const qty = (n: Decimal.Value) => new WD(n).toFixed(8)
export const issueDate = (p: WorkRecordInput) => 'date' in p ? p.date : 'endDate' in p ? p.endDate : p.kind === 'CLOSURE' ? p.cutoff : '9999-12-31'
export function assertWork(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
export function stableItemId(recordId: string, index: number) { const s = luloHash([recordId, index]); return `${s.slice(0, 8)}-${s.slice(8, 12)}-7${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}` }
export function contractItem(ctx: WorkContext, id: string) { const item = ctx.items.find(i => i.id === id); assertWork(item, 'La partida no pertenece a este contrato'); return item }
export function sourceRecord(ctx: WorkContext, id: string, kind: WorkRecordInput['kind']) { const r = ctx.records.find(r => r.id === id && r.kind === kind); assertWork(r, 'El documento fuente no pertenece al contrato'); return r }
export function withinContract(ctx: WorkContext, date: string) { assertWork(date >= ctx.contract.input.startDate && date <= ctx.contract.input.endDate, 'La fecha está fuera del plazo contractual') }
export function administrativeDate(ctx: WorkContext, date: string) { assertWork(date >= ctx.contract.input.startDate, 'La fecha administrativa es anterior al inicio contractual') }
export function itemTerms(ctx: WorkContext, id: string, date: string) {
  const item = contractItem(ctx, id); let quantity = new WD(item.quantity), price = new WD(item.price)
  const changes = ctx.records.filter(r => accepted(r) && r.payload.kind === 'CHANGE' && r.payload.date <= date).sort((a, b) => issueDate(a.payload).localeCompare(issueDate(b.payload)) || a.createdAt.getTime() - b.createdAt.getTime())
  for (const change of changes) if (change.payload.kind === 'CHANGE') for (const [index, l] of change.payload.lines.entries()) if ((l.type === 'NEW' ? stableItemId(change.id, index) : l.itemId) === id) {
    if (l.type === 'NEW' || l.type === 'INCREASE') quantity = quantity.plus(l.quantity)
    if (l.type === 'DECREASE') quantity = quantity.minus(l.quantity)
    if (l.type === 'PRICE' || l.type === 'NEW') price = new WD(l.price!)
  }
  return { item, quantity: qty(quantity), price: qty(price) }
}
export function valuedQuantity(ctx: WorkContext, id: string, cutoff = '9999-12-31') {
  return ctx.records.filter(r => r.status === 'ISSUED' && r.payload.kind === 'VALUATION' && r.payload.endDate <= cutoff).reduce((sum, r) => sum.plus(((r.result.lines ?? []) as { itemId: string; current: string }[]).filter(l => l.itemId === id).reduce((s, l) => s.plus(l.current), new WD(0))), new WD(0))
}
export function computationResult(p: Extract<WorkRecordInput, { kind: 'COMPUTATION' }>) {
  const rows = p.rows.map(r => {
    const dimension = { COUNT: 0, LENGTH: 1, AREA: 2, VOLUME: 3 }[r.formula], expected = ['UND', 'M', 'M2', 'M3'][dimension]
    assertWork(r.targetUnit === expected, 'La unidad de resultado no coincide con la fórmula geométrica')
    const ratio = new WD({ M: '1', CM: '0.01', MM: '0.001' }[r.lengthUnit])
    let value = new WD(r.count).mul(r.factor)
    if (dimension > 0) value = value.mul(r.length).mul(ratio)
    if (dimension > 1) value = value.mul(r.width).mul(ratio)
    if (dimension > 2) value = value.mul(r.height).mul(ratio)
    return { ...r, quantity: qty(value) }
  })
  assertWork(new Set(rows.map(r => r.targetUnit)).size === 1, 'No sumes unidades de dimensiones diferentes')
  return { rows, unit: rows[0].targetUnit, quantity: qty(rows.reduce((s, r) => s.plus(r.quantity), new WD(0))) }
}
export function changeResult(ctx: WorkContext, r: WorkRecord) {
  assertWork(r.payload.kind === 'CHANGE', 'Se esperaba una orden de cambio'); const p = r.payload; administrativeDate(ctx, p.date)
  const issued = ctx.records.filter(v => v.status === 'ISSUED' && v.payload.kind === 'VALUATION')
  assertWork(!issued.some(v => issueDate(v.payload) >= p.date), 'La vigencia afecta un período emitido; registra un ajuste posterior')
  const byId = new Map<string, Decimal>(); const appliedLines = p.lines.map((l, index) => {
    const id = l.type === 'NEW' ? stableItemId(r.id, index) : l.itemId; assertWork(id, 'Selecciona la partida contractual')
    if (l.type === 'NEW') { assertWork(l.code && l.name && l.unit && l.price !== null && new WD(l.quantity).gt(0), 'Completa código, alcance, unidad, cantidad y precio de la nueva partida'); assertWork(!ctx.items.some(i => i.code === l.code && i.id !== id), 'El código de partida contractual ya existe') }
    else { contractItem(ctx, id); if (l.type === 'PRICE') assertWork(l.price !== null, 'Falta el precio acordado'); else assertWork(new WD(l.quantity).gt(0), 'La cantidad del cambio debe ser positiva') }
    const original = l.type === 'NEW' ? new WD(0) : new WD(itemTerms(ctx, id, p.date).quantity)
    const before = byId.get(id) ?? original; const after = l.type === 'PRICE' ? before : l.type === 'DECREASE' ? before.minus(l.quantity) : before.plus(l.quantity)
    assertWork(after.gte(0) && after.gte(valuedQuantity(ctx, id)), 'La disminución deja la cantidad contractual por debajo de lo ya valuado')
    byId.set(id, after)
    if (l.computationId) { const c = sourceRecord(ctx, l.computationId, 'COMPUTATION'); assertWork(accepted(c) && new WD(String(c.result.quantity)).eq(l.quantity), 'El cómputo debe estar aprobado y coincidir con la cantidad del cambio') }
    return { ...l, itemId: id, previousQuantity: qty(before), quantityAfter: qty(after) }
  })
  return { appliedLines, effectiveDate: p.date }
}
export function measurementResult(ctx: WorkContext, r: WorkRecord) {
  assertWork(r.payload.kind === 'MEASUREMENT', 'Se esperaba una medición'); const p = r.payload; if (p.correctionOf) administrativeDate(ctx, p.date); else withinContract(ctx, p.date)
  const terms = itemTerms(ctx, p.itemId, p.date); assertWork(new WD(terms.quantity).gt(0), 'La partida no está vigente en la fecha de ejecución')
  assertWork(unitCode(p.unit) === unitCode(terms.item.unit), 'La unidad medida no coincide con la unidad contractual')
  assertWork(p.evidence.length > 0, 'La medición requiere evidencia')
  if (p.computationId) { const c = sourceRecord(ctx, p.computationId, 'COMPUTATION'); assertWork(accepted(c) && c.payload.kind === 'COMPUTATION' && c.payload.itemId === p.itemId && new WD(String(c.result.quantity)).eq(p.quantity), 'El cómputo aprobado no coincide con la medición') }
  if (p.correctionOf) {
    const prior = sourceRecord(ctx, p.correctionOf, 'MEASUREMENT'); assertWork(accepted(prior) && prior.payload.kind === 'MEASUREMENT' && prior.payload.itemId === p.itemId && p.date > prior.payload.date && p.correctionReason.length >= 8, 'La corrección exige una medición aprobada de la misma partida, fecha posterior y motivo')
    if (new WD(p.quantity).lt(0)) { const priorCorrections = ctx.records.filter(m => m.id !== r.id && accepted(m) && m.payload.kind === 'MEASUREMENT' && m.payload.correctionOf === prior.id).reduce((s, m) => s.plus((m.payload as typeof p).quantity), new WD(0)); assertWork(new WD(prior.payload.quantity).plus(priorCorrections).plus(p.quantity).gte(0), 'La corrección excede la cantidad de la medición original') }
  } else assertWork(new WD(p.quantity).gt(0), 'Una cantidad negativa requiere identificar la medición corregida')
  const measured = ctx.records.filter(m => m.id !== r.id && accepted(m) && m.payload.kind === 'MEASUREMENT' && m.payload.itemId === p.itemId).reduce((s, m) => s.plus((m.payload as typeof p).quantity), new WD(p.quantity))
  assertWork(measured.gte(0) && measured.lte(terms.quantity), 'La medición acumulada excede el contrato vigente o resulta negativa')
  return { itemId: p.itemId, quantity: p.quantity, measuredTotal: qty(measured), unit: terms.item.unit, priceAtExecution: terms.price, correctionOf: p.correctionOf }
}
export function valuationResult(ctx: WorkContext, r: WorkRecord) {
  assertWork(r.payload.kind === 'VALUATION', 'Se esperaba una valuación'); const p = r.payload; administrativeDate(ctx, p.startDate); administrativeDate(ctx, p.endDate)
  const previous = ctx.records.filter(v => v.id !== r.id && v.status === 'ISSUED' && v.payload.kind === 'VALUATION')
  assertWork(!previous.some(v => issueDate(v.payload) >= p.startDate), 'El período se superpone o precede a una valuación emitida')
  assertWork(new Set(p.allocations.map(a => a.measurementId)).size === p.allocations.length, 'No repitas una medición en la valuación')
  if (p.correctionOf) { const original = sourceRecord(ctx, p.correctionOf, 'VALUATION'); assertWork(original.status === 'ISSUED' && p.reason.length >= 8, 'La corrección debe referenciar una valuación emitida y un motivo') }
  const rows = p.allocations.map(a => {
    const m = sourceRecord(ctx, a.measurementId, 'MEASUREMENT'); assertWork(accepted(m) && m.payload.kind === 'MEASUREMENT', 'Selecciona mediciones aprobadas')
    assertWork((m.payload.date >= p.startDate || p.carryForward === true) && m.payload.date <= p.endDate, 'La medición no pertenece al período; habilita el arrastre si corresponde a un saldo anterior')
    const consumed = previous.reduce((s, v) => s.plus(((v.result.allocations ?? []) as { measurementId: string; quantity: string }[]).filter(x => x.measurementId === m.id).reduce((n, x) => n.plus(x.quantity), new WD(0))), new WD(0))
    const available = new WD(m.payload.quantity).minus(consumed), requested = new WD(a.quantity)
    assertWork(requested.isPositive() === available.isPositive() && requested.abs().lte(available.abs()), 'La medición ya fue asignada o no tiene cantidad suficiente')
    const terms = itemTerms(ctx, m.payload.itemId, m.payload.date)
    const origin = m.payload.correctionOf ? sourceRecord(ctx, m.payload.correctionOf, 'MEASUREMENT') : null
    const price = origin ? String(origin.result.priceAtExecution) : terms.price
    return { measurementId: m.id, itemId: m.payload.itemId, quantity: qty(requested), date: m.payload.date, price, taxable: terms.item.taxable, amount: moneyOf(ctx, requested.mul(price)) }
  })
  const reversing = rows.some(row => new WD(row.quantity).lt(0))
  if (reversing) {
    assertWork(p.correctionOf, 'Una valuación de reversión debe identificar la valuación emitida que corrige')
    assertWork(rows.every(row => new WD(row.quantity).lt(0)), 'Registra las reversiones y los nuevos avances en documentos separados')
    const origin = sourceRecord(ctx, p.correctionOf, 'VALUATION')
    const sourceIds = new Set(((origin.result.allocations ?? []) as { measurementId: string }[]).map(a => a.measurementId))
    for (const a of rows) { const m = sourceRecord(ctx, a.measurementId, 'MEASUREMENT'); assertWork(m.payload.kind === 'MEASUREMENT' && m.payload.correctionOf && sourceIds.has(m.payload.correctionOf), 'La medición corregida no corresponde a la valuación de origen') }
  }
  const lines = [...new Set(rows.map(a => a.itemId))].map(id => {
    const terms = itemTerms(ctx, id, p.endDate), before = valuedQuantity(ctx, id), now = rows.filter(a => a.itemId === id).reduce((s, a) => s.plus(a.quantity), new WD(0)), accumulated = before.plus(now)
    assertWork(accumulated.gte(0) && accumulated.lte(terms.quantity), 'La cantidad valuada excede el saldo contractual')
    return { itemId: id, code: terms.item.code, name: terms.item.name, unit: terms.item.unit, contracted: terms.quantity, previous: qty(before), current: qty(now), accumulated: qty(accumulated), remaining: qty(new WD(terms.quantity).minus(accumulated)), amount: moneyOf(ctx, rows.filter(a => a.itemId === id).reduce((s, a) => s.plus(a.amount), new WD(0))) }
  })
  const gross = rows.reduce((s, a) => s.plus(a.amount), new WD(0)), taxableBase = rows.filter(a => a.taxable).reduce((s, a) => s.plus(a.amount), new WD(0)), tax = new WD(moneyOf(ctx, taxableBase.mul(ctx.contract.input.taxPct).div(100)))
  const balance = balanceResult(ctx, p.endDate)
  const original = p.correctionOf ? sourceRecord(ctx, p.correctionOf, 'VALUATION') : null
  const amortization = reversing && original && !new WD(String(original.result.gross)).isZero() ? WD.min(new WD(balance.amortization), new WD(String(original.result.amortization)).mul(gross.abs()).div(String(original.result.gross))).negated() : WD.min(WD.max(0, new WD(balance.advanceBalance)), WD.max(0, gross.mul(ctx.contract.input.amortizationPct).div(100)))
  const retention = gross.mul(ctx.contract.input.retentionPct).div(100)
  assertWork(new WD(balance.retentionBalance).plus(retention).gte(0), 'La reversión afecta una retención ya liberada; regulariza el saldo antes de emitir')
  return { allocations: rows, lines, gross: moneyOf(ctx, gross), taxableBase: moneyOf(ctx, taxableBase), tax: moneyOf(ctx, tax), amortization: moneyOf(ctx, amortization), retention: moneyOf(ctx, retention), net: moneyOf(ctx, gross.plus(tax).minus(moneyOf(ctx, amortization)).minus(moneyOf(ctx, retention))), profile: ctx.contract.input }
}
export function scheduleResult(ctx: WorkContext, p: Extract<WorkRecordInput, { kind: 'SCHEDULE' }>) {
  const byId = new Map(p.activities.map(a => [a.id, a])); assertWork(byId.size === p.activities.length, 'No repitas identificadores de actividad')
  const visited = new Set<string>(), path = new Set<string>()
  function visit(id: string) { assertWork(!path.has(id), 'Las dependencias del cronograma contienen un ciclo'); if (visited.has(id)) return; const a = byId.get(id); assertWork(a, 'La actividad predecesora no existe'); path.add(id); for (const pred of a.predecessors) { visit(pred); assertWork(byId.get(pred)!.endDate <= a.startDate, 'Una actividad comienza antes de terminar su predecesora') }; path.delete(id); visited.add(id) }
  for (const a of p.activities) { contractItem(ctx, a.itemId); withinContract(ctx, a.startDate); withinContract(ctx, a.endDate); assertWork(a.endDate >= a.startDate, 'La actividad termina antes de comenzar'); visit(a.id) }
  const sum = p.activities.reduce((s, a) => s.plus(a.weight), new WD(0)); assertWork(sum.eq(100), 'Los pesos del cronograma deben sumar 100')
  return { activities: p.activities, weightTotal: '100', previousPlanId: ctx.records.filter(r => accepted(r) && r.kind === 'SCHEDULE').at(-1)?.id ?? null }
}
export function balanceResult(ctx: WorkContext, cutoff: string) {
  const docs = ctx.records.filter(r => accepted(r) && issueDate(r.payload) <= cutoff)
  const sum = (kind: string, field: string) => docs.filter(r => r.kind === kind).reduce((s, r) => s.plus(String(r.result[field] ?? '0')), new WD(0))
  const movement = (type: string) => docs.filter(r => r.payload.kind === 'BALANCE' && r.payload.type === type).reduce((s, r) => s.plus((r.payload as Extract<WorkRecordInput, { kind: 'BALANCE' }>).amount), new WD(0))
  const advances = movement('ADVANCE'), returns = movement('ADVANCE_RETURN'), amortized = sum('VALUATION', 'amortization').plus(sum('RECONSIDERATION', 'amortization')), retained = sum('VALUATION', 'retention').plus(sum('RECONSIDERATION', 'retention')), released = movement('RETENTION_RELEASE'), payments = movement('PAYMENT')
  const adjustments = sum('RECONSIDERATION', 'difference'), gross = sum('VALUATION', 'gross'), netAdjustments = docs.filter(r => r.kind === 'RECONSIDERATION').reduce((s, r) => s.plus(String(r.result.net ?? r.result.difference ?? '0')), new WD(0)), net = sum('VALUATION', 'net').plus(netAdjustments)
  return { gross: moneyOf(ctx, gross), tax: moneyOf(ctx, sum('VALUATION', 'tax').plus(sum('RECONSIDERATION', 'tax'))), amortization: moneyOf(ctx, amortized), retention: moneyOf(ctx, retained), adjustments: moneyOf(ctx, adjustments), net: moneyOf(ctx, net), advances: moneyOf(ctx, advances), advanceReturns: moneyOf(ctx, returns), advanceBalance: moneyOf(ctx, advances.minus(returns).minus(amortized)), retentionReleased: moneyOf(ctx, released), retentionBalance: moneyOf(ctx, retained.minus(released)), payments: moneyOf(ctx, payments), paymentBalance: moneyOf(ctx, net.minus(payments)) }
}
export function reconsiderationResult(ctx: WorkContext, r: WorkRecord) {
  assertWork(r.payload.kind === 'RECONSIDERATION', 'Se esperaba una reconsideración'); const p = r.payload; administrativeDate(ctx, p.date)
  const valuation = sourceRecord(ctx, p.valuationId, 'VALUATION'), profile = sourceRecord(ctx, p.profileId, 'PROFILE'); assertWork(valuation.status === 'ISSUED' && accepted(profile) && profile.payload.kind === 'PROFILE', 'La valuación debe estar emitida y el perfil aprobado')
  const rule = profile.payload; assertWork(rule.date <= issueDate(valuation.payload) && p.date >= issueDate(valuation.payload), 'El perfil o la fecha de reconsideración no corresponde a la valuación')
  assertWork(p.itemIds.every(id => rule.eligibleItemIds.includes(id)) && new Set(p.itemIds).size === p.itemIds.length, 'Hay partidas fuera del alcance aprobado')
  const terms = rule.terms.map(t => {
    const indices = ctx.records.filter(i => accepted(i) && i.payload.kind === 'INDEX' && i.payload.series === t.series)
    const resolve = (date: string) => indices.filter(i => i.payload.kind === 'INDEX' && i.payload.date.slice(0, 7) === date.slice(0, 7) && i.payload.date <= date).sort((a, b) => issueDate(b.payload).localeCompare(issueDate(a.payload)) || b.createdAt.getTime() - a.createdAt.getTime())[0]
    const base = resolve(rule.baseDate), current = resolve(issueDate(valuation.payload)); assertWork(base && current && base.payload.kind === 'INDEX' && current.payload.kind === 'INDEX', `Falta un índice publicado de ${t.series}`)
    return { ...t, baseId: base.id, currentId: current.id, base: base.payload.value, current: current.payload.value, contribution: new WD(t.coefficient).mul(current.payload.value).div(base.payload.value).toFixed(16) }
  })
  const factor = terms.reduce((s, t) => s.plus(t.contribution), new WD(rule.fixed)), eligible = ((valuation.result.lines ?? []) as { itemId: string; amount: string }[]).filter(l => p.itemIds.includes(l.itemId))
  assertWork(eligible.length === p.itemIds.length, 'La valuación no contiene todas las partidas seleccionadas')
  const duplicates = ctx.records.filter(a => a.id !== r.id && a.status === 'ISSUED' && a.payload.kind === 'RECONSIDERATION' && a.payload.valuationId === p.valuationId && a.payload.itemIds.some(id => p.itemIds.includes(id)))
  let prior = new WD(0), priorTax = new WD(0), priorRetention = new WD(0), priorAmortization = new WD(0)
  if (p.correctionOf) { const original = sourceRecord(ctx, p.correctionOf, 'RECONSIDERATION'); assertWork(original.status === 'ISSUED' && original.payload.kind === 'RECONSIDERATION' && original.payload.valuationId === p.valuationId && [...original.payload.itemIds].sort().join() === [...p.itemIds].sort().join(), 'La corrección debe conservar valuación y alcance'); assertWork(!duplicates.some(a => a.id !== original.id && a.payload.kind === 'RECONSIDERATION' && a.payload.correctionOf === original.id), 'El ajuste original ya tiene una corrección emitida'); let cursor: WorkRecord | undefined = original; const visited = new Set<string>(); while (cursor && !visited.has(cursor.id)) { visited.add(cursor.id); prior = prior.plus(String(cursor.result.difference)); priorTax = priorTax.plus(String(cursor.result.tax ?? '0')); priorRetention = priorRetention.plus(String(cursor.result.retention ?? '0')); priorAmortization = priorAmortization.plus(String(cursor.result.amortization ?? '0')); cursor = cursor.payload.kind === 'RECONSIDERATION' && cursor.payload.correctionOf ? ctx.records.find(a => a.id === (cursor!.payload as typeof p).correctionOf) : undefined } }
  else assertWork(!duplicates.length, 'Ya se aplicó una reconsideración sobre este alcance; crea una corrección vinculada')
  const base = eligible.reduce((s, l) => s.plus(l.amount), new WD(0)), totalDifference = new WD(moneyOf(ctx, base.mul(factor.minus(1)))), difference = totalDifference.minus(prior)
  assertWork(rule.allowNegative || difference.gte(0), 'El perfil contractual no permite diferencias negativas')
  const balances = balanceResult(ctx, p.date), taxableBase = eligible.filter(l => contractItem(ctx, l.itemId).taxable).reduce((s, l) => s.plus(l.amount), new WD(0))
  const tax = new WD(moneyOf(ctx, rule.taxAdjustment ? taxableBase.mul(factor.minus(1)).mul(ctx.contract.input.taxPct).div(100) : 0)).minus(priorTax)
  const retention = new WD(moneyOf(ctx, rule.retentionAdjustment ? totalDifference.mul(ctx.contract.input.retentionPct).div(100) : 0)).minus(priorRetention)
  const requestedAmortization = new WD(moneyOf(ctx, rule.amortizationAdjustment ? totalDifference.mul(ctx.contract.input.amortizationPct).div(100) : 0)).minus(priorAmortization)
  const amortization = requestedAmortization.gte(0) ? WD.min(WD.max(0, balances.advanceBalance), requestedAmortization) : WD.min(WD.max(0, balances.amortization), requestedAmortization.abs()).negated()
  assertWork(new WD(balances.retentionBalance).plus(retention).gte(0), 'El ajuste afecta retenciones ya liberadas; regulariza el saldo')
  const net = difference.plus(tax).minus(retention).minus(amortization)
  assertWork(rule.allowNegative || net.gte(0), 'El perfil contractual no permite un ajuste neto negativo')
  return { valuationId: valuation.id, valuationCode: valuation.code, profileId: profile.id, formula: rule.formula, terms, fixed: rule.fixed, factor: factor.toFixed(16), eligibleBase: moneyOf(ctx, base), taxableBase: moneyOf(ctx, taxableBase), totalDifference: moneyOf(ctx, totalDifference), previousAdjustments: moneyOf(ctx, prior), difference: moneyOf(ctx, difference), tax: moneyOf(ctx, tax), retention: moneyOf(ctx, retention), amortization: moneyOf(ctx, amortization), net: moneyOf(ctx, net), items: eligible, correctionOf: p.correctionOf, concepts: { tax: !!rule.taxAdjustment, retention: !!rule.retentionAdjustment, amortization: !!rule.amortizationAdjustment } }
}
export function reconciliation(ctx: WorkContext, cutoff: string) {
  administrativeDate(ctx, cutoff)
  const documents = ctx.records.filter(r => accepted(r) && issueDate(r.payload) <= cutoff && r.kind !== 'CLOSURE')
  const lines = ctx.items.map(item => {
    const terms = itemTerms(ctx, item.id, cutoff), valued = valuedQuantity(ctx, item.id, cutoff), measured = documents.filter(r => r.payload.kind === 'MEASUREMENT' && r.payload.itemId === item.id).reduce((s, r) => s.plus((r.payload as Extract<WorkRecordInput, { kind: 'MEASUREMENT' }>).quantity), new WD(0))
    return { itemId: item.id, code: item.code, name: item.name, unit: item.unit, original: item.quantity, current: terms.quantity, measured: qty(measured), valued: qty(valued), remaining: qty(new WD(terms.quantity).minus(valued)), measuredNotValued: qty(measured.minus(valued)), originalAmount: moneyOf(ctx, new WD(item.quantity).mul(item.price)), currentAmount: moneyOf(ctx, new WD(terms.quantity).mul(terms.price)) }
  })
  const balances = balanceResult(ctx, cutoff), pending = ctx.records.filter(r => !accepted(r) && !['CLOSURE', 'SCHEDULE', 'PROFILE', 'INDEX'].includes(r.kind) && issueDate(r.payload) <= cutoff).map(r => ({ id: r.id, code: r.code, kind: r.kind, status: r.status }))
  const differences = lines.flatMap(l => [!new WD(l.measuredNotValued).isZero() ? { key: `measurement:${l.itemId}`, label: `${l.code}: cantidad medida pendiente de valuar`, amount: l.measuredNotValued } : null, !new WD(l.remaining).isZero() ? { key: `remaining:${l.itemId}`, label: `${l.code}: saldo contractual de cantidad`, amount: l.remaining } : null].filter((x): x is NonNullable<typeof x> => !!x))
  for (const [key, label] of [['advanceBalance', 'Saldo de anticipo'], ['retentionBalance', 'Retenciones pendientes'], ['paymentBalance', 'Pagos pendientes de conciliación']] as const) if (!new WD(balances[key]).isZero()) differences.push({ key, label, amount: balances[key] })
  const sources = documents.map(r => ({ id: r.id, code: r.code, kind: r.kind, hash: r.contentHash, issuedAt: r.issuedAt })); const result = { cutoff, lines, balances, pending, differences, sources, originalAmount: moneyOf(ctx, lines.reduce((s, l) => s.plus(l.originalAmount), new WD(0))), currentAmount: moneyOf(ctx, lines.reduce((s, l) => s.plus(l.currentAmount), new WD(0))) }
  return { ...result, sourceHash: luloHash({ baseline: ctx.contract.baseline, ...result }) }
}
export function workRecordResult(ctx: WorkContext, r: WorkRecord): Record<string, unknown> {
  const p = r.payload
  switch (p.kind) {
    case 'COMPUTATION': { const result = computationResult(p); assertWork(unitCode(contractItem(ctx, p.itemId).unit) === result.unit, 'La unidad del cómputo no coincide con la partida'); return result }
    case 'MEASUREMENT': return measurementResult(ctx, r)
    case 'CHANGE': return changeResult(ctx, r)
    case 'VALUATION': return valuationResult(ctx, r)
    case 'SCHEDULE': return scheduleResult(ctx, p)
    case 'INDEX': {
      assertWork(p.date <= ctx.contract.input.endDate, 'El índice es posterior al fin del contrato'); assertWork(p.evidence.length, 'El índice requiere evidencia de su fuente')
      const existing = ctx.records.filter(i => i.id !== r.id && accepted(i) && i.payload.kind === 'INDEX' && i.payload.series === p.series && i.payload.date === p.date).at(-1)
      if (existing) assertWork(p.supersedes === existing.id, 'Para revisar un índice publicado debes identificar su última revisión')
      if (p.supersedes) { const old = sourceRecord(ctx, p.supersedes, 'INDEX'); assertWork(accepted(old) && old.payload.kind === 'INDEX' && old.payload.series === p.series && old.payload.date === p.date, 'La revisión debe conservar serie y período') }
      return { series: p.series, date: p.date, value: p.value, source: p.source, supersedes: p.supersedes }
    }
    case 'PROFILE': { withinContract(ctx, p.date); assertWork(new WD(p.fixed).plus(p.terms.reduce((s, t) => s.plus(t.coefficient), new WD(0))).eq(1), 'Los coeficientes y el componente fijo deben sumar 1'); assertWork(new Set(p.terms.map(t => t.series)).size === p.terms.length, 'No repitas series en la fórmula'); for (const id of p.eligibleItemIds) contractItem(ctx, id); return { ...p, formulaVersion: 'POLYNOMIAL_V1' } }
    case 'RECONSIDERATION': return reconsiderationResult(ctx, r)
    case 'BALANCE': { administrativeDate(ctx, p.date); assertWork(p.evidence.length, 'El movimiento requiere un documento de respaldo'); const b = balanceResult(ctx, p.date); if (p.type === 'ADVANCE') assertWork(new WD(b.advances).plus(p.amount).lte(ctx.contract.input.advanceAmount), 'El desembolso excede el anticipo autorizado'); if (p.type === 'ADVANCE_RETURN') assertWork(new WD(p.amount).lte(b.advanceBalance), 'La devolución excede el saldo de anticipo'); if (p.type === 'RETENTION_RELEASE') assertWork(new WD(p.amount).lte(b.retentionBalance), 'La liberación excede la retención'); if (p.type === 'PAYMENT') assertWork(new WD(p.amount).lte(b.paymentBalance), 'El pago excede el neto documentado pendiente'); return { type: p.type, date: p.date, amount: p.amount, reference: p.reference } }
    case 'CLOSURE': {
      const previous = ctx.records.filter(c => c.id !== r.id && c.kind === 'CLOSURE' && c.status === 'ISSUED').at(-1)
      if (previous) assertWork(p.correctionOf === previous.id && previous.payload.kind === 'CLOSURE' && p.cutoff >= previous.payload.cutoff, 'La rectificación debe referenciar el último cierre y conservar o ampliar el corte')
      else assertWork(!p.correctionOf, 'No existe un cierre anterior que rectificar')
      const view = reconciliation(ctx, p.cutoff); assertWork(view.sourceHash === p.sourceHash, 'Los documentos fuente cambiaron: actualiza la conciliación'); assertWork(!view.pending.length, 'Hay documentos de ejecución pendientes al corte'); for (const d of view.differences) assertWork(p.resolutions.some(x => x.key === d.key), `Debes resolver o documentar: ${d.label}`); return { ...view, resolutions: p.resolutions, annexes: p.evidence, correctionOf: p.correctionOf }
    }
  }
}
