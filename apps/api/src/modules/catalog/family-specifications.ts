import { eq } from 'drizzle-orm'
import type { Database } from '../../database/database.module'
import { familySpecifications } from '../../database/schema'
import { validationError } from '../../common/errors'
import { parseVariableValue } from './variables'

export type SpecificationDefinition = typeof familySpecifications.$inferSelect
export const specificationKey = (d: Pick<SpecificationDefinition, 'label' | 'unit'>) => d.unit ? `${d.label} (${d.unit})` : d.label
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Los valores anteriores fuera del maestro se conservan, pero no se admiten nombres nuevos libres. */
export function validateSpecificationValues(definitions: SpecificationDefinition[], input: Record<string, unknown>, previous?: Record<string, unknown>, fromExcel = false) {
  const result: Record<string, unknown> = Object.create(null)
  for (const [key, raw] of Object.entries(input)) {
    const def = definitions.find(d => specificationKey(d) === key || (fromExcel && d.label === key))
    if (!def) {
      if (previous && Object.hasOwn(previous, key) && same(previous[key], raw)) { result[key] = raw; continue }
      throw validationError('specifications', `«${key}» no es una especificación definida para esta familia`)
    }
    const canonical = specificationKey(def)
    if (Object.hasOwn(result, canonical)) throw validationError('specifications', `La especificación «${canonical}» está repetida`)
    if (raw === null || raw === undefined || raw === '') continue
    if (previous && same(previous[canonical], raw)) { result[canonical] = raw; continue }
    let value = raw
    if (fromExcel && typeof value === 'string') {
      if (def.valueType === 'NUMBER' && value.trim() !== '') value = Number(value.replace(',', '.'))
      else if (def.valueType === 'BOOLEAN') value = /^(sí|si|true)$/i.test(value) ? true : /^(no|false)$/i.test(value) ? false : value
      else if (def.valueType === 'LIST') value = value.split(';').map(x => x.trim()).filter(Boolean)
      else if (def.valueType === 'RANGE') {
        const text = value.trim()
        try { value = JSON.parse(text) } catch {
          const bound = text.match(/^(≤|<=|≥|>=)\s*(-?\d+(?:[.,]\d+)?)$/)
          const pair = text.match(/^(-?\d+(?:[.,]\d+)?)\s*[–—-]\s*(-?\d+(?:[.,]\d+)?)$/)
          if (bound) value = { [bound[1].startsWith('≤') || bound[1] === '<=' ? 'max' : 'min']: Number(bound[2].replace(',', '.')) }
          else if (pair) value = { min: Number(pair[1].replace(',', '.')), max: Number(pair[2].replace(',', '.')) }
        }
      }
    }
    result[canonical] = parseVariableValue(def.valueType, canonical, value, 'specifications')
  }
  for (const d of definitions) {
    const key = specificationKey(d)
    if (d.required && !Object.hasOwn(result, key) && (!previous || Object.hasOwn(previous, key))) {
      throw validationError('specifications', `La especificación «${key}» es obligatoria`)
    }
  }
  return { ...result }
}

export async function validateFamilySpecifications(db: Pick<Database, 'select'>, familyId: string, input: Record<string, unknown>, previous?: Record<string, unknown>) {
  const defs = await db.select().from(familySpecifications).where(eq(familySpecifications.familyId, familyId))
  return validateSpecificationValues(defs, input, previous)
}
