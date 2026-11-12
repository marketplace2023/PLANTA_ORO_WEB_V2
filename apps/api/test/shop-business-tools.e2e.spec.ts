import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, createApp, login, type Session, TestDb } from './helpers';
describe('Marketplace business tools', () => {
    let app: INestApplication, db: TestDb, admin: Session, seller: Session, buyer: Session, other: Session, staff: Session, provider: string, family: string, staffId: string;
    const call = (method: 'get' | 'post' | 'patch', path: string, user: Session, body: object = {}) => request(app.getHttpServer())[method]('/api/v1' + path).set('Authorization', bearer(user)).send(body);
    const settings = { bank: 'Bank', beneficiary: 'Shop', account: '123', currency: 'USD', shippingFee: 5, coverage: 'Caracas' };
    const address = { name: 'Buyer', phone: '123', country: 'Venezuela', city: 'Caracas', address: 'Street 1' };
    async function product(mode = 'DIRECT', rules: object = {}) { const p = (await call('post', `/providers/${provider}/listings`, seller, { title: 'E2E Advanced Product', assetFamilyCode: family, currency: 'USD', price: 10 }).expect(201)).body; await call('patch', `/providers/${provider}/commerce/products/${p.id}`, seller, { saleMode: mode }).expect(200); const v = (await call('patch', `/providers/${provider}/commerce/products/${p.id}/variants`, seller, { variants: [{ sku: randomUUID(), name: 'Standard', price: 10, stock: 100, salesRules: rules }] }).expect(200)).body.variants[0]; await call('patch', `/providers/${provider}/listings/${p.id}`, seller, { status: 'ACTIVE' }).expect(200); return { id: p.id, variantId: v.id }; }
    async function order(mode = 'DIRECT') { const p = await product(mode); return (await call('post', '/marketplace/orders', buyer, { key: randomUUID(), providerId: provider, mode, expectedTotal: 25, lines: [{ variantId: p.variantId, quantity: 2 }], address }).expect(201)).body; }
    beforeAll(async () => { app = await createApp(); db = new TestDb(); await db.cleanup(); for (const n of ['advanced-admin', 'advanced-seller', 'advanced-buyer', 'advanced-other', 'advanced-staff']) {
        const u = await db.user(n, { isGlobalAdmin: n === 'advanced-admin' });
        if (n === 'advanced-staff')
            staffId = u.id;
    } admin = await login(app, 'advanced-admin'); seller = await login(app, 'advanced-seller'); buyer = await login(app, 'advanced-buyer'); other = await login(app, 'advanced-other'); staff = await login(app, 'advanced-staff'); family = (await call('get', '/catalog/families', admin)).body[0].code; provider = (await call('post', '/providers', admin, { organizationName: 'E2E Advanced Shop', countryCode: 'VE', ownerEmail: 'advanced-seller@e2e.fur.local' }).expect(201)).body.id; await call('patch', `/providers/${provider}/commerce/settings`, seller, settings).expect(200); await call('post', `/providers/${provider}/members`, seller, { email: 'advanced-staff@e2e.fur.local' }).expect(201); });
    afterAll(async () => { try {
        await db.cleanup();
    }
    finally {
        await db.close();
        await app.close();
    } });
    it('enforces MOQ, applies quantity tiers and active discounts, and validates shipping geography', async () => {
        const p = await product('DIRECT', { minQuantity: 5, tiers: [{ quantity: 10, price: 8 }], promotion: { percent: 10, startsAt: new Date(Date.now() - 86400000).toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() } });
        await call('patch', `/providers/${provider}/commerce/settings`, seller, { ...settings, shippingZones: [{ id: 'caracas', name: 'Capital', country: 'Venezuela', cities: ['Caracas'], fee: 12, days: 2, carrier: 'Local' }] }).expect(200);
        const payload = { key: randomUUID(), providerId: provider, mode: 'DIRECT', shippingZoneId: 'caracas', expectedTotal: 84, lines: [{ variantId: p.variantId, quantity: 10 }], address };
        await call('post', '/marketplace/orders', buyer, { ...payload, lines: [{ variantId: p.variantId, quantity: 2 }] }).expect(400);
        await call('post', '/marketplace/orders', buyer, { ...payload, address: { ...address, city: 'Other city' } }).expect(409);
        await call('post', '/marketplace/orders', buyer, payload).expect(201).expect(r => { expect(r.body.total).toBe(84); expect(r.body.lines[0].unitPrice).toBe(7.2); expect(r.body.shippingFee).toBe(12); });
        await call('patch', `/providers/${provider}/commerce/settings`, seller, settings).expect(200);
    });
    it('stores private messages and attachments, and separates buyer from seller notifications', async () => {
        const o = await order();
        await call('post', `/marketplace/orders/${o.id}/messages`, other, { body: 'Cannot access' }).expect(404);
        await call('post', `/marketplace/orders/${o.id}/messages`, buyer, { body: 'Please confirm dimensions' }).expect(201);
        const path = '/api/v1/marketplace/orders/' + o.id + '/messages';
        const message = await request(app.getHttpServer()).post(path).set('Authorization', bearer(seller)).field('body', 'Technical document').attach('file', Buffer.from('%PDF-1.4\nTest'), 'spec.pdf').expect(201);
        const attachment = message.body.find((m: {
            fileName: string;
        }) => m.fileName === 'spec.pdf');
        expect(attachment).toBeDefined();
        await call('get', `/marketplace/orders/${o.id}/messages/${attachment.id}/file`, other).expect(404);
        await call('get', `/marketplace/orders/${o.id}/messages/${attachment.id}/file`, buyer).expect(200);
        expect((await call('get', '/marketplace/notifications', buyer).expect(200)).body.some((n: {
            orderId: string;
        }) => n.orderId === o.id)).toBe(true);
        expect((await call('get', `/marketplace/notifications?providerId=${provider}`, seller).expect(200)).body.length).toBeGreaterThan(0);
    });
    it('negotiates quote revisions and rejects acceptance of an obsolete version', async () => {
        const o = await order('QUOTE'), prices = o.lines.map((l: {
            id: string;
        }) => ({ lineId: l.id, price: 9 }));
        await call('patch', `/marketplace/orders/${o.id}`, seller, { status: 'QUOTED', prices }).expect(200);
        await call('patch', `/marketplace/orders/${o.id}`, buyer, { status: 'REQUEST_REVISION', expectedRevision: 1, note: 'Please improve delivery terms' }).expect(200);
        await call('patch', `/marketplace/orders/${o.id}`, seller, { status: 'QUOTED', prices }).expect(200);
        await call('patch', `/marketplace/orders/${o.id}`, buyer, { status: 'ACCEPT_QUOTE', expectedRevision: 1 }).expect(409);
        await call('patch', `/marketplace/orders/${o.id}`, buyer, { status: 'ACCEPT_QUOTE', expectedRevision: 2 }).expect(200);
    });
    it('enforces staff permissions on product and financial operations', async () => {
        const o = await order();
        await call('patch', `/providers/${provider}/commerce/staff/${staffId}`, seller, { role: 'CATALOG' }).expect(200);
        await call('patch', `/marketplace/orders/${o.id}`, buyer, { status: 'PAYMENT_REVIEW', reference: 'BANK-1' }).expect(200);
        await call('patch', `/marketplace/orders/${o.id}`, staff, { status: 'PAID' }).expect(403);
        await call('patch', `/providers/${provider}/commerce/staff/${staffId}`, seller, { role: 'SALES' }).expect(200);
        await call('patch', `/marketplace/orders/${o.id}`, staff, { status: 'CANCELLED', note: 'No bank deposit received' }).expect(403);
        await call('get', `/marketplace/orders/${o.id}`, staff).expect(200).expect(r => { expect(r.body.capabilities).toContain('ORDERS'); expect(r.body.capabilities).not.toContain('FINANCE'); });
        await call('patch', `/providers/${provider}/commerce/staff/${staffId}`, seller, { role: 'FINANCE' }).expect(200);
        await call('patch', `/marketplace/orders/${o.id}`, staff, { status: 'PAID' }).expect(200);
        await call('post', `/providers/${provider}/listings`, staff, { title: 'Forbidden Product', assetFamilyCode: family }).expect(403);
        await call('patch', `/providers/${provider}/commerce/staff/${staffId}`, staff, { role: 'SALES' }).expect(403);
    });
    it('accepts warranty requests only after delivery and preserves an audit trail of responses', async () => {
        const o = await order(), payload = { kind: 'WARRANTY', subject: 'Product warranty', description: 'Please inspect the purchased equipment.' };
        await call('post', `/marketplace/orders/${o.id}/cases`, buyer, payload).expect(409);
        await call('patch', `/marketplace/orders/${o.id}`, buyer, { status: 'PAYMENT_REVIEW', reference: 'WARRANTY-1' }).expect(200);
        for (const status of ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED'])
            await call('patch', `/marketplace/orders/${o.id}`, seller, { status, tracking: 'Carrier 123' }).expect(200);
        const issue = (await call('post', `/marketplace/orders/${o.id}/cases`, buyer, payload).expect(201)).body[0];
        await call('post', `/marketplace/orders/${o.id}/cases`, buyer, payload).expect(409);
        await call('patch', `/marketplace/orders/${o.id}/cases/${issue.id}`, seller, { status: 'SELLER_REVIEW', resolution: 'Send the serial number for review' }).expect(200);
        await call('get', `/marketplace/orders/${o.id}/messages`, buyer).expect(200).expect(r => expect(r.body.some((m: {
            body: string;
        }) => m.body.includes('serial number'))).toBe(true));
    });
    it('opens a dispute, escalates to administration, and keeps final mediation restricted', async () => {
        const o = await order();
        const issue = (await call('post', `/marketplace/orders/${o.id}/cases`, buyer, { kind: 'DISPUTE', subject: 'Payment issue', description: 'Please help verify my payment reference.' }).expect(201)).body[0];
        await call('patch', `/marketplace/orders/${o.id}/cases/${issue.id}`, buyer, { status: 'ESCALATED', resolution: 'Please mediate this issue' }).expect(200);
        await call('patch', `/marketplace/orders/${o.id}/cases/${issue.id}`, seller, { status: 'RESOLVED', resolution: 'Closed by seller' }).expect(403);
        await call('get', '/marketplace/admin/cases', other).expect(403);
        await call('patch', `/marketplace/orders/${o.id}/cases/${issue.id}`, admin, { status: 'RESOLVED', resolution: 'Evidence reviewed with both parties' }).expect(200);
        await call('patch', `/marketplace/orders/${o.id}/cases/${issue.id}`, buyer, { status: 'ESCALATED', resolution: 'Reopen final decision' }).expect(409);
    });
    it('previews imports, commits atomically as drafts and exports protected CSV', async () => {
        const rows = [{ title: 'E2E Imported Product', family, sku: 'IMPORT-1', variant: '=HYPERLINK("https://example.com")', price: 25, stock: 10 }];
        const path = `/providers/${provider}/commerce/import`;
        await call('post', path, seller, { rows, commit: false }).expect(201).expect(r => expect(r.body).toMatchObject({ valid: 1, created: 0, errors: [] }));
        await call('post', path, seller, { rows: [...rows, { ...rows[0], family: 'NONEXISTENT', sku: 'IMPORT-2' }], commit: true }).expect(400);
        await call('post', path, seller, { rows, commit: true }).expect(201).expect(r => expect(r.body.created).toBe(1));
        await call('post', path, seller, { rows, commit: true }).expect(400);
        await call('get', `/providers/${provider}/commerce/reports?kind=inventory`, seller).expect(200).expect(r => { expect(r.text).toContain('IMPORT-1'); expect(r.text).toContain("\"'=HYPERLINK"); });
        await call('get', `/providers/${provider}/commerce/reports?kind=orders`, other).expect(403);
    });
});
