import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common'
import type { AppRequest, AuthUser } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentUser, GlobalAdminOnly } from '../iam/decorators'
import { AccessRequestsService } from './access-requests.service'
import {
  type ApproveAccessRequestDto,
  approveAccessRequestSchema,
  type CreateAccessRequestDto,
  createAccessRequestSchema,
  type RejectAccessRequestDto,
  rejectAccessRequestSchema,
} from './plants.schemas'

/** Lo que hace la persona: pedir acceso a una planta, ver sus solicitudes y retirar las pendientes. */
@Controller('plant-access-requests')
export class PlantAccessRequestsController {
  constructor(private readonly requests: AccessRequestsService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.requests.mine(user)
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createAccessRequestSchema)) dto: CreateAccessRequestDto, @Req() req: AppRequest) {
    return this.requests.create(user, dto, req)
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: AppRequest) {
    return this.requests.cancel(user, id, req)
  }
}

/** Lo que hace el administrador del ecosistema: revisar y decidir. */
@GlobalAdminOnly()
@Controller('admin/plant-access-requests')
export class AdminPlantAccessRequestsController {
  constructor(private readonly requests: AccessRequestsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.requests.list(status)
  }

  @Post(':id/approve')
  approve(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approveAccessRequestSchema)) dto: ApproveAccessRequestDto,
    @Req() req: AppRequest,
  ) {
    return this.requests.approve(admin, id, dto, req)
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectAccessRequestSchema)) dto: RejectAccessRequestDto,
    @Req() req: AppRequest,
  ) {
    return this.requests.reject(admin, id, dto, req)
  }
}
