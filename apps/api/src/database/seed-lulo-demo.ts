import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import type { Database } from './database.module'
import * as schema from './schema'
import { uuidv7 } from './schema/common'
import { recoverLegacyMasters, LEGACY_MASTER_FILES, type LegacyFile } from '../modules/budget/legacy-masters'
import { initialCatalogDraft, catalogReferences, referenceKey, type CatalogNode } from '../modules/budget/catalog-review.rules'
import { storeRecoveredMasters } from '../modules/budget/master-recovery-store'
import { luloHash } from '../modules/budget/lulo-hash'
import { LULO_PROFILE } from '../modules/budget/lulo.schemas'

/** Separate fictitious data. This never assigns a currency or a current price to the MDB masters. */
export async function seedLuloDemo(db: Database) {
  const families = ['material', 'equipo', 'manoDeObra'].map((tipo, i) => ({ id: `demo-family-${i}`, codigo: `DEMO-${i}`, descripcion: ['Materiales de demostración', 'Equipos de demostración', 'Mano de obra de demostración'][i], tipo }))
  const resource = (i: number, codigo: string, descripcion: string, precio: string, unidad: string) => [{ id: `demo-resource-${i}`, codigo, descripcion, familiaId: `demo-family-${i}`, unidad, precio }]
  const sources = [families, resource(0, 'DEMO-MAT-001', 'Perfil preparado · ficticio', '40', 'UND'), resource(1, 'DEMO-EQ-001', 'Equipo de montaje · ficticio', '120', 'DIA'), resource(2, 'DEMO-MO-001', 'Montador · ficticio', '60', 'DIA'),
    [{ id: 'demo-item', codigo: 'DEMO-MON-001', descripcion: 'Montaje de soporte · demostración', unidad: 'UND', rendimiento: '10', precioUnitario: '137.94' }],
    [{ id: 'demo-apu', codigo: 'DEMO-MON-001', descripcion: 'Montaje de soporte · demostración', proyectoId: 'DEMO_MASTER', unidad: 'UND', rendimiento: '10', precioUnitario: '137.94', insumos: [
      { insumoId: 'demo-resource-0', codigoInsumo: 'DEMO-MAT-001', tipo: 'material', cantidad: '2', costoUnitario: '40', subtotal: '84' },
      { insumoId: 'demo-resource-1', codigoInsumo: 'DEMO-EQ-001', tipo: 'equipo', cantidad: '1', costoUnitario: '120', subtotal: '12' },
      { insumoId: 'demo-resource-2', codigoInsumo: 'DEMO-MO-001', tipo: 'manoDeObra', cantidad: '2', costoUnitario: '60', subtotal: '18' },
    ] }]]
  const files = Object.fromEntries(LEGACY_MASTER_FILES.map((name, i) => [name, Buffer.from(JSON.stringify(sources[i]))])) as Record<LegacyFile, Buffer>
  const recovered = recoverLegacyMasters(files)
  const { batch } = await storeRecoveredMasters(db, recovered, 'DEMO · Datos ficticios de aceptación FUR; no pertenecen al MDB')
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fur-lulo-demo'))`)
    const [existingRelease] = await tx.select().from(schema.budgetCatalogReleases).where(eq(schema.budgetCatalogReleases.batchId, batch.id))
    if (existingRelease) {
      const [publication] = await tx.select().from(schema.budgetPublications).where(eq(schema.budgetPublications.releaseId, existingRelease.id))
      return publication
    }
    const actor = uuidv7()
    const rows = await tx.select().from(schema.budgetMasterEntries).where(eq(schema.budgetMasterEntries.batchId, batch.id))
    const nodes = rows.map(source => {
      const draft = initialCatalogDraft(source)
      if (source.kind === 'RESOURCE') draft.price = { amount: String(source.data.historicalPrice), currency: 'USD', denomination: 'USD ficticio de demostración', baseDate: '2026-01-01', validUntil: '2099-12-31', costBasis: source.resourceType === 'MATERIAL' ? 'UNIT' : 'DAY', evidence: 'Tarifa ficticia del caso de aceptación, sin validez comercial' }
      if (source.kind === 'APU') { draft.yieldBasis = 'DAY'; draft.hoursPerDay = '8'; draft.methodNote = 'Material por unidad y cuadrilla por jornada; ejemplo ficticio de aceptación'; draft.composition[0].wastePct = '5' }
      return { source, draft, state: 'APPROVED', revision: 1, dependencies: {} } as CatalogNode
    })
    const graph = new Map(nodes.map(n => [referenceKey(n.source), n]))
    for (const n of nodes) {
      n.dependencies = Object.fromEntries(catalogReferences(n).map(r => [graph.get(referenceKey(r))!.source.id, 1]))
      await tx.insert(schema.budgetMasterReviews).values({ entryId: n.source.id, revision: 1, state: 'APPROVED', draft: n.draft, dependencies: n.dependencies, actorId: actor, actorName: 'Demostración FUR' })
    }
    const entries = nodes.map(n => ({ entryId: n.source.id, revision: 1, kind: n.source.kind, resourceType: n.source.resourceType, code: n.source.code, name: n.draft.name, snapshot: { sourceId: n.source.sourceId, sourceContext: n.source.sourceContext, draft: n.draft, dependencies: n.dependencies } }))
    const [release] = await tx.insert(schema.budgetCatalogReleases).values({ batchId: batch.id, version: 1, name: 'DEMOSTRACIÓN · Caso de aceptación FUR', state: 'PUBLISHED', contentHash: luloHash(entries), rootIds: nodes.filter(n => n.source.kind === 'APU').map(n => n.source.id), entryCount: entries.length, createdBy: actor, publishedBy: actor, publishedAt: new Date() }).returning()
    await tx.insert(schema.budgetCatalogReleaseEntries).values(entries.map(e => ({ ...e, releaseId: release.id })))
    const [publication] = await tx.insert(schema.budgetPublications).values({ releaseId: release.id, label: 'Ejemplo FUR · datos ficticios', profile: LULO_PROFILE, demo: true }).returning()
    await tx.insert(schema.auditEvents).values({ module: 'budget-lulo', entityType: 'publication', entityId: publication.id, action: 'DEMO_CREATED', newData: { reason: 'Caso ficticio de aceptación aislado del MDB', actorName: 'Demostración FUR' } })
    return publication
  })
}

if (require.main === module) {
  try { process.loadEnvFile('.env') } catch { /* explicit environment also supported */ }
  const url = process.env.DATABASE_URL
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/fur_dev') throw new Error('El ejemplo se instala únicamente en fur_dev local')
  const pool = new Pool({ connectionString: url })
  seedLuloDemo(drizzle(pool, { schema })).then(p => console.log(JSON.stringify({ publicationId: p?.id, demo: true }))).catch(e => { console.error((e as Error).message); process.exitCode = 1 }).finally(() => pool.end())
}
