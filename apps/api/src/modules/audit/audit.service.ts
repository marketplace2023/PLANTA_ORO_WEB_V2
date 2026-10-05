import { Global, Inject, Injectable, Module } from '@nestjs/common'
import { DB, type Database } from '../../database/database.module'
import { auditEvents } from '../../database/schema'
import type { AppRequest } from '../../common/types'

export type AuditInput = {
  module: string
  entityType: string
  entityId?: string | null
  action: string
  plantId?: string | null
  userId?: string | null
  oldData?: unknown
  newData?: unknown
}

/** Registro de auditoría por diseño (arquitectura §25): toda acción relevante deja trazabilidad. */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(req: AppRequest, input: AuditInput) {
    await this.db.insert(auditEvents).values({
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      plantId: input.plantId ?? null,
      userId: input.userId ?? req.user?.id ?? null,
      oldData: input.oldData ?? null,
      newData: input.newData ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      correlationId: req.correlationId ?? null,
    })
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
