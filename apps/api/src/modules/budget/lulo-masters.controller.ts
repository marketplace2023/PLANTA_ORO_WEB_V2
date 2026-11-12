import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common'
import type { z } from 'zod'
import { CurrentPlant, CurrentUser, Public, RequirePermission } from '../iam/decorators'
import type { AuthUser, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { LuloMastersService, masterListSchema, masterValueSchema } from './lulo-masters.service'

@Controller('budget-masters')
@Public()
export class LuloMastersPublicController {
  constructor(private readonly masters: LuloMastersService) {}
  @Get('catalogs') catalogs() { return this.masters.catalogs() }
  @Get() list(@Query(new ZodValidationPipe(masterListSchema)) q: z.infer<typeof masterListSchema>) { return this.masters.list(q) }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) { return this.masters.detail(id) }
}

@Controller('plants/:plantId/lulo/masters')
export class LuloMastersPlantController {
  constructor(private readonly masters: LuloMastersService) {}
  @Get('catalogs') @RequirePermission('budget.read') catalogs() { return this.masters.catalogs() }
  @Get() @RequirePermission('budget.read') list(@CurrentPlant() plant: PlantRow, @Query(new ZodValidationPipe(masterListSchema)) q: z.infer<typeof masterListSchema>) { return this.masters.list(q, plant.id) }
  @Get(':id') @RequirePermission('budget.read') detail(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) { return this.masters.detail(id, plant.id) }
  @Patch(':id') @RequirePermission('budget.edit') save(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(masterValueSchema)) data: z.infer<typeof masterValueSchema>, @CurrentUser() user: AuthUser) { return this.masters.save(plant.id, id, data, user) }
}
