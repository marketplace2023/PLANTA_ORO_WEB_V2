import { Controller, Get, Inject } from '@nestjs/common'
import { Public } from '../iam/decorators'
import { sql } from 'drizzle-orm'
import { DB, type Database } from '../../database/database.module'

@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Siempre responde 200 para que Render no reinicie el servicio mientras Neon
   * despierta; el estado real de la base de datos va en el cuerpo.
   */
  @Get()
  async check() {
    let database: 'up' | 'down' = 'up'
    try {
      await this.db.execute(sql`select 1`)
    } catch {
      database = 'down'
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'fur-api',
      database,
      timestamp: new Date().toISOString(),
    }
  }
}
