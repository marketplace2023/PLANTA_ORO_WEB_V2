import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../../common/types';
import { CurrentUser } from '../iam/decorators';
import { ShopImportService } from './shop-import.service';
type Uploads = {
    file?: Express.Multer.File[];
    images?: Express.Multer.File[];
};
const upload = () => FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'images', maxCount: 40 }], { limits: { files: 41, fileSize: 5 * 1024 * 1024, fields: 2, parts: 43 } });
const fingerprint = (value: unknown) => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new BadRequestException('Primero analiza los archivos'); return value; };
const replace = (value: unknown) => { if (value !== undefined && value !== 'false' && value !== 'true')
    throw new BadRequestException('replace debe ser true o false'); return value === 'true'; };
@Controller('providers/:providerId/commerce/imports')
export class ShopImportController {
    constructor(private readonly imports: ShopImportService) { }
    @Post('preview')
    @UseInterceptors(upload())
    preview(
    @Param('providerId', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    user: AuthUser,
    @UploadedFiles()
    files: Uploads) { return this.imports.workbook(id, user, files?.file?.[0], files?.images ?? []); }
    @Post()
    @UseInterceptors(upload())
    apply(
    @Param('providerId', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    user: AuthUser,
    @UploadedFiles()
    files: Uploads,
    @Body('fingerprint')
    value: unknown) { return this.imports.workbook(id, user, files?.file?.[0], files?.images ?? [], fingerprint(value)); }
    @Post('images/preview')
    @UseInterceptors(upload())
    imagesPreview(
    @Param('providerId', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    user: AuthUser,
    @UploadedFiles()
    files: Uploads,
    @Body('replace')
    value: unknown) { if (files?.file?.length)
        throw new BadRequestException('Adjunta solo imágenes'); return this.imports.covers(id, user, files?.images ?? [], replace(value)); }
    @Post('images')
    @UseInterceptors(upload())
    imagesApply(
    @Param('providerId', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    user: AuthUser,
    @UploadedFiles()
    files: Uploads,
    @Body('replace')
    value: unknown,
    @Body('fingerprint')
    fp: unknown) { if (files?.file?.length)
        throw new BadRequestException('Adjunta solo imágenes'); return this.imports.covers(id, user, files?.images ?? [], replace(value), fingerprint(fp)); }
}
