import { randomUUID } from 'node:crypto'
import { Controller, Get, Injectable, Param, ParseUUIDPipe, Post, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors, NotFoundException, BadRequestException, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { z } from 'zod'
import type { Response } from 'express'
import type { AppRequest, AuthUser } from '../../common/types'
import { IMAGE_MAX_BYTES, inspectImage, setImageHeaders } from '../documents/image-upload'
import { CurrentUser, Public } from '../iam/decorators'
import { CoursesService } from './courses.service'

@Injectable()
export class CourseCoverManageGuard implements CanActivate {
  constructor(private readonly courses: CoursesService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AppRequest>()
    const parsed = z.uuid().safeParse(req.params.id)
    if (!parsed.success) throw new BadRequestException('ID de curso inválido')
    const id = parsed.data
    await this.courses.assertManageCourse(id, req.user!)
    return true
  }
}

@Controller('courses/:id/cover')
export class CourseCoverController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  @UseGuards(CourseCoverManageGuard)
  @UseInterceptors(FileInterceptor('file', {storage:memoryStorage(), limits:{fileSize:IMAGE_MAX_BYTES,files:1,fields:0}}))
  upload(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    const image = inspectImage(file)
    return this.courses.saveCover(id, image, randomUUID(), user, req)
  }

  @Public()
  @Get()
  async read(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser | undefined, @Res({passthrough:true}) res: Response) {
    const image = await this.courses.openCover(id, user)
    if (!image) throw new NotFoundException('El curso no tiene portada')
    setImageHeaders(res, image.mime)
    // Every read checks visibility, including a course that has since been archived.
    res.set('Cache-Control', 'private, no-store')
    return new StreamableFile(image.stream)
  }
}
