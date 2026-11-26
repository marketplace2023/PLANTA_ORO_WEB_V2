import { eq } from 'drizzle-orm'
import { BadRequestException } from '@nestjs/common'
import type { Database } from '../../database/database.module'
import { familySpecifications } from '../../database/schema'
import { validationError } from '../../common/errors'
import { parseVariableValue } from './variables'

export type SpecificationDefinition = typeof familySpecifications.$inferSelect
export const specificationKey = (d: Pick<SpecificationDefinition, 'label' | 'unit'>) => d.unit ? `${d.label} (${d.unit})` : d.label
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const expectedFormat: Record<SpecificationDefinition['valueType'], string> = {
  NUMBER: 'un número, por ejemplo 16 o 16,5, sin unidades, comentarios ni rangos',
  TEXT: 'un texto de entre 1 y 500 caracteres',
  BOOLEAN: 'Sí o No',
  LIST: 'una lista de 1 a 20 textos de hasta 120 caracteres cada uno, separados por punto y coma en Excel',
  RANGE: 'un rango con mínimo y/o máximo numéricos, con el mínimo menor o igual al máximo; por ejemplo 10–20, ≤ 20 o ≥ 10',
}

/** Muestra el valor original del Excel, antes de cualquier conversión fallida a número. */
const receivedValue = (raw: unknown) => {
  const text = raw === null || raw === undefined ? '(vacío)' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}

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
    try {
      result[canonical] = parseVariableValue(def.valueType, canonical, value, 'specifications')
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error
      throw validationError('specifications', `Especificación «${canonical}»: se esperaba ${expectedFormat[def.valueType]}. Valor recibido: «${receivedValue(raw)}».`)
    }
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
