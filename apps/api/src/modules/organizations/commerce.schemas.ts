import { salesRulesSchema, shippingZoneSchema } from './commerce-rules'
import { z } from 'zod';
const text = (max: number) => z.string().trim().min(1).max(max);
export const money = z.number().finite().min(0).max(1e12).refine(v => /^\d+(?:\.\d{1,2})?$/.test(String(v)), 'Usa hasta dos decimales');
const specBase = { label: text(160), unit: z.string().trim().max(30).default('') };
export const specification = z.discriminatedUnion('type', [
    z.object({ ...specBase, type: z.literal('NUMBER'), value: z.number().finite() }),
    z.object({ ...specBase, type: z.literal('RANGE'), value: z.object({ min: z.number().finite(), max: z.number().finite() }).refine(v => v.min <= v.max, 'Rango invalido') }),
    z.object({ ...specBase, type: z.literal('TEXT'), value: text(1000) }),
    z.object({ ...specBase, type: z.literal('LIST'), value: z.array(text(160)).min(1).max(30) }),
    z.object({ ...specBase, type: z.literal('BOOLEAN'), value: z.boolean() }),
]);
export const commercialSchema = z.object({ brand: z.string().trim().max(160).default(''), model: z.string().trim().max(160).default(''), condition: z.enum(['NEW', 'USED', 'REFURBISHED']).default('NEW'), warranty: z.string().trim().max(1000).default(''), leadDays: z.number().int().min(0).max(3650).default(0), saleMode: z.enum(['DIRECT', 'QUOTE']).default('QUOTE'), specifications: z.array(specification).max(80).default([]) });
export const variantSchema = z.object({ id: z.uuid().optional(), sku: text(80), salesRules:salesRulesSchema.default({minQuantity:1,tiers:[],promotion:null}), name: text(160), price: money, stock: z.number().int().min(0).max(999999), active: z.boolean().default(true), attributes: z.record(text(60), text(160)).refine(v => Object.keys(v).length <= 15).default({}) });
export const variantsSchema = z.object({ variants: z.array(variantSchema).min(1).max(100) }).refine(v => new Set(v.variants.map(x => x.sku)).size === v.variants.length, 'SKU repetido');
export const settingsSchema = z.object({ bank: text(200), beneficiary: text(200), account: text(160), instructions: z.string().trim().max(2000).default(''), currency: z.string().regex(/^[A-Z]{3}$/), shippingZones:z.array(shippingZoneSchema).max(50).default([]),shippingFee: money, coverage: text(2000) }).refine(v=>new Set(v.shippingZones.map(z=>z.id)).size===v.shippingZones.length,'Identificadores de zona repetidos');
export const checkoutSchema = z.object({ key: z.uuid(), providerId: z.uuid(), mode: z.enum(['DIRECT', 'QUOTE']), shippingZoneId:z.string().max(80).optional(),expectedTotal: money.optional(), lines: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(9999) })).min(1).max(100), address: z.object({ name: text(160), phone: text(80), country: text(80), city: text(120), address: text(1000) }), note: z.string().trim().max(2000).optional() }).refine(v => new Set(v.lines.map(x => x.variantId)).size === v.lines.length, 'Variantes repetidas');
export const orderActionSchema = z.object({ status: z.enum(['PENDING_PAYMENT', 'PAYMENT_REVIEW', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'QUOTED', 'ACCEPT_QUOTE', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'REFUNDED', 'REQUEST_REVISION']), expectedRevision:z.number().int().min(0).optional(),reference: z.string().trim().max(200).optional(), tracking: z.string().trim().max(1000).optional(), note: z.string().trim().max(2000).optional(), prices: z.array(z.object({ lineId: z.uuid(), price: money })).max(100).optional() });
