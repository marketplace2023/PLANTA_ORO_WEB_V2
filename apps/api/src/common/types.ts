import type { Request } from 'express'
import type { plants } from '../database/schema'

export type AuthUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  isGlobalAdmin: boolean
}

export type PlantRow = typeof plants.$inferSelect

/** Request enriquecido por middleware y guards. */
export interface AppRequest extends Request {
  correlationId?: string
  /** Presente si el access token es válido. Ausente = anónimo (solo en rutas @Public). */
  user?: AuthUser
  /** Planta resuelta por PermissionsGuard a partir de :plantId (UUID o slug). */
  plant?: PlantRow
  /** Permisos efectivos del usuario sobre `plant`. */
  permissions?: ReadonlySet<string>
}
