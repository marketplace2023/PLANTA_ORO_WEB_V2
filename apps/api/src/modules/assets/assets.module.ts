import { Module } from '@nestjs/common'
import { DocumentsModule } from '../documents/documents.module'
import { InventoryModule } from '../inventory/inventory.module'
import { MaintenanceModule } from '../maintenance/maintenance.module'
import { PlantsModule } from '../plants/plants.module'
import { AssetsController } from './assets.controller'
import { AssetsService } from './assets.service'

@Module({
  imports: [PlantsModule, DocumentsModule, MaintenanceModule, InventoryModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
