import { sql } from 'drizzle-orm'
import { assetModels } from '../../database/schema'
import { normalized } from './catalog-import.xlsx'

/** La ficha es la única fuente de fabricantes del modelo; nunca el antiguo maestro de marcas. */
export function referenceIdentity(data: unknown): string {
  const refs = data && typeof data === 'object' ? (data as Record<string, unknown>).fabricantesReferencia : undefined
  return JSON.stringify([...new Set(Array.isArray(refs) ? refs.flatMap((ref: unknown) => {
    if (!ref || typeof ref !== 'object' || typeof (ref as Record<string, unknown>).nombre !== 'string') return []
    const name = normalized((ref as { nombre: string }).nombre)
    return name ? [name] : []
  }) : [])].sort())
}

export const referenceNames = sql<string | null>`catalog.reference_manufacturer_names(${assetModels.technicalData})`
export const referenceMatches = (id: string) => sql`exists (
  select 1 from catalog.model_reference_manufacturers refs
  where refs.asset_model_id = ${assetModels.id} and refs.id = ${id}::uuid
)`
export const referenceSearch = (like: string) => sql`exists (
  select 1 from catalog.model_reference_manufacturers refs
  where refs.asset_model_id = ${assetModels.id} and refs.name ilike ${like}
)`
