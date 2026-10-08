import { z } from 'zod'

/** Posición sobre la imagen del mapa de la planta, en porcentaje del ancho (x) y del alto (y): 0–100. */
export const mapPositionSchema = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
export type MapPosition = z.infer<typeof mapPositionSchema>

const round = (n: number) => Math.round(n * 100) / 100

/** Lee `map` de un objeto jsonb (`metadata` del activo, `configuration` de la etapa); null si no hay una posición válida. */
export function readMapPosition(json: unknown): MapPosition | null {
  const parsed = mapPositionSchema.safeParse((json as { map?: unknown } | null | undefined)?.map)
  return parsed.success ? { x: round(parsed.data.x), y: round(parsed.data.y) } : null
}

/**
 * Devuelve el jsonb con la posición cambiada (`null` la quita). `undefined` lo deja igual. El resto de las claves
 * (otros metadatos o configuración) no se tocan.
 */
export function withMapPosition(json: unknown, position: MapPosition | null | undefined): Record<string, unknown> {
  const base = { ...((json as Record<string, unknown> | null | undefined) ?? {}) }
  if (position === undefined) return base
  if (position === null) {
    delete base.map
    return base
  }
  return { ...base, map: { x: round(position.x), y: round(position.y) } }
}
