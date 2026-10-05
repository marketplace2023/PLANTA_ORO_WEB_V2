import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import type { Env } from '../config/env'
import * as schema from './schema'

export const PG_POOL = Symbol('PG_POOL')
export const DB = Symbol('DB')

export type Database = NodePgDatabase<typeof schema>

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const pool = new Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          max: 10,
          // Neon suspende el compute por inactividad: el primer connect puede tardar unos segundos.
          connectionTimeoutMillis: 15_000,
          idleTimeoutMillis: 30_000,
        })
        // Un error en un cliente inactivo (p. ej. Neon cerró la conexión) no debe tumbar el proceso.
        pool.on('error', (err) => console.error('[pg] idle client error:', err.message))
        return pool
      },
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [DB, PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end()
  }
}
