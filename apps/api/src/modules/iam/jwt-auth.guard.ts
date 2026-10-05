import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { and, eq } from 'drizzle-orm'
import type { AppRequest } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { users } from '../../database/schema'
import { IS_PUBLIC } from './decorators'

/**
 * Guard global. Sin token: solo pasa en rutas @Public (anónimo).
 * Con token inválido o expirado: siempre 401, incluso en rutas públicas, para que el cliente refresque la sesión.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])
    const req = ctx.switchToHttp().getRequest<AppRequest>()

    const header = req.headers.authorization
    if (!header) {
      if (isPublic) return true
      throw new UnauthorizedException('Sesión requerida')
    }

    const [scheme, token] = header.split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('Token inválido')

    let sub: string
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, { algorithms: ['HS256'] })
      sub = payload.sub
    } catch {
      throw new UnauthorizedException('Token inválido o expirado')
    }

    // Estado y rol de administrador se leen de la BD: desactivar un usuario o quitarle el rol surte efecto de inmediato.
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        isGlobalAdmin: users.isGlobalAdmin,
      })
      .from(users)
      .where(and(eq(users.id, sub), eq(users.status, 'ACTIVE')))
      .limit(1)
    if (!user) throw new UnauthorizedException('Usuario no disponible')

    req.user = user
    return true
  }
}
