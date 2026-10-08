import { z } from 'zod'

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_]{2,60}$/, 'Solo letras mayúsculas, números y guion bajo (2-60 caracteres)')
const name = z.string().trim().min(2).max(160)
const text = z.string().trim().max(2000)
const country = z
  .string()
  .trim()
  .length(2)
  .transform((c) => c.toUpperCase())
const url = z.url({ protocol: /^https?$/ })
const json = z.record(z.string(), z.unknown())

export const createFamilySchema = z.object({ code, name, description: text.optional(), icon: z.string().trim().max(40).optional() })
export const updateFamilySchema = z
  .object({ name, description: text.nullable(), icon: z.string().trim().max(40).nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

/** Códigos de etapas (D01…) o de redes (FUR-PTE…); se validan contra los maestros al guardar. */
const masterCodes = z.array(z.string().trim().toUpperCase().min(2).max(20)).max(40).transform((c) => [...new Set(c)])

export const createTypeSchema = z.object({ familyCode: code, code, name, description: text.optional(), stageCodes: masterCodes.optional(), networkCodes: masterCodes.optional() })
export const updateTypeSchema = z
  .object({ name, description: text.nullable(), familyCode: code, stageCodes: masterCodes, networkCodes: masterCodes })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export const createManufacturerSchema = z.object({ name, countryCode: country.optional(), website: url.optional() })
export const updateManufacturerSchema = z
  .object({ name, countryCode: country.nullable(), website: url.nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export const createModelSchema = z.object({
  typeCode: code,
  manufacturerId: z.uuid().optional(),
  modelName: z.string().trim().min(1).max(200),
  specifications: json.default({}),
  technicalData: json.default({}),
})
export const updateModelSchema = z
  .object({
    modelName: z.string().trim().min(1).max(200),
    manufacturerId: z.uuid().nullable(),
    specifications: json,
    technicalData: json,
    /** Desactivar en vez de borrar: los activos de planta siguen referenciando el modelo. */
    status: z.enum(['ACTIVE', 'INACTIVE']),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export type CreateFamilyDto = z.infer<typeof createFamilySchema>
export type UpdateFamilyDto = z.infer<typeof updateFamilySchema>
export type CreateTypeDto = z.infer<typeof createTypeSchema>
export type UpdateTypeDto = z.infer<typeof updateTypeSchema>
export type CreateManufacturerDto = z.infer<typeof createManufacturerSchema>
export type UpdateManufacturerDto = z.infer<typeof updateManufacturerSchema>
export type CreateModelDto = z.infer<typeof createModelSchema>
export type UpdateModelDto = z.infer<typeof updateModelSchema>
