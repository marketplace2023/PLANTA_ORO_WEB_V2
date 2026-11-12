import { Controller, ForbiddenException, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { DB,type Database } from '../../database/database.module'
import { budgetMasterBatches,budgetMasterEntries,budgetMasterReviews } from '../../database/schema'
import type { AuthUser } from '../../common/types'
import { escapeLike } from '../../common/pagination'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentUser } from '../iam/decorators'

const query=z.object({kind:z.enum(['FAMILY','RESOURCE','ITEM','APU']).optional(),type:z.enum(['MATERIAL','EQUIPMENT','LABOR']).optional(),status:z.enum(['RECOVERED','QUARANTINED']).optional(),reviewState:z.enum(['DRAFT','APPROVED']).optional(),search:z.string().trim().max(160).optional(),page:z.coerce.number().int().min(1).max(10000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(30)})
@Controller('admin/budget-catalog')
export class MasterRecoveryController{
  constructor(@Inject(DB)private readonly db:Database){}
  private admin(user:AuthUser){if(!user.isGlobalAdmin)throw new ForbiddenException('Solo administración del ecosistema puede revisar maestros recuperados')}
  @Get('batches') async batches(@CurrentUser()u:AuthUser){this.admin(u);return this.db.select().from(budgetMasterBatches).orderBy(desc(budgetMasterBatches.createdAt)).limit(100)}
  @Get('batches/:id/entries') async entries(@Param('id',ParseUUIDPipe)id:string,@Query(new ZodValidationPipe(query))q:z.infer<typeof query>,@CurrentUser()u:AuthUser){
    this.admin(u)
    if(!(await this.db.select({id:budgetMasterBatches.id}).from(budgetMasterBatches).where(eq(budgetMasterBatches.id,id)))[0])throw new NotFoundException('Lote no encontrado')
    const name=sql<string>`coalesce(${budgetMasterReviews.draft}->>'name', ${budgetMasterEntries.name})`
    const state=sql<string>`coalesce(${budgetMasterReviews.state}, 'DRAFT')`
    const where=and(eq(budgetMasterEntries.batchId,id),q.kind?eq(budgetMasterEntries.kind,q.kind):undefined,q.type?eq(budgetMasterEntries.resourceType,q.type):undefined,q.status?eq(budgetMasterEntries.status,q.status):undefined,q.reviewState?eq(state,q.reviewState):undefined,q.search?or(ilike(budgetMasterEntries.code,`%${escapeLike(q.search)}%`),ilike(name,`%${escapeLike(q.search)}%`)):undefined)
    const join=eq(budgetMasterReviews.entryId,budgetMasterEntries.id)
    const [items,[count]]=await Promise.all([this.db.select({id:budgetMasterEntries.id,kind:budgetMasterEntries.kind,resourceType:budgetMasterEntries.resourceType,code:budgetMasterEntries.code,name,unit:sql<string|null>`case when ${budgetMasterReviews.entryId} is null then ${budgetMasterEntries.unit} else ${budgetMasterReviews.draft}->>'unit' end`,status:budgetMasterEntries.status,issues:budgetMasterEntries.issues,sourceId:budgetMasterEntries.sourceId,sourceContext:budgetMasterEntries.sourceContext,reviewState:state,revision:sql<number>`coalesce(${budgetMasterReviews.revision}, 0)`}).from(budgetMasterEntries).leftJoin(budgetMasterReviews,join).where(where).orderBy(asc(budgetMasterEntries.code),asc(budgetMasterEntries.id)).limit(q.pageSize).offset((q.page-1)*q.pageSize),this.db.select({total:sql<number>`count(*)::int`}).from(budgetMasterEntries).leftJoin(budgetMasterReviews,join).where(where)])
    return {items,total:count.total,page:q.page,pageSize:q.pageSize}
  }
  @Get('entries/:id') async detail(@Param('id',ParseUUIDPipe)id:string,@CurrentUser()u:AuthUser){this.admin(u);const [e]=await this.db.select().from(budgetMasterEntries).where(eq(budgetMasterEntries.id,id));if(!e)throw new NotFoundException();return e}
}
