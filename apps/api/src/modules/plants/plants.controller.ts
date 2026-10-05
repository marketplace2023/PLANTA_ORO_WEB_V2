import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, CurrentUser, Public, RequirePermission } from '../iam/decorators'
import {
  type CreatePlantDto,
  createPlantSchema,
  type UpdatePlantDto,
  updatePlantSchema,
} from './plants.schemas'
import { PlantsService } from './plants.service'

@Controller('plants')
export class PlantsController {
  constructor(private readonly plants: PlantsService) {}

  /** Plantas visibles para quien consulta: anónimo → PUBLIC; autenticado → PUBLIC + AUTHENTICATED + las suyas. */
  @Public()
  @Get()
  list(@CurrentUser() user?: AuthUser) {
    return this.plants.list(user)
  }

  /** `:plantId` acepta UUID o slug. */
  @Public()
  @Get(':plantId')
  get(@Param('plantId') plantId: string, @CurrentUser() user?: AuthUser) {
    return this.plants.get(plantId, user)
  }

  @RequirePermission('plant.update', 'global')
  @Post()
  create(@Body(new ZodValidationPipe(createPlantSchema)) dto: CreatePlantDto, @Req() req: AppRequest) {
    return this.plants.create(dto, req)
  }

  @RequirePermission('plant.update')
  @Patch(':plantId')
  update(
    @CurrentPlant() plant: PlantRow,
    @Body(new ZodValidationPipe(updatePlantSchema)) dto: UpdatePlantDto,
    @Req() req: AppRequest,
  ) {
    return this.plants.update(plant, dto, req)
  }
}
