import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import type { AppRequest, AuthUser } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentUser, Public } from '../iam/decorators'
import { CoursesService } from './courses.service'
import { LearningService } from './learning.service'
import {
  type CreateCourseDto,
  createCourseSchema,
  type LessonDto,
  lessonSchema,
  type ListCoursesQuery,
  listCoursesQuerySchema,
  type ManageQuery,
  manageQuerySchema,
  type UpdateCourseDto,
  updateCourseSchema,
  type UpdateLessonDto,
  updateLessonSchema,
} from './lms.schemas'

/**
 * Cursos (LMS) globales. El catálogo y el temario son públicos; el contenido de las lecciones, el avance y los
 * certificados exigen sesión; la gestión exige ser miembro de la organización propietaria (o administrador).
 */
@Controller('courses')
export class CoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly learning: LearningService,
  ) {}

  @Public()
  @Get()
  list(@Query(new ZodValidationPipe(listCoursesQuerySchema)) q: ListCoursesQuery, @CurrentUser() user?: AuthUser) {
    return this.courses.list(q, user)
  }

  // Las rutas estáticas van antes de ':id' para que no se interpreten como identificadores.
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.learning.mine(user)
  }

  @Get('manage')
  manage(@Query(new ZodValidationPipe(manageQuerySchema)) q: ManageQuery, @CurrentUser() user: AuthUser) {
    return this.courses.manageList(q, user)
  }

  @Post()
  create(@Body(new ZodValidationPipe(createCourseSchema)) dto: CreateCourseDto, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.courses.create(dto, user, req)
  }

  @Public()
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser) {
    return this.courses.get(id, user)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateCourseSchema)) dto: UpdateCourseDto, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.courses.update(id, dto, user, req)
  }

  @Get(':id/enrollments')
  roster(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.courses.roster(id, user)
  }

  // ----- Lecciones -----

  @Post(':id/lessons')
  addLesson(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(lessonSchema)) dto: LessonDto, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.courses.addLesson(id, dto, user, req)
  }

  @Patch(':id/lessons/:lessonId')
  updateLesson(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body(new ZodValidationPipe(updateLessonSchema)) dto: UpdateLessonDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ) {
    return this.courses.updateLesson(id, lessonId, dto, user, req)
  }

  @Delete(':id/lessons/:lessonId')
  deleteLesson(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.courses.deleteLesson(id, lessonId, user, req)
  }

  // ----- Aprendizaje -----

  @Post(':id/enrollment')
  enroll(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.learning.enroll(id, user, req)
  }

  @Delete(':id/enrollment')
  @HttpCode(204)
  drop(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.learning.drop(id, user, req)
  }

  @Post(':id/lessons/:lessonId/complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.learning.completeLesson(id, lessonId, user, req)
  }

  @Delete(':id/lessons/:lessonId/complete')
  undo(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    return this.learning.undoLesson(id, lessonId, user, req)
  }

  @Get(':id/certificate')
  certificate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.learning.myCertificate(id, user)
  }
}

@Public()
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly learning: LearningService) {}

  @Get(':code')
  verify(@Param('code') code: string) {
    return this.learning.verify(code)
  }
}
