import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { contentDisposition } from '../documents/file-validation';
import { setImageHeaders } from '../documents/image-upload';
import { CurrentUser, OpenAccess, Public } from '../iam/decorators';
import { ProfessionalCommerceService } from './professional.service';
import { listServicesSchema, offerSchema, orderActionSchema, requestSchema, reviewSchema, settingsSchema, staffSchema } from './professional.schemas';
const pagination = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30) });
const saveOfferSchema = z.object({ offer: offerSchema, version: z.number().int().positive().optional() }).strict();
const messageSchema = z.object({ body: z.string().trim().max(8000).default('') }).strict();
const deliverySchema = z.object({ version: z.coerce.number().int().positive(), note: z.string().trim().min(10).max(8000) }).strict();
const responseSchema = z.object({ response: z.string().trim().min(10).max(4000) }).strict();
@Controller('contractors/:contractorId/workspace')
export class ProfessionalWorkspaceController {
    constructor(private readonly professional: ProfessionalCommerceService) { }
    @Get()
    get(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @CurrentUser()
    u: AuthUser) { return this.professional.workspace(c, u); }
    @Patch()
    save(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @Body(new ZodValidationPipe(settingsSchema))
    b: z.infer<typeof settingsSchema>,
    @CurrentUser()
    u: AuthUser) { return this.professional.saveWorkspace(c, b, u); }
    @Patch('bank')
    bank(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @Body(new ZodValidationPipe(settingsSchema.shape.payment))
    b: z.infer<typeof settingsSchema>['payment'],
    @CurrentUser()
    u: AuthUser) { return this.professional.saveBank(c, b, u); }
    @Patch('staff/:userId')
    staff(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @Param('userId', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(staffSchema))
    b: z.infer<typeof staffSchema>,
    @CurrentUser()
    u: AuthUser) { return this.professional.setStaff(c, id, b.role, u); }
    @Get('services')
    services(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @CurrentUser()
    u: AuthUser) { return this.professional.managed(c, u); }
    @Post('services')
    create(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @Body(new ZodValidationPipe(saveOfferSchema))
    b: z.infer<typeof saveOfferSchema>,
    @CurrentUser()
    u: AuthUser) { return this.professional.saveOffer(c, undefined, b.offer, undefined, u); }
    @Patch('services/:id')
    edit(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(saveOfferSchema))
    b: z.infer<typeof saveOfferSchema>,
    @CurrentUser()
    u: AuthUser) { return this.professional.saveOffer(c, id, b.offer, b.version, u); }
    @Post('services/:id/images')
    @UseInterceptors(FileInterceptor('file'))
    image(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @Param('id', ParseUUIDPipe)
    id: string,
    @UploadedFile()
    f: Express.Multer.File | undefined,
    @CurrentUser()
    u: AuthUser) { return this.professional.uploadMedia(c, id, 'IMAGE', f, u); }
    @Post('media/:kind')
    @UseInterceptors(FileInterceptor('file'))
    media(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @Param('kind', new ZodValidationPipe(z.enum(['AVATAR', 'PORTFOLIO'])))
    kind: string,
    @UploadedFile()
    f: Express.Multer.File | undefined,
    @CurrentUser()
    u: AuthUser) { return this.professional.uploadMedia(c, undefined, kind, f, u); }
    @Delete('media/:id')
    remove(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @Param('id', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u: AuthUser) { return this.professional.removeMedia(c, id, u); }
    @Get('orders')
    orders(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @Query(new ZodValidationPipe(pagination))
    q: z.infer<typeof pagination>,
    @CurrentUser()
    u: AuthUser) { return this.professional.listOrders(u, c, q.page, q.pageSize); }
    @Get('summary')
    summary(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @CurrentUser()
    u: AuthUser) { return this.professional.summary(c, u); }
    @Post('reviews/:id/response')
    respond(
    @Param('contractorId', ParseUUIDPipe)
    c: string,
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(responseSchema))
    b: z.infer<typeof responseSchema>,
    @CurrentUser()
    u: AuthUser) { return this.professional.respondReview(c, id, b.response, u); }
}
@Controller('professional-market')
export class ProfessionalMarketController {
    constructor(private readonly professional: ProfessionalCommerceService) { }
    @OpenAccess()
    @Get('services')
    list(
    @Query(new ZodValidationPipe(listServicesSchema))
    q: z.infer<typeof listServicesSchema>,
    @CurrentUser()
    u?: AuthUser) { return this.professional.list(q, u); }
    @OpenAccess()
    @Get('services/:id')
    detail(
    @Param('id', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u?: AuthUser) { return this.professional.detail(id, u); }
    @Public()
    @Get('media/:id')
    async media(
    @Param('id', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u: AuthUser | undefined,
    @Res({ passthrough: true })
    res: Response) { const f = await this.professional.openMedia(id, u); setImageHeaders(res, f.mime); res.set('Cache-Control', 'private, no-store'); return new StreamableFile(f.stream); }
    @Post('orders')
    request(
    @Body(new ZodValidationPipe(requestSchema))
    b: z.infer<typeof requestSchema>,
    @CurrentUser()
    u: AuthUser) { return this.professional.request(b, u); }
    @Get('orders')
    orders(
    @Query(new ZodValidationPipe(pagination))
    q: z.infer<typeof pagination>,
    @CurrentUser()
    u: AuthUser) { return this.professional.listOrders(u, undefined, q.page, q.pageSize); }
    @Get('orders/:id')
    order(
    @Param('id', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u: AuthUser) { return this.professional.order(id, u); }
    @Patch('orders/:id')
    action(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(orderActionSchema))
    b: z.infer<typeof orderActionSchema>,
    @CurrentUser()
    u: AuthUser) { return this.professional.action(id, b, u); }
    @Post('orders/:id/delivery')
    @UseInterceptors(FileInterceptor('file'))
    delivery(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(deliverySchema))
    b: z.infer<typeof deliverySchema>,
    @UploadedFile()
    f: Express.Multer.File | undefined,
    @CurrentUser()
    u: AuthUser) { return this.professional.action(id, { action: 'DELIVER', ...b }, u, f); }
    @Post('orders/:id/messages')
    @UseInterceptors(FileInterceptor('file'))
    message(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(messageSchema))
    b: z.infer<typeof messageSchema>,
    @UploadedFile()
    f: Express.Multer.File | undefined,
    @CurrentUser()
    u: AuthUser) { return this.professional.message(id, b.body, f, u); }
    @Get('orders/:id/messages/:messageId/file')
    async file(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Param('messageId', ParseUUIDPipe)
    messageId: string,
    @CurrentUser()
    u: AuthUser,
    @Res({ passthrough: true })
    res: Response) { const f = await this.professional.openFile(id, messageId, u); res.set({ 'Content-Type': f.mime, 'Content-Disposition': contentDisposition('attachment', f.name), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); return new StreamableFile(f.stream); }
    @Post('orders/:id/reviews')
    review(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(reviewSchema))
    b: z.infer<typeof reviewSchema>,
    @CurrentUser()
    u: AuthUser) { return this.professional.review(id, b.rating, b.comment, u); }
    @Get('notifications')
    inbox(
    @CurrentUser()
    u: AuthUser) { return this.professional.inbox(u); }
    @Patch('notifications/:id')
    read(
    @Param('id', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u: AuthUser) { return this.professional.readNotification(id, u); }
    @Get('admin/cases')
    cases(
    @CurrentUser()
    u: AuthUser) { return this.professional.cases(u); }
}
