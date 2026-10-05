import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, CurrentUser, Public, RequirePermission } from '../iam/decorators'
import { PlantConfigService } from './plant-config.service'
import {
  type EnableNetworkDto,
  enableNetworkSchema,
  type EnableStageDto,
  enableStageSchema,
  type UpdateNetworkDto,
  updateNetworkSchema,
  type UpdateStageDto,
  updateStageSchema,
} from './plants.schemas'

@Controller('plants/:plantId')
export class PlantConfigController {
  constructor(private readonly config: PlantConfigService) {}

  @Public()
  @Get('stages')
  listStages(@Param('plantId') plantId: string, @CurrentUser() user?: AuthUser) {
    return this.config.listStages(plantId, user)
  }

  @RequirePermission('plant.configure')
  @Post('stages')
  enableStage(
    @CurrentPlant() plant: PlantRow,
    @Body(new ZodValidationPipe(enableStageSchema)) dto: EnableStageDto,
    @Req() req: AppRequest,
  ) {
    return this.config.enableStage(plant, dto, req)
  }

  @RequirePermission('plant.configure')
  @Patch('stages/:stageId')
  updateStage(
    @CurrentPlant() plant: PlantRow,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body(new ZodValidationPipe(updateStageSchema)) dto: UpdateStageDto,
    @Req() req: AppRequest,
  ) {
    return this.config.updateStage(plant, stageId, dto, req)
  }

  @Public()
  @Get('networks')
  listNetworks(@Param('plantId') plantId: string, @CurrentUser() user?: AuthUser) {
    return this.config.listNetworks(plantId, user)
  }

  @RequirePermission('plant.configure')
  @Post('networks')
  enableNetwork(
    @CurrentPlant() plant: PlantRow,
    @Body(new ZodValidationPipe(enableNetworkSchema)) dto: EnableNetworkDto,
    @Req() req: AppRequest,
  ) {
    return this.config.enableNetwork(plant, dto, req)
  }

  @RequirePermission('plant.configure')
  @Patch('networks/:networkId')
  updateNetwork(
    @CurrentPlant() plant: PlantRow,
    @Param('networkId', ParseUUIDPipe) networkId: string,
    @Body(new ZodValidationPipe(updateNetworkSchema)) dto: UpdateNetworkDto,
    @Req() req: AppRequest,
  ) {
    return this.config.updateNetwork(plant, networkId, dto, req)
  }
}
