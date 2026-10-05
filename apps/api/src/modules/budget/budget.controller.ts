import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common'
import type { AppRequest, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, RequirePermission } from '../iam/decorators'
import { AnalysisService } from './analysis.service'
import { ApusService } from './apus.service'
import {
  type ApuLineDto,
  apuLineSchema,
  type ChapterDto,
  chapterSchema,
  type CreateApuDto,
  createApuSchema,
  type CreateBudgetDto,
  createBudgetSchema,
  type CreateProjectDto,
  createProjectSchema,
  type CreateResourceDto,
  createResourceSchema,
  exchangeRateSchema,
  importInventorySchema,
  type ItemDto,
  itemSchema,
  type ListApusQuery,
  listApusQuerySchema,
  type ListBudgetsQuery,
  listBudgetsQuerySchema,
  type ListResourcesQuery,
  listResourcesQuerySchema,
  type ScenarioDto,
  scenarioSchema,
  type UpdateApuDto,
  type UpdateApuLineDto,
  updateApuLineSchema,
  updateApuSchema,
  type UpdateBudgetDto,
  updateBudgetSchema,
  type UpdateChapterDto,
  updateChapterSchema,
  type UpdateItemDto,
  updateItemSchema,
  type UpdateProjectDto,
  updateProjectSchema,
  type UpdateResourceDto,
  updateResourceSchema,
  type ValuationDto,
  valuationSchema,
} from './budget.schemas'
import { BudgetsService } from './budgets.service'
import { ResourcesService } from './resources.service'
import { ValuationsService } from './valuations.service'

/**
 * Presupuestos (LULO) son información interna de la planta: nada es público.
 * Leer = budget.read · editar = budget.edit (rol Presupuesto) · aprobar presupuestos y valorizaciones = budget.approve (gerencia).
 */
@Controller('plants/:plantId/budgets')
export class BudgetController {
  constructor(
    private readonly resources: ResourcesService,
    private readonly apus: ApusService,
    private readonly budgets: BudgetsService,
    private readonly analysis: AnalysisService,
    private readonly valuations: ValuationsService,
  ) {}

  @RequirePermission('budget.read')
  @Get('summary')
  summary(@CurrentPlant() plant: PlantRow) {
    return this.analysis.summary(plant)
  }

  // ----- Recursos y precios -----

  @RequirePermission('budget.read')
  @Get('resources')
  listResources(@CurrentPlant() plant: PlantRow, @Query(new ZodValidationPipe(listResourcesQuerySchema)) q: ListResourcesQuery) {
    return this.resources.list(plant, q)
  }

