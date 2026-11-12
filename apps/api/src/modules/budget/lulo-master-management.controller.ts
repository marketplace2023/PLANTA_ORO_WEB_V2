import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, StreamableFile, UploadedFile, UseInterceptors, UnprocessableEntityException } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { z } from 'zod'
import type { AuthUser, PlantRow } from '../../common/types'
import { ZodValidationPipe as Pipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, CurrentUser, RequirePermission } from '../iam/decorators'
import { LuloMasterManagementService, masterImportSchema, newMasterSchema, referenceSchema } from './lulo-master-management.service'
import { priceListSchema, priceSchema } from './lulo-works.schemas'
import { masterTemplate } from './lulo-master-import'
import { LuloDbInterceptor } from './lulo-db.interceptor'
const statusSchema = z.object({ active: z.boolean() }).strict()
const confirmSchema = z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const updateList = z.object({ expectedRevision: z.number().int().positive(), input: priceListSchema }).strict()
const updateReference = z.object({ expectedRevision: z.number().int().positive(), input: referenceSchema }).strict()
@Controller('plants/:plantId/lulo')
@UseInterceptors(LuloDbInterceptor)
export class LuloMasterManagementController {
  constructor(private readonly management: LuloMasterManagementService) {}
  @Get('references') @RequirePermission('budget.read') references(@CurrentPlant() p: PlantRow) { return this.management.references(p) }
  @Post('references') @RequirePermission('budget.edit') reference(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Body(new Pipe(referenceSchema)) input: z.infer<typeof referenceSchema>) { return this.management.saveReference(p, input, u) }
  @Patch('references/:id') @RequirePermission('budget.edit') updateReference(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new Pipe(updateReference)) data: z.infer<typeof updateReference>) { return this.management.saveReference(p, data.input, u, id, data.expectedRevision) }
  @Post('masters') @RequirePermission('budget.edit') create(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Body(new Pipe(newMasterSchema)) input: z.infer<typeof newMasterSchema>) { return this.management.create(p, input, u) }
  @Post('masters/:id/status') @RequirePermission('budget.edit') status(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new Pipe(statusSchema)) input: z.infer<typeof statusSchema>) { return this.management.deactivate(p, id, input.active, u) }
  @Get('price-lists') @RequirePermission('budget.read') lists(@CurrentPlant() p: PlantRow) { return this.management.lists(p) }
  @Post('price-lists') @RequirePermission('budget.edit') createList(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Body(new Pipe(priceListSchema)) input: z.infer<typeof priceListSchema>) { return this.management.saveList(p, input, undefined, undefined, u) }
  @Patch('price-lists/:id') @RequirePermission('budget.edit') updateList(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new Pipe(updateList)) data: z.infer<typeof updateList>) { return this.management.saveList(p, data.input, id, data.expectedRevision, u) }
  @Get('price-lists/:id/prices') @RequirePermission('budget.read') prices(@CurrentPlant() p: PlantRow, @Param('id', ParseUUIDPipe) id: string) { return this.management.prices(p, id) }
  @Post('price-lists/:id/prices') @RequirePermission('budget.edit') price(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new Pipe(priceSchema)) input: z.infer<typeof priceSchema>) { return this.management.price(p, id, input, u) }
  @Post('master-imports/preview') @RequirePermission('budget.edit') preview(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Body(new Pipe(masterImportSchema)) input: z.infer<typeof masterImportSchema>) { return this.management.previewImport(p, input, u) }
  @Get('master-imports/template') @RequirePermission('budget.read') async template() { return new StreamableFile(await masterTemplate(), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: 'attachment; filename="plantilla-maestros-lulo.xlsx"' }) }
  @Post('master-imports/upload') @RequirePermission('budget.edit') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Body('catalogId', ParseUUIDPipe) catalogId: string, @UploadedFile() file: Express.Multer.File) { if (!file) throw new UnprocessableEntityException('Adjunta la plantilla .xlsx o .csv'); return this.management.previewFile(p, catalogId, file, u) }
  @Post('master-imports/:id/confirm') @RequirePermission('budget.edit') confirm(@CurrentPlant() p: PlantRow, @CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new Pipe(confirmSchema)) data: z.infer<typeof confirmSchema>) { return this.management.confirmImport(p, id, data.hash, u) }
}
