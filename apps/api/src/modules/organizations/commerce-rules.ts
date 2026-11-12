import { z } from 'zod';
export const priceCents = (value: number | string): bigint => { const [whole, fraction = ''] = String(value).split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')); };
export function effectiveUnitPrice(variant: {
    price: string | number;
    salesRules?: {
        minQuantity?: number;
        tiers?: Array<{
            quantity: number;
            price: number;
        }>;
        promotion?: {
            percent: number;
            startsAt: string;
            endsAt: string;
        } | null;
    };
}, quantity: number, now = new Date()): string {
    let price = priceCents(variant.price);
    for (const tier of [...(variant.salesRules?.tiers ?? [])].sort((a, b) => a.quantity - b.quantity))
        if (quantity >= tier.quantity)
            price = priceCents(tier.price);
    const promotion = variant.salesRules?.promotion;
    if (promotion && now >= new Date(promotion.startsAt) && now <= new Date(promotion.endsAt))
        price = (price * BigInt(100 - promotion.percent) + 50n) / 100n;
    return `${price / 100n}.${String(price % 100n).padStart(2, '0')}`;
}
const money = z.number().finite().min(0).max(1e12).refine(v => /^\d+(?:\.\d{1,2})?$/.test(String(v)));
export const salesRulesSchema = z.object({ minQuantity: z.number().int().min(1).max(9999).default(1), tiers: z.array(z.object({ quantity: z.number().int().min(1).max(9999), price: money })).max(20).default([]), promotion: z.object({ percent: z.number().int().min(1).max(90), startsAt: z.iso.datetime(), endsAt: z.iso.datetime() }).refine(v => new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime(), 'La fecha final debe ser posterior').nullable().default(null) }).refine(v => new Set(v.tiers.map(t => t.quantity)).size === v.tiers.length, 'Cantidades repetidas');
export const shippingZoneSchema = z.object({ id: z.string().min(1).max(80), name: z.string().trim().min(1).max(160), country: z.string().trim().min(1).max(80), cities: z.array(z.string().trim().min(1).max(120)).max(100).default([]), fee: money, days: z.number().int().min(0).max(365), carrier: z.string().trim().max(160).default('') });
export function shippingFor(zones: z.infer<typeof shippingZoneSchema>[], address: {
    country: string;
    city: string;
}, zoneId?: string) {
    if (!zones.length)
        return null;
    const zone = zones.find(z => z.id === zoneId), normalize = (s: string) => s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!zone || normalize(zone.country) !== normalize(address.country) || (zone.cities.length && !zone.cities.some(c => normalize(c) === normalize(address.city))))
        return undefined;
    return zone;
}
export const STAFF_ROLES = { CATALOG: ['PRODUCTS'], SALES: ['ORDERS', 'SUPPORT', 'REPORTS'], FINANCE: ['FINANCE', 'REPORTS'], SUPPORT: ['SUPPORT'], VIEWER: [] } as const;