  @RequirePermission('budget.edit')
  @Post('resources')
  createResource(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(createResourceSchema)) dto: CreateResourceDto, @Req() req: AppRequest) {
    return this.resources.create(plant, dto, req)
  }

  @RequirePermission('budget.edit')
  @Post('resources/import-inventory')
  importInventory(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(importInventorySchema)) dto: { itemId: string; resourceType: 'MATERIAL' | 'EQUIPMENT' | 'TRANSPORT'; code?: string }, @Req() req: AppRequest) {
    return this.resources.importFromInventory(plant, dto, req)
  }

  @RequirePermission('budget.edit')
  @Patch('resources/:id')
  updateResource(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateResourceSchema)) dto: UpdateResourceDto, @Req() req: AppRequest) {
    return this.resources.update(plant, id, dto, req)
  }

  @RequirePermission('budget.read')
  @Get('resources/:id/history')
  history(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) {
    return this.resources.history(plant, id)
  }

  @RequirePermission('budget.read')
  @Get('resources/:id/usage')
  usage(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) {
    return this.resources.usage(plant, id)
  }

  @RequirePermission('budget.read')
  @Get('exchange-rates')
  rates(@CurrentPlant() plant: PlantRow) {
    return this.resources.listRates(plant)
  }

  @RequirePermission('budget.edit')
  @Put('exchange-rates')
  setRate(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(exchangeRateSchema)) dto: { currency: string; rate: number }, @Req() req: AppRequest) {
    return this.resources.setRate(plant, dto, req)
  }

  @RequirePermission('budget.edit')
  @Delete('exchange-rates/:currency')
  deleteRate(@CurrentPlant() plant: PlantRow, @Param('currency') currency: string, @Req() req: AppRequest) {
    return this.resources.deleteRate(plant, currency.toUpperCase(), req)
  }

  // ----- APU -----

  @RequirePermission('budget.read')
  @Get('apus')
  listApus(@CurrentPlant() plant: PlantRow, @Query(new ZodValidationPipe(listApusQuerySchema)) q: ListApusQuery) {
    return this.apus.list(plant, q)
  }

  @RequirePermission('budget.edit')
  @Post('apus')
  createApu(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(createApuSchema)) dto: CreateApuDto, @Req() req: AppRequest) {
    return this.apus.create(plant, dto, req)
  }

  @RequirePermission('budget.read')
  @Get('apus/:id')
  getApu(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) {
    return this.apus.get(plant, id)
  }

  @RequirePermission('budget.edit')
  @Patch('apus/:id')
  updateApu(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateApuSchema)) dto: UpdateApuDto, @Req() req: AppRequest) {
    return this.apus.update(plant, id, dto, req)
  }

  @RequirePermission('budget.edit')
  @Post('apus/:id/lines')
  addApuLine(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(apuLineSchema)) dto: ApuLineDto, @Req() req: AppRequest) {
    return this.apus.addLine(plant, id, dto, req)
  }

  @RequirePermission('budget.edit')
  @Patch('apus/:id/lines/:lineId')
  updateApuLine(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body(new ZodValidationPipe(updateApuLineSchema)) dto: UpdateApuLineDto,
    @Req() req: AppRequest,
  ) {
    return this.apus.updateLine(plant, id, lineId, dto, req)
  }

  @RequirePermission('budget.edit')
  @Delete('apus/:id/lines/:lineId')
  deleteApuLine(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string, @Req() req: AppRequest) {
    return this.apus.deleteLine(plant, id, lineId, req)
  }

  // ----- Proyectos -----

  @RequirePermission('budget.read')
  @Get('projects')
  listProjects(@CurrentPlant() plant: PlantRow) {
    return this.budgets.listProjects(plant)
  }

  @RequirePermission('budget.edit')
  @Post('projects')
  createProject(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(createProjectSchema)) dto: CreateProjectDto, @Req() req: AppRequest) {
    return this.budgets.createProject(plant, dto, req)
  }

  @RequirePermission('budget.edit')
  @Patch('projects/:id')
  updateProject(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateProjectSchema)) dto: UpdateProjectDto, @Req() req: AppRequest) {
    return this.budgets.updateProject(plant, id, dto, req)
  }

  // ----- Presupuestos -----

  @RequirePermission('budget.read')
  @Get()
  list(@CurrentPlant() plant: PlantRow, @Query(new ZodValidationPipe(listBudgetsQuerySchema)) q: ListBudgetsQuery) {
    return this.budgets.list(plant, q)
  }

  @RequirePermission('budget.edit')
  @Post()
  create(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(createBudgetSchema)) dto: CreateBudgetDto, @Req() req: AppRequest) {
    return this.budgets.create(plant, dto, req)
  }

  @RequirePermission('budget.read')
  @Get(':id')
  get(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgets.get(plant, id)
  }

  @RequirePermission('budget.edit')
  @Patch(':id')
  update(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateBudgetSchema)) dto: UpdateBudgetDto, @Req() req: AppRequest) {
    return this.budgets.update(plant, id, dto, req)
  }

  @RequirePermission('budget.edit')
  @Post(':id/chapters')
  addChapter(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(chapterSchema)) dto: ChapterDto, @Req() req: AppRequest) {
    return this.budgets.addChapter(plant, id, dto, req)
  }

  @RequirePermission('budget.edit')
  @Patch(':id/chapters/:chapterId')
  updateChapter(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
    @Body(new ZodValidationPipe(updateChapterSchema)) dto: UpdateChapterDto,
    @Req() req: AppRequest,
  ) {
    return this.budgets.updateChapter(plant, id, chapterId, dto, req)
  }

  @RequirePermission('budget.edit')
  @Delete(':id/chapters/:chapterId')
  deleteChapter(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Param('chapterId', ParseUUIDPipe) chapterId: string, @Req() req: AppRequest) {
    return this.budgets.deleteChapter(plant, id, chapterId, req)
  }

  @RequirePermission('budget.edit')
  @Post(':id/items')
  addItem(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(itemSchema)) dto: ItemDto, @Req() req: AppRequest) {
    return this.budgets.addItem(plant, id, dto, req)
  }

  @RequirePermission('budget.edit')
  @Patch(':id/items/:itemId')
  updateItem(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(updateItemSchema)) dto: UpdateItemDto,
    @Req() req: AppRequest,
  ) {
    return this.budgets.updateItem(plant, id, itemId, dto, req)
  }

  @RequirePermission('budget.edit')
  @Delete(':id/items/:itemId')
  deleteItem(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Req() req: AppRequest) {
    return this.budgets.deleteItem(plant, id, itemId, req)
  }

  @RequirePermission('budget.approve')
  @Post(':id/approve')
  approve(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    return this.budgets.approve(plant, id, req)
  }

  @RequirePermission('budget.approve')
  @Post(':id/close')
  close(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    return this.budgets.close(plant, id, req)
  }

  @RequirePermission('budget.edit')
  @Post(':id/duplicate')
  duplicate(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    return this.budgets.duplicate(plant, id, req)
  }

  // ----- Escenarios y análisis -----

  @RequirePermission('budget.read')
  @Get(':id/scenarios')
  listScenarios(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) {
    return this.analysis.listScenarios(plant, id)
  }

  @RequirePermission('budget.edit')
  @Post(':id/scenarios')
  createScenario(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(scenarioSchema)) dto: ScenarioDto, @Req() req: AppRequest) {
    return this.analysis.createScenario(plant, id, dto, req)
  }

  @RequirePermission('budget.edit')
  @Delete(':id/scenarios/:scenarioId')
  @HttpCode(204)
  deleteScenario(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Param('scenarioId', ParseUUIDPipe) scenarioId: string, @Req() req: AppRequest) {
    return this.analysis.deleteScenario(plant, id, scenarioId, req)
  }

  @RequirePermission('budget.read')
  @Get(':id/analysis')
  getAnalysis(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) {
    return this.analysis.analysis(plant, id)
  }

  @RequirePermission('budget.read')
  @Get(':id/deviations')
  deviations(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) {
    return this.analysis.deviations(plant, id)
  }

  // ----- Valorizaciones -----

  @RequirePermission('budget.read')
  @Get(':id/valuations')
  listValuations(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) {
    return this.valuations.list(plant, id)
  }

  @RequirePermission('budget.edit')
  @Post(':id/valuations')
  createValuation(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(valuationSchema)) dto: ValuationDto, @Req() req: AppRequest) {
    return this.valuations.create(plant, id, dto, req)
  }

  @RequirePermission('budget.read')
  @Get(':id/valuations/:valuationId')
  getValuation(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Param('valuationId', ParseUUIDPipe) valuationId: string) {
    return this.valuations.get(plant, id, valuationId)
  }

  @RequirePermission('budget.edit')
  @Patch(':id/valuations/:valuationId')
  updateValuation(
    @CurrentPlant() plant: PlantRow,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('valuationId', ParseUUIDPipe) valuationId: string,
    @Body(new ZodValidationPipe(valuationSchema)) dto: ValuationDto,
    @Req() req: AppRequest,
  ) {
    return this.valuations.update(plant, id, valuationId, dto, req)
  }

  @RequirePermission('budget.edit')
  @Delete(':id/valuations/:valuationId')
  @HttpCode(204)
  removeValuation(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Param('valuationId', ParseUUIDPipe) valuationId: string, @Req() req: AppRequest) {
    return this.valuations.remove(plant, id, valuationId, req)
  }

  @RequirePermission('budget.approve')
  @Post(':id/valuations/:valuationId/approve')
  approveValuation(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Param('valuationId', ParseUUIDPipe) valuationId: string, @Req() req: AppRequest) {
    return this.valuations.approve(plant, id, valuationId, req)
  }
}
