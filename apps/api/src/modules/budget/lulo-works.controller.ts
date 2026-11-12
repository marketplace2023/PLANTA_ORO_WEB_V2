import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UseInterceptors } from '@nestjs/common'
import { z } from 'zod'
import type { AuthUser, PlantRow } from '../../common/types'
import { ZodValidationPipe as Pipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, CurrentUser, RequirePermission } from '../iam/decorators'
import { LuloWorksService } from './lulo-works.service'
import { clientSchema, createContractSchema, createWorkRecordSchema, transferComputationSchema, updateWorkRecordSchema, workActionSchema, workSchema } from './lulo-works.schemas'
import { workReport } from './lulo-works.reports'
import { LuloDbInterceptor } from './lulo-db.interceptor'

const clientUpdate = z.object({ expectedRevision: z.number().int().positive(), input: clientSchema }).strict()
const workUpdate = z.object({ expectedRevision: z.number().int().positive(), input: workSchema }).strict()
const preview = z.object({ expectedRevision: z.number().int().positive() }).strict()
const cutoffSchema = z.object({ cutoff: z.iso.date() })
const reportSchema = z.object({ format: z.enum(['pdf', 'xlsx']).default('pdf') })
@Controller('plants/:plantId/lulo')
@UseInterceptors(LuloDbInterceptor)
export class LuloWorksController {
  constructor(private readonly works: LuloWorksService) {}
  @Get('clients') @RequirePermission('budget.read') clients(@CurrentPlant() p: PlantRow) { return this.works.clients(p) }
  @Post('clients') @RequirePermission('budget.edit') client(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Body(new Pipe(clientSchema)) input: z.infer<typeof clientSchema>) { return this.works.saveClient(p, input, u) }
  @Patch('clients/:id') @RequirePermission('budget.edit') updateClient(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new Pipe(clientUpdate)) data: z.infer<typeof clientUpdate>) { return this.works.saveClient(p, data.input, u, id, data.expectedRevision) }
  @Get('works') @RequirePermission('budget.read') listWorks(@CurrentPlant() p: PlantRow) { return this.works.works(p) }
  @Post('works') @RequirePermission('budget.edit') work(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Body(new Pipe(workSchema)) input: z.infer<typeof workSchema>) { return this.works.saveWork(p, input, u) }
  @Patch('works/:id') @RequirePermission('budget.edit') updateWork(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new Pipe(workUpdate)) data: z.infer<typeof workUpdate>) { return this.works.saveWork(p, data.input, u, id, data.expectedRevision) }
  @Get('contracts') @RequirePermission('budget.read') contracts(@CurrentPlant() p: PlantRow) { return this.works.list(p) }
  @Post('contracts') @RequirePermission('budget.approve') activate(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Body(new Pipe(createContractSchema)) data: z.infer<typeof createContractSchema>) { return this.works.activate(p, data, u) }
  @Get('contracts/:id') @RequirePermission('budget.read') get(@CurrentPlant() p: PlantRow, @Param('id', ParseUUIDPipe) id: string) { return this.works.get(p, id) }
  @Get('contracts/:id/reconciliation') @RequirePermission('budget.read') reconciliation(@CurrentPlant() p: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Query(new Pipe(cutoffSchema)) q: z.infer<typeof cutoffSchema>) { return this.works.reconcile(p, id, q.cutoff) }
  @Get('contracts/:id/progress') @RequirePermission('budget.read') progress(@CurrentPlant() p: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Query(new Pipe(cutoffSchema)) q: z.infer<typeof cutoffSchema>) { return this.works.progress(p, id, q.cutoff) }
  @Post('contracts/:id/records') @RequirePermission('budget.edit') create(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new Pipe(createWorkRecordSchema)) data: z.infer<typeof createWorkRecordSchema>) { return this.works.create(p, id, data, u) }
  @Patch('contracts/:id/records/:recordId') @RequirePermission('budget.edit') update(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('recordId', ParseUUIDPipe) recordId: string, @Body(new Pipe(updateWorkRecordSchema)) data: z.infer<typeof updateWorkRecordSchema>) { return this.works.update(p, id, recordId, data, u) }
  @Post('contracts/:id/records/:recordId/preview') @RequirePermission('budget.read') preview(@CurrentPlant() p: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Param('recordId', ParseUUIDPipe) recordId: string, @Body(new Pipe(preview)) data: z.infer<typeof preview>) { return this.works.preview(p, id, recordId, data.expectedRevision) }
  @Post('contracts/:id/records/:recordId/submit') @RequirePermission('budget.edit') submit(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('recordId', ParseUUIDPipe) recordId: string, @Body(new Pipe(workActionSchema)) data: z.infer<typeof workActionSchema>) { return this.works.action(p, id, recordId, 'submit', data, u) }
  @Post('contracts/:id/records/:recordId/return') @RequirePermission('budget.approve') return(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('recordId', ParseUUIDPipe) recordId: string, @Body(new Pipe(workActionSchema)) data: z.infer<typeof workActionSchema>) { return this.works.action(p, id, recordId, 'return', data, u) }
  @Post('contracts/:id/records/:recordId/approve') @RequirePermission('budget.approve') approve(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('recordId', ParseUUIDPipe) recordId: string, @Body(new Pipe(workActionSchema)) data: z.infer<typeof workActionSchema>) { return this.works.action(p, id, recordId, 'approve', data, u) }
  @Post('contracts/:id/records/:recordId/issue') @RequirePermission('budget.approve') issue(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('recordId', ParseUUIDPipe) recordId: string, @Body(new Pipe(workActionSchema)) data: z.infer<typeof workActionSchema>) { return this.works.action(p, id, recordId, 'issue', data, u) }
  @Post('contracts/:id/records/:recordId/rectify') @RequirePermission('budget.approve') rectify(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('recordId', ParseUUIDPipe) recordId: string, @Body(new Pipe(workActionSchema)) data: z.infer<typeof workActionSchema>) { return this.works.rectify(p, id, recordId, data, u) }
  @Post('contracts/:id/records/:recordId/transfer') @RequirePermission('budget.edit') transfer(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('recordId', ParseUUIDPipe) recordId: string, @Body(new Pipe(transferComputationSchema)) data: z.infer<typeof transferComputationSchema>) { return this.works.transfer(p, id, recordId, data, u) }
  @Get('contracts/:id/records/:recordId/report') @RequirePermission('budget.read')
  async report(@CurrentPlant() p: PlantRow, @Param('id', ParseUUIDPipe) id: string, @Param('recordId', ParseUUIDPipe) recordId: string, @Query(new Pipe(reportSchema)) q: z.infer<typeof reportSchema>) {
    const data = await this.works.get(p, id); const report = await workReport(data, recordId, q.format)
    return new StreamableFile(report.buffer, { type: q.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: `attachment; filename="${report.code}.${q.format}"` })
  }
}
