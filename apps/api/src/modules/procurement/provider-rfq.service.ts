import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { validationError } from '../../common/errors'
import type { AppRequest, AuthUser } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { plants, providers, requisitionLines, requisitions, rfqInvitations, rfqs, supplierQuotes } from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../organizations/org-access.service'
import type { QuoteDto } from './procurement.schemas'

/**
 * Lado del proveedor: ve a qué solicitudes de cotización fue invitado y responde. No recibe la justificación interna
 * ni los precios estimados de la planta, solo lo necesario para cotizar (líneas, cantidades, fecha requerida).
 */
@Injectable()
export class ProviderRfqService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: OrgAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(providerId: string, user: AuthUser | undefined) {
    await this.access.assertManage('provider', providerId, user)
    const rows = await this.db
      .select({
        id: rfqs.id,
        code: rfqs.code,
        status: rfqs.status,
        deadlineAt: rfqs.deadlineAt,
        requisitionId: requisitions.id,
        priority: requisitions.priority,
        neededBy: requisitions.neededBy,
        plantName: plants.name,
        plantCountry: plants.countryCode,
      })
      .from(rfqInvitations)
      .innerJoin(rfqs, eq(rfqs.id, rfqInvitations.rfqId))
      .innerJoin(requisitions, eq(requisitions.id, rfqs.requisitionId))
      .innerJoin(plants, eq(plants.id, rfqs.plantId))
      .where(eq(rfqInvitations.providerId, providerId))
      .orderBy(desc(rfqs.createdAt))
      .limit(100)

    const reqIds = rows.map((r) => r.requisitionId)
    const lines = reqIds.length
      ? await this.db
          .select({ requisitionId: requisitionLines.requisitionId, id: requisitionLines.id, description: requisitionLines.description, quantity: requisitionLines.quantity, uom: requisitionLines.uom })
          .from(requisitionLines)
          .where(inArray(requisitionLines.requisitionId, reqIds))
      : []
    const quotes = rows.length ? await this.db.select().from(supplierQuotes).where(and(eq(supplierQuotes.providerId, providerId), inArray(supplierQuotes.rfqId, rows.map((r) => r.id)))) : []

    return rows.map((r) => {
      const mine = quotes.find((q) => q.rfqId === r.id)
      return {
        id: r.id,
        code: r.code,
        status: r.status,
        deadlineAt: r.deadlineAt,
        acceptsQuotes: r.status === 'OPEN' && r.deadlineAt > new Date(),
        priority: r.priority,
        neededBy: r.neededBy,
        plant: { name: r.plantName, countryCode: r.plantCountry },
        lines: lines.filter((l) => l.requisitionId === r.requisitionId).map((l) => ({ id: l.id, description: l.description, quantity: Number(l.quantity), uom: l.uom })),
        myQuote: mine ? { id: mine.id, currency: mine.currency, totalAmount: Number(mine.totalAmount), deliveryDays: mine.deliveryDays, conditions: mine.conditions, status: mine.status } : null,
      }
    })
  }

  async submit(providerId: string, rfqId: string, dto: QuoteDto, user: AuthUser | undefined, req: AppRequest) {
    await this.access.assertManage('provider', providerId, user)
    const [prov] = await this.db.select({ status: providers.status }).from(providers).where(eq(providers.id, providerId))
    if (prov?.status !== 'ACTIVE') throw new ConflictException('La organización debe estar activa para cotizar')

    const plantId = await this.db.transaction(async (tx) => {
      // Bloquea la RFQ: si el comprador adjudica o cancela en paralelo, esta cotización no se cuela después.
      const [rfq] = await tx.select().from(rfqs).where(eq(rfqs.id, rfqId)).for('update')
      const [invited] = rfq ? await tx.select().from(rfqInvitations).where(and(eq(rfqInvitations.rfqId, rfqId), eq(rfqInvitations.providerId, providerId))) : []
      // No invitado = indistinguible de inexistente (no se revela qué solicitudes existen).
      if (!rfq || !invited) throw new NotFoundException('Solicitud de cotización no encontrada')
      if (rfq.status !== 'OPEN') throw new ConflictException('La solicitud de cotización ya no está abierta')
      if (rfq.deadlineAt.getTime() <= Date.now()) throw new ConflictException('Venció el plazo para cotizar')

      await tx
        .insert(supplierQuotes)
        .values({ rfqId, providerId, currency: dto.currency, totalAmount: String(dto.totalAmount), deliveryDays: dto.deliveryDays, conditions: dto.conditions, submittedBy: user?.id })
        .onConflictDoUpdate({
          target: [supplierQuotes.rfqId, supplierQuotes.providerId],
          set: { currency: dto.currency, totalAmount: String(dto.totalAmount), deliveryDays: dto.deliveryDays, conditions: dto.conditions ?? null, status: 'SUBMITTED', submittedBy: user?.id, updatedAt: new Date() },
        })
      return rfq.plantId
    })
    await this.audit.record(req, { module: 'procurement', entityType: 'supplier_quote', entityId: rfqId, plantId, action: 'quote.submitted', newData: { providerId, currency: dto.currency, totalAmount: dto.totalAmount, deliveryDays: dto.deliveryDays } })
    return this.list(providerId, user).then((all) => all.find((r) => r.id === rfqId))
  }

  async withdraw(providerId: string, rfqId: string, user: AuthUser | undefined, req: AppRequest) {
    await this.access.assertManage('provider', providerId, user)
    const plantId = await this.db.transaction(async (tx) => {
      const [rfq] = await tx.select().from(rfqs).where(eq(rfqs.id, rfqId)).for('update')
      if (!rfq) throw new NotFoundException('Solicitud de cotización no encontrada')
      if (rfq.status !== 'OPEN') throw new ConflictException('La solicitud de cotización ya no está abierta')
      const updated = await tx
        .update(supplierQuotes)
        .set({ status: 'WITHDRAWN', updatedAt: new Date() })
        .where(and(eq(supplierQuotes.rfqId, rfqId), eq(supplierQuotes.providerId, providerId), eq(supplierQuotes.status, 'SUBMITTED')))
        .returning({ id: supplierQuotes.id })
      if (updated.length === 0) throw validationError('quote', 'No tienes una cotización vigente para retirar')
      return rfq.plantId
    })
    await this.audit.record(req, { module: 'procurement', entityType: 'supplier_quote', entityId: rfqId, plantId, action: 'quote.withdrawn', newData: { providerId } })
    return this.list(providerId, user).then((all) => all.find((r) => r.id === rfqId))
  }
}
