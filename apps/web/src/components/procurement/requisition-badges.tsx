import { Badge } from '@/components/ui/badge'
import { REQUISITION_STATUS_META, type RequisitionStatus } from '@/lib/procurement'

/** Estado de la requisición con icono + texto (el color nunca es el único canal, design.md §1.7). */
export function RequisitionStatusBadge({ status }: { status: string }) {
  const meta = REQUISITION_STATUS_META[status as RequisitionStatus]
  if (!meta) return <Badge variant="outline">{status}</Badge>
  const Icon = meta.icon
  return (
    <Badge variant="outline" className="gap-1.5 bg-card font-medium text-foreground">
      <Icon className="size-3.5" style={{ color: meta.color }} aria-hidden />
      {meta.label}
    </Badge>
  )
}
