import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DB, type Database } from '../../database/database.module';
import { providers, assetFamilies, listings, productVariants, providerMembers, users, shopOrders, shopMessages, shopOrderEvents, shopNotifications, shopCases, shopStaffRoles } from '../../database/schema';
import type { AuthUser } from '../../common/types';
import { OrgAccessService } from './org-access.service';
import { CommerceService } from './commerce.service';
import { money } from './commerce.schemas';
import { StorageService } from '../documents/storage.service';
import { inspectUpload } from '../documents/file-validation';
import { notifyOrder } from './commerce-events';
export const importRowSchema = z.object({ title: z.string().trim().min(1).max(200), family: z.string().trim().min(1).max(60), sku: z.string().trim().min(1).max(80), variant: z.string().trim().min(1).max(160).default('Estandar'), price: money, stock: z.number().int().min(0).max(999999), currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), brand: z.string().trim().max(160).default(''), model: z.string().trim().max(160).default(''), mode: z.enum(['DIRECT', 'QUOTE']).default('QUOTE') });
export const importSchema = z.object({ rows: z.array(z.unknown()).min(1).max(200), commit: z.boolean().default(false) });
@Injectable()
export class ShopToolsService {
    constructor(
    @Inject(DB)
    private readonly db: Database, private readonly commerce: CommerceService, private readonly access: OrgAccessService, private readonly storage: StorageService) { }
    async assertOrder(id: string, user: AuthUser, permission = 'SUPPORT') { const order = await this.commerce.order(id, user); if (order.buyerId !== user.id && !user.isGlobalAdmin)
        await this.access.assertProviderPermission(order.providerId, user, permission); return order; }
    async messages(id: string, user: AuthUser) { await this.assertOrder(id, user); const messages = await this.db.select({ id: shopMessages.id, authorId: shopMessages.authorId, author: users.firstName, body: shopMessages.body, fileName: shopMessages.fileName, createdAt: shopMessages.createdAt }).from(shopMessages).innerJoin(users, eq(users.id, shopMessages.authorId)).where(eq(shopMessages.orderId, id)).orderBy(desc(shopMessages.createdAt), desc(shopMessages.id)).limit(200); return messages.reverse(); }
    async send(id: string, body: string, user: AuthUser, file?: Express.Multer.File) {
        await this.assertOrder(id, user);
        let attachment: {
            fileKey: string;
            fileName: string;
            fileMime: string;
        } | undefined;
        if (file) {
            if (file.size > 5 * 1024 * 1024)
                throw new BadRequestException('Maximo 5 MB');
            const checked = inspectUpload(file.originalname, file.buffer);
            if (!['png', 'jpg', 'jpeg', 'webp', 'pdf'].includes(checked.extension))
                throw new BadRequestException('Adjunta PDF, JPG, PNG o WebP');
            const key = `marketplace/messages/${id}/${randomUUID()}.${checked.extension}`;
            await this.storage.put(key, file.buffer);
            attachment = { fileKey: key, fileName: checked.originalName, fileMime: checked.mimeType };
        }
        try {
            await this.db.transaction(async (tx) => { const [order] = await tx.select().from(shopOrders).where(eq(shopOrders.id, id)).for('update'); await tx.insert(shopMessages).values({ orderId: id, authorId: user.id, body, ...attachment }); await notifyOrder(tx, order, user.id, 'Nuevo mensaje en el pedido'); });
        }
        catch (error) {
            if (attachment)
                await this.storage.delete(attachment.fileKey).catch(() => undefined);
            throw error;
        }
        return this.messages(id, user);
    }
    async attachment(id: string, messageId: string, user: AuthUser) { await this.assertOrder(id, user); const [message] = await this.db.select().from(shopMessages).where(and(eq(shopMessages.id, messageId), eq(shopMessages.orderId, id))); if (!message?.fileKey)
        throw new NotFoundException('Adjunto no encontrado'); return { stream: await this.storage.open(message.fileKey), mime: message.fileMime!, name: message.fileName! }; }
    async notifications(user: AuthUser, providerId?: string) { if (providerId)
        await this.access.assertManage('provider', providerId, user); return this.db.select({ id: shopNotifications.id, orderId: shopNotifications.orderId, title: shopNotifications.title, readAt: shopNotifications.readAt, createdAt: shopNotifications.createdAt, providerId: shopOrders.providerId, buyerId: shopOrders.buyerId }).from(shopNotifications).innerJoin(shopOrders, eq(shopOrders.id, shopNotifications.orderId)).where(and(eq(shopNotifications.userId, user.id), providerId ? eq(shopOrders.providerId, providerId) : eq(shopOrders.buyerId, user.id))).orderBy(desc(shopNotifications.createdAt)).limit(100); }
    async markRead(id: string, user: AuthUser) { await this.db.update(shopNotifications).set({ readAt: new Date() }).where(and(eq(shopNotifications.id, id), eq(shopNotifications.userId, user.id))); return { saved: true }; }
    async cases(id: string, user: AuthUser) { await this.assertOrder(id, user); return this.db.select().from(shopCases).where(eq(shopCases.orderId, id)).orderBy(desc(shopCases.createdAt)); }
    async openCase(id: string, input: {
        kind: string;
        subject: string;
        description: string;
    }, user: AuthUser) { const order = await this.assertOrder(id, user); if (order.buyerId !== user.id)
        throw new ForbiddenException('Solo el comprador puede abrir una incidencia'); if (['QUOTE_REQUESTED', 'QUOTED'].includes(order.status))
        throw new ConflictException('Usa la negociacion de la cotizacion antes de comprar'); if (input.kind === 'WARRANTY' && order.status !== 'DELIVERED') {
        const [delivered] = await this.db.select({ id: shopOrderEvents.id }).from(shopOrderEvents).where(and(eq(shopOrderEvents.orderId, id), eq(shopOrderEvents.status, 'DELIVERED'))).limit(1);
        if (!delivered)
            throw new ConflictException('La garantia se solicita despues de la entrega');
    } await this.db.transaction(async (tx) => { await tx.select().from(shopOrders).where(eq(shopOrders.id, id)).for('update'); const [existing] = await tx.select().from(shopCases).where(and(eq(shopCases.orderId, id), eq(shopCases.kind, input.kind), inArray(shopCases.status, ['OPEN', 'SELLER_REVIEW', 'ESCALATED']))); if (existing)
        throw new ConflictException('Ya existe una incidencia abierta de este tipo'); await tx.insert(shopCases).values({ ...input, orderId: id, openedBy: user.id }); await notifyOrder(tx, order, user.id, 'Nueva incidencia o solicitud de garantia'); }); return this.cases(id, user); }
    async updateCase(id: string, caseId: string, input: {
        status: string;
        resolution: string;
    }, user: AuthUser) {
        const order = await this.assertOrder(id, user);
        return this.db.transaction(async (tx) => {
            const [issue] = await tx.select().from(shopCases).where(and(eq(shopCases.id, caseId), eq(shopCases.orderId, id))).for('update');
            if (!issue)
                throw new NotFoundException('Incidencia no encontrada');
            const buyer = order.buyerId === user.id, admin = user.isGlobalAdmin;
            if (['RESOLVED', 'REJECTED'].includes(issue.status)) {
                const [resolver] = issue.resolvedBy ? await tx.select({ admin: users.isGlobalAdmin }).from(users).where(eq(users.id, issue.resolvedBy)) : [];
                if (input.status !== 'ESCALATED' || !buyer || resolver?.admin)
                    throw new ConflictException('La incidencia ya esta cerrada por una resolucion final');
            }
            if (input.status === 'ESCALATED') {
                if (!buyer)
                    throw new ForbiddenException('Solo el comprador puede pedir mediacion');
            }
            else if (buyer && !admin)
                throw new ForbiddenException('Esta accion corresponde a la tienda');
            if (issue.status === 'ESCALATED' && !admin)
                throw new ForbiddenException('La mediacion la resuelve el administrador');
            if (!['SELLER_REVIEW', 'ESCALATED', 'RESOLVED', 'REJECTED'].includes(input.status))
                throw new BadRequestException('Estado invalido');
            await tx.update(shopCases).set({ status: input.status, resolution: input.resolution, resolvedBy: ['RESOLVED', 'REJECTED'].includes(input.status) ? user.id : null, updatedAt: new Date() }).where(eq(shopCases.id, caseId));
            await tx.insert(shopMessages).values({ orderId: id, authorId: user.id, body: `Incidencia ${issue.subject}: ${input.status}\n${input.resolution}` });
            await notifyOrder(tx, order, user.id, `Incidencia actualizada: ${input.status}`);
            return { saved: true };
        });
    }
    async adminCases(user: AuthUser) { if (!user.isGlobalAdmin)
        throw new ForbiddenException(); return this.db.select().from(shopCases).orderBy(desc(shopCases.createdAt)).limit(200); }
    async staff(providerId: string, user: AuthUser) { await this.access.assertOwner('provider', providerId, user); return this.db.select({ userId: providerMembers.userId, name: users.firstName, email: users.email, membership: providerMembers.role, role: shopStaffRoles.role }).from(providerMembers).innerJoin(users, eq(users.id, providerMembers.userId)).leftJoin(shopStaffRoles, and(eq(shopStaffRoles.providerId, providerId), eq(shopStaffRoles.userId, providerMembers.userId))).where(eq(providerMembers.providerId, providerId)); }
    async setRole(providerId: string, userId: string, role: string, user: AuthUser) { await this.access.assertOwner('provider', providerId, user); return this.db.transaction(async (tx) => { await tx.select({ id: providers.id }).from(providers).where(eq(providers.id, providerId)).for('update'); const [member] = await tx.select().from(providerMembers).where(and(eq(providerMembers.providerId, providerId), eq(providerMembers.userId, userId))).for('update'); if (!member || member.role === 'OWNER')
        throw new ConflictException('No puedes cambiar los permisos del responsable'); await tx.insert(shopStaffRoles).values({ providerId, userId, role }).onConflictDoUpdate({ target: [shopStaffRoles.providerId, shopStaffRoles.userId], set: { role } }); return { saved: true }; }); }
    async import(providerId: string, input: z.infer<typeof importSchema>, user: AuthUser) {
        await this.commerce.manage(providerId, user);
        await this.access.assertProviderPermission(providerId, user, 'PRODUCTS');
        return this.db.transaction(async (tx) => {
            await tx.select({ id: providers.id }).from(providers).where(eq(providers.id, providerId)).for('update');
            const families = await tx.select().from(assetFamilies);
            const existing = await tx.select({ sku: productVariants.sku }).from(productVariants).where(eq(productVariants.providerId, providerId));
            const seen = new Set(existing.map(v => v.sku));
            const valid: Array<z.infer<typeof importRowSchema>> = [], errors: Array<{
                row: number;
                message: string;
            }> = [];
            input.rows.forEach((raw, index) => { const parsed = importRowSchema.safeParse(raw); if (!parsed.success) {
                errors.push({ row: index + 1, message: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
                return;
            } const row = parsed.data; if (!families.some(f => f.code === row.family))
                errors.push({ row: index + 1, message: 'Categoria inexistente' });
            else if (seen.has(row.sku))
                errors.push({ row: index + 1, message: 'SKU repetido o ya existente en tu tienda' });
            else {
                seen.add(row.sku);
                valid.push(row);
            } });
            if (!input.commit)
                return { valid: valid.length, errors, created: 0 };
            if (errors.length)
                throw new BadRequestException({ message: 'Corrige todas las filas antes de importar', errors: errors.map(e => ({ path: `row.${e.row}`, message: e.message })) });
            for (const row of valid) {
                const [product] = await tx.insert(listings).values({ providerId, title: row.title, assetFamilyId: families.find(f => f.code === row.family)!.id, currency: row.currency, price: row.mode === 'DIRECT' ? String(row.price) : null, commercial: { brand: row.brand, model: row.model, saleMode: row.mode }, status: 'DRAFT' }).returning();
                await tx.insert(productVariants).values({ listingId: product.id, providerId, sku: row.sku, name: row.variant, price: String(row.price), stock: row.stock });
            }
            return { valid: valid.length, errors: [], created: valid.length };
        });
    }
    async report(providerId: string, kind: string, user: AuthUser) {
        await this.access.assertManage('provider', providerId, user);
        await this.access.assertProviderPermission(providerId, user, 'REPORTS');
        const safe = (v: unknown) => { let s = String(v ?? ''); if (/^[\s]*[=+\-@]/.test(s))
            s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
        let rows: unknown[][];
        if (kind === 'inventory') {
            const inventory = await this.db.select({ variant: productVariants, title: listings.title, currency: listings.currency }).from(productVariants).innerJoin(listings, eq(listings.id, productVariants.listingId)).where(eq(productVariants.providerId, providerId)).orderBy(desc(productVariants.id)).limit(10000);
            rows = [['SKU', 'Producto', 'Variante', 'Moneda', 'Precio', 'Stock', 'Reservadas', 'Disponibles'], ...inventory.map(({ variant: v, title, currency }) => [v.sku, title, v.name, currency, v.price, v.stock, v.reserved, v.stock - v.reserved])];
        }
        else {
            const orders = await this.db.select().from(shopOrders).where(eq(shopOrders.providerId, providerId)).orderBy(desc(shopOrders.createdAt)).limit(10000);
            rows = [['Pedido', 'Fecha', 'Estado', 'Moneda', 'Total', 'Envio'], ...orders.map(o => [o.id, o.createdAt.toISOString(), o.status, o.currency, o.total, o.shippingFee])];
        }
        ;
        return '\ufeff' + rows.map(row => row.map(safe).join(',')).join('\r\n');
    }
}
