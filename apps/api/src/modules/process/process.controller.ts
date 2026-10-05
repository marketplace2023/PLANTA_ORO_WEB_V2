import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, CurrentUser, Public, RequirePermission } from '../iam/decorators'
import { type CreateConnectionDto, createConnectionSchema } from './process.schemas'
import { ProcessService } from './process.service'

/**
 * Mapa de proceso y redes transversales de una planta. La lectura sigue las reglas de visibilidad de la planta
 * (pública / con sesión / privada); la edición del flujo exige plant.configure.
 */
@Controller('plants/:plantId')
export class ProcessController {
  constructor(private readonly process: ProcessService) {}

  @Public()
  @Get('process')
  overview(@Param('plantId') plantId: string, @CurrentUser() user?: AuthUser) {
    return this.process.overview(plantId, user)
  }

  @RequirePermission('plant.configure')
  @Post('process/connections')
  createConnection(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(createConnectionSchema)) dto: CreateConnectionDto, @Req() req: AppRequest) {
    return this.process.createConnection(plant, dto, req)
  }

  @RequirePermission('plant.configure')
  @Delete('process/connections/:id')
  @HttpCode(204)
  deleteConnection(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    return this.process.deleteConnection(plant, id, req)
  }

  @Public()
  @Get('network-overview')
  networks(@Param('plantId') plantId: string, @CurrentUser() user?: AuthUser) {
    return this.process.networks(plantId, user)
  }

  @Public()
  @Get('network-overview/:code')
  networkDashboard(@Param('plantId') plantId: string, @Param('code') code: string, @CurrentUser() user?: AuthUser) {
    return this.process.networkDashboard(plantId, code, user)
  }
}
