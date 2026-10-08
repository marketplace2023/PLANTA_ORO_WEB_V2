import { ListOrdered, Network } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { PlantNetwork, PlantStage } from '@/features/plant/use-plant-data'
import { cn } from '@/lib/utils'
import { GeoPanel } from './geo-panel'
import { stageNumber } from './stage-number'

const count = (n: number | undefined) => (
  <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-fur-gray-600 tabular-nums" title="Activos">
    {n ?? 0}
  </span>
)

/** Listado de etapas habilitadas de la planta; la elegida manda sobre el mapa, la ficha de etapa y los activos. */
export function StageList({
  stages,
  counts,
  selected,
  loading,
  onSelect,
}: {
  stages: PlantStage[]
  counts: Record<string, number> | undefined
  selected: string | undefined
  loading: boolean
  onSelect: (code: string) => void
}) {
  return (
    <GeoPanel title="Listado de etapas del proceso" icon={ListOrdered} bodyClassName="p-1.5">
      {loading ? (
        <div className="space-y-1.5 p-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      ) : stages.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">Esta planta aún no tiene etapas habilitadas.</p>
      ) : (
        <ul className="max-h-[26rem] space-y-0.5 overflow-y-auto" aria-label="Etapas">
          {stages.map((s) => {
            const active = s.code === selected
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelect(s.code)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    active ? 'bg-fur-navy-900 font-semibold text-white' : 'text-fur-gray-800 hover:bg-muted',
                  )}
                >
                  <span className={cn('fur-code w-6 shrink-0 text-xs', active ? 'text-fur-gold-400' : 'text-fur-gray-500')}>{stageNumber(s.code)}</span>
                  <span className="truncate">{s.displayName}</span>
                  {count(counts?.[s.code])}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </GeoPanel>
  )
}

/** Redes transversales habilitadas; sirven de segundo filtro (se pulsa de nuevo para quitarlo). */
export function NetworkList({
  networks,
  counts,
  selected,
  loading,
  onSelect,
}: {
  networks: PlantNetwork[]
  counts: Record<string, number> | undefined
  selected: string | undefined
  loading: boolean
  onSelect: (code: string | undefined) => void
}) {
  return (
    <GeoPanel title="Redes transversales" icon={Network} bodyClassName="p-1.5">
      {loading ? (
        <div className="space-y-1.5 p-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      ) : networks.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">Esta planta aún no tiene redes habilitadas.</p>
      ) : (
        <ul className="space-y-0.5" aria-label="Redes">
          {networks.map((n) => {
            const active = n.code === selected
            return (
              <li key={n.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(active ? undefined : n.code)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    active ? 'border-fur-navy-900 bg-fur-navy-900/5 font-semibold text-fur-navy-900' : 'border-transparent text-fur-gray-800 hover:bg-muted',
                  )}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: n.colorToken ? `var(--${n.colorToken})` : 'var(--fur-steel-500)' }} aria-hidden />
                  <span className="fur-code shrink-0 text-xs">{n.code}</span>
                  <span className="truncate text-fur-gray-600">{n.name}</span>
                  {active ? <span className="ml-auto shrink-0 rounded-full bg-fur-gold-500 px-2 py-0.5 text-[10px] font-bold text-fur-navy-950 uppercase">Activa</span> : count(counts?.[n.code])}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </GeoPanel>
  )
}
