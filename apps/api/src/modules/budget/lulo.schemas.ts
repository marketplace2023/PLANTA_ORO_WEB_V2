import { z } from 'zod'

export const LULO_PROFILE = 'FUR_LULO_MVP_1' as const
export const luloDecimal = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,8})?$/, 'Use un decimal con punto, sin separadores de miles y hasta 8 decimales')
const positive = luloDecimal.refine(v => Number(v) > 0, 'Debe ser mayor que cero')
const pct = luloDecimal.refine(v => Number(v) <= 100, 'El porcentaje debe estar entre 0 y 100')
const text = (max: number) => z.string().trim().max(max).refine(v => !v.includes('\ufffd'), 'El texto contiene caracteres dañados')
export const luloInputSchema = z.object({
  title: text(200).min(1), project: text(200), client: text(200), notes: text(2000),
  publicationId: z.uuid().nullable(), currency: z.string().regex(/^[A-Z]{3}$/), precision: z.number().int().min(0).max(4).default(2),
  referenceMode: z.boolean().optional(),
  workId: z.uuid().nullable().optional(), priceListId: z.uuid().nullable().optional(), baseDate: z.iso.date().optional(),
  priceListSnapshot: z.object({ id: z.uuid(), name: text(200), currency: text(3), revision: z.number().int().positive() }).strict().optional(),
  workSnapshot: z.object({ id: z.uuid(), code: text(80), name: text(200), location: text(500), contractReference: text(200), clientId: z.uuid(), clientName: text(200), taxId: text(80), address: text(500), contact: text(300) }).strict().optional(),
  rates: z.object({ fcasPct: pct, overheadPct: pct, utilityPct: pct, financePct: pct, taxPct: pct }).strict(),
  chapters: z.array(z.object({ id: text(80).min(1), name: text(200).min(1), parentId: text(80).nullable() }).strict()).min(1).max(100),
  lines: z.array(z.object({
    id: text(80).min(1), chapterId: text(80).min(1), mode: z.enum(['CALCULATED', 'MANUAL', 'ASSUMED']),
    apuId: z.uuid().nullable(), code: text(100).min(1), description: text(2000).min(1), unit: text(30).min(1),
    sourceMasterId: z.uuid().optional(),
    assetId: z.uuid().nullable().optional(), computationId: z.uuid().optional(), pendingReason: text(1000).optional(),
    assetSnapshot: z.object({ id: z.uuid(), tag: text(60), name: text(200), stageCode: text(20).nullable(), networkCodes: z.array(text(30)) }).strict().optional(),
    quantity: positive, manualPrice: luloDecimal.nullable(), reason: text(1000), taxable: z.boolean(),
  }).strict()).min(1, 'Agregue al menos una partida').max(200),
  overrides: z.array(z.object({ resourceId: z.uuid(), amount: luloDecimal, baseDate: z.iso.date(), validUntil: z.iso.date(), reason: text(1000).min(8) }).strict()).max(1000),
}).strict().superRefine((v, ctx) => {
  const error = (message: string) => ctx.addIssue({ code: 'custom', message })
  const chapters = new Map(v.chapters.map(c => [c.id, c]))
  if (chapters.size !== v.chapters.length || new Set(v.lines.map(l => l.id)).size !== v.lines.length) error('No repita identificadores de capítulos o partidas')
  if (new Set(v.overrides.map(o => o.resourceId)).size !== v.overrides.length) error('No repita ajustes de un insumo')
  for (const c of v.chapters) {
    const visited = new Set([c.id]); let parent = c.parentId
    while (parent) { if (visited.has(parent) || !chapters.has(parent) || visited.size >= 5) { error('La jerarquía de capítulos es inválida o excede cuatro niveles'); break }; visited.add(parent); parent = chapters.get(parent)!.parentId }
  }
  for (const l of v.lines) {
    if (!chapters.has(l.chapterId)) error(`La partida ${l.code} no tiene un capítulo válido`)
    if (l.pendingReason?.trim()) continue
    if (l.mode !== 'MANUAL' && (!l.apuId || !v.publicationId)) error(`Seleccione un APU del catálogo para ${l.code}`)
    if (l.mode === 'MANUAL' && l.apuId) error(`La partida manual ${l.code} no debe contener APU`)
    if (l.mode === 'CALCULATED' && l.manualPrice !== null) error(`La partida calculada ${l.code} no admite un precio manual`)
    if (l.mode !== 'CALCULATED' && (l.manualPrice === null || l.reason.length < 8)) error(`Indique el precio y el motivo de ${l.code}`)
  }
  for (const o of v.overrides) if (o.validUntil < o.baseDate) error('La vigencia de un ajuste no puede terminar antes de su fecha base')
})
export type LuloInput = z.infer<typeof luloInputSchema>
export const luloSaveSchema = z.object({ expectedRevision: z.number().int().min(1), reason: text(1000).min(8), input: luloInputSchema }).strict()
export const luloAdoptSchema = z.object({ requestId: z.uuid(), input: luloInputSchema }).strict()
export const luloActionSchema = z.object({ expectedRevision: z.number().int().min(1), reason: text(1000).min(8), requestId: z.uuid().optional() }).strict()
export const luloRefreshSchema = luloActionSchema.extend({ publicationId: z.uuid(), apuIds: z.array(z.uuid()).min(1).max(200), previewHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), resourceTypes: z.array(z.enum(['MATERIAL', 'EQUIPMENT', 'LABOR'])).min(1).optional(), replaceStructure: z.boolean().optional() })
export const luloPublicationSchema = z.object({ expectedHash: z.string().regex(/^[a-f0-9]{64}$/), label: text(160).min(3), reason: text(1000).min(8) }).strict()
export const luloListSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), search: text(120).optional() })
export const luloReportSchema = z.object({ kind: z.enum(['budget', 'chapters', 'apus', 'resources']).default('budget'), format: z.enum(['pdf', 'xlsx']).default('pdf') })
