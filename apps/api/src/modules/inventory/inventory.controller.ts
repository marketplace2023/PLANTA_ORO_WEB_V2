import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import type { AppRequest, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, RequirePermission } from '../iam/decorators'
import {
  type AdjustDto,
  adjustSchema,
  type CreateItemDto,
  createItemSchema,
  type CreateLocationDto,
  createLocationSchema,
  type CreateWarehouseDto,
  createWarehouseSchema,
  type IssueDto,
  issueSchema,
  type ListItemsQuery,
  listItemsQuerySchema,
  listLocationsQuerySchema,
  type ListMovementsQuery,
  listMovementsQuerySchema,
  type ReceiptDto,
  receiptSchema,
  type TransferDto,
  transferSchema,
  type UpdateItemDto,
  updateItemSchema,
  type UpdateLocationDto,
  updateLocationSchema,
  type UpdateWarehouseDto,
  updateWarehouseSchema,
} from './inventory.schemas'
import { InventoryService } from './inventory.service'

/** Inventario interno de la planta (WMS). Ningún endpoint es público; el stock de proveedores vive en marketplace. */
@Controller('plants/:plantId/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermission('inventory.read')
  @Get('dashboard')
  dashboard(@CurrentPlant() plant: PlantRow) {
    return this.inventory.dashboard(plant)
  }

  // ----- Almacenes y ubicaciones -----

  @RequirePermission('inventory.read')
  @Get('warehouses')
  warehouses(@CurrentPlant() plant: PlantRow) {
    return this.inventory.listWarehouses(plant)
  }

  @RequirePermission('inventory.create')
  @Post('warehouses')
  createWarehouse(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(createWarehouseSchema)) dto: CreateWarehouseDto, @Req() req: AppRequest) {
    return this.inventory.createWarehouse(plant, dto, req)
  }

  @RequirePermission('inventory.update')
  @Patch('warehouses/:id')
  updateWarehouse(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWarehouseSchema)) dto: UpdateWarehouseDto,
    @Req() req: AppRequest,
  ) {
    return this.inventory.updateWarehouse(plant, id, dto, req)
  }

  @RequirePermission('inventory.read')
  @Get('locations')
  locations(@CurrentPlant() plant: PlantRow, @Query(new ZodValidationPipe(listLocationsQuerySchema)) q: { warehouseId?: string }) {
    return this.inventory.listLocations(plant, q.warehouseId)
  }

  @RequirePermission('inventory.create')
  @Post('locations')
  createLocation(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(createLocationSchema)) dto: CreateLocationDto, @Req() req: AppRequest) {
    return this.inventory.createLocation(plant, dto, req)
  }

  @RequirePermission('inventory.update')
  @Patch('locations/:id')
  updateLocation(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLocationSchema)) dto: UpdateLocationDto,
    @Req() req: AppRequest,
  ) {
    return this.inventory.updateLocation(plant, id, dto, req)
  }

  // ----- Ítems -----

  @RequirePermission('inventory.read')
  @Get('items')
  items(@CurrentPlant() plant: PlantRow, @Query(new ZodValidationPipe(listItemsQuerySchema)) q: ListItemsQuery) {
    return this.inventory.listItems(plant, q)
  }

  @RequirePermission('inventory.create')
  @Post('items')
  createItem(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(createItemSchema)) dto: CreateItemDto, @Req() req: AppRequest) {
    return this.inventory.createItem(plant, dto, req)
  }

  @RequirePermission('inventory.read')
  @Get('items/:id')
  item(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.getItem(plant, id)
  }

  @RequirePermission('inventory.update')
  @Patch('items/:id')
  updateItem(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateItemSchema)) dto: UpdateItemDto,
    @Req() req: AppRequest,
  ) {
    return this.inventory.updateItem(plant, id, dto, req)
  }

  // ----- Movimientos -----

  @RequirePermission('inventory.read')
  @Get('movements')
  movements(@CurrentPlant() plant: PlantRow, @Query(new ZodValidationPipe(listMovementsQuerySchema)) q: ListMovementsQuery) {
    return this.inventory.listMovements(plant, q)
  }

  @RequirePermission('inventory.move')
  @Post('movements/receipt')
  receipt(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(receiptSchema)) dto: ReceiptDto, @Req() req: AppRequest) {
    return this.inventory.receipt(plant, dto, req)
  }

  @RequirePermission('inventory.move')
  @Post('movements/issue')
  issue(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(issueSchema)) dto: IssueDto, @Req() req: AppRequest) {
    return this.inventory.issue(plant, dto, req)
  }

  @RequirePermission('inventory.move')
  @Post('movements/transfer')
  transfer(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(transferSchema)) dto: TransferDto, @Req() req: AppRequest) {
    return this.inventory.transfer(plant, dto, req)
  }

  @RequirePermission('inventory.move')
  @Post('movements/adjust')
  adjust(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(adjustSchema)) dto: AdjustDto, @Req() req: AppRequest) {
    return this.inventory.adjust(plant, dto, req)
  }
}
