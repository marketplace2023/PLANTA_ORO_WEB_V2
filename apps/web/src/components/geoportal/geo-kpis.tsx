import { AlertTriangle, Boxes, CheckCircle2, Cog, Network, Wrench, type LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { AssetsSummary } from '@/features/assets/use-assets'

type Kpi = { label: string; value: number | string; icon: LucideIcon; color?: string }

/** Franja de indicadores de la planta. Los números vienen del resumen del servidor, no de la página visible. */
export function GeoKpis({ summary, stages, networks, loading }: { summary: AssetsSummary | undefined; stages: number; networks: number; loading: boolean }) {
  const by = (record: Record<string, number> | undefined, key: string) => record?.[key] ?? 0
  const kpis: Kpi[] = [
    { label: 'Etapas del proceso', value: stages, icon: Cog },
    { label: 'Activos físicos', value: summary?.total ?? '—', icon: Boxes },
    { label: 'Operativos', value: summary ? by(summary.byStatus, 'OPERATIVE') : '—', icon: CheckCircle2, color: 'var(--fur-green-500)' },
    { label: 'En mantenimiento o reparación', value: summary ? by(summary.byStatus, 'MAINTENANCE') + by(summary.byStatus, 'REPAIR') : '—', icon: Wrench, color: 'var(--fur-orange-500)' },
    { label: 'Criticidad crítica', value: summary ? by(summary.byCriticality, 'CRITICAL') : '—', icon: AlertTriangle, color: 'var(--fur-red-500)' },
    { label: 'Redes transversales', value: networks, icon: Network },
  ]
  return (
    <ul className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Indicadores de la planta">
      {kpis.map((k) => (
        <li key={k.label} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-fur-navy-900 text-fur-gold-400">
            <k.icon className="size-5" style={k.color ? { color: k.color } : undefined} aria-hidden />
          </span>
          <div className="min-w-0">
            {loading ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl leading-none font-bold text-fur-navy-900 tabular-nums">{k.value}</p>}
            <p className="mt-1 text-xs leading-tight text-fur-gray-600">{k.label}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
