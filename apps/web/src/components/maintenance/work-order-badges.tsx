import { Badge } from '@/components/ui/badge'
import { PRIORITY_META, STATUS_META, type WorkOrderPriority, type WorkOrderStatus } from '@/lib/maintenance'

/** Estado de la OT con icono + texto + color (el color nunca es el único canal, design.md §1.7). */
export function WorkOrderStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as WorkOrderStatus]
  if (!meta) return <Badge variant="outline">{status}</Badge>
  const Icon = meta.icon
  return (
    <Badge variant="outline" className="gap-1.5 bg-card font-medium text-foreground">
      <Icon className="size-3.5" style={{ color: meta.color }} aria-hidden />
      {meta.label}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  const meta = PRIORITY_META[priority as WorkOrderPriority]
  if (!meta) return <Badge variant="outline">{priority}</Badge>
  const Icon = meta.icon
  return (
    <Badge variant="outline" className="gap-1.5 bg-card font-medium text-foreground">
      <Icon className="size-3.5" style={{ color: meta.color }} aria-hidden />
      {meta.label}
    </Badge>
  )
}
