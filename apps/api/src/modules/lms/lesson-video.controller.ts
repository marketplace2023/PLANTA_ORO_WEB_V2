import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { BadRequestException, Controller, Delete, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors, Body, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { diskStorage } from 'multer'
import { z } from 'zod'
import type { AppRequest, AuthUser } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentUser, Public } from '../iam/decorators'
import { StorageService } from '../documents/storage.service'
import { LessonVideoService } from './lesson-video.service'
import { LearningService } from './learning.service'
import { playbackSchema, type PlaybackDto } from './lms.schemas'
import { videoRange } from './video-tools'

@Injectable()
export class LessonVideoManageGuard implements CanActivate {
  constructor(private readonly videos: LessonVideoService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AppRequest>()
    const id = z.uuid().safeParse(req.params.id)
    const lessonId = z.uuid().safeParse(req.params.lessonId)
    if (!id.success || !lessonId.success) throw new BadRequestException('Identificador inválido')
    await this.videos.authorizeUpload(id.data, lessonId.data, req.user!)
    return true
  }
}

/** Disk-backed uploads. This guard checks ownership BEFORE Multer accepts file bytes. */
export const videoUploadStorage = diskStorage({ destination: tmpdir(), filename: (_req, _file, cb) => cb(null, `fur-video-upload-${randomUUID()}`) })

@Controller('courses/:id/lessons/:lessonId')
export class LessonVideoController {
  constructor(private readonly videos: LessonVideoService, private readonly learning: LearningService, private readonly storage: StorageService) {}

  @Post('video')
  @UseGuards(LessonVideoManageGuard)
  @UseInterceptors(FileInterceptor('file'))
  upload(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    if (!file) throw new BadRequestException('Selecciona un video (campo file)')
    return this.videos.upload(id, lessonId, file, user, req)
  }

  @Delete('video')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string, @CurrentUser() user: AuthUser, @Req() req: AppRequest) { return this.videos.remove(id, lessonId, user, req) }

  @Post('video/session')
  session(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string, @CurrentUser() user: AuthUser) { return this.videos.session(id, lessonId, user) }

  @Public()
  @Get('video/stream')
  async stream(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Query('ticket') ticket: string | undefined, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    if (!ticket || ticket.length > 3000) throw new BadRequestException('Falta el acceso de reproducción')
    const file = await this.videos.stream(id, lessonId, ticket)
    const range = videoRange(req.headers.range, file.size)
    res.set({ 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'cross-origin', 'X-Content-Type-Options': 'nosniff' })
    if (!range) { res.status(416).set('Content-Range', `bytes */${file.size}`).end(); return }
    res.status(range.partial ? 206 : 200).set('Content-Length', String(range.end - range.start + 1))
    if (range.partial) res.set('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`)
    const stream = await this.storage.openRange(file.key, range.start, range.end)
    res.once('close', () => stream.destroy())
    return new StreamableFile(stream)
  }

  @Patch('playback')
  playback(@Param('id', ParseUUIDPipe) id: string, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Body(new ZodValidationPipe(playbackSchema)) dto: PlaybackDto, @CurrentUser() user: AuthUser) { return this.learning.savePlayback(id, lessonId, dto, user) }
}
