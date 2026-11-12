import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../common/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CurrentUser } from '../iam/decorators';
import { ShopToolsService, importSchema } from './shop-tools.service';
import { STAFF_ROLES } from './commerce-rules';
const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) });
@Controller('marketplace')
export class ShopToolsController {
    constructor(private readonly tools: ShopToolsService) { }
    @Get('notifications')
    notifications(
    @CurrentUser()
    u: AuthUser,
    @Query(new ZodValidationPipe(z.object({ providerId: z.uuid().optional() })))
    q: {
        providerId?: string;
    }) { return this.tools.notifications(u, q.providerId); }
    @Patch('notifications/:id')
    read(
    @Param('id', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u: AuthUser) { return this.tools.markRead(id, u); }
    @Get('orders/:id/messages')
    messages(
    @Param('id', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u: AuthUser) { return this.tools.messages(id, u); }
    @Post('orders/:id/messages')
    @UseInterceptors(FileInterceptor('file'))
    send(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(messageSchema))
    b: z.infer<typeof messageSchema>,
    @UploadedFile()
    file: Express.Multer.File | undefined,
    @CurrentUser()
    u: AuthUser) { return this.tools.send(id, b.body, u, file); }
    @Get('orders/:id/messages/:messageId/file')
    async file(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Param('messageId', ParseUUIDPipe)
    m: string,
    @CurrentUser()
    u: AuthUser,
    @Res({ passthrough: true })
    res: Response) { const file = await this.tools.attachment(id, m, u); res.set({ 'Content-Type': file.mime, 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(file.name), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); return new StreamableFile(file.stream); }
    @Get('orders/:id/cases')
    cases(
    @Param('id', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u: AuthUser) { return this.tools.cases(id, u); }
    @Post('orders/:id/cases')
    open(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(z.object({ kind: z.enum(['DISPUTE', 'WARRANTY']), subject: z.string().trim().min(3).max(200), description: z.string().trim().min(10).max(4000) })))
    b: {
        kind: string;
        subject: string;
        description: string;
    },
    @CurrentUser()
    u: AuthUser) { return this.tools.openCase(id, b, u); }
    @Patch('orders/:id/cases/:caseId')
    update(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Param('caseId', ParseUUIDPipe)
    c: string,
    @Body(new ZodValidationPipe(z.object({ status: z.enum(['SELLER_REVIEW', 'ESCALATED', 'RESOLVED', 'REJECTED']), resolution: z.string().trim().min(3).max(4000) })))
    b: {
        status: string;
        resolution: string;
    },
    @CurrentUser()
    u: AuthUser) { return this.tools.updateCase(id, c, b, u); }
    @Get('admin/cases')
    admin(
    @CurrentUser()
    u: AuthUser) { return this.tools.adminCases(u); }
}
@Controller('providers/:providerId/commerce')
export class ShopBusinessController {
    constructor(private readonly tools: ShopToolsService) { }
    @Get('staff')
    staff(
    @Param('providerId', ParseUUIDPipe)
    id: string,
    @CurrentUser()
    u: AuthUser) { return this.tools.staff(id, u); }
    @Patch('staff/:userId')
    role(
    @Param('providerId', ParseUUIDPipe)
    id: string,
    @Param('userId', ParseUUIDPipe)
    target: string,
    @Body(new ZodValidationPipe(z.object({ role: z.enum(Object.keys(STAFF_ROLES) as [
            string,
            ...string[]
        ]) })))
    b: {
        role: string;
    },
    @CurrentUser()
    u: AuthUser) { return this.tools.setRole(id, target, b.role, u); }
    @Post('import')
    import(
    @Param('providerId', ParseUUIDPipe)
    id: string,
    @Body(new ZodValidationPipe(importSchema))
    b: z.infer<typeof importSchema>,
    @CurrentUser()
    u: AuthUser) { return this.tools.import(id, b, u); }
    @Get('reports')
    async report(
    @Param('providerId', ParseUUIDPipe)
    id: string,
    @Query(new ZodValidationPipe(z.object({ kind: z.enum(['orders', 'inventory']) })))
    q: {
        kind: string;
    },
    @CurrentUser()
    u: AuthUser,
    @Res({ passthrough: true })
    res: Response) { const csv = await this.tools.report(id, q.kind, u); res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${q.kind}.csv"`, 'Cache-Control': 'private, no-store' }); return csv; }
}
