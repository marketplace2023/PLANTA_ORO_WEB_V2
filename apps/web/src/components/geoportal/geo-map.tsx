import { Crosshair, Map as MapIcon, Maximize2, MapPinOff, Zap } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { AssetItem } from '@/features/assets/use-assets'
import type { MapPosition, PlantStage } from '@/features/plant/use-plant-data'
import { plantMapUrl } from '@/lib/plant-maps'
import { cn } from '@/lib/utils'
import { GeoPanel } from './geo-panel'
import { stageNumber } from './stage-number'

type Layers = { assets: boolean; stages: boolean; networks: boolean }
const LAYER_LABELS: Array<[keyof Layers, string]> = [
  ['assets', 'Activos físicos'],
  ['stages', 'Etapas'],
  ['networks', 'Redes'],
]

const pct = (p: MapPosition) => ({ left: `${p.x}%`, top: `${p.y}%` })

type CanvasProps = {
  url: string
  alt: string
  layers: Layers
  stages: PlantStage[]
  selectedStage: string | undefined
  assets: AssetItem[]
  selectedAssetId: string | undefined
  onSelectStage: (code: string) => void
  onSelectAsset: (id: string) => void
  /** Con valor, el mapa está en modo «ubicar»: un clic coloca lo elegido en ese punto. */
  placing?: { label: string; onPlace: (position: MapPosition) => void }
  imgClassName: string
}

/** Imagen del mapa con las etapas y los activos ubicados encima. Las posiciones son porcentajes de la imagen. */
function MapCanvas({ url, alt, layers, stages, selectedStage, assets, selectedAssetId, onSelectStage, onSelectAsset, placing, imgClassName }: CanvasProps) {
  const place = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clamp = (n: number) => Math.min(100, Math.max(0, n))
    placing?.onPlace({ x: clamp(((e.clientX - rect.left) / rect.width) * 100), y: clamp(((e.clientY - rect.top) / rect.height) * 100) })
  }

  return (
    <div className="relative mx-auto w-fit max-w-full bg-white">
      <img src={url} alt={alt} className={imgClassName} />

      {layers.stages &&
        stages
          .filter((s) => s.mapPosition)
          .map((s) => {
            const active = s.code === selectedStage
            return (
              <button
                key={s.id}
                type="button"
                disabled={!!placing}
                aria-pressed={active}
                aria-label={`Etapa ${stageNumber(s.code)} ${s.displayName}`}
                title={s.displayName}
                onClick={() => onSelectStage(s.code)}
                style={pct(s.mapPosition!)}
                className={cn(
                  'absolute flex -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-fur-navy-900/60 text-[11px] font-bold shadow-md outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:pointer-events-none',
                  active ? 'z-20 scale-110' : 'z-10',
                )}
              >
                <span className={cn('px-1.5 py-0.5 text-white', active ? 'bg-fur-orange-500' : 'bg-fur-navy-900')}>{stageNumber(s.code)}</span>
                <span className="max-w-32 truncate bg-white px-1.5 py-0.5 text-fur-navy-900">{s.displayName}</span>
              </button>
            )
          })}

      {layers.assets &&
        assets
          .filter((a) => a.mapPosition)
          .map((a) => {
            const active = a.id === selectedAssetId
            const color = layers.networks && a.networks[0]?.colorToken ? `var(--${a.networks[0].colorToken})` : undefined
            return (
              <button
                key={a.id}
                type="button"
                disabled={!!placing}
                aria-pressed={active}
                aria-label={`Activo ${a.tag} ${a.name}`}
                onClick={() => onSelectAsset(a.id)}
                style={pct(a.mapPosition!)}
                className={cn('group absolute flex -translate-y-1/2 items-center gap-1 outline-none disabled:pointer-events-none', active ? 'z-30' : 'z-20')}
              >
                <span
                  className={cn('-ml-2.5 grid size-5 shrink-0 place-items-center rounded-full text-fur-navy-950 shadow ring-2 ring-white', !color && (active ? 'bg-fur-orange-500' : 'bg-fur-gold-500'))}
                  style={color ? { backgroundColor: color } : undefined}
                >
                  <Zap className="size-3" aria-hidden />
                </span>
                <span
                  className={cn(
                    'max-w-36 rounded px-1.5 py-0.5 text-left text-[11px] leading-tight font-semibold shadow group-focus-visible:ring-3 group-focus-visible:ring-ring/60',
                    active ? 'bg-fur-orange-500 text-white' : 'bg-fur-gold-400 text-fur-navy-950',
                  )}
                >
                  <span className="fur-code block">{a.tag}</span>
                  <span className="block truncate font-medium">{a.name}</span>
                </span>
              </button>
            )
          })}

      {placing && (
        <button type="button" aria-label={`Colocar ${placing.label} en el mapa`} onClick={place} className="absolute inset-0 z-40 cursor-crosshair bg-fur-navy-900/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/60" />
      )}
    </div>
  )
}

export type GeoMapProps = {
  plantName: string
  plantCode: string
  /** Etapas habilitadas, con su posición si ya se ubicaron. */
  stages: PlantStage[]
  selectedStage: PlantStage | undefined
  /** Activos de la etapa y la red elegidas. */
  assets: AssetItem[]
  selectedAsset: AssetItem | undefined
  onSelectStage: (code: string) => void
  onSelectAsset: (id: string) => void
  /** Quien puede configurar la planta puede ubicar etapas; quien puede editar activos, ubicar activos. */
  canPlaceStages: boolean
  canPlaceAssets: boolean
  onPlaceStage: (stage: PlantStage, position: MapPosition | null) => void
  onPlaceAsset: (asset: AssetItem, position: MapPosition | null) => void
}

