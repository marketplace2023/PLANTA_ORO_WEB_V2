import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { bearer, createApp, login, type Session, TestDb } from './helpers';
import { SHOP_IMPORT_HEADERS, parseShopWorkbook } from '../src/modules/organizations/shop-import.xlsx';
import { StorageService } from '../src/modules/documents/storage.service';
import { listings } from '../src/database/schema';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBz8AAAAASUVORK5CYII=', 'base64');
async function workbook(family: string, ref = 'IMPORT-X', options: {
    stock?: unknown;
    second?: boolean;
    formula?: boolean;
    badFamily?: boolean;
} = {}) {
    const book = new ExcelJS.Workbook();
    for (const [name, headers] of Object.entries(SHOP_IMPORT_HEADERS))
        book.addWorksheet(name).addRow(headers);
    for (const r of options.second ? [ref, ref + '-B'] : [ref]) {
        book.getWorksheet('Productos')!.addRow([r, 'E2E Imported Pump ' + r, options.badFamily ? 'NOT-A-FAMILY' : family, 'USD', 'Marca propia', 'Bomba 20', 'NEW', 'DIRECT', 'Producto comercial', '12 meses', 2]);
        book.getWorksheet('Variantes')!.addRow([r, r, 'Standard', options.formula ? { formula: '10+15', result: 25 } : 25, options.stock ?? 10, 1]);
        book.getWorksheet('Especificaciones')!.addRow([r, 'Potencia', 'NUMBER', 'kW', 20]);
        book.getWorksheet('Imagenes')!.addRow([r, r + '.png', 'PORTADA', 0]);
    }
    return Buffer.from(await book.xlsx.writeBuffer());
}
describe('Strict seller Excel and image imports', () => {
    let app: INestApplication, db: TestDb, seller: Session, admin: Session, other: Session, provider: string, family: string, imported: string;
    const call = (method: 'get' | 'post', path: string, user: Session, body: object = {}) => request(app.getHttpServer())[method]('/api/v1' + path).set('Authorization', bearer(user)).send(body);
    function excel(path: string, buffer: Buffer, names = ['IMPORT-X.png'], fp?: string, user = seller) { const req = request(app.getHttpServer()).post(`/api/v1/providers/${provider}/commerce/imports${path}`).set('Authorization', bearer(user)); if (fp)
        req.field('fingerprint', fp); req.attach('file', buffer, 'tienda.xlsx'); for (const name of names)
        req.attach('images', png, name); return req; }
    function covers(path: string, replace = false, fp?: string, user = seller) { const req = request(app.getHttpServer()).post(`/api/v1/providers/${provider}/commerce/imports/images${path}`).set('Authorization', bearer(user)).field('replace', String(replace)); if (fp)
        req.field('fingerprint', fp); return req.attach('images', png, 'IMPORT-X.png'); }
    beforeAll(async () => { app = await createApp(); db = new TestDb(); await db.cleanup(); await db.user('excel-admin', { isGlobalAdmin: true }); await db.user('excel-seller'); await db.user('excel-other'); admin = await login(app, 'excel-admin'); seller = await login(app, 'excel-seller'); other = await login(app, 'excel-other'); family = (await call('get', '/catalog/families', admin)).body[0].code; provider = (await call('post', '/providers', admin, { organizationName: 'E2E Excel Shop', countryCode: 'VE', ownerEmail: 'excel-seller@e2e.fur.local' }).expect(201)).body.id; });
    afterAll(async () => { try {
        await db.cleanup();
    }
    finally {
        await db.close();
        await app.close();
    } });
    const snapshot = async (db: TestDb) => JSON.stringify((await db.pool.query("SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) AS models FROM catalog.asset_models m")).rows);
    it('previews without writes and imports variants, specifications and images without changing the catalogue', async () => {
        const buffer = await workbook(family), before = await snapshot(db);
        const preview = (await excel('/preview', buffer).expect(201)).body;
        expect(preview.issues).toEqual([]);
        expect(preview.summary).toEqual({ products: 1, variants: 1, specifications: 1, images: 1 });
        expect((await db.db.select().from(listings).where(eq(listings.providerId, provider))).length).toBe(0);
        const result = (await excel('', buffer, ['IMPORT-X.png'], preview.fingerprint).expect(201)).body;
        imported = result.created[0].id;
        const detail = (await call('get', `/providers/${provider}/commerce/products/${imported}`, seller).expect(200)).body;
        expect(detail.status).toBe('DRAFT');
        expect(detail.variants[0].sku).toBe('IMPORT-X');
        expect(detail.commercial.specifications[0]).toMatchObject({ type: 'NUMBER', value: 20 });
        expect((await db.db.select().from(listings).where(eq(listings.id, imported)))[0].assetModelId).toBeNull();
        await call('get', detail.imageUrl, seller).expect(200);
        await call('get', `/marketplace/products/${imported}`, other).expect(404);
        expect(await snapshot(db)).toBe(before);
    });
    it('blocks reused SKU, missing photos, invalid data and changed files without partial inserts', async () => {
        const old = await workbook(family), duplicate = (await excel('/preview', old).expect(201)).body;
        expect(duplicate.issues.some((i: {
            message: string;
        }) => i.message.includes('SKU ya existente'))).toBe(true);
        await excel('', old, ['IMPORT-X.png'], duplicate.fingerprint).expect(400);
        const fresh = await workbook(family, 'IMPORT-Y'), missing = (await excel('/preview', fresh, []).expect(201)).body;
        expect(missing.issues.some((i: {
            message: string;
        }) => i.message.includes('Falta adjuntar'))).toBe(true);
        const bad = (await excel('/preview', await workbook(family, 'IMPORT-Y', { stock: -1 }), ['IMPORT-Y.png']).expect(201)).body;
        expect(bad.issues.length).toBeGreaterThan(0);
        const preview = (await excel('/preview', fresh, ['IMPORT-Y.png']).expect(201)).body;
        await excel('', await workbook(family, 'IMPORT-Y', { stock: 20 }), ['IMPORT-Y.png'], preview.fingerprint).expect(409);
        expect((await db.db.select().from(listings).where(eq(listings.providerId, provider))).length).toBe(1);
    });
    it('rejects formulas, invalid images and access from another shop', async () => {
        await excel('/preview', await workbook(family, 'FORMULA', { formula: true }), ['FORMULA.png']).expect(400);
        await excel('/preview', await workbook(family), [], undefined, other).expect(403);
        const invalid = await request(app.getHttpServer()).post(`/api/v1/providers/${provider}/commerce/imports/preview`).set('Authorization', bearer(seller)).attach('file', await workbook(family, 'BAD'), 'tienda.xlsx').attach('images', Buffer.from('<html>'), 'BAD.png').expect(201);
        expect(invalid.body.issues.some((i: {
            sheet: string;
        }) => i.sheet === 'Archivos')).toBe(true);
        const numeric = await parseShopWorkbook(await workbook(family, 'TEXT', { stock: '10' }));
        expect(numeric.issues.some(i => i.sheet === 'Variantes')).toBe(true);
    });
    it('rolls back the entire batch and removes newly uploaded objects if storage fails', async () => {
        const buffer = await workbook(family, 'ROLLBACK', { second: true }), files = ['ROLLBACK.png', 'ROLLBACK-B.png'], preview = (await excel('/preview', buffer, files).expect(201)).body;
        const storage = app.get(StorageService), original = storage.put.bind(storage);
        let writes = 0;
        const put = jest.spyOn(storage, 'put').mockImplementation(async (...args: Parameters<StorageService['put']>) => { if (++writes === 2)
            throw Error('Storage unavailable'); return original(...args); }), remove = jest.spyOn(storage, 'delete');
        try {
            await excel('', buffer, files, preview.fingerprint).expect(500);
            expect(remove).toHaveBeenCalledTimes(2);
            expect((await db.db.select().from(listings).where(eq(listings.providerId, provider))).length).toBe(1);
        }
        finally {
            put.mockRestore();
            remove.mockRestore();
        }
    });
    it('requires explicit replacement and invalidates stale cover previews', async () => {
        const skipped = (await covers('/preview').expect(201)).body;
        expect(skipped.issues.length).toBeGreaterThan(0);
        const preview = (await covers('/preview', true).expect(201)).body;
        expect(preview.issues).toEqual([]);
        await db.db.update(listings).set({ updatedAt: new Date() }).where(eq(listings.id, imported));
        await covers('', true, preview.fingerprint).expect(409);
        const fresh = (await covers('/preview', true).expect(201)).body;
        await covers('', true, fresh.fingerprint).expect(201).expect(r => expect(r.body.uploaded).toBe(1));
        await covers('/preview', true, undefined, other).expect(403);
    });
});
