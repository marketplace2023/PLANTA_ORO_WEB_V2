import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../../database/database.module'
import { assets, assetTagSequences, plantNetworks, plantStages } from '../../database/schema'
import { escapeLike } from '../../common/pagination'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

type TagScope = {
  plantId: string; plantStageId: string; plantNetworkId: string; familyId: string
  networkCode: string; stageCode: string; familyTagCode: string
}

async function readTagScope(db: Pick<Database, 'select'>, input: TagScope) {
  const prefix = `${input.networkCode}-${input.stageCode}-${input.familyTagCode}-`
  const [stage] = await db.select({ id: plantStages.stageMasterId }).from(plantStages).where(eq(plantStages.id, input.plantStageId))
  const [network] = await db.select({ id: plantNetworks.networkMasterId }).from(plantNetworks).where(eq(plantNetworks.id, input.plantNetworkId))
  // Respeta TAG existentes de este formato incluso si se restauraron datos sin sus contadores.
  const [{ max }] = await db.select({ max: sql<string>`coalesce(max(case
    when substring(${assets.tag} from ${prefix.length + 1}) ~ '^[0-9]+$'
    then substring(${assets.tag} from ${prefix.length + 1})::bigint end), 0)` })
    .from(assets).where(sql`${assets.plantId} = ${input.plantId} and ${assets.tag} like ${escapeLike(prefix) + '%'}`)
  return { prefix, stageId: stage.id, networkId: network.id, max: Number(max) }
}

/** Consulta orientativa: no reserva números ni modifica contadores. */
export async function previewAssetTag(db: Pick<Database, 'select'>, input: TagScope) {
  const { prefix, stageId, networkId, max } = await readTagScope(db, input)
  const [counter] = await db.select({ value: assetTagSequences.lastValue }).from(assetTagSequences).where(and(
    eq(assetTagSequences.plantId, input.plantId), eq(assetTagSequences.stageMasterId, stageId),
    eq(assetTagSequences.networkMasterId, networkId), eq(assetTagSequences.familyId, input.familyId),
  ))
  return prefix + String(Math.max(max, counter?.value ?? 0) + 1).padStart(3, '0')
}

/** Se llama dentro del alta, después de bloquear el contador FUR de la planta. No reinicia cada año. */
export async function nextAssetTag(tx: Tx, input: TagScope) {
  const { prefix, stageId, networkId, max } = await readTagScope(tx, input)
  const [counter] = await tx.insert(assetTagSequences).values({
    plantId: input.plantId, stageMasterId: stageId, networkMasterId: networkId,
    familyId: input.familyId, lastValue: max + 1,
  }).onConflictDoUpdate({
    target: [assetTagSequences.plantId, assetTagSequences.networkMasterId, assetTagSequences.stageMasterId, assetTagSequences.familyId],
    set: { lastValue: sql`greatest(${assetTagSequences.lastValue}, ${max}) + 1` },
  }).returning({ value: assetTagSequences.lastValue })
  return prefix + String(counter.value).padStart(3, '0')
}
