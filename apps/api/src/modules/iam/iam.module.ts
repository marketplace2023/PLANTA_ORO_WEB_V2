import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { ThrottlerModule } from '@nestjs/throttler'
import type { Env } from '../../config/env'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AuthzService } from './authz.service'
import { JwtAuthGuard } from './jwt-auth.guard'
import { PasswordService } from './password.service'
import { PermissionsGuard } from './permissions.guard'

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ ttl: 60_000, limit: config.get('AUTH_RATE_LIMIT_PER_MINUTE', { infer: true }) }],
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    PasswordService,
    AuthzService,
    AuthService,
    // El orden importa: primero autenticación, luego permisos.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthzService, PasswordService],
})
export class IamModule {}
