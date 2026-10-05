import { Module } from '@nestjs/common'
import { MembersController } from './members.controller'
import { MembersService } from './members.service'
import { PlantConfigController } from './plant-config.controller'
import { PlantConfigService } from './plant-config.service'
import { PlantsController } from './plants.controller'
import { PlantsService } from './plants.service'

@Module({
  controllers: [PlantsController, PlantConfigController, MembersController],
  providers: [PlantsService, PlantConfigService, MembersService],
  exports: [PlantsService],
})
export class PlantsModule {}
