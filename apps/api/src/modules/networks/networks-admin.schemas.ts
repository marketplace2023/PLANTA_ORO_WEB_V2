import { z } from 'zod'

/** Mismo formato que ya exige el resto de la API para referirse a una red (`FUR-IOT`). */
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^FUR-[A-Z]{2,16}$/, 'Formato FUR- seguido de 2 a 16 letras mayúsculas (p. ej. FUR-AGUA)')
const name = z.string().trim().min(2).max(120)
const description = z.string().trim().max(2000)
const icon = z.string().trim().min(1).max(40)
/** Token CSS del frontend (`--network-proc`…): el color lo definen las hojas de estilo, aquí solo se valida el formato. */
const colorToken = z.string().trim().regex(/^network-[a-z]{2,16}$/, 'Token de color inválido (p. ej. network-iot)')

export const createNetworkSchema = z.object({ code, name, description: description.optional(), icon: icon.optional(), colorToken: colorToken.optional() })

export const updateNetworkSchema = z
  .object({ name, description: description.nullable(), icon: icon.nullable(), colorToken: colorToken.nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indique al menos un campo')

export type CreateNetworkDto = z.infer<typeof createNetworkSchema>
export type UpdateNetworkDto = z.infer<typeof updateNetworkSchema>
