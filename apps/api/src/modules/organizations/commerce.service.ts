import { effectiveUnitPrice, shippingFor } from './commerce-rules'
import { notifyOrder } from './commerce-events'
import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Database } from '../../database/database.module';
import { users, productReviews, variantMovements, listings, productImages, productVariants, providers, shopSettings, shopOrders, shopOrderLines, shopOrderEvents } from '../../database/schema';
import type { AuthUser } from '../../common/types';
import { OrgAccessService } from './org-access.service';
import { MarketplaceService } from './marketplace.service';
import { StorageService } from '../documents/storage.service';
import { inspectImage } from '../documents/image-upload';
import { checkoutSchema, commercialSchema, variantsSchema, settingsSchema, orderActionSchema } from './commerce.schemas';
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
const cents = (v: string | number) => { const [whole, fraction = ''] = String(v).split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2)); };
const amount = (v: bigint) => { if (v < 0 || v > 100000000000000n)
    throw new BadRequestException('Importe fuera de rango'); return `${v / 100n}.${String(v % 100n).padStart(2, '0')}`; };
@Injectable()
export class CommerceService {
    constructor(
    @Inject(DB)
    private readonly db: Database, private readonly access: OrgAccessService, private readonly market: MarketplaceService, private readonly storage: StorageService) { }
    async manage(providerId: string, user: AuthUser) { await this.access.assertManage('provider', providerId, user); const [p] = await this.db.select().from(providers).where(eq(providers.id, providerId)); if (p?.status !== 'ACTIVE')
        throw new ConflictException('La tienda debe estar activa'); return p; }
    async owned(providerId: string, id: string, user: AuthUser) { await this.manage(providerId, user); await this.access.assertProviderPermission(providerId,user,'PRODUCTS'); const [row] = await this.db.select().from(listings).where(and(eq(listings.id, id), eq(listings.providerId, providerId))); if (!row)
        throw new NotFoundException('Producto no encontrado'); return row; }
    async detail(id: string, user?: AuthUser) { const listing = await this.market.getPublic(id, user); const [row] = await this.db.select().from(listings).where(eq(listings.id, id)); const reviews = await this.db.select({ id: productReviews.id, rating: productReviews.rating, comment: productReviews.comment, createdAt: productReviews.createdAt, buyer: users.firstName }).from(productReviews).innerJoin(users, eq(users.id, productReviews.buyerId)).where(eq(productReviews.listingId, id)).orderBy(desc(productReviews.createdAt)).limit(50); const [{ average, count }] = await this.db.select({ average: sql<string> `avg(${productReviews.rating})`, count: sql<number> `count(*)::int` }).from(productReviews).where(eq(productReviews.listingId, id)); const variants = await this.db.select().from(productVariants).where(eq(productVariants.listingId, id)).orderBy(asc(productVariants.sku)); const [settings] = await this.db.select().from(shopSettings).where(eq(shopSettings.providerId, listing.provider.id)); const gallery = await this.db.select({ id: productImages.id, position: productImages.position }).from(productImages).where(eq(productImages.listingId, id)).orderBy(asc(productImages.position), asc(productImages.id)); return { ...listing, reviews, rating: count ? Number(average) : null, ratingCount: count, terms: settings ? { currency: settings.currency, shippingFee: Number(settings.shippingFee), shippingZones:settings.shippingZones, coverage: settings.coverage } : null, commercial: row.commercial, variants: variants.map(v => ({ id: v.id, sku: v.sku, name: v.name, salesRules:v.salesRules, attributes: v.attributes, price: Number(v.price), available: v.stock - v.reserved, active: v.active })), gallery: gallery.map(g => ({ ...g, url: `/marketplace/products/${id}/gallery/${g.id}` })) }; }
    async editDetail(providerId: string, id: string, user: AuthUser) { await this.owned(providerId, id, user); const detail = await this.detail(id, user); const variants = await this.db.select().from(productVariants).where(eq(productVariants.listingId, id)); const movements = variants.length ? await this.db.select().from(variantMovements).where(inArray(variantMovements.variantId, variants.map(v => v.id))).orderBy(desc(variantMovements.createdAt)).limit(50) : []; return { ...detail, movements, variants: variants.map(v => ({ ...v, price: Number(v.price), available: v.stock - v.reserved })) }; }
    async saveCommercial(providerId: string, id: string, input: z.infer<typeof commercialSchema>, user: AuthUser) { await this.owned(providerId, id, user); await this.db.update(listings).set({ commercial: input, assetModelId: null, updatedAt: new Date() }).where(eq(listings.id, id)); return this.editDetail(providerId, id, user); }
    async saveVariants(providerId: string, id: string, input: z.infer<typeof variantsSchema>, user: AuthUser) {
        await this.owned(providerId, id, user);
        await this.db.transaction(async (tx) => {
            await tx.select({ id: providers.id }).from(providers).where(eq(providers.id, providerId)).for('update');
            await tx.select().from(listings).where(eq(listings.id, id)).for('update');
            const old = await tx.select().from(productVariants).where(eq(productVariants.listingId, id)).orderBy(asc(productVariants.id)).for('update');
            for (const v of input.variants) {
                if (v.id && !old.some(o => o.id === v.id))
                    throw new BadRequestException('Variante ajena al producto');
                const existing = old.find(o => o.id === v.id);
                if (existing && v.stock < existing.reserved)
                    throw new ConflictException('No puedes reducir el stock por debajo de las unidades reservadas');
                const [duplicate] = await tx.select().from(productVariants).where(and(eq(productVariants.providerId, providerId), eq(productVariants.sku, v.sku)));
                if (duplicate && duplicate.id !== v.id)
                    throw new ConflictException(`El SKU ${v.sku} ya existe en tu tienda`);
                if (v.id)
                    await tx.update(productVariants).set({ sku: v.sku, name: v.name, salesRules:v.salesRules, attributes: v.attributes, price: String(v.price), stock: v.stock, active: v.active }).where(eq(productVariants.id, v.id));
                else
                    await tx.insert(productVariants).values({ ...v, providerId, listingId: id, price: String(v.price) });
                const [saved] = await tx.select().from(productVariants).where(and(eq(productVariants.providerId, providerId), eq(productVariants.sku, v.sku)));
                const delta = v.stock - (existing?.stock ?? 0);
                if (delta)
                    await tx.insert(variantMovements).values({ variantId: saved.id, actorId: user.id, stockDelta: delta, reason: 'Ajuste de existencias' });
            }
            for (const oldVariant of old)
                if (!input.variants.some(v => v.id === oldVariant.id))
                    await tx.update(productVariants).set({ active: false }).where(eq(productVariants.id, oldVariant.id));
        });
        return this.editDetail(providerId, id, user);
    }
    async settings(providerId: string, user: AuthUser) { await this.manage(providerId, user); const [settings] = await this.db.select().from(shopSettings).where(eq(shopSettings.providerId, providerId)); return { settings: settings ? { ...settings, shippingFee: Number(settings.shippingFee) } : null }; }
    async saveSettings(providerId: string, input: z.infer<typeof settingsSchema>, user: AuthUser) { await this.access.assertOwner('provider', providerId, user); await this.manage(providerId, user); await this.db.insert(shopSettings).values({ ...input, providerId, shippingFee: String(input.shippingFee) }).onConflictDoUpdate({ target: shopSettings.providerId, set: { ...input, shippingFee: String(input.shippingFee) } }); return this.settings(providerId, user); }
    async addImage(providerId: string, id: string, file: Express.Multer.File | undefined, user: AuthUser) { await this.owned(providerId, id, user); const image = inspectImage(file), key = `marketplace/gallery/${id}/${randomUUID()}.${image.extension}`; await this.storage.put(key, image.data); try {
        await this.db.transaction(async (tx) => { await tx.select().from(listings).where(eq(listings.id, id)).for('update'); const rows = await tx.select().from(productImages).where(eq(productImages.listingId, id)); if (rows.length >= 8)
            throw new ConflictException('La galeria admite hasta 8 fotos'); await tx.insert(productImages).values({ listingId: id, key, mime: image.mimeType, position: rows.length }); });
    }
    catch (error) {
        await this.storage.delete(key).catch(() => undefined);
        throw error;
    } return this.editDetail(providerId, id, user); }
    async removeImage(providerId: string, id: string, imageId: string, user: AuthUser) { await this.owned(providerId, id, user); const [removed] = await this.db.delete(productImages).where(and(eq(productImages.id, imageId), eq(productImages.listingId, id))).returning(); if (!removed)
        throw new NotFoundException('Foto no encontrada'); await this.storage.delete(removed.key).catch(() => undefined); return this.editDetail(providerId, id, user); }
    async image(id: string, imageId: string, user?: AuthUser) { await this.market.getPublic(id, user); const [image] = await this.db.select().from(productImages).where(and(eq(productImages.id, imageId), eq(productImages.listingId, id))); if (!image)
        throw new NotFoundException('Foto no encontrada'); return { stream: await this.storage.open(image.key), mime: image.mime }; }
    async createOrder(input: z.infer<typeof checkoutSchema>, user: AuthUser) {
        const hash = createHash('sha256').update(JSON.stringify({ ...input, lines: [...input.lines].sort((a, b) => a.variantId.localeCompare(b.variantId)) })).digest('hex');
        return this.db.transaction(async (tx) => {
            // Serialize checkouts per buyer before checking the idempotency key.
            await tx.execute(sql `select pg_advisory_xact_lock(hashtext(${user.id}))`);
            const [prior] = await tx.select().from(shopOrders).where(and(eq(shopOrders.buyerId, user.id), eq(shopOrders.idempotencyKey, input.key)));
            if (prior) {
                if (prior.requestHash !== hash)
                    throw new ConflictException('La clave ya se uso con otro pedido');
                return this.order(prior.id, user, tx);
            }
            const [provider] = await tx.select().from(providers).where(eq(providers.id, input.providerId)).for('update');
            if (provider?.status !== 'ACTIVE')
                throw new ConflictException('Tienda no disponible');
            if (await this.access.roleOf('provider', input.providerId, user.id))
                throw new BadRequestException('No puedes comprar a tu propia tienda');
            const [settings] = await tx.select().from(shopSettings).where(eq(shopSettings.providerId, input.providerId));
            if (!settings)
                throw new ConflictException('La tienda debe configurar sus transferencias y entregas');
            const variants = await tx.select().from(productVariants).where(inArray(productVariants.id, input.lines.map(l => l.variantId))).orderBy(asc(productVariants.id)).for('update');
            const zone=shippingFor(settings.shippingZones,input.address,input.shippingZoneId);
            if(zone===undefined)throw new ConflictException('Selecciona una zona de envio valida para tu direccion');
            const shippingFee=zone?String(zone.fee):settings.shippingFee;
            let total = cents(shippingFee);
            const snapshots = [];
            for (const line of input.lines) {
                const variant = variants.find(v => v.id === line.variantId);
                if (!variant || !variant.active || variant.providerId !== input.providerId)
                    throw new BadRequestException('Variante no disponible');
                const [product] = await tx.select().from(listings).where(eq(listings.id, variant.listingId));
                if (product.status !== 'ACTIVE' || product.currency !== settings.currency || product.commercial.saleMode !== input.mode)
                    throw new ConflictException('El producto cambio. Revisa el carrito');
                if(line.quantity<(variant.salesRules.minQuantity??1))throw new BadRequestException(`Compra minima: ${variant.salesRules.minQuantity} unidades para ${variant.sku}`);
                const unitPrice=effectiveUnitPrice(variant,line.quantity);
                if (input.mode === 'DIRECT') {
                    if (variant.stock - variant.reserved < line.quantity)
                        throw new ConflictException(`Stock insuficiente: ${variant.sku}`);
                    await tx.update(productVariants).set({ reserved: variant.reserved + line.quantity }).where(eq(productVariants.id, variant.id));
                    await tx.insert(variantMovements).values({ variantId: variant.id, actorId: user.id, reservedDelta: line.quantity, reason: 'Reserva de compra' });
                }
                total += cents(unitPrice) * BigInt(line.quantity);
                snapshots.push({ variantId: variant.id, listingId: product.id, title: product.title, sku: variant.sku, variantName: variant.name, quantity: line.quantity, unitPrice });
            }
            if (input.mode === 'DIRECT' && (input.expectedTotal === undefined || cents(input.expectedTotal) !== total))
                throw new ConflictException('El precio cambio. Actualiza el carrito antes de confirmar');
            const [order] = await tx.insert(shopOrders).values({ providerId: input.providerId, buyerId: user.id, idempotencyKey: input.key, requestHash: hash, status: input.mode === 'QUOTE' ? 'QUOTE_REQUESTED' : 'PENDING_PAYMENT', currency: settings.currency, total: amount(total), shippingFee, address: input.address, paymentInstructions: { bank: settings.bank, beneficiary: settings.beneficiary, account: settings.account, instructions: settings.instructions, coverage: zone?`${zone.name} - ${zone.carrier} - ${zone.days} dias`:settings.coverage }, note: input.note }).returning();
            await tx.insert(shopOrderLines).values(snapshots.map(l => ({ ...l, orderId: order.id })));
            await tx.insert(shopOrderEvents).values({ orderId: order.id, actorId: user.id, status: order.status, note: 'Pedido creado' });
            await notifyOrder(tx,order,user.id,'Nuevo pedido o solicitud de cotizacion');
            return this.order(order.id, user, tx);
        });
    }
    async order(id: string, user: AuthUser, db: Database | Tx = this.db) { const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, id)); if (!order)
        throw new NotFoundException('Pedido no encontrado'); const seller = await this.access.roleOf('provider', order.providerId, user.id); if (order.buyerId !== user.id && !seller && !user.isGlobalAdmin)
        throw new NotFoundException('Pedido no encontrado'); const lines = await db.select().from(shopOrderLines).where(eq(shopOrderLines.orderId, id)); const events = await db.select().from(shopOrderEvents).where(eq(shopOrderEvents.orderId, id)).orderBy(asc(shopOrderEvents.createdAt)); return { ...order, receiptKey: undefined, receiptMime: undefined, requestHash: undefined, idempotencyKey: undefined, hasReceipt: !!order.receiptKey, total: Number(order.total), shippingFee: Number(order.shippingFee), canManage: !!seller || user.isGlobalAdmin, capabilities: seller || user.isGlobalAdmin ? await this.access.providerPermissions(order.providerId,user) : [], lines: lines.map(l => ({ ...l, unitPrice: Number(l.unitPrice) })), events }; }
    async summary(providerId: string, user: AuthUser) { await this.access.assertManage('provider', providerId, user); const rows = await this.db.select({ status: shopOrders.status, currency: shopOrders.currency, count: sql<number> `count(*)::int`, total: sql<string> `sum(${shopOrders.total})` }).from(shopOrders).where(eq(shopOrders.providerId, providerId)).groupBy(shopOrders.status, shopOrders.currency); const count = (statuses: string[]) => rows.filter(r => statuses.includes(r.status)).reduce((sum, r) => sum + r.count, 0); const salesByCurrency: Record<string, number> = {}; for (const row of rows)
        if (['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'RETURN_REQUESTED', 'RETURN_APPROVED'].includes(row.status))
            salesByCurrency[row.currency] = (salesByCurrency[row.currency] ?? 0) + Number(row.total); return { paymentReview: count(['PAYMENT_REVIEW']), toShip: count(['PAID', 'PREPARING']), quotes: count(['QUOTE_REQUESTED']), salesByCurrency }; }
    async orders(user: AuthUser, providerId?: string) { if (providerId)
        await this.access.assertManage('provider', providerId, user); const rows = await this.db.select({ id: shopOrders.id }).from(shopOrders).where(providerId ? eq(shopOrders.providerId, providerId) : eq(shopOrders.buyerId, user.id)).orderBy(desc(shopOrders.createdAt)).limit(200); return Promise.all(rows.map(r => this.order(r.id, user))); }
    async action(id: string, input: z.infer<typeof orderActionSchema>, user: AuthUser) {
        return this.db.transaction(async (tx) => {
            const [order] = await tx.select().from(shopOrders).where(eq(shopOrders.id, id)).for('update');
            if (!order)
                throw new NotFoundException('Pedido no encontrado');
            const seller = !!(await this.access.roleOf('provider', order.providerId, user.id)) || user.isGlobalAdmin, buyer = order.buyerId === user.id;
            if (!seller && !buyer)
                throw new NotFoundException('Pedido no encontrado');
            const next = input.status;
            if(seller&&!buyer)await this.access.assertProviderPermission(order.providerId,user,(['PAID','REFUNDED','PENDING_PAYMENT'].includes(next)||(next==='CANCELLED'&&order.status==='PAYMENT_REVIEW'))?'FINANCE':['RETURN_APPROVED'].includes(next)?'SUPPORT':'ORDERS');
            const allowed: Record<string, string[]> = { QUOTE_REQUESTED: ['QUOTED', 'CANCELLED'], QUOTED: ['ACCEPT_QUOTE', 'REQUEST_REVISION', 'CANCELLED'], PENDING_PAYMENT: ['PAYMENT_REVIEW', 'CANCELLED'], PAYMENT_REVIEW: ['PAID', 'PENDING_PAYMENT', 'CANCELLED'], PAID: ['PREPARING', 'RETURN_REQUESTED'], PREPARING: ['SHIPPED', 'RETURN_REQUESTED'], SHIPPED: ['DELIVERED'], DELIVERED: ['RETURN_REQUESTED'], RETURN_REQUESTED: ['RETURN_APPROVED'], RETURN_APPROVED: ['REFUNDED'] };
            if (!allowed[order.status]?.includes(next))
                throw new ConflictException('Transicion de pedido no permitida');
            if (['PAYMENT_REVIEW', 'ACCEPT_QUOTE', 'REQUEST_REVISION', 'RETURN_REQUESTED'].includes(next) && !buyer)
                throw new ForbiddenException('Esta accion corresponde al comprador');
            if (!['PAYMENT_REVIEW', 'ACCEPT_QUOTE', 'REQUEST_REVISION', 'RETURN_REQUESTED', 'CANCELLED', 'DELIVERED'].includes(next) && !seller)
                throw new ForbiddenException('Esta accion corresponde a la tienda');
            if (next === 'CANCELLED' && order.status === 'PAYMENT_REVIEW') {
                if (!seller) throw new ForbiddenException('La tienda debe revisar la transferencia antes de cancelar');
                if (!input.note?.trim()) throw new BadRequestException('Indica por qué se cancela y confirma que no hubo abono');
            }
            if(['ACCEPT_QUOTE','REQUEST_REVISION'].includes(next)&&input.expectedRevision!==order.quoteRevision)throw new ConflictException('La propuesta cambio. Actualiza el pedido antes de responder');
            if(next==='REQUEST_REVISION'&&!input.note?.trim())throw new BadRequestException('Indica que deseas negociar');
            const lines = await tx.select().from(shopOrderLines).where(eq(shopOrderLines.orderId, id));
            let total = order.total;
            if (next === 'QUOTED') {
                if (!input.prices || input.prices.length !== lines.length || new Set(input.prices.map(p => p.lineId)).size !== lines.length)
                    throw new BadRequestException('Cotiza todas las lineas');
                let sum = cents(order.shippingFee);
                for (const line of lines) {
                    const price = input.prices.find(p => p.lineId === line.id)?.price;
                    if (price === undefined)
                        throw new BadRequestException('Linea sin cotizar');
                    sum += cents(price) * BigInt(line.quantity);
                    await tx.update(shopOrderLines).set({ unitPrice: String(price) }).where(eq(shopOrderLines.id, line.id));
                }
                total = amount(sum);
            }
            if (next === 'PAYMENT_REVIEW' && !input.reference?.trim())
                throw new BadRequestException('Indica la referencia de transferencia');
            if (next === 'SHIPPED' && !input.tracking?.trim())
                throw new BadRequestException('Indica el transportista y seguimiento');
            if (next === 'REFUNDED' && !input.reference?.trim())
                throw new BadRequestException('Indica la referencia del reembolso');
            if (['CANCELLED', 'SHIPPED', 'ACCEPT_QUOTE'].includes(next)) {
                const variants = await tx.select().from(productVariants).where(inArray(productVariants.id, lines.map(l => l.variantId))).orderBy(asc(productVariants.id)).for('update');
                for (const line of lines) {
                    const v = variants.find(v => v.id === line.variantId)!;
                    if (next === 'ACCEPT_QUOTE') {
                        const [store] = await tx.select().from(providers).where(eq(providers.id, order.providerId));
                        const [product] = await tx.select().from(listings).where(eq(listings.id, line.listingId));
                        if (store?.status !== 'ACTIVE' || product?.status !== 'ACTIVE')
                            throw new ConflictException('La tienda o el producto ya no estan disponibles');
                        if (!v.active || v.stock - v.reserved < line.quantity)
                            throw new ConflictException('No hay existencias para aceptar la cotizacion');
                        await tx.update(productVariants).set({ reserved: v.reserved + line.quantity }).where(eq(productVariants.id, v.id));
                    }
                    else if (next === 'SHIPPED')
                        await tx.update(productVariants).set({ stock: v.stock - line.quantity, reserved: v.reserved - line.quantity }).where(eq(productVariants.id, v.id));
                    else if (!['QUOTE_REQUESTED', 'QUOTED'].includes(order.status))
                        await tx.update(productVariants).set({ reserved: v.reserved - line.quantity }).where(eq(productVariants.id, v.id));
                    if (next !== 'CANCELLED' || !['QUOTE_REQUESTED', 'QUOTED'].includes(order.status))
                        await tx.insert(variantMovements).values({ variantId: v.id, actorId: user.id, orderId: id, stockDelta: next === 'SHIPPED' ? -line.quantity : 0, reservedDelta: next === 'ACCEPT_QUOTE' ? line.quantity : -line.quantity, reason: next });
                }
            }
            if (next === 'REFUNDED') {
                const [shipped] = await tx.select({id:shopOrderEvents.id}).from(shopOrderEvents).where(and(eq(shopOrderEvents.orderId,id),eq(shopOrderEvents.status,'SHIPPED'))).limit(1);
                if (!shipped) {
                    const variants = await tx.select().from(productVariants).where(inArray(productVariants.id,lines.map(l=>l.variantId))).orderBy(asc(productVariants.id)).for('update');
                    for (const line of lines) {
                        const variant = variants.find(v=>v.id===line.variantId)!;
                        await tx.update(productVariants).set({reserved:variant.reserved-line.quantity}).where(eq(productVariants.id,variant.id));
                        await tx.insert(variantMovements).values({variantId:variant.id,actorId:user.id,orderId:id,reservedDelta:-line.quantity,reason:'Reembolso antes del envio'});
                    }
                }
            }
            const status = next === 'ACCEPT_QUOTE' ? 'PENDING_PAYMENT' : next === 'REQUEST_REVISION' ? 'QUOTE_REQUESTED' : next;
            await tx.update(shopOrders).set({ status, total, ...(next==='QUOTED'&&{quoteRevision:order.quoteRevision+1}), ...(input.reference && next !== 'REFUNDED' && { paymentReference: input.reference }), ...(input.tracking && { tracking: input.tracking }), updatedAt: new Date() }).where(eq(shopOrders.id, id));
            const eventNote = next === 'QUOTED'
                ? [`Propuesta ${order.quoteRevision + 1}: ${order.currency} ${total}`, ...lines.map(line => `${line.sku}: ${line.quantity} x ${input.prices!.find(p => p.lineId === line.id)!.price.toFixed(2)}`), `Envío: ${order.shippingFee}`, input.note].filter(Boolean).join('\n')
                : input.note || input.reference;
            await tx.insert(shopOrderEvents).values({ orderId: id, actorId: user.id, status, note: eventNote });
            await notifyOrder(tx,order,user.id,`Pedido actualizado: ${status}`);
            return this.order(id, user, tx);
        });
    }
    async review(id: string, input: {
        listingId: string;
        rating: number;
        comment: string;
    }, user: AuthUser) { return this.db.transaction(async (tx) => { const [order] = await tx.select().from(shopOrders).where(eq(shopOrders.id, id)).for('update'); if (!order || order.buyerId !== user.id)
        throw new NotFoundException('Pedido no encontrado'); if (order.status !== 'DELIVERED')
        throw new ConflictException('Solo puedes valorar pedidos entregados'); const [line] = await tx.select().from(shopOrderLines).where(and(eq(shopOrderLines.orderId, id), eq(shopOrderLines.listingId, input.listingId))); if (!line)
        throw new BadRequestException('El producto no pertenece al pedido'); const [prior] = await tx.select().from(productReviews).where(and(eq(productReviews.orderId, id), eq(productReviews.listingId, input.listingId))); if (prior)
        throw new ConflictException('Ya valoraste este producto en el pedido'); await tx.insert(productReviews).values({ ...input, orderId: id, buyerId: user.id }); return { saved: true }; }); }
    async receipt(id: string, file: Express.Multer.File | undefined, user: AuthUser) { const image = inspectImage(file), key = `marketplace/receipts/${id}/${randomUUID()}.${image.extension}`; const order = await this.order(id, user); if (order.buyerId !== user.id)
        throw new ForbiddenException(); await this.storage.put(key, image.data); let previous: string | null = null; try {
        await this.db.transaction(async (tx) => { const [row] = await tx.select().from(shopOrders).where(eq(shopOrders.id, id)).for('update'); if (!['PENDING_PAYMENT', 'PAYMENT_REVIEW'].includes(row.status))
            throw new ConflictException('No se puede cambiar el comprobante'); previous = row.receiptKey; await tx.update(shopOrders).set({ receiptKey: key, receiptMime: image.mimeType }).where(eq(shopOrders.id, id)); });
    }
    catch (error) {
        await this.storage.delete(key).catch(() => undefined);
        throw error;
    } if (previous)
        await this.storage.delete(previous).catch(() => undefined); return this.order(id, user); }
    async readReceipt(id: string, user: AuthUser) { await this.order(id, user); const [order] = await this.db.select().from(shopOrders).where(eq(shopOrders.id, id)); if (!order.receiptKey || !order.receiptMime)
        throw new NotFoundException('Sin comprobante'); return { stream: await this.storage.open(order.receiptKey), mime: order.receiptMime }; }
}
