import { Module } from '@nestjs/common'
import { BudgetModule } from '../budget/budget.module'
import { InventoryModule } from '../inventory/inventory.module'
import { MaintenanceController } from './maintenance.controller'
import { PlansService } from './plans.service'
import { WorkOrderCostsService } from './work-order-costs.service'
import { WorkOrderPartsService } from './work-order-parts.service'
import { WorkOrdersService } from './work-orders.service'

@Module({
  imports: [InventoryModule, BudgetModule],
  controllers: [MaintenanceController],
  providers: [WorkOrdersService, WorkOrderPartsService, WorkOrderCostsService, PlansService],
  exports: [WorkOrdersService, WorkOrderPartsService, WorkOrderCostsService, PlansService],
})
export class MaintenanceModule {}
