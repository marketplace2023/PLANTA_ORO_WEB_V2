import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentPlant, CurrentUser, Public, RequirePermission } from '../iam/decorators'
import {
  addVersionSchema,
  type CreateDocumentDto,
  createDocumentSchema,
  type DownloadQuery,
  downloadQuerySchema,
  type ListDocumentsQuery,
  listDocumentsQuerySchema,
  type UpdateDocumentDto,
  updateDocumentSchema,
} from './documents.schemas'
import { DocumentsService } from './documents.service'
import { contentDisposition } from './file-validation'

const requireFile = (file: Express.Multer.File | undefined) => {
  if (!file) throw new BadRequestException('Falta el archivo (campo "file")')
  return file
}

@Controller('plants/:plantId/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Public()
  @Get()
  list(
    @Param('plantId') plantId: string,
    @Query(new ZodValidationPipe(listDocumentsQuerySchema)) query: ListDocumentsQuery,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.documents.list(plantId, query, user)
  }

  /** multipart/form-data: campo `file` + metadatos. Los guards corren antes que multer: sin permiso no se procesa el archivo. */
  @RequirePermission('document.upload')
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(
    @CurrentPlant() plant: PlantRow,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(createDocumentSchema)) dto: CreateDocumentDto,
    @Req() req: AppRequest,
  ) {
    return this.documents.create(plant, dto, requireFile(file), req)
  }

  @Public()
  @Get(':documentId')
  get(@Param('plantId') plantId: string, @Param('documentId', ParseUUIDPipe) documentId: string, @CurrentUser() user?: AuthUser) {
    return this.documents.get(plantId, documentId, user)
  }

  @Public()
  @Get(':documentId/download')
  async download(
    @Param('plantId') plantId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query(new ZodValidationPipe(downloadQuerySchema)) query: DownloadQuery,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user?: AuthUser,
  ) {
    const wantsInline = query.inline === '1'
    const file = await this.documents.download(plantId, documentId, user, { version: query.version, inline: wantsInline }, req)
    // Solo PDF e imágenes se muestran en el navegador; todo lo demás se descarga.
    const inline = wantsInline && /^(application\/pdf|image\/(png|jpeg|webp))$/.test(file.mimeType)

    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.sizeBytes),
      'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', file.originalName),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      ...(inline && { 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:" }),
    })
    return new StreamableFile(file.stream)
  }

  @RequirePermission('document.upload')
  @Post(':documentId/versions')
  @UseInterceptors(FileInterceptor('file'))
  async addVersion(
    @CurrentPlant() plant: PlantRow,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(addVersionSchema)) body: { note?: string },
    @Req() req: AppRequest,
  ) {
    return this.documents.addVersion(plant, documentId, requireFile(file), body.note, req)
  }

  @RequirePermission('document.upload')
  @Patch(':documentId')
  update(
    @CurrentPlant() plant: PlantRow,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body(new ZodValidationPipe(updateDocumentSchema)) dto: UpdateDocumentDto,
    @Req() req: AppRequest,
  ) {
    return this.documents.update(plant, documentId, dto, req)
  }

  /** Archiva (no borra): archivos, versiones y auditoría se conservan. */
  @RequirePermission('document.delete')
  @Delete(':documentId')
  @HttpCode(204)
  archive(@CurrentPlant() plant: PlantRow, @Param('documentId', ParseUUIDPipe) documentId: string, @Req() req: AppRequest) {
    return this.documents.archive(plant, documentId, req)
  }
}
