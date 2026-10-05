import { z } from 'zod'

const email = z.string().trim().toLowerCase().pipe(z.email('Correo inválido').max(320))

export const registerSchema = z.object({
  email,
  // Argon2id absorbe cualquier longitud, pero se limita para evitar abuso de CPU/memoria.
  password: z.string().min(10, 'Mínimo 10 caracteres').max(128, 'Máximo 128 caracteres'),
  firstName: z.string().trim().min(1, 'Requerido').max(100),
  lastName: z.string().trim().min(1, 'Requerido').max(100),
})

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Requerido').max(128),
})

export type RegisterDto = z.infer<typeof registerSchema>
export type LoginDto = z.infer<typeof loginSchema>
