import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { AppRequest } from '../../common/types'
import { AuthzService } from './authz.service'
import { REQUIRE_PERMISSION, type RequirePermissionMeta } from './decorators'

/** Guard global (corre después de JwtAuthGuard): aplica @RequirePermission. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthzService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<RequirePermissionMeta | undefined>(REQUIRE_PERMISSION, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!meta) return true

    const req = ctx.switchToHttp().getRequest<AppRequest>()
    if (!req.user) throw new UnauthorizedException('Sesión requerida')

    if (meta.scope === 'global') {
      if (!req.user.isGlobalAdmin) throw new ForbiddenException('Requiere administrador del ecosistema')
      return true
    }

    const plant = await this.authz.findPlant(String(req.params.plantId ?? ''))
    if (!plant) throw new NotFoundException('Planta no encontrada')

    const access = await this.authz.access(req.user, plant.id)
    // Una planta que el usuario no puede ver no debe revelar su existencia: 404, no 403.
    if (!this.authz.canView(req.user, plant, access)) throw new NotFoundException('Planta no encontrada')
    if (!access.permissions.has(meta.permission)) {
      throw new ForbiddenException(`Falta el permiso ${meta.permission} en esta planta`)
    }

    req.plant = plant
    req.permissions = access.permissions
    return true
  }
}
