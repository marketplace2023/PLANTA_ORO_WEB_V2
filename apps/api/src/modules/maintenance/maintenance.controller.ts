import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, CurrentUser, RequirePermission } from '../iam/decorators'
import {
  type AddCostDto,
  addCostSchema,
  type AddPartDto,
  addPartSchema,
  type CreatePlanDto,
  createPlanSchema,
  type CreateWorkOrderDto,
  createWorkOrderSchema,
  type ListPlansQuery,
  listPlansQuerySchema,
  type ListWorkOrdersQuery,
  listWorkOrdersQuerySchema,
  type TransitionDto,
  transitionSchema,
  type UpdatePlanDto,
  updatePlanSchema,
  type UpdateWorkOrderDto,
  updateWorkOrderSchema,
} from './maintenance.schemas'
import { PlansService } from './plans.service'
import { WorkOrderCostsService } from './work-order-costs.service'
import { WorkOrderPartsService } from './work-order-parts.service'
import { WorkOrdersService } from './work-orders.service'

/**
 * Mantenimiento es información interna: ningún endpoint es público.
 * Las transiciones validan su permiso fino en el servicio (cerrar = maintenance.close; el asignado reporta avance).
 */
@Controller('plants/:plantId/maintenance')
export class MaintenanceController {
  constructor(
    private readonly orders: WorkOrdersService,
    private readonly plans: PlansService,
    private readonly parts: WorkOrderPartsService,
    private readonly costs: WorkOrderCostsService,
  ) {}

  @RequirePermission('maintenance.read')
  @Get('dashboard')
  dashboard(@CurrentPlant() plant: PlantRow) {
    return this.orders.dashboard(plant)
  }

  @RequirePermission('maintenance.read')
  @Get('assignees')
  assignees(@CurrentPlant() plant: PlantRow) {
    return this.orders.assignees(plant.id)
  }

  // ----- Órdenes de trabajo -----

  @RequirePermission('maintenance.read')
  @Get('work-orders')
  listOrders(
    @CurrentPlant() plant: PlantRow,
    @Query(new ZodValidationPipe(listWorkOrdersQuerySchema)) query: ListWorkOrdersQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.list(plant, query, user)
  }

  /** Cualquiera con maintenance.create (p. ej. un operador) puede solicitar mantenimiento. */
  @RequirePermission('maintenance.create')
  @Post('work-orders')
  createOrder(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(createWorkOrderSchema)) dto: CreateWorkOrderDto, @Req() req: AppRequest) {
    return this.orders.create(plant, dto, req)
  }

  @RequirePermission('maintenance.read')
  @Get('work-orders/:id')
  getOrder(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(plant, id)
  }

  @RequirePermission('maintenance.update')
  @Patch('work-orders/:id')
  updateOrder(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWorkOrderSchema)) dto: UpdateWorkOrderDto,
    @Req() req: AppRequest,
  ) {
    return this.orders.update(plant, id, dto, req)
  }

  @RequirePermission('maintenance.read')
  @Post('work-orders/:id/transition')
  transition(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionSchema)) dto: TransitionDto,
    @Req() req: AppRequest,
  ) {
    return this.orders.transition(plant, id, dto, req)
  }

  /** El permiso fino (maintenance.update o ser el responsable) y el estado de la orden se validan en el servicio. */
  @RequirePermission('maintenance.read')
  @Post('work-orders/:id/parts')
  addPart(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addPartSchema)) dto: AddPartDto,
    @Req() req: AppRequest,
  ) {
    return this.parts.add(plant, id, dto, req)
  }

  @RequirePermission('maintenance.read')
  @Delete('work-orders/:id/parts/:partId')
  removePart(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('partId', ParseUUIDPipe) partId: string,
    @Req() req: AppRequest,
  ) {
    return this.parts.remove(plant, id, partId, req)
  }

  /** Costos que no son repuestos (mano de obra, equipos, transporte, servicios): el permiso fino y el estado se validan en el servicio. */
  @RequirePermission('maintenance.read')
  @Post('work-orders/:id/costs')
  addCost(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addCostSchema)) dto: AddCostDto,
    @Req() req: AppRequest,
  ) {
    return this.costs.add(plant, id, dto, req)
  }

  @RequirePermission('maintenance.read')
  @Delete('work-orders/:id/costs/:costId')
  removeCost(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('costId', ParseUUIDPipe) costId: string,
    @Req() req: AppRequest,
  ) {
    return this.costs.remove(plant, id, costId, req)
  }

  /** Costos acumulados de un activo: por categoría, mes, tipo de orden y orden (pestaña Costos de la FUR). */
  @RequirePermission('maintenance.read')
  @Get('assets/:assetId/costs')
  assetCosts(@CurrentPlant() plant: PlantRow, @Param('assetId', ParseUUIDPipe) assetId: string) {
    return this.costs.assetBreakdown(plant, assetId)
  }

  // ----- Planes -----

  @RequirePermission('maintenance.read')
  @Get('plans')
  listPlans(@CurrentPlant() plant: PlantRow, @Query(new ZodValidationPipe(listPlansQuerySchema)) query: ListPlansQuery) {
    return this.plans.list(plant, query)
  }

  @RequirePermission('maintenance.update')
  @Post('plans')
  createPlan(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(createPlanSchema)) dto: CreatePlanDto, @Req() req: AppRequest) {
    return this.plans.create(plant, dto, req)
  }

  @RequirePermission('maintenance.update')
  @Patch('plans/:id')
  updatePlan(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePlanSchema)) dto: UpdatePlanDto,
    @Req() req: AppRequest,
  ) {
    return this.plans.update(plant, id, dto, req)
  }

  @RequirePermission('maintenance.update')
  @Post('plans/:id/generate')
  generate(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    return this.plans.generate(plant, id, req)
  }
}
