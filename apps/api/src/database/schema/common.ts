import { randomBytes } from 'node:crypto'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

/** UUID v7 (RFC 9562): prefijo temporal en ms + aleatorio. Recomendado en arquitectura §46. */
export function uuidv7(): string {
  const bytes = randomBytes(16)
  const ts = BigInt(Date.now())
  bytes[0] = Number((ts >> 40n) & 0xffn)
  bytes[1] = Number((ts >> 32n) & 0xffn)
  bytes[2] = Number((ts >> 24n) & 0xffn)
  bytes[3] = Number((ts >> 16n) & 0xffn)
  bytes[4] = Number((ts >> 8n) & 0xffn)
  bytes[5] = Number(ts & 0xffn)
  bytes[6] = (bytes[6] & 0x0f) | 0x70 // versión 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variante RFC 4122
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const pk = () => uuid('id').primaryKey().$defaultFn(uuidv7)

// Fechas siempre en UTC (arquitectura §46).
export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
