import { z } from 'zod'

const decimal = z.string().trim().regex(/^(0|[1-9]\d{0,11})(\.\d{1,8})?$/, 'Use un decimal positivo, con punto y hasta 8 decimales')
const text = (max: number) => z.string().trim().max(max)
const cleanText = (max: number) => text(max).refine(v => !v.includes('\ufffd'), 'Corrija los caracteres dañados')
export const catalogPriceSchema = z.object({
  amount: decimal,
  currency: z.string().trim().regex(/^[A-Z]{3}$/, 'Use un código de moneda de tres letras mayúsculas'),
  denomination: cleanText(120).min(3, 'Indique la denominación monetaria'),
  baseDate: z.iso.date(),
  validUntil: z.iso.date(),
  costBasis: z.enum(['UNIT', 'HOUR', 'DAY']),
  evidence: cleanText(1000).min(8, 'Indique la fuente de verificación del precio'),
}).strict().refine(v => v.validUntil >= v.baseDate, 'La vigencia no puede terminar antes de la fecha base')
export const catalogComponentSchema = z.object({
  resourceType: z.enum(['MATERIAL', 'EQUIPMENT', 'LABOR']),
  resourceSourceId: text(200).min(1),
  code: text(100),
  quantity: decimal,
  wastePct: decimal.nullable(),
  sourceDepreciation: decimal.nullable(),
}).strict()
export const catalogDraftSchema = z.object({
  name: cleanText(2000),
  unit: cleanText(30).nullable(),
  familySourceId: text(200).nullable(),
  price: catalogPriceSchema.nullable(),
  yieldValue: decimal.nullable(),
  yieldBasis: z.enum(['ITEM', 'HOUR', 'DAY']).nullable(),
  hoursPerDay: decimal.nullable(),
  methodNote: cleanText(1000),
  composition: z.array(catalogComponentSchema).max(1000),
}).strict()
export const catalogActionSchema = z.object({
  expectedRevision: z.number().int().min(0),
  reason: cleanText(1000).min(8, 'Explique el motivo con al menos 8 caracteres'),
}).strict()
export const catalogEditSchema = catalogActionSchema.extend({ draft: catalogDraftSchema })
export const catalogReleaseSchema = z.object({
  name: cleanText(160).min(3),
  reason: cleanText(1000).min(8),
  entryIds: z.array(z.uuid()).min(1).max(200).refine(ids => new Set(ids).size === ids.length, 'No repita registros'),
}).strict()
export const catalogPublishSchema = z.object({
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: cleanText(1000).min(8),
}).strict()
export type CatalogDraft = z.infer<typeof catalogDraftSchema>
export type CatalogEdit = z.infer<typeof catalogEditSchema>
export type CatalogAction = z.infer<typeof catalogActionSchema>
export type CatalogReleaseInput = z.infer<typeof catalogReleaseSchema>
export type CatalogPublishInput = z.infer<typeof catalogPublishSchema>
export type CatalogSource = {
  id: string; batchId: string; kind: string; resourceType: string; sourceId: string;
  code: string; name: string; unit: string | null; sourceContext: string; data: Record<string, unknown>;
}
export type CatalogNode = {
  source: CatalogSource;
  revision: number;
  state: string;
  draft: CatalogDraft;
  dependencies: Record<string, number>;
}
export type CatalogReference = { kind: string; resourceType: string; sourceId: string }
export const referenceKey = (r: CatalogReference) => JSON.stringify([r.kind, r.resourceType, r.sourceId])
const nullableString = (v: unknown) => v == null ? null : String(v)

/** An initial draft never treats a recovered historical price as verified. */
export function initialCatalogDraft(source: CatalogSource): CatalogDraft {
  return {
    name: source.name, unit: source.unit, familySourceId: nullableString(source.data.familySourceId),
    price: null, yieldValue: nullableString(source.data.yieldValue), yieldBasis: null, hoursPerDay: null, methodNote: '',
    composition: Array.isArray(source.data.composition) ? source.data.composition.map(c => ({
      resourceType: c.resourceType, resourceSourceId: String(c.resourceSourceId), code: String(c.code),
      quantity: String(c.quantity), wastePct: nullableString(c.sourceWastePct), sourceDepreciation: nullableString(c.sourceDepreciation),
    })) : [],
  }
}

export function catalogReferences(node: CatalogNode): CatalogReference[] {
  if (node.source.kind === 'RESOURCE') return node.draft.familySourceId
    ? [{ kind: 'FAMILY', resourceType: node.source.resourceType, sourceId: node.draft.familySourceId }] : []
  if (node.source.kind !== 'APU') return []
  return [
    ...(node.source.data.masterSourceId ? [{ kind: 'ITEM', resourceType: '', sourceId: String(node.source.data.masterSourceId) }] : []),
    ...node.draft.composition.map(c => ({ kind: 'RESOURCE', resourceType: c.resourceType, sourceId: c.resourceSourceId })),
  ]
}

