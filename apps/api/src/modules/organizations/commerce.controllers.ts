import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CurrentUser, OpenAccess, Public } from '../iam/decorators';
import { setImageHeaders } from '../documents/image-upload';
import { CommerceService } from './commerce.service';
import { checkoutSchema, commercialSchema, variantsSchema, settingsSchema, orderActionSchema } from './commerce.schemas';
@Controller('providers/:providerId/commerce')
export class ShopManageController {
    constructor(private readonly commerce: CommerceService) { }
    @Get('settings')
    settings(
    @Param('providerId', ParseUUIDPipe)
    p: string,
    @CurrentUser()
    u: AuthUser) { return this.commerce.settings(p, u); }
    @Patch('settings')
    saveSettings(
    @Param('providerId', ParseUUIDPipe)
    p: string,
    @Body(new ZodValidationPipe(settingsSchema))
    b: z.infer<typeof settingsSchema>,
    @CurrentUser()
    u: AuthUser) { return this.commerce.saveSettings(p, b, u); }
    @Get('products/:id')
    product(
    @Param('providerId', ParseUUIDPipe)
    p: string,
    @Param('id', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u: AuthUser) { return this.commerce.editDetail(p, id, u); }
    @Patch('products/:id')
    save(
    @Param('providerId', ParseUUIDPipe)
    p: string,
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(commercialSchema))
    b: z.infer<typeof commercialSchema>,
    @CurrentUser()
    u: AuthUser) { return this.commerce.saveCommercial(p, id, b, u); }
    @Patch('products/:id/variants')
    variants(
    @Param('providerId', ParseUUIDPipe)
    p: string,
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(variantsSchema))
    b: z.infer<typeof variantsSchema>,
    @CurrentUser()
    u: AuthUser) { return this.commerce.saveVariants(p, id, b, u); }
    @Post('products/:id/gallery')
    @UseInterceptors(FileInterceptor('file'))
    image(
    @Param('providerId', ParseUUIDPipe)
    p: string,
    @Param('id', ParseUUIDPipe)
    id: string,
    @UploadedFile()
    f: Express.Multer.File | undefined,
    @CurrentUser()
    u: AuthUser) { return this.commerce.addImage(p, id, f, u); }
    @Delete('products/:id/gallery/:imageId')
    remove(
    @Param('providerId', ParseUUIDPipe)
    p: string,
    @Param('id', ParseUUIDPipe)
    id: string,
    @Param('imageId', ParseUUIDPipe)
    imageId: string,
    @CurrentUser()
    u: AuthUser) { return this.commerce.removeImage(p, id, imageId, u); }
    @Get('summary')
    summary(
    @Param('providerId', ParseUUIDPipe)
    p: string,
    @CurrentUser()
    u: AuthUser) { return this.commerce.summary(p, u); }
    @Get('orders')
    orders(
    @Param('providerId', ParseUUIDPipe)
    p: string,
    @CurrentUser()
    u: AuthUser) { return this.commerce.orders(u, p); }
}
@Controller('marketplace')
export class ShopCommerceController {
    constructor(private readonly commerce: CommerceService) { }
    @OpenAccess()
    @Get('products/:id')
    product(
    @Param('id', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u?: AuthUser) { return this.commerce.detail(id, u); }
    @Public()
    @Get('products/:id/gallery/:imageId')
    async image(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Param('imageId', ParseUUIDPipe)
    imageId: string,
    @CurrentUser()
    u: AuthUser | undefined,
    @Res({ passthrough: true })
    res: Response) { const image = await this.commerce.image(id, imageId, u); setImageHeaders(res, image.mime); res.set('Cache-Control', 'private, no-store'); return new StreamableFile(image.stream); }
    @Post('orders')
    checkout(
    @Body(new ZodValidationPipe(checkoutSchema))
    b: z.infer<typeof checkoutSchema>,
    @CurrentUser()
    u: AuthUser) { return this.commerce.createOrder(b, u); }
    @Get('orders')
    orders(
    @CurrentUser()
    u: AuthUser) { return this.commerce.orders(u); }
    @Get('orders/:id')
    order(
    @Param('id', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u: AuthUser) { return this.commerce.order(id, u); }
    @Patch('orders/:id')
    action(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(orderActionSchema))
    b: z.infer<typeof orderActionSchema>,
    @CurrentUser()
    u: AuthUser) { return this.commerce.action(id, b, u); }
    @Post('orders/:id/reviews')
    review(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(z.object({ listingId: z.uuid(), rating: z.number().int().min(1).max(5), comment: z.string().trim().min(3).max(2000) })))
    body: {
        listingId: string;
        rating: number;
        comment: string;
    },
    @CurrentUser()
    user: AuthUser) { return this.commerce.review(id, body, user); }
    @Post('orders/:id/receipt')
    @UseInterceptors(FileInterceptor('file'))
    receipt(
    @Param('id', ParseUUIDPipe)
    id: string,
    @UploadedFile()
    f: Express.Multer.File | undefined,
    @CurrentUser()
    u: AuthUser) { return this.commerce.receipt(id, f, u); }
    @Get('orders/:id/receipt')
    async readReceipt(
    @Param('id', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u: AuthUser,
    @Res({ passthrough: true })
    res: Response) { const image = await this.commerce.readReceipt(id, u); setImageHeaders(res, image.mime); res.set('Cache-Control', 'private, no-store'); return new StreamableFile(image.stream); }
}
