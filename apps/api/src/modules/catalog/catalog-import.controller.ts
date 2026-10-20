import { BadRequestException, Body, Controller, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { AppRequest } from '../../common/types'
import { GlobalAdminOnly } from '../iam/decorators'
import { CATALOG_IMPORT_MAX_BYTES } from './catalog-import.xlsx'
import { CatalogImportService } from './catalog-import.service'

@GlobalAdminOnly()
@Controller('catalog/imports')
export class CatalogImportController {
  constructor(private readonly imports: CatalogImportService) {}

  private buffer(file: Express.Multer.File | undefined) {
    if (!file || !file.originalname.toLowerCase().endsWith('.xlsx')) throw new BadRequestException('Adjunta un archivo .xlsx en el campo «file»')
    return file.buffer
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CATALOG_IMPORT_MAX_BYTES, files: 1, fields: 1 } }))
  preview(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.imports.preview(this.buffer(file))
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CATALOG_IMPORT_MAX_BYTES, files: 1, fields: 1 } }))
  apply(@UploadedFile() file: Express.Multer.File | undefined, @Body('fingerprint') fingerprint: unknown, @Req() req: AppRequest) {
    if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new BadRequestException('Primero analiza el archivo para obtener una vista previa')
    return this.imports.apply(this.buffer(file), fingerprint, req)
  }
}