/** Pure business validation. Publication re-runs this against current approved dependencies and today's date. */
export function validateCatalogNode(node: CatalogNode, graph: Map<string, CatalogNode>, today: string, visited = new Set<string>()): string[] {
  if (visited.has(node.source.id)) return ['Dependencia circular']
  const path = new Set(visited).add(node.source.id)
  const errors: string[] = []
  const { source, draft } = node
  if (!source.code.trim()) errors.push('Falta el código original')
  if (!draft.name.trim() || draft.name.includes('\ufffd')) errors.push('La descripción está vacía o dañada')
  if (source.kind !== 'FAMILY' && (!draft.unit?.trim() || draft.unit.includes('\ufffd'))) errors.push('Defina una unidad válida')
  if (source.kind === 'RESOURCE') {
    if (!draft.familySourceId) errors.push('Seleccione una familia del mismo tipo')
    const p = draft.price
    if (!p) errors.push('Falta verificar precio, moneda, denominación, fecha, vigencia y base de costo')
    else {
      const parsed = catalogPriceSchema.safeParse(p)
      if (!parsed.success) errors.push('Los metadatos del precio no son válidos')
      if (Number(p.amount) <= 0) errors.push('El precio validado debe ser mayor que cero')
      if (p.baseDate > today) errors.push('La fecha base no puede estar en el futuro')
      if (p.validUntil < today) errors.push('El precio ha vencido; verifique su vigencia')
      if (source.resourceType === 'MATERIAL' && p.costBasis !== 'UNIT') errors.push('Los materiales se valoran por su unidad')
      if (source.resourceType !== 'MATERIAL' && p.costBasis === 'UNIT') errors.push('Confirme una tarifa por hora o por día; no use el costo de adquisición')
      if (p.costBasis === 'HOUR' && draft.unit !== 'H') errors.push('La tarifa por hora debe usar la unidad H')
      if (p.costBasis === 'DAY' && draft.unit !== 'DIA') errors.push('La tarifa por día debe usar la unidad DIA')
    }
  } else if (draft.price) errors.push('Los precios verificados se definen en los insumos, no en esta clase de maestro')
  if (source.kind === 'ITEM' || source.kind === 'APU') {
    if (!draft.yieldValue || !decimal.safeParse(draft.yieldValue).success || Number(draft.yieldValue) <= 0) errors.push('El rendimiento debe ser mayor que cero')
  }
  if (source.kind === 'APU') {
    if (!draft.yieldBasis || draft.methodNote.trim().length < 8) errors.push('Documente la base del rendimiento y el criterio de composición')
    if (draft.yieldBasis === 'DAY' && (!draft.hoursPerDay || Number(draft.hoursPerDay) <= 0 || Number(draft.hoursPerDay) > 24)) errors.push('Defina las horas de jornada entre 0 y 24')
    if (!source.data.masterSourceId) errors.push('Falta la partida maestra de origen')
    if (!draft.composition.length) errors.push('El APU necesita al menos un insumo')
    for (const [i, c] of draft.composition.entries()) {
      if (!decimal.safeParse(c.quantity).success || Number(c.quantity) <= 0) errors.push(`Renglón ${i + 1}: cantidad no positiva o inválida`)
      if (c.wastePct !== null && (!decimal.safeParse(c.wastePct).success || Number(c.wastePct) > 100)) errors.push(`Renglón ${i + 1}: desperdicio fuera de 0–100`)
      if (c.sourceDepreciation !== null && (!decimal.safeParse(c.sourceDepreciation).success || Number(c.sourceDepreciation) > 1)) errors.push(`Renglón ${i + 1}: depreciación fuera de 0–1`)
      const dependency = graph.get(referenceKey({ kind: 'RESOURCE', resourceType: c.resourceType, sourceId: c.resourceSourceId }))
      if (dependency && dependency.source.code !== c.code) errors.push(`Renglón ${i + 1}: código y referencia del insumo no coinciden`)
    }
  } else if (draft.composition.length) errors.push('Solo un APU puede tener una composición')
  for (const ref of catalogReferences(node)) {
    const dep = graph.get(referenceKey(ref))
    if (!dep) { errors.push(`Referencia inexistente o incompatible: ${ref.sourceId}`); continue }
    if (dep.state !== 'APPROVED') errors.push(`Debe aprobar ${dep.source.code} (${dep.source.kind})`)
    else {
      if (validateCatalogNode(dep, graph, today, path).length) errors.push(`La dependencia ${dep.source.code} requiere revisión`)
      if (node.state === 'APPROVED' && node.dependencies[dep.source.id] !== dep.revision) errors.push(`Cambió ${dep.source.code} después de la aprobación`)
    }
    if (source.kind === 'APU' && ref.kind === 'ITEM' && dep.draft.unit !== draft.unit) errors.push('La unidad del APU debe coincidir con la partida maestra')
  }
  return [...new Set(errors)]
}
