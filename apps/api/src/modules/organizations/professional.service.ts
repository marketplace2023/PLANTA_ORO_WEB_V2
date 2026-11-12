import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql, ilike, or, type SQL } from 'drizzle-orm';
import { escapeLike } from '../../common/pagination';
import { DB, type Database } from '../../database/database.module';
import { contractorMembers, contractors, professionalEvents as events, professionalMedia as media, professionalMessages as messages, professionalNotifications as notifications, professionalOffers as offers, professionalOrders as orders, professionalReviews as reviews, professionalSettings as settings, professionalStaff as staff, services, serviceStages, stageMaster, users } from '../../database/schema';
import type { AuthUser } from '../../common/types';
import { validationError } from '../../common/errors';
import { inspectImage } from '../documents/image-upload';
import { inspectUpload } from '../documents/file-validation';
import { StorageService } from '../documents/storage.service';
import { OrgAccessService } from './org-access.service';
import { EMPTY_SETTINGS, PROFESSIONAL_ROLES, type OfferInput, type OrderAction, type ProfessionalSettings, type Proposal, type ServiceRequest, type listServicesSchema } from './professional.schemas';
import type { z } from 'zod';
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Order = typeof orders.$inferSelect;
type Db = Tx | Database;
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const cents = (v: number) => Math.round(v * 100);
const nowPlus = (days: number) => new Date(Date.now() + days * 86400000);
const fail = (message: string): never => { throw new ConflictException(message); };
const need = (ok: unknown, message: string) => { if (!ok)
    fail(message); };
const required = (value: string | undefined, label: string) => { if (!value?.trim())
    throw validationError(label, 'Completa este campo'); return value.trim(); };
