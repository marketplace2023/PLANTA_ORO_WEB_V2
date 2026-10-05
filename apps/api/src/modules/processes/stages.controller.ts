import { Controller, Get, Inject } from '@nestjs/common'
import { Public } from '../iam/decorators'
import { asc } from 'drizzle-orm'
import { DB, type Database } from '../../database/database.module'
import { stageMaster } from '../../database/schema'

@Public()
@Controller('stages')
export class StagesController {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Catálogo maestro global de etapas (D01…D20). Lectura pública. */
  @Get('catalog')
  catalog() {
    return this.db.select().from(stageMaster).orderBy(asc(stageMaster.sequenceDefault))
  }
}
