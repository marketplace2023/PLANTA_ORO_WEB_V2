import { Module } from '@nestjs/common'
import { InventoryModule } from '../inventory/inventory.module'
import { OrganizationsModule } from '../organizations/organizations.module'
import { ProcurementController, ProviderRfqController } from './procurement.controllers'
import { ProviderRfqService } from './provider-rfq.service'
import { RequisitionsService } from './requisitions.service'

@Module({
  imports: [InventoryModule, OrganizationsModule],
  controllers: [ProcurementController, ProviderRfqController],
  providers: [RequisitionsService, ProviderRfqService],
})
export class ProcurementModule {}