const terminal = ['COMPLETED', 'CANCELLED', 'REFUNDED'];
const publicMediaUrl = (id: string) => `/professional-market/media/${id}`;
@Injectable()
export class ProfessionalCommerceService {
    constructor(
    @Inject(DB)
    private readonly db: Database, private readonly access: OrgAccessService, private readonly storage: StorageService) { }
    async permissions(contractorId: string, user: AuthUser) {
        const role = await this.access.assertManage('contractor', contractorId, user);
        if (role === 'OWNER' || role === 'ADMIN')
            return [...PROFESSIONAL_ROLES.FULL];
        const [s] = await this.db.select().from(staff).where(and(eq(staff.contractorId, contractorId), eq(staff.userId, user.id)));
        return [...(PROFESSIONAL_ROLES[s?.role ?? 'FULL'] ?? [])];
    }
    private async permit(contractorId: string, user: AuthUser, permission: string) {
        if (!(await this.permissions(contractorId, user)).includes(permission))
            throw new ForbiddenException('Tu rol no permite esta operación');
    }
    private async active(contractorId: string, db: Db = this.db) {
        const [c] = await db.select().from(contractors).where(eq(contractors.id, contractorId));
        if (!c)
            throw new NotFoundException('Profesional no encontrado');
        need(c.status === 'ACTIVE', 'La empresa debe estar aprobada y activa');
        return c;
    }
    private async config(contractorId: string, db: Db = this.db) {
        return (await db.select().from(settings).where(eq(settings.contractorId, contractorId)))[0]?.content ?? EMPTY_SETTINGS;
    }
    async workspace(contractorId: string, user: AuthUser) {
        const permissions = await this.permissions(contractorId, user);
        const config = await this.config(contractorId);
        const members = await this.access.list('contractor', contractorId, user);
        const scopes = await this.db.select().from(staff).where(eq(staff.contractorId, contractorId));
        const images = await this.db.select().from(media).where(and(eq(media.contractorId, contractorId), sql `${media.serviceId} is null`)).orderBy(asc(media.createdAt));
        return { ...config, payment: permissions.includes('FINANCE') ? config.payment : EMPTY_SETTINGS.payment, permissions, media: images.map(m => ({ id: m.id, kind: m.kind, name: m.name, url: publicMediaUrl(m.id) })), members: members.map(m => ({ ...m, scope: m.role === 'OWNER' ? 'OWNER' : scopes.find(s => s.userId === m.userId)?.role ?? 'FULL' })) };
    }
    async saveWorkspace(contractorId: string, input: ProfessionalSettings, user: AuthUser) {
        // A profile editor must not silently replace banking details hidden by their role.
        await this.permit(contractorId, user, 'CATALOG');
        const [c] = await this.db.select().from(contractors).where(eq(contractors.id, contractorId));
        need(c && c.status !== 'SUSPENDED', 'La empresa está suspendida');
        await this.db.transaction(async (tx) => {
            await tx.select().from(contractors).where(eq(contractors.id, contractorId)).for('update');
            const previous = await this.config(contractorId, tx);
            const content = { ...input, payment: previous.payment };
            await tx.insert(settings).values({ contractorId, content }).onConflictDoUpdate({ target: settings.contractorId, set: { content, updatedAt: new Date() } });
        });
        return this.workspace(contractorId, user);
    }
    async saveBank(contractorId: string, payment: ProfessionalSettings['payment'], user: AuthUser) {
        await this.permit(contractorId, user, 'FINANCE');
        await this.active(contractorId);
        await this.db.transaction(async (tx) => { await tx.select().from(contractors).where(eq(contractors.id, contractorId)).for('update'); const content = { ...await this.config(contractorId, tx), payment }; await tx.insert(settings).values({ contractorId, content }).onConflictDoUpdate({ target: settings.contractorId, set: { content, updatedAt: new Date() } }); });
        return this.workspace(contractorId, user);
    }
    async setStaff(contractorId: string, userId: string, role: string, user: AuthUser) {
        await this.access.assertOwner('contractor', contractorId, user);
        const membership = await this.access.roleOf('contractor', contractorId, userId);
        need(membership === 'MEMBER', 'Selecciona un miembro; los responsables conservan acceso completo');
        await this.db.insert(staff).values({ contractorId, userId, role }).onConflictDoUpdate({ target: [staff.contractorId, staff.userId], set: { role } });
        return this.workspace(contractorId, user);
    }
    async managed(contractorId: string, user: AuthUser) {
        const permissions = await this.permissions(contractorId, user);
        const rows = await this.db.select({ service: services, offer: offers }).from(services).leftJoin(offers, eq(services.id, offers.serviceId)).where(eq(services.contractorId, contractorId)).orderBy(desc(services.createdAt));
        const images = await this.db.select().from(media).where(eq(media.contractorId, contractorId)).orderBy(asc(media.createdAt));
        const ids = rows.map(r => r.service.id);
        const stages = ids.length ? await this.db.select({ serviceId: serviceStages.serviceId, code: stageMaster.code }).from(serviceStages).innerJoin(stageMaster, eq(stageMaster.id, serviceStages.stageMasterId)).where(inArray(serviceStages.serviceId, ids)) : [];
        return { permissions, items: rows.map(({ service, offer }) => ({ ...service, stageCodes: stages.filter(s => s.serviceId === service.id).map(s => s.code), offer: offer ? { ...offer.content, version: offer.version } : null, media: images.filter(m => m.serviceId === service.id).map(m => ({ id: m.id, name: m.name, kind: m.kind, url: publicMediaUrl(m.id) })) })) };
    }
    async saveOffer(contractorId: string, serviceId: string | undefined, input: OfferInput, version: number | undefined, user: AuthUser) {
        await this.permit(contractorId, user, 'CATALOG');
        await this.active(contractorId);
        const savedId = await this.db.transaction(async (tx) => {
            await tx.select().from(contractors).where(eq(contractors.id, contractorId)).for('update');
            const previous = serviceId ? (await tx.select().from(services).where(and(eq(services.id, serviceId), eq(services.contractorId, contractorId))))[0] : null;
            if (serviceId && !previous)
                throw new NotFoundException('Servicio no encontrado');
            const priorOffer = serviceId ? (await tx.select().from(offers).where(eq(offers.serviceId, serviceId)))[0] : null;
            if (priorOffer && priorOffer.version !== version)
                fail('El servicio cambió. Recarga antes de guardar');
            if (input.status === 'PUBLISHED') {
                const photos = serviceId ? await tx.select().from(media).where(and(eq(media.serviceId, serviceId), eq(media.kind, 'IMAGE'))) : [];
                need(photos.length, 'Sube al menos una imagen antes de publicar');
                if (input.mode === 'FIXED' && input.packages.some(p => p.price > 0)) {
                    const cfg = await this.config(contractorId, tx);
                    need(cfg.payment.bank && cfg.payment.account && cfg.payment.beneficiary, 'Configura los datos para transferencias antes de publicar un servicio de pago');
                }
            }
            const stages = input.stageCodes.length ? await tx.select().from(stageMaster).where(inArray(stageMaster.code, input.stageCodes)) : [];
            if (new Set(input.stageCodes).size !== stages.length)
                throw validationError('stageCodes', 'Hay etapas repetidas o inexistentes');
            const values = { name: input.name, description: input.description, serviceType: input.specialty.toUpperCase(), status: input.status === 'PUBLISHED' ? 'ACTIVE' : 'INACTIVE', updatedAt: new Date() };
            const id = serviceId ?? (await tx.insert(services).values({ ...values, contractorId }).returning())[0].id;
            if (serviceId)
                await tx.update(services).set(values).where(eq(services.id, id));
            await tx.insert(offers).values({ serviceId: id, status: input.status, content: input }).onConflictDoUpdate({ target: offers.serviceId, set: { content: input, status: input.status, version: (priorOffer?.version ?? 0) + 1, updatedAt: new Date() } });
            await tx.delete(serviceStages).where(eq(serviceStages.serviceId, id));
            if (stages.length)
                await tx.insert(serviceStages).values(stages.map(s => ({ serviceId: id, stageMasterId: s.id })));
            return id;
        });
        return { id: savedId, ...await this.managed(contractorId, user) };
    }
    async uploadMedia(contractorId: string, serviceId: string | undefined, kind: string, file: Express.Multer.File | undefined, user: AuthUser) {
        await this.permit(contractorId, user, 'CATALOG');
        await this.active(contractorId);
        const image = inspectImage(file);
        const key = `professional/${contractorId}/${randomUUID()}.${image.extension}`;
        try {
            await this.storage.put(key, image.data);
            await this.db.transaction(async (tx) => {
                await tx.select().from(contractors).where(eq(contractors.id, contractorId)).for('update');
                if (serviceId && !(await tx.select().from(services).where(and(eq(services.id, serviceId), eq(services.contractorId, contractorId))))[0])
                    throw new NotFoundException('Servicio no encontrado');
                const existing = await tx.select().from(media).where(and(eq(media.contractorId, contractorId), serviceId ? eq(media.serviceId, serviceId) : sql `${media.serviceId} is null`, eq(media.kind, kind)));
                need(existing.length < (kind === 'AVATAR' ? 1 : kind === 'PORTFOLIO' ? 12 : 8), 'Alcanzaste el máximo de imágenes; elimina una antes de subir otra');
                await tx.insert(media).values({ contractorId, serviceId, kind, storageKey: key, mime: image.mimeType, name: file!.originalname.slice(0, 255) });
            });
        }
        catch (e) {
            await this.storage.delete(key).catch(() => { });
            throw e;
        }
        return serviceId ? this.managed(contractorId, user) : this.workspace(contractorId, user);
    }
    async removeMedia(contractorId: string, id: string, user: AuthUser) {
        await this.permit(contractorId, user, 'CATALOG');
        await this.active(contractorId);
        const removed = await this.db.transaction(async (tx) => {
            await tx.select().from(contractors).where(eq(contractors.id, contractorId)).for('update');
            const [m] = await tx.select().from(media).where(and(eq(media.id, id), eq(media.contractorId, contractorId)));
            if (!m)
                throw new NotFoundException('Imagen no encontrada');
            if (m.serviceId) {
                const [o] = await tx.select().from(offers).where(eq(offers.serviceId, m.serviceId));
                if (o?.status === 'PUBLISHED') {
                    const images = await tx.select().from(media).where(eq(media.serviceId, m.serviceId));
                    need(images.length > 1, 'Un servicio publicado debe conservar una imagen');
                }
            }
            await tx.delete(media).where(eq(media.id, id));
            return m;
        });
        await this.storage.delete(removed.storageKey).catch(() => { });
        return { ok: true };
    }
    async openMedia(id: string, user?: AuthUser) {
        const [m] = await this.db.select().from(media).where(eq(media.id, id));
        if (!m)
            throw new NotFoundException();
        const [c] = await this.db.select().from(contractors).where(eq(contractors.id, m.contractorId));
        const [s] = m.serviceId ? await this.db.select().from(services).where(eq(services.id, m.serviceId)) : [];
        const [o] = m.serviceId ? await this.db.select().from(offers).where(eq(offers.serviceId, m.serviceId)) : [];
        const visible = c?.status === 'ACTIVE' && (!m.serviceId || (o?.status === 'PUBLISHED' && s?.status === 'ACTIVE'));
        if (!visible && !user?.isGlobalAdmin && !(await this.access.roleOf('contractor', m.contractorId, user?.id)))
            throw new NotFoundException();
        return { stream: await this.storage.open(m.storageKey), mime: m.mime };
    }
    async list(q: z.infer<typeof listServicesSchema>, user?: AuthUser) {
        if ((q.minPrice !== undefined || q.maxPrice !== undefined || q.sort === 'price') && !q.currency)
            throw validationError('currency', 'Selecciona una moneda para comparar precios');
        const price = sql `(select min((p->>'price')::numeric) from jsonb_array_elements(${offers.content}->'packages') p)`;
        const rating = sql `(select avg(r.rating) from professional.reviews r where r.service_id=${services.id})`;
        const conditions: Array<SQL | undefined> = [eq(offers.status, 'PUBLISHED'), eq(services.status, 'ACTIVE'), eq(contractors.status, 'ACTIVE')];
        if (q.search) {
            const term = `%${escapeLike(q.search)}%`;
            conditions.push(or(ilike(services.name, term), ilike(services.description, term), ilike(services.serviceType, term), ilike(contractors.organizationName, term)));
        }
        if (q.specialty)
            conditions.push(sql `lower(${services.serviceType})=lower(${q.specialty})`);
        if (q.stage)
            conditions.push(sql `${offers.content}->'stageCodes' @> ${JSON.stringify([q.stage])}::jsonb`);
        if (q.location)
            conditions.push(ilike(contractors.city, `%${escapeLike(q.location)}%`));
        if (q.availability)
            conditions.push(eq(contractors.availability, q.availability));
        if (q.verified)
            conditions.push(eq(contractors.verified, q.verified === '1'));
        if (q.currency)
            conditions.push(sql `${offers.content}->>'currency'=${q.currency}`);
        if (q.minPrice !== undefined)
            conditions.push(sql `${price} >= ${q.minPrice}`);
        if (q.maxPrice !== undefined)
            conditions.push(sql `${price} <= ${q.maxPrice}`);
        const where = and(...conditions);
        const sorting = q.sort === 'price' ? asc(price) : q.sort === 'rating' ? sql `${rating} desc nulls last` : asc(services.name);
        const [rows, [count]] = await Promise.all([
            this.db.select({ s: services, o: offers, c: contractors }).from(offers).innerJoin(services, eq(services.id, offers.serviceId)).innerJoin(contractors, eq(contractors.id, services.contractorId)).where(where).orderBy(sorting, asc(services.name), asc(services.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
            this.db.select({ total: sql<number> `count(*)::int` }).from(offers).innerJoin(services, eq(services.id, offers.serviceId)).innerJoin(contractors, eq(contractors.id, services.contractorId)).where(where),
        ]);
        const ids = rows.map(r => r.s.id);
        const pictures = ids.length ? await this.db.select().from(media).where(inArray(media.serviceId, ids)).orderBy(asc(media.createdAt)) : [];
        const ratings = ids.length ? await this.db.select({ serviceId: reviews.serviceId, rating: sql<number> `avg(${reviews.rating})::float`, count: sql<number> `count(*)::int` }).from(reviews).where(inArray(reviews.serviceId, ids)).groupBy(reviews.serviceId) : [];
        const items = rows.map(({ s, o, c }) => ({ id: s.id, name: s.name, description: s.description, specialty: s.serviceType, version: o.version, currency: o.content.currency, mode: o.content.mode, fromPrice: Math.min(...o.content.packages.map(p => p.price)), deliveryDays: Math.min(...o.content.packages.map(p => p.deliveryDays)), stageCodes: o.content.stageCodes, coverUrl: pictures.find(m => m.serviceId === s.id) ? publicMediaUrl(pictures.find(m => m.serviceId === s.id)!.id) : null, rating: ratings.find(r => r.serviceId === s.id)?.rating ?? null, ratingCount: ratings.find(r => r.serviceId === s.id)?.count ?? 0, contractor: { id: c.id, name: c.organizationName, verified: c.verified, availability: c.availability, city: c.city, countryCode: c.countryCode } }));
        void user;
        return { items, total: count.total, page: q.page, pageSize: q.pageSize };
    }
    async detail(id: string, user?: AuthUser) {
        const [row] = await this.db.select({ s: services, o: offers, c: contractors }).from(services).innerJoin(offers, eq(offers.serviceId, services.id)).innerJoin(contractors, eq(contractors.id, services.contractorId)).where(eq(services.id, id));
        if (!row)
            throw new NotFoundException('Servicio no encontrado');
        const managed = !!user && (user.isGlobalAdmin || !!await this.access.roleOf('contractor', row.c.id, user.id));
        if (!managed && (row.o.status !== 'PUBLISHED' || row.s.status !== 'ACTIVE' || row.c.status !== 'ACTIVE'))
            throw new NotFoundException('Servicio no encontrado');
        const cfg = await this.config(row.c.id);
        const pictures = await this.db.select().from(media).where(eq(media.contractorId, row.c.id)).orderBy(asc(media.createdAt));
        const opinions = await this.db.select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, response: reviews.response, createdAt: reviews.createdAt, buyer: users.firstName }).from(reviews).innerJoin(users, eq(users.id, reviews.buyerId)).where(eq(reviews.serviceId, id)).orderBy(desc(reviews.createdAt)).limit(100);
        const [aggregate] = await this.db.select({ rating: sql<number> `avg(${reviews.rating})::float`, count: sql<number> `count(*)::int` }).from(reviews).where(eq(reviews.serviceId, id));
        return { id, ...row.o.content, version: row.o.version, canManage: managed, canContract: !user || !await this.access.roleOf('contractor',row.c.id,user.id), contractor: { id: row.c.id, name: row.c.organizationName, verified: row.c.verified, availability: row.c.availability, city: row.c.city, countryCode: row.c.countryCode, certifications: row.c.certifications, displayName: cfg.displayName, headline: cfg.headline, bio: cfg.bio, languages: cfg.languages, skills: cfg.skills, portfolio: cfg.portfolio, avatarUrl: pictures.find(p => !p.serviceId && p.kind === 'AVATAR') ? publicMediaUrl(pictures.find(p => !p.serviceId && p.kind === 'AVATAR')!.id) : row.c.logoUrl, portfolioImages: pictures.filter(p => !p.serviceId && p.kind === 'PORTFOLIO').map(p => ({ id: p.id, url: publicMediaUrl(p.id) })) }, gallery: pictures.filter(p => p.serviceId === id).map(p => ({ id: p.id, url: publicMediaUrl(p.id), name: p.name })), reviews: opinions, rating: aggregate?.rating ?? null, ratingCount: aggregate?.count ?? 0 };
    }
    private async participants(o: Order, user: AuthUser, db: Db = this.db) {
        const isBuyer = o.buyerId === user.id;
        const role = user.isGlobalAdmin ? 'ADMIN' : await this.access.roleOf('contractor', o.contractorId, user.id);
        if (!isBuyer && !role)
            throw new NotFoundException('Contratación no encontrada');
        let permissions: readonly string[] = [];
        if (role) {
            if (role === 'ADMIN' || role === 'OWNER')
                permissions = PROFESSIONAL_ROLES.FULL;
            else {
                const [scoped] = await db.select().from(staff).where(and(eq(staff.contractorId, o.contractorId), eq(staff.userId, user.id)));
                permissions = PROFESSIONAL_ROLES[scoped?.role ?? 'FULL'] ?? [];
            }
        }
        return { isBuyer, isSeller: !!role, permissions, isAdmin: !!user.isGlobalAdmin };
    }
    private async notify(tx: Tx, o: Order, actor: AuthUser, title: string) {
        const members = await tx.select({ id: contractorMembers.userId }).from(contractorMembers).where(eq(contractorMembers.contractorId, o.contractorId));
        const recipients = [...new Set([o.buyerId, ...members.map(m => m.id)])].filter(id => id !== actor.id);
        if (recipients.length)
            await tx.insert(notifications).values(recipients.map(userId => ({ userId, orderId: o.id, title })));
    }
    private async event(tx: Tx, o: Order, user: AuthUser, action: string, snapshot: unknown) {
        await tx.insert(events).values({ orderId: o.id, actorId: user.id, action, snapshot });
        await this.notify(tx, o, user, action);
    }
    async request(input: ServiceRequest, user: AuthUser) {
        const fingerprint = hash(input);
        const created = await this.db.transaction(async (tx) => {
            await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for('no key update');
            const [s] = await tx.select().from(services).where(eq(services.id, input.serviceId));
            if (!s)
                throw new NotFoundException('Servicio no encontrado');
            await tx.select().from(contractors).where(eq(contractors.id, s.contractorId)).for('update');
            const [prior] = await tx.select().from(orders).where(and(eq(orders.buyerId, user.id), eq(orders.key, input.key)));
            if (prior) {
                need(prior.requestHash === fingerprint, 'Esta solicitud ya se utilizó con otros datos');
                return prior;
            }
            const c = await this.active(s.contractorId, tx);
            need(c.availability !== 'UNAVAILABLE', 'El profesional no está disponible para nuevos trabajos');
            need(!await this.access.roleOf('contractor', s.contractorId, user.id), 'No puedes contratar tus propios servicios');
            const [o] = await tx.select().from(offers).where(eq(offers.serviceId, s.id));
            need(o?.status === 'PUBLISHED' && s.status === 'ACTIVE', 'Este servicio no está publicado');
            need(o.version === input.expectedVersion, 'Las condiciones cambiaron. Recarga el servicio');
            const cfg = await this.config(s.contractorId, tx);
            let proposal: Proposal | null = null;
            if (input.mode === 'FIXED') {
                need(o.content.mode === 'FIXED', 'Este servicio requiere una propuesta personalizada');
                const pack = o.content.packages.find(p => p.id === input.packageId);
                need(pack, 'El paquete ya no existe');
                need(new Set(input.extras).size === input.extras.length, 'Hay extras repetidos');
                const extras = input.extras.map(id => { const e = o.content.extras.find(e => e.id === id); need(e, 'Un extra ya no está disponible'); return e!; });
                const total = (cents(pack!.price) + extras.reduce((sum, e) => sum + cents(e.price), 0)) / 100;
                need(input.expectedTotal === total, 'El precio cambió. Revisa el importe antes de contratar');
                proposal = { name: pack!.name, scope: `${pack!.description}\n${o.content.terms}`, currency: o.content.currency, price: total, deliveryDays: pack!.deliveryDays + extras.reduce((s, e) => s + e.extraDays, 0), revisions: pack!.revisions, deliverables: [...pack!.deliverables, ...extras.map(e => e.name)], expiresAt: nowPlus(7).toISOString(), milestones: [] };
                for (const r of o.content.requirements)
                    if (r.required && !input.requirements[r.id]?.trim())
                        throw validationError('requirements', `Falta: ${r.question}`);
                if (total > 0)
                    need(cfg.payment.account && cfg.payment.bank && cfg.payment.beneficiary, 'El profesional debe configurar sus datos para transferencias');
            }
            const [order] = await tx.insert(orders).values({ contractorId: s.contractorId, serviceId: s.id, buyerId: user.id, key: input.key, requestHash: fingerprint, title: s.name, status: proposal ? (proposal.price > 0 ? 'PENDING_PAYMENT' : 'IN_PROGRESS') : 'REQUESTED', proposal, requirements: input.requirements, paymentInstructions: proposal ? cfg.payment : null, acceptedAt: proposal ? new Date() : null, paidAt: proposal?.price === 0 ? new Date() : null, dueAt: proposal?.price === 0 ? nowPlus(proposal.deliveryDays) : null }).returning();
            await tx.insert(messages).values({ orderId: order.id, authorId: user.id, kind: 'BRIEF', body: input.brief });
            await this.event(tx, order, user, 'REQUESTED', { serviceVersion: o.version, offer: o.content, brief: input.brief, requirements: input.requirements, proposal });
            return order;
        });
        return this.order(created.id, user);
    }
    async order(id: string, user: AuthUser) {
        const [o] = await this.db.select().from(orders).where(eq(orders.id, id));
        if (!o)
            throw new NotFoundException('Contratación no encontrada');
        const capabilities = await this.participants(o, user);
        const [c] = await this.db.select({ name: contractors.organizationName }).from(contractors).where(eq(contractors.id, o.contractorId));
        const [buyer] = await this.db.select({ name: users.firstName, email: users.email }).from(users).where(eq(users.id, o.buyerId));
        const conversation = await this.db.select({ id: messages.id, authorId: messages.authorId, author: users.firstName, kind: messages.kind, body: messages.body, fileName: messages.fileName, createdAt: messages.createdAt }).from(messages).innerJoin(users, eq(users.id, messages.authorId)).where(eq(messages.orderId, id)).orderBy(asc(messages.createdAt), asc(messages.id));
        const history = await this.db.select().from(events).where(eq(events.orderId, id)).orderBy(asc(events.createdAt), asc(events.id));
        const [review] = await this.db.select().from(reviews).where(eq(reviews.orderId, id));
        const terms = (history[0]?.snapshot as {
            offer?: OfferInput;
        } | undefined)?.offer;
        const canFinance = capabilities.isBuyer || capabilities.permissions.includes('FINANCE');
        const { requestHash: _hash, key: _key, ...safe } = o;
        return { ...safe, paymentInstructions: canFinance ? o.paymentInstructions : null, paymentReference: canFinance ? o.paymentReference : null, refundReference: canFinance ? o.refundReference : null, contractorName: c?.name, buyer, capabilities: { ...capabilities, canRespondChange: !!o.changeRequest && (o.changeRequest.by === o.buyerId ? !capabilities.isBuyer && capabilities.permissions.includes('PROJECTS') : capabilities.isBuyer) }, requirementQuestions: terms?.requirements ?? [], late: !!o.dueAt && o.dueAt.getTime() < Date.now() && ['IN_PROGRESS', 'REVISION'].includes(o.status), messages: conversation.map(m => ({ ...m, fileUrl: m.fileName ? `/professional-market/orders/${id}/messages/${m.id}/file` : null })), events: history.map(e => ({ id: e.id, action: e.action, createdAt: e.createdAt })), review: review ?? null };
    }
    async listOrders(user: AuthUser, contractorId?: string, page = 1, pageSize = 30) {
        if (contractorId)
            await this.permissions(contractorId, user);
        const condition = contractorId ? eq(orders.contractorId, contractorId) : eq(orders.buyerId, user.id);
        const [items, [count]] = await Promise.all([this.db.select({ id: orders.id, title: orders.title, status: orders.status, version: orders.version, proposal: orders.proposal, dueAt: orders.dueAt, updatedAt: orders.updatedAt, contractorName: contractors.organizationName, buyerName: users.firstName }).from(orders).innerJoin(contractors, eq(contractors.id, orders.contractorId)).innerJoin(users, eq(users.id, orders.buyerId)).where(condition).orderBy(desc(orders.updatedAt), desc(orders.id)).limit(pageSize).offset((page - 1) * pageSize), this.db.select({ total: sql<number> `count(*)::int` }).from(orders).where(condition)]);
        return { items, total: count.total, page, pageSize };
    }
    async action(id: string, b: OrderAction, user: AuthUser, file?: Express.Multer.File) {
        let stored: {
            key: string;
            name: string;
            mime: string;
        } | null = null;
        if (file) {
            const info = this.inspectFile(file);
            stored = { key: `professional-deliveries/${id}/${randomUUID()}.${info.extension}`, name: info.originalName, mime: info.mimeType };
        }
        try {
            if (stored)
                await this.storage.put(stored.key, file!.buffer);
            await this.db.transaction(async (tx) => {
                const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
                if (!o)
                    throw new NotFoundException('Contratación no encontrada');
                const cap = await this.participants(o, user, tx);
                need(o.version === b.version, 'La contratación cambió. Recarga antes de continuar');
                const buyer = () => { if (!cap.isBuyer)
                    throw new ForbiddenException('Esta acción corresponde al cliente'); };
                const seller = (permission = 'PROJECTS') => { if (!cap.isSeller || !cap.permissions.includes(permission))
                    throw new ForbiddenException('Tu rol no permite esta operación'); };
                const state = (...states: string[]) => need(states.includes(o.status), 'Esta acción no corresponde al estado actual');
                const change: Partial<typeof orders.$inferInsert> = { version: o.version + 1, updatedAt: new Date() };
                const note = b.note?.trim() ?? '';
                if (b.action === 'PROPOSE') {
                    seller();
                    state('REQUESTED', 'PROPOSED');
                    need(b.proposal, 'Completa la propuesta');
                    need(Date.parse(b.proposal!.expiresAt) > Date.now(), 'La propuesta debe vencer en el futuro');
                    need(Date.parse(b.proposal!.expiresAt) <= nowPlus(90).getTime(), 'La vigencia máxima es de 90 días');
                    change.proposal = b.proposal!;
                    change.status = 'PROPOSED';
                }
                else if (b.action === 'REQUEST_PROPOSAL_CHANGE') {
                    buyer();
                    state('PROPOSED');
                    required(note, 'note');
                    change.status = 'REQUESTED';
                }
                else if (b.action === 'ACCEPT') {
                    buyer();
                    state('PROPOSED');
                    need(o.proposal, 'No hay propuesta');
                    need(Date.parse(o.proposal!.expiresAt) > Date.now(), 'La propuesta venció');
                    const c = await this.active(o.contractorId, tx);
                    need(c.availability !== 'UNAVAILABLE', 'El profesional no está disponible');
                    const cfg = await this.config(o.contractorId, tx);
                    if (o.proposal!.price > 0)
                        need(cfg.payment.bank && cfg.payment.account && cfg.payment.beneficiary, 'Faltan los datos para transferencias del profesional');
                    change.acceptedAt = new Date();
                    change.paymentInstructions = cfg.payment;
                    change.status = 'AWAITING_REQUIREMENTS';
                }
                else if (b.action === 'REQUIREMENTS') {
                    buyer();
                    state('AWAITING_REQUIREMENTS');
                    const [first] = await tx.select().from(events).where(eq(events.orderId, id)).orderBy(asc(events.createdAt), asc(events.id)).limit(1);
                    const offer = (first?.snapshot as {
                        offer: OfferInput;
                    })?.offer;
                    const responses = { ...o.requirements, ...b.requirements };
                    for (const r of offer?.requirements ?? [])
                        if (r.required && !responses[r.id]?.trim())
                            throw validationError('requirements', `Falta: ${r.question}`);
                    change.requirements = responses;
                    change.status = o.proposal!.price > 0 ? 'PENDING_PAYMENT' : 'IN_PROGRESS';
                    if (o.proposal!.price === 0) {
                        change.paidAt = new Date();
                        change.dueAt = nowPlus(o.proposal!.deliveryDays);
                    }
                }
                else if (b.action === 'PAYMENT_SUBMIT') {
                    buyer();
                    state('PENDING_PAYMENT');
                    change.paymentReference = required(b.reference, 'reference');
                    change.status = 'PAYMENT_REVIEW';
                }
                else if (b.action === 'PAYMENT_CONFIRM') {
                    seller('FINANCE');
                    state('PAYMENT_REVIEW');
                    change.paidAt = new Date();
                    change.status = 'IN_PROGRESS';
                    change.dueAt = nowPlus(o.proposal!.deliveryDays);
                }
                else if (b.action === 'PAYMENT_REJECT') {
                    seller('FINANCE');
                    state('PAYMENT_REVIEW');
                    required(note, 'note');
                    change.status = 'PENDING_PAYMENT';
                }
                else if (b.action === 'DELIVER') {
                    seller();
                    state('IN_PROGRESS', 'REVISION');
                    required(note, 'note');
                    change.status = 'DELIVERED';
                    await tx.insert(messages).values({ orderId: id, authorId: user.id, kind: 'DELIVERY', body: note, fileKey: stored?.key, fileName: stored?.name, fileMime: stored?.mime });
                }
                else if (b.action === 'REVISE') {
                    buyer();
                    state('DELIVERED');
                    need(o.revisionsUsed < (o.proposal?.revisions ?? 0), 'Se agotaron las revisiones incluidas; puedes abrir una incidencia');
                    required(note, 'note');
                    change.revisionsUsed = o.revisionsUsed + 1;
                    change.status = 'REVISION';
                }
                else if (b.action === 'APPROVE') {
                    buyer();
                    state('DELIVERED');
                    const milestones = o.proposal?.milestones ?? [];
                    const done = o.completedMilestones + 1;
                    change.completedMilestones = done;
                    if (milestones.length && done < milestones.length) {
                        change.status = 'IN_PROGRESS';
                    }
                    else {
                        change.status = 'COMPLETED';
                        change.completedAt = new Date();
                    }
                }
                else if (b.action === 'CANCEL') {
                    buyer();
                    state('REQUESTED', 'PROPOSED', 'AWAITING_REQUIREMENTS', 'PENDING_PAYMENT');
                    change.status = 'CANCELLED';
                    change.changeRequest = null;
                }
                else if (b.action === 'REQUEST_CANCEL' || b.action === 'REQUEST_EXTENSION') {
                    if (!cap.isBuyer)
                        seller();
                    need(!terminal.includes(o.status) && !['DISPUTED', 'REFUND_PENDING'].includes(o.status), 'No se puede solicitar un cambio en este estado');
                    need(!o.changeRequest, 'Ya hay una solicitud pendiente');
                    required(note, 'note');
                    if (b.action === 'REQUEST_EXTENSION') {
                        need(o.dueAt, 'El trabajo aún no comenzó');
                        need(b.days, 'Indica los días adicionales');
                    }
                    change.changeRequest = { kind: b.action === 'REQUEST_CANCEL' ? 'CANCEL' : 'EXTEND', reason: note, by: user.id, ...(b.days ? { days: b.days } : {}) };
                }
                else if (b.action === 'ACCEPT_CHANGE' || b.action === 'REJECT_CHANGE') {
                    need(o.changeRequest, 'No hay una solicitud pendiente');
                    need(o.changeRequest!.by !== user.id, 'La otra parte debe responder');
                    if (o.changeRequest!.by === o.buyerId)
                        seller();
                    else
                        buyer();
                    if (b.action === 'ACCEPT_CHANGE') {
                        if (o.changeRequest!.kind === 'CANCEL') {
                            change.status = o.paidAt || o.status === 'PAYMENT_REVIEW' ? 'REFUND_PENDING' : 'CANCELLED';
                        }
                        else {
                            change.dueAt = new Date(o.dueAt!.getTime() + o.changeRequest!.days! * 86400000);
                        }
                    }
                    change.changeRequest = null;
                }
                else if (b.action === 'REFUND_CONFIRM') {
                    seller('FINANCE');
                    state('REFUND_PENDING');
                    change.refundReference = required(b.reference, 'reference');
                    change.status = 'REFUNDED';
                }
                else if (b.action === 'DISPUTE') {
                    if (!cap.isBuyer)
                        seller();
                    need(!['REQUESTED', 'PROPOSED', 'CANCELLED', 'REFUNDED', 'DISPUTED'].includes(o.status), 'No se puede abrir una incidencia en este estado');
                    required(note, 'note');
                    change.dispute = { reason: note, previousStatus: o.status };
                    change.status = 'DISPUTED';
                    change.changeRequest = null;
                }
                else if (b.action === 'RESOLVE') {
                    if (!cap.isAdmin)
                        throw new ForbiddenException('Solo el administrador puede mediar');
                    state('DISPUTED');
                    required(note, 'note');
                    need(b.outcome, 'Selecciona una resolución');
                    if (b.outcome === 'COMPLETE')
                        need(o.paidAt, 'No se puede completar un trabajo sin pago confirmado');
                    change.dispute = { ...o.dispute!, resolution: note, outcome: b.outcome };
                    change.status = b.outcome === 'REFUND' ? 'REFUND_PENDING' : b.outcome === 'COMPLETE' ? 'COMPLETED' : o.dispute!.previousStatus;
                    if (b.outcome === 'COMPLETE')
                        change.completedAt = new Date();
                }
                if (change.status && terminal.includes(change.status))
                    change.changeRequest = null;
                if (note && b.action !== 'DELIVER')
                    await tx.insert(messages).values({ orderId: id, authorId: user.id, kind: b.action, body: note });
                await tx.update(orders).set(change).where(eq(orders.id, id));
                await this.event(tx, o, user, b.action, { ...b, status: change.status ?? o.status });
            });
        }
        catch (e) {
            if (stored)
                await this.storage.delete(stored.key).catch(() => { });
            throw e;
        }
        return this.order(id, user);
    }
    private inspectFile(file: Express.Multer.File) {
        if (file.size > 5 * 1024 * 1024)
            throw new PayloadTooLargeException('Máximo 5 MB por archivo');
        const info = inspectUpload(file.originalname, file.buffer);
        if (!['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv', 'docx', 'xlsx'].includes(info.extension))
            throw validationError('file', 'Adjunta PDF, imagen, texto, Word o Excel');
        return info;
    }
    async message(id: string, body: string, file: Express.Multer.File | undefined, user: AuthUser) {
        need(body.trim() || file, 'Escribe un mensaje o adjunta un archivo');
        const [o] = await this.db.select().from(orders).where(eq(orders.id, id));
        if (!o)
            throw new NotFoundException();
        const cap = await this.participants(o, user);
        if (!cap.isBuyer && !cap.isAdmin && !cap.permissions.some(p => ['PROJECTS', 'FINANCE'].includes(p)))
            throw new ForbiddenException('Tu rol no puede enviar mensajes');
        const info = file ? this.inspectFile(file) : null;
        const key = info ? `professional-messages/${id}/${randomUUID()}.${info.extension}` : null;
        try {
            if (key)
                await this.storage.put(key, file!.buffer);
            await this.db.transaction(async (tx) => { await tx.insert(messages).values({ orderId: id, authorId: user.id, body: body.trim(), fileKey: key, fileName: info?.originalName, fileMime: info?.mimeType }); await this.notify(tx, o, user, 'MESSAGE'); });
        }
        catch (e) {
            if (key)
                await this.storage.delete(key).catch(() => { });
            throw e;
        }
        return this.order(id, user);
    }
    async openFile(id: string, messageId: string, user: AuthUser) {
        const [o] = await this.db.select().from(orders).where(eq(orders.id, id));
        if (!o)
            throw new NotFoundException();
        await this.participants(o, user);
        const [m] = await this.db.select().from(messages).where(and(eq(messages.id, messageId), eq(messages.orderId, id)));
        if (!m?.fileKey)
            throw new NotFoundException();
        return { stream: await this.storage.open(m.fileKey), mime: m.fileMime!, name: m.fileName! };
    }
    async review(id: string, rating: number, comment: string, user: AuthUser) {
        await this.db.transaction(async (tx) => {
            const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
            if (!o || o.buyerId !== user.id)
                throw new NotFoundException();
            need(o.status === 'COMPLETED', 'Solo puedes calificar trabajos completados');
            need(!(await tx.select().from(reviews).where(eq(reviews.orderId, id)))[0], 'Ya calificaste este trabajo');
            await tx.insert(reviews).values({ orderId: id, serviceId: o.serviceId, contractorId: o.contractorId, buyerId: user.id, rating, comment });
            await tx.select().from(contractors).where(eq(contractors.id, o.contractorId)).for('no key update');
            const [aggregate] = await tx.select({ rating: sql<string> `avg(${reviews.rating})::numeric(3,2)` }).from(reviews).where(eq(reviews.contractorId, o.contractorId));
            await tx.update(contractors).set({ rating: aggregate.rating }).where(eq(contractors.id, o.contractorId));
            await this.event(tx, o, user, 'REVIEW', { rating, comment });
        });
        return this.order(id, user);
    }
    async respondReview(contractorId: string, id: string, response: string, user: AuthUser) {
        await this.permit(contractorId, user, 'PROJECTS');
        const [r] = await this.db.update(reviews).set({ response }).where(and(eq(reviews.id, id), eq(reviews.contractorId, contractorId))).returning();
        if (!r)
            throw new NotFoundException();
        return { ok: true };
    }
    async inbox(user: AuthUser) { return this.db.select({ id: notifications.id, orderId: notifications.orderId, title: notifications.title, readAt: notifications.readAt, createdAt: notifications.createdAt }).from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(100); }
    async readNotification(id: string, user: AuthUser) { await this.db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id))); return { ok: true }; }
    async summary(contractorId: string, user: AuthUser) {
        const permissions = await this.permissions(contractorId, user);
        const counts = await this.db.select({ status: orders.status, count: sql<number> `count(*)::int` }).from(orders).where(eq(orders.contractorId, contractorId)).groupBy(orders.status);
        const late = await this.db.select({ count: sql<number> `count(*)::int` }).from(orders).where(and(eq(orders.contractorId, contractorId), inArray(orders.status, ['IN_PROGRESS', 'REVISION']), sql `${orders.dueAt} < now()`));
        const earnings = permissions.includes('REPORTS') ? await this.db.select({ currency: sql<string> `${orders.proposal}->>'currency'`, completed: sql<string> `coalesce(sum((${orders.proposal}->>'price')::numeric) filter(where ${orders.status}='COMPLETED'),0)`, inProgress: sql<string> `coalesce(sum((${orders.proposal}->>'price')::numeric) filter(where ${orders.paidAt} is not null and ${orders.status} not in ('COMPLETED','REFUNDED','CANCELLED')),0)`, refunded: sql<string> `coalesce(sum((${orders.proposal}->>'price')::numeric) filter(where ${orders.status}='REFUNDED'),0)` }).from(orders).where(and(eq(orders.contractorId, contractorId), sql `${orders.proposal} is not null`)).groupBy(sql `${orders.proposal}->>'currency'`) : [];
        const rating = await this.db.select({ rating: sql<number> `avg(${reviews.rating})::float`, count: sql<number> `count(*)::int` }).from(reviews).where(eq(reviews.contractorId, contractorId));
        return { permissions, counts, late: late[0].count, earnings, rating: rating[0], recent: (await this.listOrders(user, contractorId, 1, 6)).items };
    }
    async cases(user: AuthUser) {
        if (!user.isGlobalAdmin)
            throw new ForbiddenException('Acceso de administración requerido');
        return this.db.select({ id: orders.id, title: orders.title, status: orders.status, dispute: orders.dispute, updatedAt: orders.updatedAt, contractorName: contractors.organizationName }).from(orders).innerJoin(contractors, eq(contractors.id, orders.contractorId)).where(sql `${orders.dispute} is not null`).orderBy(desc(orders.updatedAt)).limit(200);
    }
}
