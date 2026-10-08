import { Search } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorState } from '@/components/base/error-state'
import { PageHeader } from '@/components/layout/page-header'
import { Input } from '@/components/ui/input'
import { useAssets, useAssetsSummary, useSetAssetMapPosition } from '@/features/assets/use-assets'
import { usePlant } from '@/features/plant/plant-context'
import { useUpdateStage } from '@/features/plant/use-plant-admin'
import { usePlantNetworks, usePlantStages, type MapPosition, type PlantDetail } from '@/features/plant/use-plant-data'
import { ApiError } from '@/lib/api'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { AssetFicha } from './asset-ficha'
import { GeoKpis } from './geo-kpis'
import { NetworkList, StageList } from './geo-lists'
import { GeoMap } from './geo-map'
import { StageDetail } from './stage-detail'
import { stageNumber } from './stage-number'

/** Tope del servidor por página: una etapa rara vez lo alcanza y así el mapa y las tarjetas ven todos sus activos. */
const STAGE_ASSETS = 100

const failed = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar la posición en el mapa')

/**
 * Geoportal de Activos Físicos: las etapas del proceso mandan. Se elige una etapa (y, si se quiere, una red transversal)
 * y el mapa, la ficha de la etapa, las tarjetas de activos y la ficha técnica se ajustan a ella. La etapa, la red, el
 * activo y la búsqueda viven en la URL para poder compartir la vista.
 */
export function AssetsGeoportal({ plant, actions }: { plant: PlantDetail; actions: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const { permissions } = usePlant()
  const stagesQuery = usePlantStages(plant.slug)
  const networksQuery = usePlantNetworks(plant.slug)
  const summary = useAssetsSummary(plant.slug)
  const updateStage = useUpdateStage(plant.slug)
  const setAssetPosition = useSetAssetMapPosition(plant.slug)

  const stages = (stagesQuery.data ?? []).filter((s) => s.isEnabled).sort((a, b) => a.sequence - b.sequence)
  const networks = (networksQuery.data ?? []).filter((n) => n.isEnabled)

  // Sin etapa en la URL: la primera que tenga activos (o la primera de la planta).
  const firstWithAssets = stages.find((s) => (summary.data?.byStage[s.code] ?? 0) > 0) ?? stages[0]
  const selected = stages.find((s) => s.code === params.get('stage')) ?? firstWithAssets
  const network = params.get('network') ?? undefined
  const networkName = networks.find((n) => n.code === network)?.name ?? network
  const search = params.get('search') ?? undefined

  const setParam = (updates: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(updates)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        return next
      },
      { replace: true },
    )

  const [searchText, setSearchText] = useState(search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced.trim() !== (params.get('search') ?? '')) setParam({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const assets = useAssets(plant.slug, { stage: selected?.code, network, search }, STAGE_ASSETS, !!selected)
  const items = assets.data?.items ?? []
  // El activo de la URL si sigue en la lista; si no, el primero.
  const selectedAsset = items.find((a) => a.id === params.get('asset')) ?? items[0]
  const [expandedFor, setExpandedFor] = useState<string | undefined>()

  const placeStage = (stage: { id: string; code: string }, position: MapPosition | null) =>
    updateStage.mutate(
      { id: stage.id, mapPosition: position },
      { onSuccess: () => toast.success(position ? `Etapa ${stageNumber(stage.code)} ubicada en el mapa` : `Etapa ${stageNumber(stage.code)} quitada del mapa`), onError: failed },
    )
  const placeAsset = (asset: { id: string; tag: string }, position: MapPosition | null) =>
    setAssetPosition.mutate(
      { id: asset.id, position },
      { onSuccess: () => toast.success(position ? `${asset.tag} ubicado en el mapa` : `${asset.tag} quitado del mapa`), onError: failed },
    )

  const subtitle = [
    plant.name,
    'Mapa integral de activos físicos',
    selected && `Etapa ${stageNumber(selected.code)} – ${selected.displayName}`,
    networkName && `Red transversal – ${networkName}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <PageHeader
        title="Geoportal de Activos Físicos"
        description={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input
                type="search"
                aria-label="Buscar activos"
                className="h-10 w-56 pl-9"
                placeholder="Buscar activos…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
            {actions}
          </div>
        }
      />

      <GeoKpis summary={summary.data} stages={stages.length} networks={networks.length} loading={summary.isLoading || stagesQuery.isLoading || networksQuery.isLoading} />

      <div className="grid items-start gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_21rem]">
        <div className="space-y-3">
          <StageList stages={stages} counts={summary.data?.byStage} selected={selected?.code} loading={stagesQuery.isLoading} onSelect={(code) => setParam({ stage: code, asset: undefined })} />
          <NetworkList networks={networks} counts={summary.data?.byNetwork} selected={network} loading={networksQuery.isLoading} onSelect={(code) => setParam({ network: code, asset: undefined })} />
        </div>

        <div className="min-w-0">
          <GeoMap
            plantName={plant.name}
            plantCode={plant.code}
            stages={stages}
            selectedStage={selected}
            assets={items}
            selectedAsset={selectedAsset}
            onSelectStage={(code) => setParam({ stage: code, asset: undefined })}
            onSelectAsset={(id) => setParam({ asset: id })}
            canPlaceStages={permissions.includes('plant.configure')}
            canPlaceAssets={permissions.includes('asset.update')}
            onPlaceStage={placeStage}
            onPlaceAsset={placeAsset}
          />
          <div className="mt-3">
            {assets.isError ? (
              <ErrorState onRetry={() => void assets.refetch()} />
            ) : (
              <StageDetail
                stage={selected}
                networkName={networkName}
                selectedAssetId={selectedAsset?.id}
                onSelectAsset={(id) => setParam({ asset: id })}
                assets={items}
                total={assets.data?.total ?? 0}
                loading={assets.isLoading || (!selected && stagesQuery.isLoading)}
                expanded={!!selected && expandedFor === selected.code}
                onExpand={() => setExpandedFor(selected?.code)}
                filtered={!!network || !!search}
              />
            )}
          </div>
        </div>

        <AssetFicha plantSlug={plant.slug} asset={selectedAsset} networkName={networkName} />
      </div>
    </>
  )
}
