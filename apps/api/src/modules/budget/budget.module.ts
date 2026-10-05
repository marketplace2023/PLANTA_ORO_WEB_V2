import { Module } from '@nestjs/common'
import { AnalysisService } from './analysis.service'
import { ApusService } from './apus.service'
import { BudgetController } from './budget.controller'
import { BudgetsService } from './budgets.service'
import { PricingService } from './pricing.service'
import { ResourcesService } from './resources.service'
import { ValuationsService } from './valuations.service'

@Module({
  controllers: [BudgetController],
  providers: [PricingService, ResourcesService, ApusService, BudgetsService, AnalysisService, ValuationsService],
  // Mantenimiento convierte los recursos del libro de precios a la moneda de la planta al registrar costos de una OT.
  exports: [PricingService],
})
export class BudgetModule {}
