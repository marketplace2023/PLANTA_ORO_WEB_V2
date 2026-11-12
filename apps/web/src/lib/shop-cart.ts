export type CartLine = {
    productId: string;
    variantId: string;
    quantity: number;
};
const key = (userId: string) => `fur-marketplace-cart:${userId}`;
export function readCart(userId: string): CartLine[] { try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(userId)) ?? '[]');
    if (!Array.isArray(raw))
        return [];
    return raw.filter((v): v is CartLine => !!v && typeof v === 'object' && typeof v.productId === 'string' && typeof v.variantId === 'string' && Number.isInteger(v.quantity) && v.quantity > 0 && v.quantity <= 9999).slice(0, 100);
}
catch {
    return [];
} }
export function writeCart(userId: string, lines: CartLine[]) { localStorage.setItem(key(userId), JSON.stringify(lines)); window.dispatchEvent(new Event('fur-cart-changed')); }
