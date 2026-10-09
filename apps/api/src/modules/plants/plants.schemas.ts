import { z } from 'zod'
import { mapPositionSchema } from '../../common/map-position'

const slug = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones')

const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}, 'Zona horaria inválida (use un identificador IANA, p. ej. America/Lima)')

const httpUrl = z.url({ protocol: /^https?$/ })
const visibility = z.enum(['PUBLIC', 'AUTHENTICATED', 'PRIVATE'])

export const createPlantSchema = z.object({
  code: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(200),
  slug: slug.optional(),
  description: z.string().trim().max(2000).optional(),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((c) => c.toUpperCase())
    .optional(),
  timezone: timezone.optional(),
  // Privada por defecto: publicar una planta debe ser una decisión explícita.
  visibility: visibility.default('PRIVATE'),
})

export const updatePlantSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).nullable(),
    countryCode: z
      .string()
      .trim()
      .length(2)
      .transform((c) => c.toUpperCase())
      .nullable(),
    timezone,
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
    visibility,
    logoUrl: httpUrl.nullable(),
    heroImageUrl: httpUrl.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export const enableStageSchema = z.object({
  stageCode: z.string().regex(/^D\d{2}$/, 'Código de etapa inválido (D01…D19)'),
  sequence: z.number().int().min(1).optional(),
  nameOverride: z.string().trim().min(1).max(200).nullable().optional(),
  isPublic: z.boolean().optional(),
})

export const updateStageSchema = z
  .object({
    sequence: z.number().int().min(1),
    nameOverride: z.string().trim().min(1).max(200).nullable(),
    isEnabled: z.boolean(),
    isPublic: z.boolean(),
    /** Posición de la etapa sobre el mapa de la planta; null la quita. */
    mapPosition: mapPositionSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export const enableNetworkSchema = z.object({
  networkCode: z.string().regex(/^FUR-[A-Z]+$/, 'Código de red inválido (p. ej. FUR-IOT)'),
  isPublic: z.boolean().optional(),
})

export const updateNetworkSchema = z
  .object({ isEnabled: z.boolean(), isPublic: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export const assignMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  roleCode: z.string().trim().min(1).max(60),
})

export const createAccessRequestSchema = z.object({
  /** UUID o slug de la planta. */
  plant: z.string().trim().min(1).max(120),
  message: z.string().trim().max(500).optional(),
})

export const approveAccessRequestSchema = z.object({
  roleCode: z.string().trim().min(1).max(60),
  note: z.string().trim().max(500).optional(),
})

export const rejectAccessRequestSchema = z.object({
  note: z.string().trim().max(500).optional(),
})

export type CreateAccessRequestDto = z.infer<typeof createAccessRequestSchema>
export type ApproveAccessRequestDto = z.infer<typeof approveAccessRequestSchema>
export type RejectAccessRequestDto = z.infer<typeof rejectAccessRequestSchema>
export type CreatePlantDto =z.infer<typeof createPlantSchema>
export type UpdatePlantDto = z.infer<typeof updatePlantSchema>
export type EnableStageDto = z.infer<typeof enableStageSchema>
export type UpdateStageDto = z.infer<typeof updateStageSchema>
export type EnableNetworkDto = z.infer<typeof enableNetworkSchema>
export type UpdateNetworkDto = z.infer<typeof updateNetworkSchema>
export type AssignMemberDto = z.infer<typeof assignMemberSchema>
