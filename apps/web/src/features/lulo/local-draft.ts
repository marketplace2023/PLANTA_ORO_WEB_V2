import { z } from 'zod'
import type { LuloInput } from './types'

export const LULO_STORAGE_KEY = 'fur.lulo.public-draft.v1'
const s = z.string()
const draft = z.object({
  referenceMode: z.boolean().optional(),
  baseDate: s.optional(),
  title: s, project: s, client: s, notes: s, publicationId: s.nullable(), currency: s, precision: z.number().int().min(0).max(4),
  rates: z.object({ fcasPct: s, overheadPct: s, utilityPct: s, financePct: s, taxPct: s }),
  chapters: z.array(z.object({ id: s, name: s, parentId: s.nullable() })).min(1).max(100),
  lines: z.array(z.object({ id: s, chapterId: s, mode: z.enum(['CALCULATED', 'MANUAL', 'ASSUMED']), apuId: s.nullable(), sourceMasterId: s.optional(), pendingReason: s.optional(), code: s, description: s, unit: s, quantity: s, manualPrice: s.nullable(), reason: s, taxable: z.boolean() })).max(200),
  overrides: z.array(z.object({ resourceId: s, amount: s, baseDate: s, validUntil: s, reason: s })).max(1000),
})
export function readLuloDraft(): LuloInput | null {
  try {
    const stored = localStorage.getItem(LULO_STORAGE_KEY)
    if (!stored || stored.length > 2_000_000) return null
    const value = JSON.parse(stored)
    const parsed = draft.safeParse(value?.schemaVersion === 1 ? value.input : null)
    return parsed.success ? parsed.data : null
  } catch { return null }
}
export function writeLuloDraft(input: LuloInput) { localStorage.setItem(LULO_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, input })) }
