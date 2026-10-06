import { Module } from '@nestjs/common'
import { AdminPlantAccessRequestsController, PlantAccessRequestsController } from './access-requests.controller'
import { AccessRequestsService } from './access-requests.service'
import { MembersController } from './members.controller'
import { MembersService } from './members.service'
import { PlantConfigController } from './plant-config.controller'
import { PlantConfigService } from './plant-config.service'
import { PlantsController } from './plants.controller'
import { PlantsService } from './plants.service'

@Module({
  controllers: [PlantsController, PlantConfigController, MembersController, PlantAccessRequestsController, AdminPlantAccessRequestsController],
  providers: [PlantsService, PlantConfigService, MembersService, AccessRequestsService],
  exports: [PlantsService],
})
export class PlantsModule {}
