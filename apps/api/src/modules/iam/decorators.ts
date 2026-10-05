import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common'
import type { AppRequest } from '../../common/types'
import type { PermissionCode } from './permissions.catalog'

export const IS_PUBLIC = 'fur:isPublic'
export const REQUIRE_PERMISSION = 'fur:requirePermission'

/** Ruta accesible sin sesión (un token presente pero inválido sigue siendo 401). */
export const Public = () => SetMetadata(IS_PUBLIC, true)

export type RequirePermissionMeta = { permission: PermissionCode; scope: 'plant' | 'global' }

/**
 * Exige un permiso. `plant` (por defecto) evalúa usuario + planta (`:plantId`) + rol + permiso (§6).
 * `global` exige administrador del ecosistema (acciones sin planta, p. ej. crear plantas).
 */
export const RequirePermission = (permission: PermissionCode, scope: 'plant' | 'global' = 'plant') =>
  SetMetadata(REQUIRE_PERMISSION, { permission, scope } satisfies RequirePermissionMeta)

/**
 * Solo el administrador del ecosistema (acciones globales sin planta: catálogo, proveedores…).
 * Reutiliza el mecanismo de `scope: 'global'`; el código de permiso no se evalúa en ese caso.
 */
export const GlobalAdminOnly = () => RequirePermission('plant.update', 'global')

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().user
})

export const CurrentPlant = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().plant
})
