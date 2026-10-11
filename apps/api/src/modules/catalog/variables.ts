import { z } from 'zod'
import { VARIABLE_TYPES, type VariableType } from '../../database/schema/catalog'
import { validationError } from '../../common/errors'

const text = (max: number) => z.string().trim().min(1).max(max)

const networkCodes = z.array(z.string().trim().toUpperCase().regex(/^FUR-[A-Z]+$/, 'Código de red inválido (p. ej. FUR-PROC)')).max(30)
const stageCodes = z.array(z.string().trim().toUpperCase().regex(/^D\d{2}$/, 'Código de etapa inválido (D01…D19)')).max(40)
const assetTypeCodes = z.array(z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,60}$/, 'Código de tipo inválido')).max(200)
const unique = <T>(list: T[]) => [...new Set(list)]

export const createVariableSchema = z.object({
  /** Opcional: si no viene se genera a partir del nombre y del alcance. */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,60}$/, 'Solo letras mayúsculas, números y guion bajo (2-60 caracteres)')
    .optional(),
  label: text(160),
  unit: text(30).optional(),
  valueType: z.enum(VARIABLE_TYPES),
  /** Alcance: listas de redes, etapas y tipos. Vacío o ausente = todas (una variable general). */
  networkCodes: networkCodes.transform(unique).default([]),
  stageCodes: stageCodes.transform(unique).default([]),
  assetTypeCodes: assetTypeCodes.transform(unique).default([]),
  /** Valor general: lo que muestran los modelos que no registraron uno propio. */
  defaultValue: z.unknown().optional(),
  group: text(120).optional(),
  isKey: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
})

export const updateVariableSchema = z
  .object({
    label: text(160),
    unit: text(30).nullable(),
    valueType: z.enum(VARIABLE_TYPES),
    networkCodes: networkCodes.transform(unique),
    stageCodes: stageCodes.transform(unique),
    assetTypeCodes: assetTypeCodes.transform(unique),
    /** null quita el valor general. */
    defaultValue: z.unknown(),
    group: text(120).nullable(),
    isKey: z.boolean(),
    sortOrder: z.number().int().min(0).max(9999),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

/** Valores por código de variable; `null` borra el valor. */
export const setModelVariablesSchema = z.object({ values: z.record(z.string().min(1).max(60), z.unknown()) })

export type CreateVariableDto = z.infer<typeof createVariableSchema>
export type UpdateVariableDto = z.infer<typeof updateVariableSchema>
export type SetModelVariablesDto = z.infer<typeof setModelVariablesSchema>

const finite = z.number().refine((n) => Number.isFinite(n), 'Debe ser un número')

const valueSchemas: Record<VariableType, z.ZodType> = {
  NUMBER: finite,
  // Rango: mínimo y/o máximo («600 – 800», «≤ 700», «≥ 50»).
  RANGE: z
    .object({ min: finite.optional(), max: finite.optional() })
    .refine((v) => v.min !== undefined || v.max !== undefined, 'Indique el mínimo, el máximo o ambos')
    .refine((v) => v.min === undefined || v.max === undefined || v.min <= v.max, 'El mínimo no puede ser mayor que el máximo'),
  TEXT: z.string().trim().min(1).max(500),
  LIST: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  BOOLEAN: z.boolean(),
}

/** Valida y normaliza un valor según el tipo de la variable; un valor inválido es un error de validación del campo. */
export function parseVariableValue(type: VariableType, code: string, raw: unknown, path = `values.${code}`): unknown {
  const parsed = valueSchemas[type].safeParse(raw)
  if (!parsed.success) throw validationError(path, parsed.error.issues[0]?.message ?? 'Valor inválido')
  return parsed.data
}

/** Texto en mayúsculas sin acentos para armar códigos: «Abertura de cribado» → ABERTURA_DE_CRIBADO. */
export function slugCode(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}
