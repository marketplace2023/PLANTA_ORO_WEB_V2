import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, CurrentUser, Public, RequirePermission } from '../iam/decorators'
import {
  type CreateAssetDto,
  createAssetSchema,
  type ListAssetsQuery,
  listAssetsQuerySchema,
  type UpdateAssetDto,
  updateAssetSchema,
} from './assets.schemas'
import { AssetsService } from './assets.service'

@Controller('plants/:plantId/assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Public()
  @Get()
  list(
    @Param('plantId') plantId: string,
    @Query(new ZodValidationPipe(listAssetsQuerySchema)) query: ListAssetsQuery,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.assets.list(plantId, query, user)
  }

  @RequirePermission('asset.create')
  @Post()
  create(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(createAssetSchema)) dto: CreateAssetDto, @Req() req: AppRequest) {
    return this.assets.create(plant, dto, req)
  }

  @Public()
  @Get(':assetId')
  get(@Param('plantId') plantId: string, @Param('assetId', ParseUUIDPipe) assetId: string, @CurrentUser() user?: AuthUser) {
    return this.assets.get(plantId, assetId, user)
  }

  /** Ficha Única de Registro consolidada (arquitectura §14.2). */
  @Public()
  @Get(':assetId/fur')
  fur(@Param('plantId') plantId: string, @Param('assetId', ParseUUIDPipe) assetId: string, @CurrentUser() user?: AuthUser) {
    return this.assets.fur(plantId, assetId, user)
  }

  @RequirePermission('asset.update')
  @Patch(':assetId')
  update(
    @CurrentPlant() plant: PlantRow,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Body(new ZodValidationPipe(updateAssetSchema)) dto: UpdateAssetDto,
    @Req() req: AppRequest,
  ) {
    return this.assets.update(plant, assetId, dto, req)
  }

  /** Baja lógica: el activo y su historial se conservan. */
  @RequirePermission('asset.delete')
  @Delete(':assetId')
  @HttpCode(204)
  decommission(@CurrentPlant() plant: PlantRow, @Param('assetId', ParseUUIDPipe) assetId: string, @Req() req: AppRequest) {
    return this.assets.decommission(plant, assetId, req)
  }
}
