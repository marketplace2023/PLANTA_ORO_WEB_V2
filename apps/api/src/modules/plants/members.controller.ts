import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import type { AppRequest, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, RequirePermission } from '../iam/decorators'
import { MembersService } from './members.service'
import { type AssignMemberDto, assignMemberSchema } from './plants.schemas'

@Controller('plants/:plantId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @RequirePermission('user.read')
  @Get()
  list(@CurrentPlant() plant: PlantRow) {
    return this.members.list(plant)
  }

  /** Roles que se pueden asignar a una planta (roles de planta + usuario común). */
  @RequirePermission('user.assign')
  @Get('roles')
  roles() {
    return this.members.assignableRoles()
  }

  @RequirePermission('user.assign')
  @Post()
  assign(
    @CurrentPlant() plant: PlantRow,
    @Body(new ZodValidationPipe(assignMemberSchema)) dto: AssignMemberDto,
    @Req() req: AppRequest,
  ) {
    return this.members.assign(plant, dto, req)
  }

  @RequirePermission('user.assign')
  @Delete(':assignmentId')
  @HttpCode(204)
  remove(
    @CurrentPlant() plant: PlantRow,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Req() req: AppRequest,
  ) {
    return this.members.remove(plant, assignmentId, req)
  }
}