/**
 * Mapa integral de la planta: el diagrama con las etapas y los activos marcados encima. Las capas se activan y
 * desactivan; quien tiene permiso puede ubicar la etapa o el activo elegidos haciendo clic en el mapa.
 */
export function GeoMap(props: GeoMapProps) {
  const { plantName, plantCode, stages, selectedStage, assets, selectedAsset, canPlaceStages, canPlaceAssets } = props
  const url = plantMapUrl(plantCode)
  const [zoom, setZoom] = useState(false)
  const [layers, setLayers] = useState<Layers>({ assets: true, stages: true, networks: true })
  const [editing, setEditing] = useState(false)
  const [target, setTarget] = useState<'stage' | 'asset'>('asset')

  if (!url) {
    return (
      <GeoPanel title="Mapa integral de activos físicos de la planta" icon={MapIcon}>
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{plantName} aún no tiene un mapa cargado.</p>
      </GeoPanel>
    )
  }

  const canEdit = canPlaceStages || canPlaceAssets
  // El destino real: lo elegido si se puede, o el otro si solo se puede uno.
  const kind: 'stage' | 'asset' = target === 'stage' ? (canPlaceStages ? 'stage' : 'asset') : canPlaceAssets ? 'asset' : 'stage'
  const stageTarget = kind === 'stage' ? selectedStage : undefined
  const assetTarget = kind === 'asset' ? selectedAsset : undefined
  const targetLabel = stageTarget ? `la etapa ${stageNumber(stageTarget.code)}` : assetTarget ? `el activo ${assetTarget.tag}` : undefined
  const targetPosition = stageTarget?.mapPosition ?? assetTarget?.mapPosition ?? null

  const placing =
    editing && targetLabel
      ? {
          label: targetLabel,
          onPlace: (p: MapPosition) => (stageTarget ? props.onPlaceStage(stageTarget, p) : assetTarget && props.onPlaceAsset(assetTarget, p)),
        }
      : undefined

  const canvas = (imgClassName: string) => (
    <MapCanvas
      url={url}
      alt={`Mapa de ${plantName}`}
      layers={layers}
      stages={stages}
      selectedStage={selectedStage?.code}
      assets={assets}
      selectedAssetId={selectedAsset?.id}
      onSelectStage={props.onSelectStage}
      onSelectAsset={props.onSelectAsset}
      placing={placing}
      imgClassName={imgClassName}
    />
  )

  const placed = assets.filter((a) => a.mapPosition).length

  return (
    <GeoPanel title="Mapa integral de activos físicos de la planta" icon={MapIcon} bodyClassName="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <legend className="sr-only">Capas del mapa</legend>
          {LAYER_LABELS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="size-4 accent-fur-navy-900" checked={layers[key]} onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))} />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button size="sm" variant={editing ? 'default' : 'outline'} aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
              <Crosshair /> Ubicar en el mapa
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setZoom(true)} aria-label={`Ampliar el mapa de ${plantName}`}>
            <Maximize2 /> Ampliar
          </Button>
        </div>
      </div>

      {editing && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-fur-gold-500/10 px-3 py-2 text-sm">
          <div role="group" aria-label="Qué ubicar" className="inline-flex rounded-md border border-border bg-card p-0.5">
            {canPlaceStages && (
              <button type="button" aria-pressed={kind === 'stage'} onClick={() => setTarget('stage')} className={cn('rounded px-2.5 py-1 text-xs font-medium', kind === 'stage' ? 'bg-fur-navy-900 text-white' : 'hover:bg-muted')}>
                Etapa {selectedStage ? stageNumber(selectedStage.code) : ''}
              </button>
            )}
            {canPlaceAssets && (
              <button type="button" aria-pressed={kind === 'asset'} onClick={() => setTarget('asset')} className={cn('rounded px-2.5 py-1 text-xs font-medium', kind === 'asset' ? 'bg-fur-navy-900 text-white' : 'hover:bg-muted')}>
                Activo {selectedAsset?.tag ?? ''}
              </button>
            )}
          </div>
          <p className="min-w-0 flex-1 text-fur-gray-800">
            {targetLabel ? `Haz clic en el mapa para ubicar ${targetLabel}.` : kind === 'stage' ? 'Elige una etapa del listado.' : 'Elige un activo de la etapa.'}
          </p>
          {targetLabel && targetPosition && (
            <Button size="sm" variant="outline" onClick={() => (stageTarget ? props.onPlaceStage(stageTarget, null) : assetTarget && props.onPlaceAsset(assetTarget, null))}>
              <MapPinOff /> Quitar posición
            </Button>
          )}
          <Button size="sm" onClick={() => setEditing(false)}>
            Listo
          </Button>
        </div>
      )}

      {canvas('block h-auto max-h-[26rem] w-auto max-w-full')}

      {!editing && placed === 0 && !stages.some((s) => s.mapPosition) && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {canEdit ? 'Aún no hay etapas ni activos ubicados en el mapa: usa «Ubicar en el mapa» para colocarlos.' : 'Aún no hay etapas ni activos ubicados en el mapa.'}
        </p>
      )}

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="w-[96vw] max-w-[96vw] gap-2 p-2 sm:max-w-[96vw]">
          <DialogTitle className="sr-only">Mapa de {plantName}</DialogTitle>
          <DialogDescription className="sr-only">Imagen del mapa a tamaño completo.</DialogDescription>
          <div className="max-h-[88vh] overflow-auto rounded-md bg-white">{zoom && canvas('block h-auto w-[90vw] max-w-none')}</div>
        </DialogContent>
      </Dialog>
    </GeoPanel>
  )
}
