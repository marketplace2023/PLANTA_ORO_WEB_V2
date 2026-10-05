import { sql } from 'drizzle-orm'
import type { Database } from '../database/database.module'
import { codeSequences } from '../database/schema'

/**
 * Siguiente código legible por planta, tipo y año: OT-2026-00418.
 * Atómico: dos altas simultáneas nunca reciben el mismo número. Úsese dentro de la transacción que crea
 * el registro, para que un fallo posterior revierta también el incremento (sin huecos).
 */
export async function nextCode(db: Pick<Database, 'insert'>, plantId: string, kind: string, prefix: string, now = new Date()) {
  const year = now.getUTCFullYear()
  const [{ n }] = await db
    .insert(codeSequences)
    .values({ plantId, kind, year, lastValue: 1 })
    .onConflictDoUpdate({
      target: [codeSequences.plantId, codeSequences.kind, codeSequences.year],
      set: { lastValue: sql`${codeSequences.lastValue} + 1` },
    })
    .returning({ n: codeSequences.lastValue })
  return `${prefix}-${year}-${String(n).padStart(5, '0')}`
}
