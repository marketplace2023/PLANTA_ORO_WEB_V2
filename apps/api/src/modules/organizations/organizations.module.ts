import { Module } from '@nestjs/common'
import { ContractorsService } from './contractors.service'
import { MarketplaceService } from './marketplace.service'
import { OrgAccessService } from './org-access.service'
import { ContractorsController, MarketplaceController, ProfessionalServicesController, ProvidersController } from './organizations.controllers'
import { ProvidersService } from './providers.service'

@Module({
  controllers: [ProvidersController, MarketplaceController, ContractorsController, ProfessionalServicesController],
  providers: [OrgAccessService, ProvidersService, MarketplaceService, ContractorsService],
  exports: [OrgAccessService, ProvidersService, MarketplaceService, ContractorsService],
})
export class OrganizationsModule {}
