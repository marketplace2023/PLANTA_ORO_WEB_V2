import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../../database/database.module';
import { assetFamilies, listings, productImages, productVariants, providers, variantMovements } from '../../database/schema';
import type { AuthUser } from '../../common/types';
import { StorageService } from '../documents/storage.service';
import { inspectImage } from '../documents/image-upload';
import { cleanFileName } from '../documents/file-validation';
import { OrgAccessService } from './org-access.service';
import { parseShopWorkbook, type ShopImportIssue } from './shop-import.xlsx';
type Connection = Pick<Database, 'select'>;
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const normalize = (name: string) => name.normalize('NFC').toLocaleLowerCase();
type CheckedImage = {
    name: string;
    file: Express.Multer.File;
    image: ReturnType<typeof inspectImage>;
    hash: string;
};
@Injectable()
export class ShopImportService {
    constructor(
    @Inject(DB)
    private readonly db: Database, private readonly access: OrgAccessService, private readonly storage: StorageService) { }
    private async authorize(providerId: string, user: AuthUser) { await this.access.assertProviderPermission(providerId, user, 'PRODUCTS'); }
    private images(files: Express.Multer.File[]) {
        if (files.length > 40 || files.reduce((n, f) => n + f.buffer.length, 0) > 50 * 1024 * 1024)
            throw new BadRequestException('Máximo 40 imágenes y 50 MB por lote');
        const images: CheckedImage[] = [], issues: ShopImportIssue[] = [];
        files.forEach((file, i) => { const name = cleanFileName(file.originalname); try {
            const image = inspectImage({ ...file, originalname: name });
            if (images.some(f => normalize(f.name) === normalize(name)))
                throw Error('Nombre de archivo repetido');
            images.push({ name, file, image, hash: digest(file.buffer) });
        }
        catch (e) {
            issues.push({ sheet: 'Archivos', row: i + 1, message: `${name}: ${e instanceof Error ? e.message : 'Imagen inválida'}` });
        } });
        return { images, issues };
    }
    private async state(db: Connection, providerId: string) {
        const [provider] = await db.select().from(providers).where(eq(providers.id, providerId));
        if (provider?.status !== 'ACTIVE')
            throw new ConflictException('La tienda debe estar activa');
        const families = await db.select({ id: assetFamilies.id, code: assetFamilies.code, name: assetFamilies.name }).from(assetFamilies);
        const variants = await db.select({ id: productVariants.id, sku: productVariants.sku, listingId: productVariants.listingId }).from(productVariants).where(eq(productVariants.providerId, providerId));
        const products = await db.select({ id: listings.id, title: listings.title, imageKey: listings.imageKey, updatedAt: listings.updatedAt }).from(listings).where(eq(listings.providerId, providerId));
        return { families: families.sort((a, b) => a.id.localeCompare(b.id)), variants: variants.sort((a, b) => a.id.localeCompare(b.id)), products: products.sort((a, b) => a.id.localeCompare(b.id)) };
    }
    private plan(book: Awaited<ReturnType<typeof parseShopWorkbook>>, batch: ReturnType<ShopImportService['images']>, state: Awaited<ReturnType<ShopImportService['state']>>, providerId: string, user: AuthUser, buffer: Buffer) {
        const issues = [...book.issues, ...batch.issues];
        for (const product of book.products) {
            if (!state.families.some(f => f.code === product.family))
                issues.push({ sheet: 'Productos', row: product.row, message: `Categoría inexistente: ${product.family}` });
            for (const variant of product.variants)
                if (state.variants.some(v => v.sku === variant.sku))
                    issues.push({ sheet: 'Productos', row: product.row, message: `SKU ya existente en tu tienda: ${variant.sku}` });
        }
        for (const photo of book.photos)
            if (!batch.images.some(f => normalize(f.name) === normalize(photo.file)))
                issues.push({ sheet: 'Imagenes', row: photo.row, message: `Falta adjuntar ${photo.file}` });
        for (const file of batch.images)
            if (!book.photos.some(p => normalize(p.file) === normalize(file.name)))
                issues.push({ sheet: 'Archivos', row: 1, message: `Archivo sin asignación en Imagenes: ${file.name}` });
        const fingerprint = digest(JSON.stringify({ file: digest(buffer), images: batch.images.map(f => [f.name, f.hash]).sort(), state, providerId, userId: user.id }));
        return { fingerprint, issues, summary: { products: book.products.length, variants: book.products.reduce((n, p) => n + p.variants.length, 0), specifications: book.products.reduce((n, p) => n + p.commercial.specifications.length, 0), images: book.photos.length }, rows: book.products.map(p => ({ reference: p.reference, title: p.title, family: p.family, currency: p.currency, variants: p.variants.map(v => ({ sku: v.sku, name: v.name, price: v.price, stock: v.stock })), images: book.photos.filter(i => i.reference === p.reference).map(i => ({ file: i.file, use: i.use })) })) };
    }
    async workbook(providerId: string, user: AuthUser, file: Express.Multer.File | undefined, files: Express.Multer.File[], fingerprint?: string) {
        await this.authorize(providerId, user);
        if (!file || !file.originalname.toLowerCase().endsWith('.xlsx'))
            throw new BadRequestException('Selecciona la plantilla Excel .xlsx');
        const book = await parseShopWorkbook(file.buffer), batch = this.images(files);
        if (fingerprint === undefined)
            return this.plan(book, batch, await this.state(this.db, providerId), providerId, user, file.buffer);
        const written: string[] = [];
        try {
            return await this.db.transaction(async (tx) => {
                await tx.select({ id: providers.id }).from(providers).where(eq(providers.id, providerId)).for('update');
                const state = await this.state(tx, providerId), plan = this.plan(book, batch, state, providerId, user, file.buffer);
                if (plan.fingerprint !== fingerprint)
                    throw new ConflictException('El Excel, las imágenes o la tienda cambiaron. Vuelve a analizar antes de confirmar.');
                if (plan.issues.length)
                    throw new BadRequestException('Corrige todos los errores antes de importar');
                const created: Array<{
                    id: string;
                    reference: string;
                    title: string;
                }> = [];
                for (const product of book.products) {
                    const [listing] = await tx.insert(listings).values({ providerId, title: product.title, description: book.descriptions.get(product.reference), assetFamilyId: state.families.find(f => f.code === product.family)!.id, assetModelId: null, commercial: product.commercial, currency: product.currency, price: product.commercial.saleMode === 'DIRECT' ? String(Math.min(...product.variants.map(v => v.price))) : null, status: 'DRAFT' }).returning({ id: listings.id });
                    for (const variant of product.variants) {
                        const [saved] = await tx.insert(productVariants).values({ ...variant, providerId, listingId: listing.id, price: String(variant.price) }).returning({ id: productVariants.id });
                        if (variant.stock)
                            await tx.insert(variantMovements).values({ variantId: saved.id, actorId: user.id, stockDelta: variant.stock, reason: 'Importación Excel de tienda' });
                    }
                    for (const photo of book.photos.filter(p => p.reference === product.reference)) {
                        const image = batch.images.find(f => normalize(f.name) === normalize(photo.file))!.image, key = `marketplace/imports/${listing.id}/${randomUUID()}.${image.extension}`;
                        written.push(key);
                        await this.storage.put(key, image.data);
                        if (photo.use === 'PORTADA')
                            await tx.update(listings).set({ imageKey: key, imageMime: image.mimeType, imageUrl: `/marketplace/listings/${listing.id}/image?v=${digest(key).slice(0, 16)}` }).where(eq(listings.id, listing.id));
                        else
                            await tx.insert(productImages).values({ listingId: listing.id, key, mime: image.mimeType, position: photo.position });
                    }
                    created.push({ id: listing.id, reference: product.reference, title: product.title });
                }
                return { ...plan, created };
            });
        }
        catch (error) {
            await Promise.all(written.map(key => this.storage.delete(key).catch(() => undefined)));
            throw error;
        }
    }
    private imagePlan(batch: ReturnType<ShopImportService['images']>, state: Awaited<ReturnType<ShopImportService['state']>>, providerId: string, user: AuthUser, replace: boolean) {
        const issues = [...batch.issues], targets = new Set<string>();
        const rows = batch.images.map(file => {
            const sku = file.name.replace(/\.[^.]+$/, ''), variant = state.variants.find(v => v.sku === sku), product = state.products.find(p => p.id === variant?.listingId);
            const error = !product ? 'SKU desconocido en esta tienda' : targets.has(product.id) ? 'Varias imágenes apuntan a la portada del mismo producto' : product.imageKey && !replace ? 'Ya tiene portada; activa el reemplazo para cambiarla' : null;
            if (error)
                issues.push({ sheet: 'Archivos', row: 1, message: `${file.name}: ${error}` });
            if (product)
                targets.add(product.id);
            return { file: file.name, sku, productId: product?.id ?? null, title: product?.title ?? '', replacing: !!product?.imageKey };
        });
        return { fingerprint: digest(JSON.stringify({ files: batch.images.map(f => [f.name, f.hash]).sort(), state, providerId, userId: user.id, replace })), issues, rows };
    }
    async covers(providerId: string, user: AuthUser, files: Express.Multer.File[], replace: boolean, fingerprint?: string) {
        await this.authorize(providerId, user);
        if (!files.length)
            throw new BadRequestException('Selecciona imágenes nombradas con el SKU del producto');
        const batch = this.images(files);
        if (fingerprint === undefined)
            return this.imagePlan(batch, await this.state(this.db, providerId), providerId, user, replace);
        const written: string[] = [], previous: string[] = [];
        try {
            const result = await this.db.transaction(async (tx) => {
                await tx.select({ id: providers.id }).from(providers).where(eq(providers.id, providerId)).for('update');
                // Serialize with the normal cover editor, which locks listing rows too.
                await tx.select({ id: listings.id }).from(listings).where(eq(listings.providerId, providerId)).orderBy(listings.id).for('update');
                const state = await this.state(tx, providerId), plan = this.imagePlan(batch, state, providerId, user, replace);
                if (plan.fingerprint !== fingerprint)
                    throw new ConflictException('Las imágenes o los productos cambiaron. Vuelve a analizar.');
                if (plan.issues.length)
                    throw new BadRequestException('Corrige todos los errores antes de cargar las portadas');
                for (const row of plan.rows) {
                    const image = batch.images.find(f => f.name === row.file)!.image, key = `marketplace/imports/${row.productId}/${randomUUID()}.${image.extension}`;
                    written.push(key);
                    await this.storage.put(key, image.data);
                    const old = state.products.find(p => p.id === row.productId)!.imageKey;
                    if (old)
                        previous.push(old);
                    await tx.update(listings).set({ imageKey: key, imageMime: image.mimeType, imageUrl: `/marketplace/listings/${row.productId}/image?v=${digest(key).slice(0, 16)}`, updatedAt: new Date() }).where(eq(listings.id, row.productId!));
                }
                return { ...plan, uploaded: plan.rows.length };
            });
            await Promise.all(previous.map(key => this.storage.delete(key).catch(() => undefined)));
            return result;
        }
        catch (error) {
            await Promise.all(written.map(key => this.storage.delete(key).catch(() => undefined)));
            throw error;
        }
    }
}
