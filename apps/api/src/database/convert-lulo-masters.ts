import { eq, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import type { Database } from './database.module'
import * as schema from './schema'

/** Converts the already read original into usable relational masters, preserving every composition row. */
export async function convertLuloMasters(db: Database, batchId: string, original?: Buffer) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lulo-convert:${batchId}`}))`)
    const [batch] = await tx.select().from(schema.budgetMasterBatches).where(eq(schema.budgetMasterBatches.id, batchId))
    if (!batch || !batch.report.files.some(f => f.name.toUpperCase() === 'LULO.MDB')) throw new Error('Seleccione el lote original LULO.MDB')
    const [existing] = await tx.select().from(schema.luloMasterCatalogs).where(eq(schema.luloMasterCatalogs.id, batchId))
    if (existing) return { created: false, catalog: existing }
    if (original && createHash('sha256').update(original).digest('hex') !== batch.report.files[0].sha256) throw new Error('La huella del original no coincide con el lote')
    const nativeResources = new Map<string, Record<string, unknown>>(), nativeItems = new Map<string, Record<string, unknown>>(), nativeComponents = new Map<string, Record<string, unknown>[]>()
    if (original) {
      const MDBReader = (await import('mdb-reader')).default
      const reader = new MDBReader(original)
      for (const [table, type, key] of [['ObraMate', 'MATERIAL', 'CodMat'], ['ObraEqui', 'EQUIPMENT', 'CodEqu'], ['ObraMano', 'LABOR', 'CodMan']]) for (const row of reader.getTable(table).getData()) nativeResources.set(`${type}:${row[key]}`, row)
      for (const row of reader.getTable('ObraPart').getData()) nativeItems.set(String(row.CodPar), row)
      for (const table of ['ObraPainMate', 'ObraPainEqui', 'ObraPainMano']) for (const row of reader.getTable(table).getData()) { const code = String(row.CodPar); const list = nativeComponents.get(code) ?? []; list.push(row); nativeComponents.set(code, list) }
    }
    const entries = await tx.select().from(schema.budgetMasterEntries).where(eq(schema.budgetMasterEntries.batchId, batchId))
    const families = entries.filter(e => e.kind === 'FAMILY')
    const resources = entries.filter(e => e.kind === 'RESOURCE')
    const items = entries.filter(e => e.kind === 'APU' && e.sourceContext === 'MASTER')
    if (items.length !== batch.report.counts.items) throw new Error('No concilian las partidas maestras del MDB')
    const [catalog] = await tx.insert(schema.luloMasterCatalogs).values({ id: batchId, name: 'Maestros LULO · archivo original', sourceHash: batch.report.files[0].sha256, counts: batch.report.counts }).returning()
    const familiesBySource = new Map(families.map(f => [f.sourceId, f]))
    const resourcesBySource = new Map(resources.map(r => [`${r.resourceType}:${r.sourceId}`, r]))
    const number = (v: unknown) => v == null ? null : String(v)
    await tx.insert(schema.luloMasterFamilies).values(families.map(f => ({ id: f.id, catalogId: batchId, code: f.code, name: f.name, resourceType: f.resourceType })))
    for (let offset = 0; offset < resources.length; offset += 200) await tx.insert(schema.luloMasterResources).values(resources.slice(offset, offset + 200).map(r => ({
      id: r.id, catalogId: batchId, familyId: familiesBySource.get(String(r.data.familySourceId))?.id ?? null, code: r.code, name: r.name, resourceType: r.resourceType,
      unit: r.unit, originalUnit: r.unit, historicalPrice: String(r.data.historicalPrice), dailyCost: number(r.data.sourceDailyCost), depreciation: number(r.data.sourceDepreciation),
      wastePct: number(r.data.wastePct), sourceDate: number(r.data.priceDate), currency: null,
      sourceFields: nativeResources.get(`${r.resourceType}:${r.code}`) ?? {},
    })))
    for (let offset = 0; offset < items.length; offset += 200) await tx.insert(schema.luloMasterItems).values(items.slice(offset, offset + 200).map(i => ({ id: i.id, catalogId: batchId, code: i.code, name: i.name, unit: i.unit, yieldValue: String(i.data.yieldValue), originalUnitPrice: String(i.data.historicalUnitPrice), issues: i.issues, standardCode: number(nativeItems.get(i.code)?.CovPar), sourceFields: nativeItems.get(i.code) ?? {} })))
    let componentCount = 0
    const pending: typeof schema.luloMasterComponents.$inferInsert[] = []
    for (const item of items) for (const [position, c] of (item.data.composition as Record<string, unknown>[]).entries()) {
      pending.push({ itemId: item.id, position, resourceId: resourcesBySource.get(`${c.resourceType}:${c.resourceSourceId}`)?.id ?? null, resourceType: String(c.resourceType), originalCode: String(c.code), quantity: String(c.quantity), wastePct: number(c.sourceWastePct), depreciation: number(c.sourceDepreciation), sourceFields: nativeComponents.get(item.code)?.[position] ?? {} })
      componentCount++
      if (pending.length === 500) { await tx.insert(schema.luloMasterComponents).values(pending); pending.length = 0 }
    }
    if (pending.length) await tx.insert(schema.luloMasterComponents).values(pending)
    if (componentCount !== batch.report.compositionLines) throw new Error('No concilian los renglones de composición')
    return { created: true, catalog, componentCount, families: families.length, resources: resources.length, items: items.length }
  })
}

if (require.main === module) {
  try { process.loadEnvFile('.env') } catch { /* explicit environment */ }
  const url = process.env.DATABASE_URL
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/fur_dev') throw new Error('Conversión local: fur_dev')
  const pool = new Pool({ connectionString: url }); const db = drizzle(pool, { schema })
  ;(async () => {
    const batches = await db.select().from(schema.budgetMasterBatches)
    const originals = batches.filter(b => b.report.files.some(f => f.name.toUpperCase() === 'LULO.MDB'))
    if (!originals.length) throw new Error('No se encontró el MDB recuperado')
    const original = readFileSync(path.resolve(__dirname, '../../../../.local/lulo-sources/LULO.MDB'))
    for (const b of originals) console.log(JSON.stringify(await convertLuloMasters(db, b.id, original)))
    // Remove the automatically installed example from the normal catalog selector, keeping its audit/source intact.
    await db.update(schema.budgetPublications).set({ active: false }).where(eq(schema.budgetPublications.demo, true))
  })().catch(e => { console.error((e as Error).message); process.exitCode = 1 }).finally(() => pool.end())
}
