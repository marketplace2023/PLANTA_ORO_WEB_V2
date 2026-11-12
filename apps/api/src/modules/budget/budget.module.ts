import { Module } from '@nestjs/common'
import { AnalysisService } from './analysis.service'
import { ApusService } from './apus.service'
import { BudgetController } from './budget.controller'
import { BudgetsService } from './budgets.service'
import { PricingService } from './pricing.service'
import { ResourcesService } from './resources.service'
import { ValuationsService } from './valuations.service'
import { MasterRecoveryController } from './master-recovery.controller'
import { CatalogReviewController } from './catalog-review.controller'
import { CatalogReviewService } from './catalog-review.service'
import { LuloCatalogService } from './lulo-catalog.service'
import { LuloDocumentsService } from './lulo-documents.service'
import { LuloPlantController, LuloPublicationController, LuloPublicController } from './lulo.controller'
import { LuloMastersService } from './lulo-masters.service'
import { LuloMastersPublicController, LuloMastersPlantController } from './lulo-masters.controller'
import { LuloWorksController } from './lulo-works.controller'
import { LuloWorksService } from './lulo-works.service'
import { LuloMasterManagementService } from './lulo-master-management.service'
import { LuloMasterManagementController } from './lulo-master-management.controller'

@Module({
  controllers: [BudgetController, MasterRecoveryController, CatalogReviewController, LuloPublicController, LuloPublicationController, LuloPlantController, LuloMastersPublicController, LuloMastersPlantController, LuloWorksController, LuloMasterManagementController],
  providers: [PricingService, ResourcesService, ApusService, BudgetsService, AnalysisService, ValuationsService, CatalogReviewService, LuloCatalogService, LuloDocumentsService, LuloMastersService, LuloWorksService, LuloMasterManagementService],
  // Mantenimiento convierte los recursos del libro de precios a la moneda de la planta al registrar costos de una OT.
  exports: [PricingService],
})
export class BudgetModule {}
