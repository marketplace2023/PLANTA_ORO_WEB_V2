import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { DB, type Database } from '../../database/database.module'
import { apuResources, apus, exchangeRates, plantSettings, resources } from '../../database/schema'
import { type Breakdown, type PricedApu, priceApu, type ResourceType, round4 } from './budget-engine'

type Db = Pick<Database, 'select'>

export type ApuPricing =
  | { ok: true; priced: PricedApu; lines: Array<{ resourceId: string; subtotal: number; unitPriceBase: number }> }
  | { ok: false; missingRates: string[] }

/** Moneda base, tipos de cambio y precio de APUs: lo comparten recursos, APU, presupuestos y valorizaciones. */
@Injectable()
export class PricingService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async baseCurrency(plantId: string, db: Db = this.db): Promise<string> {
    const [s] = await db.select({ c: plantSettings.currencyCode }).from(plantSettings).where(eq(plantSettings.plantId, plantId))
    return s?.c ?? 'USD'
  }

  /** 1 unidad de cada moneda en moneda base. La base siempre vale 1. */
  async rates(plantId: string, db: Db = this.db): Promise<Map<string, number>> {
    const rows = await db.select().from(exchangeRates).where(eq(exchangeRates.plantId, plantId))
    const map = new Map(rows.map((r) => [r.currency, Number(r.rate)]))
    map.set(await this.baseCurrency(plantId, db), 1)
    return map
  }

  /** Precia varios APU con los precios y tipos de cambio VIGENTES. Un APU con un recurso en moneda sin tipo de cambio queda sin precio. */
  async priceApus(plantId: string, apuIds: string[], db: Db = this.db): Promise<Map<string, ApuPricing>> {
    const out = new Map<string, ApuPricing>()
    if (apuIds.length === 0) return out
    const [headers, lines, rates] = await Promise.all([
      db.select().from(apus).where(and(eq(apus.plantId, plantId), inArray(apus.id, apuIds))),
      db
        .select({
          apuId: apuResources.apuId,
          resourceId: apuResources.resourceId,
          quantity: apuResources.quantity,
          wastePct: apuResources.wastePct,
          type: resources.resourceType,
          price: resources.unitPrice,
          currency: resources.currency,
        })
        .from(apuResources)
        .innerJoin(resources, eq(resources.id, apuResources.resourceId))
        .where(inArray(apuResources.apuId, apuIds))
        .orderBy(asc(apuResources.position), asc(apuResources.id)),
      this.rates(plantId, db),
    ])

    for (const h of headers) {
      const mine = lines.filter((l) => l.apuId === h.id)
      const missing = [...new Set(mine.filter((l) => !rates.has(l.currency)).map((l) => l.currency))]
      if (missing.length > 0) {
        out.set(h.id, { ok: false, missingRates: missing })
        continue
      }
      const converted = mine.map((l) => ({ resourceId: l.resourceId, type: l.type as ResourceType, quantity: Number(l.quantity), wastePct: Number(l.wastePct), unitPrice: round4(Number(l.price) * rates.get(l.currency)!) }))
      const priced = priceApu(converted, Number(h.yieldValue), Number(h.hoursPerDay))
      out.set(h.id, { ok: true, priced, lines: converted.map((c, i) => ({ resourceId: c.resourceId, subtotal: priced.lines[i], unitPriceBase: c.unitPrice })) })
    }
    return out
  }

  /** Exige precio para todos; si falta algún tipo de cambio dice cuál. */
  requirePriced(pricing: ApuPricing, label: string): { direct: number; breakdown: Breakdown } {
    if (!pricing.ok) throw new ConflictException(`${label}: falta el tipo de cambio de ${pricing.missingRates.join(', ')}`)
    return { direct: pricing.priced.direct, breakdown: pricing.priced.breakdown }
  }
}
