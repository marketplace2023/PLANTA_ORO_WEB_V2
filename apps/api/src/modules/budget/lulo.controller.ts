import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { z } from 'zod'
import type { AuthUser, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, CurrentUser, GlobalAdminOnly, Public, RequirePermission } from '../iam/decorators'
import { LuloCatalogService } from './lulo-catalog.service'
import { LuloDocumentsService } from './lulo-documents.service'
import { luloActionSchema, luloAdoptSchema, luloInputSchema, luloListSchema, luloPublicationSchema, luloRefreshSchema, luloReportSchema, luloSaveSchema } from './lulo.schemas'
import { luloHash } from './lulo-hash'
import { luloExcel, luloPdf } from './lulo-reports'
import { demoLuloInput } from './lulo-demo'

const reason = z.object({ reason: z.string().trim().min(8).max(1000) }).strict()
const revision = luloActionSchema.extend({ requestId: z.uuid() })
const file = (buffer: Buffer, format: 'pdf' | 'xlsx', name: string) => new StreamableFile(buffer, { type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: `attachment; filename="${name}.${format}"` })

@Controller('budget-estimates')
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class LuloPublicController {
  constructor(private readonly catalogs: LuloCatalogService) {}
  @Get('publications') publications() { return this.catalogs.publications() }
  @Get('publications/:id/apus') search(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(luloListSchema)) q: z.infer<typeof luloListSchema>) { return this.catalogs.search(id, q.page, q.search) }
  @Get('example') async example() {
    const publications = await this.catalogs.publications(); const demo = publications.find(p => p.demo && p.version === 1)
    if (!demo) return { available: false, input: null }
    const catalog = await this.catalogs.catalog(demo.id)
    return { available: true, input: demoLuloInput(catalog.publicationId!, catalog.apus[0]) }
  }
  @Post('calculate')
  @Header('Cache-Control', 'no-store')
  async calculate(@Body(new ZodValidationPipe(luloInputSchema)) input: z.infer<typeof luloInputSchema>) {
    const catalog = await this.catalogs.snapshot(input); const calculated = this.catalogs.calculate(input, catalog)
    return { ...calculated, catalog, hash: luloHash({ input, catalog, result: calculated.result }) }
  }
  @Post('report')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async report(@Body(new ZodValidationPipe(luloInputSchema)) input: z.infer<typeof luloInputSchema>, @Query(new ZodValidationPipe(luloReportSchema)) q: z.infer<typeof luloReportSchema>) {
    const catalog = await this.catalogs.snapshot(input); const { result } = this.catalogs.calculate(input, catalog)
    const data = { input, catalog, result, contentHash: luloHash({ input, catalog, result }) }
    return file(q.format === 'pdf' ? await luloPdf(data, q.kind) : await luloExcel(data, q.kind), q.format, `FUR-LULO-preliminar-${q.kind}`)
  }
}

@Controller('admin/budget-catalog')
@GlobalAdminOnly()
export class LuloPublicationController {
  constructor(private readonly catalogs: LuloCatalogService) {}
  @Get('publications') list() { return this.catalogs.publications(true) }
  @Post('releases/:id/activate') activate(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(luloPublicationSchema)) data: z.infer<typeof luloPublicationSchema>, @CurrentUser() actor: AuthUser) { return this.catalogs.activate(id, data, actor) }
  @Post('publications/:id/withdraw') withdraw(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(reason)) data: z.infer<typeof reason>, @CurrentUser() actor: AuthUser) { return this.catalogs.withdraw(id, data.reason, actor) }
}

