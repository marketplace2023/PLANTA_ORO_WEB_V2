import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import { z } from 'zod'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, CurrentUser, RequirePermission } from '../iam/decorators'
import { ProviderRfqService } from './provider-rfq.service'
import {
  awardSchema,
  cancelSchema,
  type CreateRequisitionDto,
  createRequisitionSchema,
  type CreateRfqDto,
  createRfqSchema,
  decisionSchema,
  type ListRequisitionsQuery,
  listRequisitionsQuerySchema,
  type QuoteDto,
  quoteSchema,
  type ReceiveDto,
  receiveSchema,
  rejectSchema,
  type UpdateRequisitionDto,
  updateRequisitionSchema,
} from './procurement.schemas'
import { RequisitionsService } from './requisitions.service'

type Note = z.infer<typeof decisionSchema>

/** Compras es información interna de la planta: ningún endpoint es público. */
@Controller('plants/:plantId/procurement')
export class ProcurementController {
  constructor(private readonly svc: RequisitionsService) {}

  @RequirePermission('procurement.read')
  @Get('summary')
  summary(@CurrentPlant() plant: PlantRow) {
    return this.svc.summary(plant)
  }

  @RequirePermission('procurement.create')
  @Get('suggestions')
  suggestions(@CurrentPlant() plant: PlantRow) {
    return this.svc.lowStockSuggestions(plant)
  }

  @RequirePermission('procurement.read')
  @Get('requisitions')
  list(@CurrentPlant() plant: PlantRow, @Query(new ZodValidationPipe(listRequisitionsQuerySchema)) q: ListRequisitionsQuery, @CurrentUser() user: AuthUser) {
    return this.svc.list(plant, q, user.id)
  }

  @RequirePermission('procurement.create')
  @Post('requisitions')
  create(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(createRequisitionSchema)) dto: CreateRequisitionDto, @Req() req: AppRequest) {
    return this.svc.create(plant, dto, req)
  }

  @RequirePermission('procurement.read')
  @Get('requisitions/:id')
  get(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(plant, id)
  }

  @RequirePermission('procurement.create')
  @Patch('requisitions/:id')
  update(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateRequisitionSchema)) dto: UpdateRequisitionDto, @Req() req: AppRequest) {
    return this.svc.update(plant, id, dto, req)
  }

  @RequirePermission('procurement.create')
  @Post('requisitions/:id/submit')
  submit(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    return this.svc.submit(plant, id, req)
  }

  @RequirePermission('procurement.approve')
  @Post('requisitions/:id/approve')
  approve(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(decisionSchema)) dto: Note, @Req() req: AppRequest) {
    return this.svc.approve(plant, id, dto.note, req)
  }

  @RequirePermission('procurement.approve')
  @Post('requisitions/:id/reject')
  reject(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(rejectSchema)) dto: { note: string }, @Req() req: AppRequest) {
    return this.svc.reject(plant, id, dto.note, req)
  }

  @RequirePermission('procurement.create')
  @Post('requisitions/:id/cancel')
  cancel(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(cancelSchema)) dto: { note: string }, @Req() req: AppRequest) {
    return this.svc.cancel(plant, id, dto.note, req)
  }

  @RequirePermission('procurement.create')
  @Post('requisitions/:id/rfq')
  createRfq(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(createRfqSchema)) dto: CreateRfqDto, @Req() req: AppRequest) {
    return this.svc.createRfq(plant, id, dto, req)
  }

  @RequirePermission('procurement.create')
  @Delete('requisitions/:id/rfq')
  cancelRfq(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    return this.svc.cancelRfq(plant, id, req)
  }

  /** Adjudicar compromete el gasto: lo hace quien aprueba. */
  @RequirePermission('procurement.approve')
  @Post('requisitions/:id/award')
  award(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(awardSchema)) dto: { quoteId: string }, @Req() req: AppRequest) {
    return this.svc.award(plant, id, dto.quoteId, req)
  }

  /** La recepción ingresa stock: exige poder mover inventario (almacén), además de ver compras. */
  @RequirePermission('inventory.move')
  @Post('requisitions/:id/receive')
  receive(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(receiveSchema)) dto: ReceiveDto, @Req() req: AppRequest) {
    return this.svc.receive(plant, id, dto, req)
  }
}

/** Solicitudes de cotización recibidas por un proveedor: se gestionan por membresía de la organización, no por planta. */
@Controller('providers/:providerId/rfqs')
export class ProviderRfqController {
  constructor(private readonly svc: ProviderRfqService) {}

  @Get()
  list(@Param('providerId', ParseUUIDPipe) providerId: string, @CurrentUser() user: AuthUser) {
    return this.svc.list(providerId, user)
  }

  @Post(':rfqId/quote')
  submit(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Param('rfqId', ParseUUIDPipe) rfqId: string,
    @Body(new ZodValidationPipe(quoteSchema)) dto: QuoteDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ) {
    return this.svc.submit(providerId, rfqId, dto, user, req)
  }

  @Delete(':rfqId/quote')
  withdraw(@Param('providerId', ParseUUIDPipe) providerId: string, @Param('rfqId', ParseUUIDPipe) rfqId: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.svc.withdraw(providerId, rfqId, user, req)
  }
}
