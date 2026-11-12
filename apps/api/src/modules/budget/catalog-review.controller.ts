import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { z } from 'zod'
import type { AuthUser } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentUser, GlobalAdminOnly } from '../iam/decorators'
import { CatalogReviewService } from './catalog-review.service'
import { catalogActionSchema, catalogEditSchema, catalogPublishSchema, catalogReleaseSchema, type CatalogAction, type CatalogEdit, type CatalogPublishInput, type CatalogReleaseInput } from './catalog-review.rules'

const pages = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) })

@Controller('admin/budget-catalog')
@GlobalAdminOnly()
export class CatalogReviewController {
  constructor(private readonly service: CatalogReviewService) {}

  @Get('entries/:id/review')
  review(@Param('id', ParseUUIDPipe) id: string) { return this.service.review(id) }

  @Get('entries/:id/history')
  history(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(pages)) q: z.infer<typeof pages>) { return this.service.history(id, q.page) }

  @Get('batches/:id/review-summary')
  summary(@Param('id', ParseUUIDPipe) id: string) { return this.service.summary(id) }

  @Patch('entries/:id/review')
  edit(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(catalogEditSchema)) body: CatalogEdit, @CurrentUser() u: AuthUser) { return this.service.edit(id, body, u) }

  @Post('entries/:id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(catalogActionSchema)) body: CatalogAction, @CurrentUser() u: AuthUser) { return this.service.approve(id, body, u) }

  @Get('batches/:id/releases')
  releases(@Param('id', ParseUUIDPipe) id: string) { return this.service.releases(id) }

  @Post('batches/:id/releases')
  prepare(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(catalogReleaseSchema)) body: CatalogReleaseInput, @CurrentUser() u: AuthUser) { return this.service.prepare(id, body, u) }

  @Get('releases/:id')
  release(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(pages)) q: z.infer<typeof pages>) { return this.service.release(id, q.page) }

  @Post('releases/:id/publish')
  publish(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(catalogPublishSchema)) body: CatalogPublishInput, @CurrentUser() u: AuthUser) { return this.service.publish(id, body, u) }
}
