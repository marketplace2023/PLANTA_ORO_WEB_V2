import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, CheckCircle2, Cog, GripVertical, Package, Wrench } from 'lucide-react'
import type { KeyboardEventHandler, PointerEventHandler } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { AssetItem } from '@/features/assets/use-assets'
import type { PlantStage } from '@/features/plant/use-plant-data'
import { apiUrl } from '@/lib/api'
import { STATUS_META, type AssetStatus } from '@/lib/assets'
import { stageGroupLabel } from '@/lib/stage-groups'
import { cn } from '@/lib/utils'
import { GeoPanel } from './geo-panel'
import { reorderIds } from './reorder-ids'
import { stageNumber } from './stage-number'

/** Activos que se muestran de entrada; el resto se abre con «Ver los N activos». */
export const VISIBLE_ASSETS = 8

function Stat({ icon: Icon, value, label, color }: { icon: typeof Cog; value: number; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
      <Icon className="size-5 shrink-0 text-fur-navy-800" style={color ? { color } : undefined} aria-hidden />
      <div>
        <p className="text-xl leading-none font-bold text-fur-navy-900 tabular-nums">{value}</p>
        <p className="mt-0.5 text-[11px] leading-tight text-fur-gray-600">{label}</p>
      </div>
    </div>
  )
}

/** Tarjeta de un activo; con `sortable` lleva un asa para arrastrarla a otra posición (siempre visible, como en las galerías de fotos). */
function AssetCard({ asset, selected, onSelect, sortable }: { asset: AssetItem; selected: boolean; onSelect: () => void; sortable: boolean }) {
  const meta = STATUS_META[asset.status as AssetStatus]
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: asset.id, disabled: !sortable })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // La tarjeta entera se arrastra (el clic corto sigue seleccionando el activo: el arrastre empieza tras mover unos píxeles).
      onPointerDown={sortable ? (listeners?.onPointerDown as PointerEventHandler<HTMLLIElement> | undefined) : undefined}
      className={cn('relative', sortable && 'cursor-grab active:cursor-grabbing', isDragging && 'z-10 opacity-60')}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          'group flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card text-left outline-none hover:border-fur-navy-800 focus-visible:ring-3 focus-visible:ring-ring/50',
          selected ? 'border-fur-orange-500 ring-2 ring-fur-orange-500/40' : 'border-border',
        )}
      >
        <div className="relative grid h-24 place-items-center border-b border-border bg-white">
          {asset.model.imageUrl ? (
            <img src={apiUrl(asset.model.imageUrl)} alt={`Foto de ${asset.model.name}`} loading="lazy" draggable={false} className="h-full w-full object-contain" />
          ) : (
            <Package className="size-9 text-fur-gray-300" aria-hidden />
          )}
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-card/95 px-1.5 py-0.5 text-[10px] font-semibold text-fur-gray-800 shadow-sm">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: meta?.color ?? 'var(--fur-steel-500)' }} aria-hidden />
            {meta?.label ?? asset.status}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 px-2.5 py-2">
          <p className="fur-code text-xs font-semibold text-fur-navy-900 group-hover:underline">{asset.tag}</p>
          <p className="line-clamp-2 text-sm leading-tight font-medium">{asset.name}</p>
          <p className="mt-auto pt-1 text-[11px] text-fur-gray-600">{asset.family.name}</p>
        </div>
      </button>
      {sortable && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          onKeyDown={listeners?.onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined}
          aria-label={`Arrastrar ${asset.tag} para cambiar su orden`}
          className="absolute top-1.5 right-1.5 inline-flex h-7 touch-none items-center gap-0.5 rounded-md bg-fur-navy-900 pr-2 pl-1 text-[11px] font-semibold text-white shadow-md ring-1 ring-white/60 hover:bg-fur-navy-800 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <GripVertical className="size-4" aria-hidden />
          Mover
        </button>
      )}
    </li>
  )
}

/** Etapa destacada: su descripción, los indicadores de sus activos y las tarjetas de esos activos. */
export function StageDetail({
  stage,
  networkName,
  selectedAssetId,
  onSelectAsset,
  assets,
  total,
  loading,
  expanded,
  onExpand,
  filtered,
  canReorder = false,
  onReorder,
}: {
  stage: PlantStage | undefined
  /** Nombre de la red transversal elegida, si hay una. */
  networkName: string | undefined
  selectedAssetId: string | undefined
  onSelectAsset: (id: string) => void
  assets: AssetItem[]
  total: number
  loading: boolean
  expanded: boolean
  onExpand: () => void
  /** Hay red o búsqueda activas: cambia el texto del estado vacío. */
  filtered: boolean
  /** Quien puede editar activos arrastra las tarjetas para cambiar su orden. */
  canReorder?: boolean
  /** Recibe los ids de todas las tarjetas en el orden en que deben quedar. */
  onReorder?: (assetIds: string[]) => void
}) {
  const of = (status: AssetStatus) => assets.filter((a) => a.status === status).length
  const shown = expanded ? assets : assets.slice(0, VISIBLE_ASSETS)
  const sortable = canReorder && !!onReorder && assets.length > 1

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const next = reorderIds(
      assets.map((a) => a.id),
      shown.length,
      String(active.id),
      String(over.id),
    )
    if (next) onReorder?.(next)
  }

  return (
    <>
      <GeoPanel title="Etapa destacada" icon={Cog}>
        {!stage ? (
          <p className="text-sm text-muted-foreground">Elige una etapa del listado.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-lg leading-tight font-bold text-fur-navy-900">
                Etapa {stageNumber(stage.code)} · {stage.displayName}
              </h3>
              <p className="mt-0.5 text-sm text-fur-gray-600">Grupo: {stageGroupLabel(stage.stageGroup)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat icon={Package} value={total} label="activos asociados" />
              <Stat icon={CheckCircle2} value={of('OPERATIVE')} label="operativos" color="var(--fur-green-500)" />
              <Stat icon={Wrench} value={of('MAINTENANCE') + of('REPAIR')} label="en mantenimiento o reparación" color="var(--fur-orange-500)" />
              <Stat icon={AlertTriangle} value={assets.filter((a) => a.criticality === 'CRITICAL').length} label="de criticidad crítica" color="var(--fur-red-500)" />
            </div>
          </div>
        )}
      </GeoPanel>

      <GeoPanel
        title={stage ? (networkName ? `Activos asociados a la red ${networkName} (Etapa ${stageNumber(stage.code)})` : `Activos asociados a la etapa ${stageNumber(stage.code)}`) : 'Activos asociados'}
        icon={Package}
        className="mt-3"
        actions={total > VISIBLE_ASSETS && !expanded ? (
          <button type="button" onClick={onExpand} className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            Ver los {total} activos
          </button>
        ) : undefined}
      >
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {filtered ? 'Ningún activo de esta etapa coincide con los filtros.' : 'Esta etapa aún no tiene activos registrados.'}
          </p>
        ) : (
          <>
            {sortable && (
              <p className="mb-2 text-xs text-fur-gray-600">
                Arrastra una tarjeta (o su botón «Mover») hacia la posición que quieras, por ejemplo la primera. El orden se guarda al instante.
              </p>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={shown.map((a) => a.id)} strategy={rectSortingStrategy}>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Activos de la etapa">
                  {shown.map((a) => (
                    <AssetCard key={a.id} asset={a} selected={a.id === selectedAssetId} onSelect={() => onSelectAsset(a.id)} sortable={sortable} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </>
        )}
      </GeoPanel>
    </>
  )
}
