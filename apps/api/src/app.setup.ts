import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import cookieParser from 'cookie-parser'
import type { NextFunction, Response } from 'express'
import helmet from 'helmet'
import type { AppRequest } from './common/types'
import type { Env } from './config/env'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Configuración común a producción y tests (e2e), para que ambos vean la misma API. */
export function configureApp(app: INestApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService)

  // Detrás del proxy de Render, req.ip debe ser la IP real del cliente (rate limit y auditoría).
  if (config.get('NODE_ENV', { infer: true }) === 'production') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1)
  }

  // API versionada (arquitectura §29): /api/v1
  app.setGlobalPrefix('api/v1')
  app.use(helmet())
  app.use(cookieParser())

  // Correlation id por petición (arquitectura §25/§43): se propaga a auditoría y a la respuesta.
  app.use((req: AppRequest, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-correlation-id']
    req.correlationId = typeof incoming === 'string' && UUID_RE.test(incoming) ? incoming : randomUUID()
    res.setHeader('x-correlation-id', req.correlationId)
    next()
  })

  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
    exposedHeaders: ['x-correlation-id'],
  })
  app.enableShutdownHooks()
}
