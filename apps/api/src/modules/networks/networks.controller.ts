import { Controller, Get, Inject } from '@nestjs/common'
import { Public } from '../iam/decorators'
import { asc } from 'drizzle-orm'
import { DB, type Database } from '../../database/database.module'
import { networkMaster } from '../../database/schema'

@Public()
@Controller('networks')
export class NetworksController {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Catálogo maestro global de redes transversales. Lectura pública. */
  @Get('catalog')
  catalog() {
    return this.db.select().from(networkMaster).orderBy(asc(networkMaster.code))
  }
}