@Controller('plants/:plantId/lulo')
export class LuloPlantController {
  constructor(private readonly documents: LuloDocumentsService, private readonly catalogs: LuloCatalogService) {}
  @Post('calculate') @RequirePermission('budget.read') @Header('Cache-Control', 'no-store')
  async calculate(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(luloInputSchema)) input: z.infer<typeof luloInputSchema>) {
    const catalog = await this.catalogs.snapshot(input, undefined, plant.id); const calculated = this.catalogs.calculate(input, catalog)
    return { ...calculated, catalog, hash: luloHash({ input, catalog, result: calculated.result }) }
  }
  @Post('report') @RequirePermission('budget.read') @Header('Cache-Control', 'no-store')
  async draftReport(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(luloInputSchema)) input: z.infer<typeof luloInputSchema>, @Query(new ZodValidationPipe(luloReportSchema)) q: z.infer<typeof luloReportSchema>) {
    const catalog = await this.catalogs.snapshot(input, undefined, plant.id); const { result } = this.catalogs.calculate(input, catalog)
    const data = { input, catalog, result, contentHash: luloHash({ input, catalog, result }) }
    return file(q.format === 'pdf' ? await luloPdf(data, q.kind) : await luloExcel(data, q.kind), q.format, `FUR-LULO-preliminar-${q.kind}`)
  }
  @Get('documents') @RequirePermission('budget.read') list(@CurrentPlant() plant: PlantRow, @Query(new ZodValidationPipe(luloListSchema)) q: z.infer<typeof luloListSchema>) { return this.documents.list(plant, q.page, q.search) }
  @Get('documents/:id') @RequirePermission('budget.read') get(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string) { return this.documents.get(plant, id) }
  @Post('documents') @RequirePermission('budget.edit') adopt(@CurrentPlant() plant: PlantRow, @Body(new ZodValidationPipe(luloAdoptSchema)) data: z.infer<typeof luloAdoptSchema>, @CurrentUser() actor: AuthUser) { return this.documents.adopt(plant, data.requestId, data.input, actor) }
  @Patch('documents/:id') @RequirePermission('budget.edit') save(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(luloSaveSchema)) data: z.infer<typeof luloSaveSchema>, @CurrentUser() actor: AuthUser) { return this.documents.save(plant, id, data, actor) }
  @Post('documents/:id/preview') @RequirePermission('budget.edit') preview(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(luloSaveSchema)) data: z.infer<typeof luloSaveSchema>) { return this.documents.preview(plant, id, data) }
  @Post('documents/:id/submit') @RequirePermission('budget.edit') submit(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(luloActionSchema)) data: z.infer<typeof luloActionSchema>, @CurrentUser() actor: AuthUser) { return this.documents.transition(plant, id, data, 'SUBMIT', actor) }
  @Post('documents/:id/return') @RequirePermission('budget.approve') sendBack(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(luloActionSchema)) data: z.infer<typeof luloActionSchema>, @CurrentUser() actor: AuthUser) { return this.documents.transition(plant, id, data, 'RETURN', actor) }
  @Post('documents/:id/issue') @RequirePermission('budget.approve') issue(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(luloActionSchema)) data: z.infer<typeof luloActionSchema>, @CurrentUser() actor: AuthUser) { return this.documents.transition(plant, id, data, 'ISSUE', actor) }
  @Post('documents/:id/revisions') @RequirePermission('budget.edit') revise(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(revision)) data: z.infer<typeof revision>, @CurrentUser() actor: AuthUser) { return this.documents.revise(plant, id, data, actor) }
  @Post('documents/:id/recalculate-preview') @RequirePermission('budget.edit') refreshPreview(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(luloRefreshSchema)) data: z.infer<typeof luloRefreshSchema>, @CurrentUser() actor: AuthUser) { return this.documents.refresh(plant, id, data, actor, false) }
  @Post('documents/:id/recalculate') @RequirePermission('budget.edit') refresh(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(luloRefreshSchema)) data: z.infer<typeof luloRefreshSchema>, @CurrentUser() actor: AuthUser) { return this.documents.refresh(plant, id, data, actor, true) }
  @Get('documents/:id/report') @RequirePermission('budget.read') @Header('Cache-Control', 'no-store')
  async report(@CurrentPlant() plant: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(luloReportSchema)) q: z.infer<typeof luloReportSchema>) {
    const doc = await this.documents.get(plant, id)
    return file(q.format === 'pdf' ? await luloPdf(doc, q.kind) : await luloExcel(doc, q.kind), q.format, `${doc.code}-v${doc.version}-${q.kind}`)
  }
}
