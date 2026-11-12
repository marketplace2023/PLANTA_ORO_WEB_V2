import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { bearer, createApp, login, type Session, TestDb } from './helpers';
import { professionalOffers, professionalOrders, professionalEvents, professionalMedia } from '../src/database/schema';
import { StorageService } from '../src/modules/documents/storage.service';
import type { OfferInput } from '../src/modules/organizations/professional.schemas';
describe('Professional services: complete contracting lifecycle', () => {
    let app: INestApplication, db: TestDb, admin: Session, seller: Session, buyer: Session, other: Session, viewer: Session, finance: Session, contractor: string, viewerId: string;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBz8AAAAASUVORK5CYII=', 'base64');
    const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, session: Session, body: object = {}) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', bearer(session)).send(body);
    const workspace = () => `/contractors/${contractor}/workspace`;
    const bank = { bank: 'E2E Professional Bank', beneficiary: 'E2E Professional', account: '111122223333', instructions: 'Use the contract number' };
    const cfg = { displayName: 'E2E Specialist', headline: 'Industrial diagnosis', bio: 'Experienced team', languages: ['Español'], skills: ['Diagnosis'], portfolio: [{ title: 'E2E Project', description: 'Project documentation', url: 'https://example.com/project' }], payment: bank };
    const offer = (mode: 'FIXED' | 'QUOTE' = 'FIXED'): OfferInput => ({ name: `E2E Inspection ${randomUUID()}`, description: 'Inspection service with a documented report, technical observations and clear recommendations for the maintenance team.', specialty: 'MECANICA', stageCodes: [], status: 'DRAFT', currency: 'USD', mode, packages: [{ id: 'basic', name: 'Basic', description: 'Technical inspection and report', price: 120, deliveryDays: 7, revisions: 1, deliverables: ['Inspection report'] }], extras: [{ id: 'extra', name: 'Additional equipment', price: 5, extraDays: 1 }], requirements: [{ id: 'equipment', question: 'Equipment to inspect', required: true }], faq: [{ question: 'Where?', answer: 'On site' }], terms: 'Access to the equipment must be provided.', videoUrl: '' });
    async function product(mode: 'FIXED' | 'QUOTE' = 'FIXED') {
        const content = offer(mode);
        const create = (await call('post', `${workspace()}/services`, seller, { offer: content }).expect(201)).body;
        const id = create.id;
        await request(app.getHttpServer()).post(`/api/v1${workspace()}/services/${id}/images`).set('Authorization', bearer(seller)).attach('file', png, 'photo.png').expect(201);
        await call('patch', `${workspace()}/services/${id}`, seller, { offer: { ...content, status: 'PUBLISHED' }, version: 1 }).expect(200);
        return { id, content: { ...content, status: 'PUBLISHED' }, version: 2 };
    }
    const req = (p: {
        id: string;
        version: number;
    }, over: object = {}) => ({ key: randomUUID(), serviceId: p.id, mode: 'FIXED', packageId: 'basic', extras: ['extra'], expectedTotal: 125, expectedVersion: p.version, requirements: { equipment: 'Pump with vibration' }, brief: 'Please inspect this equipment and submit the report.', ...over });
    const act = async (o: {
        id: string;
        version: number;
    }, action: string, session: Session, extra: object = {}) => (await call('patch', `/professional-market/orders/${o.id}`, session, { action, version: o.version, ...extra }).expect(200)).body;
    const paid = async () => { const p = await product(); let o = (await call('post', '/professional-market/orders', buyer, req(p)).expect(201)).body; o = await act(o, 'PAYMENT_SUBMIT', buyer, { reference: 'PAYMENT-123' }); return act(o, 'PAYMENT_CONFIRM', seller); };
    beforeAll(async () => {
        app = await createApp();
        db = new TestDb();
        await db.cleanup();
        await db.user('pro-admin', { isGlobalAdmin: true });
        for (const n of ['pro-seller', 'pro-buyer', 'pro-other', 'pro-viewer', 'pro-finance'])
            await db.user(n);
        admin = await login(app, 'pro-admin');
        seller = await login(app, 'pro-seller');
        buyer = await login(app, 'pro-buyer');
        other = await login(app, 'pro-other');
        viewer = await login(app, 'pro-viewer');
        finance = await login(app, 'pro-finance');
        contractor = (await call('post', '/contractors', admin, { organizationName: 'E2E Professional Studio', countryCode: 'VE', ownerEmail: 'pro-seller@e2e.fur.local' }).expect(201)).body.id;
        await call('patch', workspace(), seller, cfg).expect(200);
        await call('patch', `${workspace()}/bank`, seller, bank).expect(200);
        for (const email of ['pro-viewer@e2e.fur.local', 'pro-finance@e2e.fur.local'])
            await call('post', `/contractors/${contractor}/members`, seller, { email, role: 'MEMBER' }).expect(201);
        const members = (await call('get', workspace(), seller)).body.members;
        viewerId = members.find((m: {
            email: string;
        }) => m.email === 'pro-viewer@e2e.fur.local').userId;
        const financeId = members.find((m: {
            email: string;
        }) => m.email === 'pro-finance@e2e.fur.local').userId;
        await call('patch', `${workspace()}/staff/${viewerId}`, seller, { role: 'VIEWER' }).expect(200);
        await call('patch', `${workspace()}/staff/${financeId}`, seller, { role: 'FINANCE' }).expect(200);
    });
    afterAll(async () => { try {
        await db.cleanup();
    }
    finally {
        await db.close();
        await app.close();
    } });
    it('validates publication, protects drafts and never exposes banking details in public services', async () => {
        const content = offer();
        const s = (await call('post', `${workspace()}/services`, seller, { offer: content }).expect(201)).body;
        await call('patch', `${workspace()}/services/${s.id}`, seller, { version: 1, offer: { ...content, status: 'PUBLISHED' } }).expect(409);
        await call('get', `/professional-market/services/${s.id}`, other).expect(404);
        const p = await product();
        const publicDetail = (await call('get', `/professional-market/services/${p.id}`, buyer).expect(200)).body;
        expect(publicDetail).not.toHaveProperty('payment');
        expect(publicDetail.contractor.displayName).toBe(cfg.displayName);
        expect(publicDetail.gallery).toHaveLength(1);
        expect(publicDetail.rating).toBeNull();
        await request(app.getHttpServer()).get(`/api/v1${publicDetail.gallery[0].url}`).expect(200);
        const list = (await call('get', '/professional-market/services?currency=USD&sort=price&minPrice=100', buyer)).body;
        expect(list.items.some((s: {
            id: string;
        }) => s.id === p.id)).toBe(true);
        await call('get', '/professional-market/services?sort=price', buyer).expect(400);
        await call('patch', `${workspace()}/services/${p.id}`, seller, { version: 1, offer: p.content }).expect(409);
    });
    it('snapshots accepted conditions, prevents duplicate requests and detects price or version changes', async () => {
        const p = await product();
        await call('post', '/professional-market/orders', buyer, req(p, { expectedTotal: 1 })).expect(409);
        await call('post', '/professional-market/orders', buyer, req(p, { requirements: {} })).expect(400);
        const body = req(p);
        const [a, b] = await Promise.all([call('post', '/professional-market/orders', buyer, body), call('post', '/professional-market/orders', buyer, body)]);
        expect(a.status).toBe(201);
        expect(b.status).toBe(201);
        expect(a.body.id).toBe(b.body.id);
        await call('post', '/professional-market/orders', buyer, { ...body, brief: 'Changed requirements in duplicate request' }).expect(409);
        await call('get', `/professional-market/orders/${a.body.id}`, other).expect(404);
        await call('post', '/professional-market/orders', seller, req(p)).expect(409);
        await call('patch', `${workspace()}/bank`, seller, { ...bank, account: 'NEW-ACCOUNT' }).expect(200);
        await call('get', `/professional-market/orders/${a.body.id}`, buyer).expect(200).expect(r => expect(r.body.paymentInstructions.account).toBe(bank.account));
        await call('patch', `${workspace()}/bank`, seller, bank).expect(200);
        await call('patch', `${workspace()}/services/${p.id}`, seller, { version: 2, offer: { ...p.content, packages: [{ ...p.content.packages[0], price: 500 }] } }).expect(200);
        await call('get', `/professional-market/orders/${a.body.id}`, buyer).expect(200).expect(r => expect(r.body.proposal.price).toBe(125));
    });
    it('requires actual payment confirmation, starts the deadline then, and rejects stale competing transitions', async () => {
        const p = await product();
        let o = (await call('post', '/professional-market/orders', buyer, req(p)).expect(201)).body;
        expect(o.dueAt).toBeNull();
        await call('patch', `/professional-market/orders/${o.id}`, buyer, { action: 'PAYMENT_CONFIRM', version: o.version }).expect(403);
        await call('patch', `/professional-market/orders/${o.id}`, seller, { action: 'DELIVER', version: o.version, note: 'Premature delivery' }).expect(409);
        o = await act(o, 'PAYMENT_SUBMIT', buyer, { reference: 'BANK-1' });
        o = await act(o, 'PAYMENT_REJECT', seller, { note: 'Reference not located in our bank' });
        expect(o.status).toBe('PENDING_PAYMENT');
        o = await act(o, 'PAYMENT_SUBMIT', buyer, { reference: 'BANK-2' });
        const updates = await Promise.all([call('patch', `/professional-market/orders/${o.id}`, seller, { action: 'PAYMENT_CONFIRM', version: o.version }), call('patch', `/professional-market/orders/${o.id}`, seller, { action: 'PAYMENT_REJECT', version: o.version, note: 'Concurrent review' })]);
        expect(updates.map(r => r.status).sort()).toEqual([200, 409]);
        const saved = (await call('get', `/professional-market/orders/${o.id}`, buyer)).body;
        if (saved.status === 'IN_PROGRESS')
            expect(saved.dueAt).not.toBeNull();
    });
    it('delivers private files, limits revisions, approves work and calculates reviews only from completed jobs', async () => {
        let o = await paid();
        const storage = app.get(StorageService);
        o = (await request(app.getHttpServer()).post(`/api/v1/professional-market/orders/${o.id}/delivery`).set('Authorization', bearer(seller)).field('version', String(o.version)).field('note', 'Inspection report delivered for review').attach('file', Buffer.from('%PDF-1.4\nTest report'), 'report.pdf').expect(201)).body;
        const delivery = o.messages.find((m: {
            kind: string;
        }) => m.kind === 'DELIVERY');
        expect(delivery.fileUrl).toBeTruthy();
        await call('get', delivery.fileUrl, other).expect(404);
        await call('get', delivery.fileUrl, buyer).expect(200);
        await call('post', `/professional-market/orders/${o.id}/reviews`, buyer, { rating: 5, comment: 'Premature review' }).expect(409);
        o = await act(o, 'REVISE', buyer, { note: 'Please add the measurement details' });
        expect(o.revisionsUsed).toBe(1);
        o = await act(o, 'DELIVER', seller, { note: 'Revised report with all measurements' });
        await call('patch', `/professional-market/orders/${o.id}`, buyer, { action: 'REVISE', version: o.version, note: 'More edits beyond included revision' }).expect(409);
        o = await act(o, 'APPROVE', buyer);
        expect(o.status).toBe('COMPLETED');
        o = (await call('post', `/professional-market/orders/${o.id}/reviews`, buyer, { rating: 4, comment: 'Useful diagnosis and clear report' }).expect(201)).body;
        await call('post', `/professional-market/orders/${o.id}/reviews`, buyer, { rating: 5, comment: 'Duplicate review text' }).expect(409);
        await call('post', `${workspace()}/reviews/${o.review.id}/response`, seller, { response: 'Thank you for trusting our team' }).expect(201);
        await call('get', `/professional-market/services/${o.serviceId}`, buyer).expect(200).expect(r => expect(r.body).toMatchObject({ rating: 4, ratingCount: 1 }));
        const message = await db.db.select().from(professionalMedia).limit(1);
        expect(message.length).toBeGreaterThan(0);
        expect(storage).toBeDefined();
    });
    it('supports custom proposals, expiry, requirement snapshots and milestone approvals', async () => {
        const p = await product('QUOTE');
        let o = (await call('post', '/professional-market/orders', buyer, req(p, { mode: 'QUOTE', requirements: {}, packageId: undefined, extras: [], expectedTotal: undefined })).expect(201)).body;
        const proposal = { name: 'Two-part inspection', scope: 'On-site inspection and final documentation', price: 200, currency: 'USD', deliveryDays: 10, revisions: 2, deliverables: ['Diagnosis', 'Final report'], expiresAt: new Date(Date.now() + 86400000).toISOString(), milestones: [{ name: 'Diagnosis', deliverables: ['Diagnosis'] }, { name: 'Final report', deliverables: ['Report'] }] };
        o = await act(o, 'PROPOSE', seller, { proposal });
        const old = o;
        o = await act(o, 'REQUEST_PROPOSAL_CHANGE', buyer, { note: 'Please include the second equipment' });
        await call('patch', `/professional-market/orders/${o.id}`, buyer, { action: 'ACCEPT', version: old.version }).expect(409);
        o = await act(o, 'PROPOSE', seller, { proposal });
        o = await act(o, 'ACCEPT', buyer);
        expect(o.status).toBe('AWAITING_REQUIREMENTS');
        await call('patch', `/professional-market/orders/${o.id}`, buyer, { action: 'REQUIREMENTS', version: o.version, requirements: {} }).expect(400);
        o = await act(o, 'REQUIREMENTS', buyer, { requirements: { equipment: 'Main pump' } });
        o = await act(o, 'PAYMENT_SUBMIT', buyer, { reference: 'CUSTOM-1' });
        o = await act(o, 'PAYMENT_CONFIRM', seller);
        for (let i = 0; i < 2; i++) {
            o = await act(o, 'DELIVER', seller, { note: `Completed milestone ${i + 1} with report` });
            o = await act(o, 'APPROVE', buyer);
            expect(o.status).toBe(i === 0 ? 'IN_PROGRESS' : 'COMPLETED');
        }
        expect(o.completedMilestones).toBe(2);
        let expired = (await call('post', '/professional-market/orders', buyer, req(p, { mode: 'QUOTE' })).expect(201)).body;
        expired = await act(expired, 'PROPOSE', seller, { proposal });
        await db.db.update(professionalOrders).set({ proposal: { ...proposal, expiresAt: '2020-01-01T00:00:00.000Z' } }).where(eq(professionalOrders.id, expired.id));
        await call('patch', `/professional-market/orders/${expired.id}`, buyer, { action: 'ACCEPT', version: expired.version }).expect(409);
    });
    it('supports mutual deadline changes and cancellations followed by recorded bank refunds', async () => {
        let o = await paid();
        const previous = o.dueAt;
        o = await act(o, 'REQUEST_EXTENSION', seller, { days: 3, note: 'Need an additional site visit' });
        await call('patch', `/professional-market/orders/${o.id}`, seller, { action: 'ACCEPT_CHANGE', version: o.version }).expect(409);
        o = await act(o, 'ACCEPT_CHANGE', buyer);
        expect(new Date(o.dueAt).getTime() - new Date(previous).getTime()).toBe(3 * 86400000);
        o = await act(o, 'REQUEST_CANCEL', buyer, { note: 'The equipment is no longer accessible' });
        o = await act(o, 'ACCEPT_CHANGE', seller);
        expect(o.status).toBe('REFUND_PENDING');
        await call('patch', `/professional-market/orders/${o.id}`, buyer, { action: 'REFUND_CONFIRM', version: o.version, reference: 'INVALID' }).expect(403);
        o = await act(o, 'REFUND_CONFIRM', seller, { reference: 'BANK-REFUND-1' });
        expect(o.status).toBe('REFUNDED');
        expect(o.refundReference).toBe('BANK-REFUND-1');
    });
    it('restricts mediation to administrators, keeps events and notifies participants', async () => {
        let o = await paid();
        o = await act(o, 'DISPUTE', buyer, { note: 'The professional missed the agreed scope' });
        await call('get', '/professional-market/admin/cases', buyer).expect(403);
        await call('patch', `/professional-market/orders/${o.id}`, seller, { action: 'RESOLVE', version: o.version, outcome: 'COMPLETE', note: 'Attempt to resolve own dispute' }).expect(403);
        const cases = (await call('get', '/professional-market/admin/cases', admin)).body;
        expect(cases.some((c: {
            id: string;
        }) => c.id === o.id)).toBe(true);
        o = await act(o, 'RESOLVE', admin, { outcome: 'REFUND', note: 'The parties agreed to refund the payment' });
        expect(o.status).toBe('REFUND_PENDING');
        const inbox = (await call('get', '/professional-market/notifications', seller)).body;
        expect(inbox.some((n: {
            orderId: string;
        }) => n.orderId === o.id)).toBe(true);
        await call('patch', `/professional-market/notifications/${inbox[0].id}`, seller).expect(200);
        expect((await db.db.select().from(professionalEvents).where(eq(professionalEvents.orderId, o.id))).length).toBeGreaterThan(3);
    });
    it('enforces scoped staff roles on new and legacy endpoints without leaking bank configuration', async () => {
        await call('get', workspace(), viewer).expect(200).expect(r => expect(r.body.payment.account).toBe(''));
        await call('post', `${workspace()}/services`, viewer, { offer: offer() }).expect(403);
        await call('post', `/contractors/${contractor}/services`, viewer, { name: 'Bypass test', serviceType: 'MECANICA' }).expect(403);
        await call('patch', `/contractors/${contractor}`, viewer, { description: 'Unauthorized profile edit' }).expect(403);
        await call('patch', `${workspace()}/bank`, viewer, bank).expect(403);
        await call('patch', `${workspace()}/bank`, finance, bank).expect(200);
        await call('patch', `${workspace()}/staff/${viewerId}`, viewer, { role: 'FULL' }).expect(403);
        const o = await paid();
        await call('get', `/professional-market/orders/${o.id}`, viewer).expect(200).expect(r => expect(r.body.paymentInstructions).toBeNull());
        await call('patch', `/professional-market/orders/${o.id}`, finance, { action: 'DELIVER', version: o.version, note: 'Not allowed for finance role' }).expect(403);
        await call('get', `${workspace()}/summary`, seller).expect(200).expect(r => expect(r.body.earnings[0].currency).toBe('USD'));
    });
    it('validates file content, prevents unauthorized messages and cleans storage after transaction failures', async () => {
        const o = await paid();
        const url = `/api/v1/professional-market/orders/${o.id}/messages`;
        await request(app.getHttpServer()).post(url).set('Authorization', bearer(other)).field('body', 'Unauthorized private message').attach('file', png, 'photo.png').expect(404);
        await request(app.getHttpServer()).post(url).set('Authorization', bearer(buyer)).attach('file', Buffer.from('<svg>bad</svg>'), 'bad.png').expect(415);
        const storage = app.get(StorageService);
        const original = storage.put.bind(storage);
        const put = jest.spyOn(storage, 'put').mockImplementationOnce(async (key, data) => { await original(key, data); throw new Error('Simulated storage error'); });
        const del = jest.spyOn(storage, 'delete');
        const content = offer();
        const draft = (await call('post', `${workspace()}/services`, seller, { offer: content })).body;
        await request(app.getHttpServer()).post(`/api/v1${workspace()}/services/${draft.id}/images`).set('Authorization', bearer(seller)).attach('file', png, 'photo.png').expect(500);
        expect(del).toHaveBeenCalled();
        put.mockRestore();
        del.mockRestore();
        expect((await db.db.select().from(professionalMedia).where(eq(professionalMedia.serviceId, draft.id)))).toHaveLength(0);
        const [savedDraft] = await db.db.select().from(professionalOffers).where(eq(professionalOffers.serviceId, draft.id));
        expect(savedDraft.status).toBe('DRAFT');
    });
});
