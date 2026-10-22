import { BadRequestException, Body, Controller, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { z } from 'zod'
import type { AppRequest } from '../../common/types'
import { GlobalAdminOnly } from '../iam/decorators'
import { CATALOG_IMPORT_MAX_BYTES } from './catalog-import.xlsx'
import { CatalogImportService } from './catalog-import.service'

const networkCodesSchema = z.array(z.string().trim().toUpperCase().regex(/^FUR-[A-Z]{2,16}$/)).min(1).max(40)
  .transform(codes => [...new Set(codes)].sort())

@GlobalAdminOnly()
@Controller('catalog/imports')
export class CatalogImportController {
  constructor(private readonly imports: CatalogImportService) {}

  private buffer(file: Express.Multer.File | undefined) {
    if (!file || !file.originalname.toLowerCase().endsWith('.xlsx')) throw new BadRequestException('Adjunta un archivo .xlsx en el campo «file»')
    return file.buffer
  }

  private networkCodes(value: unknown): string[] {
    let parsed: unknown
    try { parsed = typeof value === 'string' ? JSON.parse(value) : undefined }
    catch { throw new BadRequestException('Selecciona al menos una red transversal válida en networkCodes (lista JSON)') }
    const result = networkCodesSchema.safeParse(parsed)
    if (!result.success) throw new BadRequestException('Selecciona al menos una red transversal válida en networkCodes (lista JSON, máximo 40 redes)')
    return result.data
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CATALOG_IMPORT_MAX_BYTES, files: 1, fields: 1 } }))
  preview(@UploadedFile() file: Express.Multer.File | undefined, @Body('networkCodes') networkCodes: unknown) {
    return this.imports.preview(this.buffer(file), this.networkCodes(networkCodes))
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CATALOG_IMPORT_MAX_BYTES, files: 1, fields: 3 } }))
  apply(@UploadedFile() file: Express.Multer.File | undefined, @Body('fingerprint') fingerprint: unknown, @Body('networkCodes') networkCodes: unknown, @Body('allowMissingSpecifications') allowMissingSpecifications: unknown, @Req() req: AppRequest) {
    if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new BadRequestException('Primero analiza el archivo para obtener una vista previa')
    if (allowMissingSpecifications !== undefined && allowMissingSpecifications !== 'true' && allowMissingSpecifications !== 'false') throw new BadRequestException('allowMissingSpecifications debe ser true o false')
    return this.imports.apply(this.buffer(file), fingerprint, this.networkCodes(networkCodes), req, allowMissingSpecifications === 'true')
  }
}
