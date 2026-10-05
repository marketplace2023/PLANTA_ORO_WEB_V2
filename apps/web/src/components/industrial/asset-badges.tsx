import { Badge } from '@/components/ui/badge'
import { CRITICALITY_META, STATUS_META, type AssetCriticality, type AssetStatus } from '@/lib/assets'

/** Estado del activo con icono + texto + color (el color nunca es el único canal, design.md §16). */
export function AssetStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as AssetStatus]
  if (!meta) return <Badge variant="outline">{status}</Badge>
  const Icon = meta.icon
  return (
    <Badge variant="outline" className="gap-1.5 bg-card font-medium text-foreground">
      <Icon className="size-3.5" style={{ color: meta.color }} aria-hidden />
      {meta.label}
    </Badge>
  )
}

export function CriticalityBadge({ criticality }: { criticality: string }) {
  const meta = CRITICALITY_META[criticality as AssetCriticality]
  if (!meta) return <Badge variant="outline">{criticality}</Badge>
  return (
    <Badge variant="outline" className="gap-1.5 bg-card font-medium text-foreground">
      <span className="size-2 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
      {meta.label}
    </Badge>
  )
}
