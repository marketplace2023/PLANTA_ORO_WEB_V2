import { Body, Controller, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { AppRequest } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { GlobalAdminOnly } from '../iam/decorators'
import { CatalogImagesService } from './catalog-images.service'
import { previewCatalogImagesSchema, uploadCatalogImageSchema, type PreviewCatalogImagesDto, type UploadCatalogImageDto } from './catalog-images.schemas'

@GlobalAdminOnly()
@Controller('catalog/image-imports')
export class CatalogImagesController {
  constructor(private readonly images: CatalogImagesService) {}

  @Post('preview')
  preview(@Body(new ZodValidationPipe(previewCatalogImagesSchema)) dto: PreviewCatalogImagesDto) {
    return this.images.preview(dto)
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Body(new ZodValidationPipe(uploadCatalogImageSchema)) dto: UploadCatalogImageDto, @Req() req: AppRequest) {
    return this.images.upload(file, dto, req)
  }
}
