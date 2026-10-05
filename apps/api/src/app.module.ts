import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { validateEnv } from './config/env'
import { DatabaseModule } from './database/database.module'
import { AssetsModule } from './modules/assets/assets.module'
import { AuditModule } from './modules/audit/audit.service'
import { CatalogModule } from './modules/catalog/catalog.module'
import { DashboardModule } from './modules/dashboard/dashboard.module'
import { DocumentsModule } from './modules/documents/documents.module'
import { HealthController } from './modules/health/health.controller'
import { IamModule } from './modules/iam/iam.module'
import { InventoryModule } from './modules/inventory/inventory.module'
import { BudgetModule } from './modules/budget/budget.module'
import { LmsModule } from './modules/lms/lms.module'
import { OrganizationsModule } from './modules/organizations/organizations.module'
import { ProcessModule } from './modules/process/process.module'
import { ProcurementModule } from './modules/procurement/procurement.module'
import { MaintenanceModule } from './modules/maintenance/maintenance.module'
import { NetworksController } from './modules/networks/networks.controller'
import { PlantsModule } from './modules/plants/plants.module'
import { StagesController } from './modules/processes/stages.controller'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    DatabaseModule,
    AuditModule,
    IamModule,
    PlantsModule,
    AssetsModule,
    DocumentsModule,
    MaintenanceModule,
    CatalogModule,
    InventoryModule,
    OrganizationsModule,
    ProcurementModule,
    ProcessModule,
    LmsModule,
    BudgetModule,
    DashboardModule,
  ],
  controllers: [HealthController, StagesController, NetworksController],
})
export class AppModule {}
