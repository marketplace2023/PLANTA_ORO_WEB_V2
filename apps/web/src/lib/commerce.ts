export type SalesRules={minQuantity?:number;tiers?:Array<{quantity:number;price:number}>;promotion?:{percent:number;startsAt:string;endsAt:string}|null}
export type ShippingZone={id:string;name:string;country:string;cities:string[];fee:number;days:number;carrier:string}
export function effectivePrice(variant:{price:number;salesRules?:SalesRules},quantity:number,now=new Date()):number {
 let price=BigInt(Math.round(variant.price*100));for(const tier of [...(variant.salesRules?.tiers??[])].sort((a,b)=>a.quantity-b.quantity))if(quantity>=tier.quantity)price=BigInt(Math.round(tier.price*100));const p=variant.salesRules?.promotion;if(p&&now>=new Date(p.startsAt)&&now<=new Date(p.endsAt))price=(price*BigInt(100-p.percent)+50n)/100n;return Number(price)/100
}
export type Spec = {
    label: string;
    unit: string;
    type: 'NUMBER' | 'RANGE' | 'TEXT' | 'LIST' | 'BOOLEAN';
    value: string | number | boolean | string[] | {
        min: number;
        max: number;
    };
};
export type Commercial = {
    brand: string;
    model: string;
    condition: string;
    warranty: string;
    leadDays: number;
    saleMode: 'DIRECT' | 'QUOTE';
    specifications: Spec[];
};
export type Variant = {
    salesRules?:SalesRules;
    id?: string;
    sku: string;
    name: string;
    price: number;
    stock: number;
    reserved?: number;
    available?: number;
    active: boolean;
    attributes: Record<string, string>;
};
export type Product = {
    id: string;
    title: string;
    description: string | null;
    currency: string;
    price: number | null;
    status: string;
    imageUrl: string | null;
    family: {
        code: string;
        name: string;
    };
    provider: {
        id: string;
        name: string;
    };
    stages: Array<{
        code: string;
        name: string;
    }>;
    terms?: {
        shippingZones?:ShippingZone[];
        currency: string;
        shippingFee: number;
        coverage: string;
    } | null;
    rating?: number | null;
    ratingCount?: number;
    reviews?: Array<{
        id: string;
        rating: number;
        comment: string;
        buyer: string;
        createdAt: string;
    }>;
    movements?: Array<{
        id: string;
        variantId: string;
        stockDelta: number;
        reservedDelta: number;
        reason: string;
        createdAt: string;
    }>;
    commercial: Partial<Commercial>;
    variants: Variant[];
    gallery: Array<{
        id: string;
        url: string;
    }>;
};
export type Order = {
    capabilities?:string[];
    quoteRevision?:number;
    id: string;
    buyerId: string;
    providerId: string;
    status: string;
    currency: string;
    total: number;
    shippingFee: number;
    address: Record<string, string>;
    paymentInstructions: {
        bank: string;
        beneficiary: string;
        account: string;
        instructions: string;
        coverage: string;
    };
    paymentReference: string | null;
    tracking: string | null;
    note: string | null;
    hasReceipt: boolean;
    canManage: boolean;
    createdAt: string;
    lines: Array<{
        id: string;
        listingId: string;
        title: string;
        sku: string;
        variantName: string;
        quantity: number;
        unitPrice: number;
    }>;
    events: Array<{
        id: string;
        status: string;
        note: string | null;
        createdAt: string;
    }>;
};
export const ORDER_LABELS: Record<string, string> = { QUOTE_REQUESTED: 'Cotización solicitada', QUOTED: 'Cotización recibida', PENDING_PAYMENT: 'Pendiente de transferencia', PAYMENT_REVIEW: 'Transferencia en revisión', PAID: 'Pago confirmado', PREPARING: 'En preparación', SHIPPED: 'Enviado', DELIVERED: 'Entregado', CANCELLED: 'Cancelado', RETURN_REQUESTED: 'Devolución solicitada', RETURN_APPROVED: 'Devolución aprobada', REFUNDED: 'Reembolso confirmado', ACCEPT_QUOTE: 'Aceptar cotización' };
export const commerceImage = (url: string | null | undefined, apiUrl: (p: string) => string) => url ? /^https?:\/\//i.test(url) ? url : apiUrl(url) : undefined;

ORDER_LABELS.REQUEST_REVISION='Solicitar nueva propuesta';
