import { arrayMove } from '@dnd-kit/sortable'

/**
 * Orden resultante de arrastrar `activeId` a la posición de `overId` entre las tarjetas visibles (`shownCount` primeras
 * de `ids`); las que no se ven conservan su lugar al final. null si no hay cambio.
 */
export function reorderIds(ids: string[], shownCount: number, activeId: string, overId: string): string[] | null {
  const shown = ids.slice(0, shownCount)
  const from = shown.indexOf(activeId)
  const to = shown.indexOf(overId)
  if (from < 0 || to < 0 || from === to) return null
  return [...arrayMove(shown, from, to), ...ids.slice(shownCount)]
}
