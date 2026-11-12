import { z } from 'zod';
const line = z.string().trim().min(1).max(200);
const text = z.string().trim().max(8000);
const money = z.number().finite().min(0).max(100000000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, 'Máximo dos decimales');
const days = z.number().int().min(1).max(365);
const url = z.union([z.literal(''), z.url().max(1000).refine(v => /^https:\/\//i.test(v), 'Usa un enlace HTTPS')]);
export const packageSchema = z.object({ id: line.max(40), name: line, description: text, price: money, deliveryDays: days, revisions: z.number().int().min(0).max(20), deliverables: z.array(line).min(1).max(30) }).strict();
export const offerSchema = z.object({
    name: line, description: text, specialty: line.max(80), stageCodes: z.array(z.string().regex(/^D\d{2}$/)).max(19).default([]),
    status: z.enum(['DRAFT', 'PUBLISHED', 'PAUSED']), currency: z.string().regex(/^[A-Z]{3}$/), mode: z.enum(['FIXED', 'QUOTE']),
    packages: z.array(packageSchema).min(1).max(3),
    extras: z.array(z.object({ id: line.max(40), name: line, price: money, extraDays: z.number().int().min(0).max(90) }).strict()).max(10).default([]),
    requirements: z.array(z.object({ id: line.max(40), question: line, required: z.boolean() }).strict()).max(20).default([]),
    faq: z.array(z.object({ question: line, answer: text.min(1) }).strict()).max(10).default([]),
    terms: text.default(''), videoUrl: url.default(''),
}).strict().superRefine((o, ctx) => {
    for (const field of ['packages', 'extras', 'requirements'] as const)
        if (new Set(o[field].map(x => x.id)).size !== o[field].length)
            ctx.addIssue({ code: 'custom', path: [field], message: 'Identificadores repetidos' });
    if (o.status === 'PUBLISHED' && o.description.length < 80)
        ctx.addIssue({ code: 'custom', path: ['description'], message: 'Mínimo 80 caracteres para publicar' });
});
export type OfferInput = z.infer<typeof offerSchema>;
export const settingsSchema = z.object({
    displayName: z.string().trim().max(200).default(''), headline: z.string().trim().max(200).default(''), bio: text.default(''),
    languages: z.array(line.max(50)).max(10).default([]), skills: z.array(line.max(80)).max(20).default([]),
    portfolio: z.array(z.object({ title: line, description: text, url }).strict()).max(12).default([]),
    payment: z.object({ bank: z.string().trim().max(160), beneficiary: z.string().trim().max(200), account: z.string().trim().max(160), instructions: text }).strict(),
}).strict();
export type ProfessionalSettings = z.infer<typeof settingsSchema>;
export const EMPTY_SETTINGS: ProfessionalSettings = { displayName: '', headline: '', bio: '', languages: [], skills: [], portfolio: [], payment: { bank: '', beneficiary: '', account: '', instructions: '' } };
export const proposalSchema = z.object({
    name: line, scope: text.min(10), currency: z.string().regex(/^[A-Z]{3}$/), price: money,
    deliveryDays: days, revisions: z.number().int().min(0).max(20), deliverables: z.array(line).min(1).max(30),
    expiresAt: z.iso.datetime(), milestones: z.array(z.object({ name: line, deliverables: z.array(line).min(1).max(20) }).strict()).max(5).default([]),
}).strict();
export type Proposal = z.infer<typeof proposalSchema>;
export const requestSchema = z.object({ key: z.uuid(), serviceId: z.uuid(), mode: z.enum(['FIXED', 'QUOTE']), packageId: line.max(40).optional(), extras: z.array(line.max(40)).max(10).default([]), requirements: z.record(z.string().max(40), text).default({}), brief: text.min(10), expectedVersion: z.number().int().positive(), expectedTotal: money.optional() }).strict();
export type ServiceRequest = z.infer<typeof requestSchema>;
export const orderActionSchema = z.object({
    action: z.enum(['PROPOSE', 'REQUEST_PROPOSAL_CHANGE', 'ACCEPT', 'REQUIREMENTS', 'PAYMENT_SUBMIT', 'PAYMENT_CONFIRM', 'PAYMENT_REJECT', 'DELIVER', 'REVISE', 'APPROVE', 'CANCEL', 'REQUEST_CANCEL', 'REQUEST_EXTENSION', 'ACCEPT_CHANGE', 'REJECT_CHANGE', 'REFUND_CONFIRM', 'DISPUTE', 'RESOLVE']),
    version: z.number().int().positive(), proposal: proposalSchema.optional(), note: text.optional(), reference: z.string().trim().max(200).optional(),
    requirements: z.record(z.string().max(40), text).optional(), days: days.optional(), outcome: z.enum(['RESUME', 'REFUND', 'COMPLETE']).optional(),
}).strict();
export type OrderAction = z.infer<typeof orderActionSchema>;
export const listServicesSchema = z.object({ search: z.string().trim().max(160).optional(), specialty: z.string().max(80).optional(), stage: z.string().regex(/^D\d{2}$/).optional(), location: z.string().max(120).optional(), availability: z.enum(['AVAILABLE', 'LIMITED', 'UNAVAILABLE']).optional(), verified: z.enum(['1', '0']).optional(), minPrice: z.coerce.number().min(0).optional(), maxPrice: z.coerce.number().min(0).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), sort: z.enum(['name', 'price', 'rating']).default('name'), page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(48).default(12) }).strict();
export const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: text.min(10) }).strict();
export const staffSchema = z.object({ role: z.enum(['FULL', 'CATALOG', 'PROJECTS', 'FINANCE', 'VIEWER']) }).strict();
export const PROFESSIONAL_ROLES: Record<string, readonly string[]> = { FULL: ['CATALOG', 'PROJECTS', 'FINANCE', 'REPORTS'], CATALOG: ['CATALOG'], PROJECTS: ['PROJECTS'], FINANCE: ['FINANCE', 'REPORTS'], VIEWER: [] };
