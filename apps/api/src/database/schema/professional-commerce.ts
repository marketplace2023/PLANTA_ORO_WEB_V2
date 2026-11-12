import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, updatedAt } from './common';
import { users } from './iam';
import { contractors, professionalSchema, services } from './professional';
import type { OfferInput, ProfessionalSettings, Proposal } from '../../modules/organizations/professional.schemas';
export const professionalOffers = professionalSchema.table('offers', {
    serviceId: uuid('service_id').primaryKey().references(() => services.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('DRAFT'),
    content: jsonb('content').$type<OfferInput>().notNull(),
    version: integer('version').notNull().default(1), updatedAt: updatedAt(),
}, t => [check('professional_offer_status', sql `${t.status} in ('DRAFT','PUBLISHED','PAUSED')`)]);
export const professionalSettings = professionalSchema.table('settings', {
    contractorId: uuid('contractor_id').primaryKey().references(() => contractors.id, { onDelete: 'cascade' }),
    content: jsonb('content').$type<ProfessionalSettings>().notNull(), updatedAt: updatedAt(),
});
export const professionalMedia = professionalSchema.table('media', {
    id: pk(), contractorId: uuid('contractor_id').notNull().references(() => contractors.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), storageKey: text('storage_key').notNull(), mime: text('mime').notNull(), name: text('name').notNull(), createdAt: createdAt(),
});
export const professionalOrders = professionalSchema.table('orders', {
    id: pk(), contractorId: uuid('contractor_id').notNull().references(() => contractors.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
    buyerId: uuid('buyer_id').notNull().references(() => users.id), key: uuid('key').notNull(), requestHash: text('request_hash').notNull(),
    title: text('title').notNull(), status: text('status').notNull(), version: integer('version').notNull().default(1),
    requirements: jsonb('requirements').$type<Record<string, string>>().notNull().default({}),
    proposal: jsonb('proposal').$type<Proposal>(), paymentInstructions: jsonb('payment_instructions').$type<ProfessionalSettings['payment']>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }), paidAt: timestamp('paid_at', { withTimezone: true }),
    paymentReference: text('payment_reference'), refundReference: text('refund_reference'),
    dueAt: timestamp('due_at', { withTimezone: true }), revisionsUsed: integer('revisions_used').notNull().default(0),
    completedMilestones: integer('completed_milestones').notNull().default(0),
    changeRequest: jsonb('change_request').$type<{
        kind: 'CANCEL' | 'EXTEND';
        reason: string;
        days?: number;
        by: string;
    }>(),
    dispute: jsonb('dispute').$type<{
        reason: string;
        previousStatus: string;
        resolution?: string;
        outcome?: string;
    }>(),
    completedAt: timestamp('completed_at', { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [unique('professional_order_buyer_key').on(t.buyerId, t.key), index('professional_orders_contractor').on(t.contractorId, t.status), index('professional_orders_buyer').on(t.buyerId), check('professional_order_counters', sql `${t.version} > 0 and ${t.revisionsUsed} >= 0 and ${t.completedMilestones} >= 0`)]);
export const professionalMessages = professionalSchema.table('messages', {
    id: pk(), orderId: uuid('order_id').notNull().references(() => professionalOrders.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => users.id), kind: text('kind').notNull().default('MESSAGE'), body: text('body').notNull(),
    fileKey: text('file_key'), fileName: text('file_name'), fileMime: text('file_mime'), createdAt: createdAt(),
}, t => [index('professional_messages_order').on(t.orderId, t.createdAt)]);
export const professionalEvents = professionalSchema.table('events', {
    id: pk(), orderId: uuid('order_id').notNull().references(() => professionalOrders.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').notNull().references(() => users.id), action: text('action').notNull(),
    snapshot: jsonb('snapshot').notNull(), createdAt: createdAt(),
});
export const professionalReviews = professionalSchema.table('reviews', {
    id: pk(), orderId: uuid('order_id').notNull().unique().references(() => professionalOrders.id, { onDelete: 'cascade' }),
    contractorId: uuid('contractor_id').notNull().references(() => contractors.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
    buyerId: uuid('buyer_id').notNull().references(() => users.id), rating: integer('rating').notNull(), comment: text('comment').notNull(),
    response: text('response'), createdAt: createdAt(),
}, t => [check('professional_review_rating', sql `${t.rating} between 1 and 5`)]);
export const professionalNotifications = professionalSchema.table('notifications', {
    id: pk(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').notNull().references(() => professionalOrders.id, { onDelete: 'cascade' }), title: text('title').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }), createdAt: createdAt(),
}, t => [index('professional_notifications_user').on(t.userId, t.createdAt)]);
export const professionalStaff = professionalSchema.table('staff', {
    contractorId: uuid('contractor_id').notNull().references(() => contractors.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), role: text('role').notNull(),
}, t => [primaryKey({ columns: [t.contractorId, t.userId] })]);
