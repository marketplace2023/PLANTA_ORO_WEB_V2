import { eq, inArray } from 'drizzle-orm';
import { providerMembers, shopNotifications } from '../../database/schema';
import type { Database } from '../../database/database.module';
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export async function notifyOrder(tx: Tx, order: {
    id: string;
    providerId: string;
    buyerId: string;
}, actorId: string, title: string) { const members = await tx.select({ id: providerMembers.userId }).from(providerMembers).where(eq(providerMembers.providerId, order.providerId)); const ids = [...new Set([order.buyerId, ...members.map(m => m.id)])].filter(id => id !== actorId); if (ids.length)
    await tx.insert(shopNotifications).values(ids.map(userId => ({ userId, orderId: order.id, title }))); }
