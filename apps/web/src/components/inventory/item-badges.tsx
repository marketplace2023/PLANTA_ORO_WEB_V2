import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { itemTypeLabel, movementLabel, type MovementType } from '@/lib/inventory'

const MOVEMENT_ICONS: Record<MovementType, typeof ArrowDownToLine> = {
  RECEIPT: ArrowDownToLine,
  ISSUE: ArrowUpFromLine,
  TRANSFER: ArrowLeftRight,
  ADJUSTMENT: SlidersHorizontal,
}

/** Tipo de movimiento con icono + texto (el color nunca es el único canal). */
export function MovementBadge({ type }: { type: MovementType }) {
  const Icon = MOVEMENT_ICONS[type] ?? SlidersHorizontal
  return (
    <Badge variant="outline" className="gap-1.5 bg-card font-medium text-foreground">
      <Icon className="size-3.5" aria-hidden />
      {movementLabel(type)}
    </Badge>
  )
}

export function ItemTypeBadge({ type }: { type: string }) {
  return <Badge variant="secondary">{itemTypeLabel(type)}</Badge>
}

/** Señales de atención de un ítem: bajo mínimo y crítico. */
export function StockFlags({ belowMin, isCritical }: { belowMin: boolean; isCritical: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {belowMin && (
        <Badge variant="outline" className="gap-1 border-fur-red-500 text-fur-red-500">
          <AlertTriangle aria-hidden /> Bajo mínimo
        </Badge>
      )}
      {isCritical && (
        <Badge variant="outline" className="border-fur-orange-500 text-fur-orange-500">
          Crítico
        </Badge>
      )}
    </span>
  )
}
