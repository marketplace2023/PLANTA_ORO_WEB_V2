import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'
import { configureApp } from './app.setup'
import type { Env } from './config/env'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  configureApp(app)

  // Render inyecta PORT y exige escuchar en 0.0.0.0.
  const port = app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true })
  await app.listen(port, '0.0.0.0')
  console.log(`FUR API escuchando en el puerto ${port} (/api/v1)`)
}

void bootstrap()
