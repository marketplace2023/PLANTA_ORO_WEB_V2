import { ArrowDown, ArrowUp, ArrowUpDown, List, Map, Package, Plus, Search } from 'lucide-react'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { AssetsGeoportal } from '@/components/geoportal/assets-geoportal'
import { AssetFormDialog } from '@/components/assets/asset-form-dialog'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { Pagination } from '@/components/data/pagination'
import { AssetStatusBadge, CriticalityBadge } from '@/components/industrial/asset-badges'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAssets, useCatalogFamilies, type AssetFilters } from '@/features/assets/use-assets'
import { usePlantNetworks, usePlantStages, type PlantDetail } from '@/features/plant/use-plant-data'
import { ASSET_CRITICALITIES, ASSET_STATUSES, criticalityLabel, statusLabel } from '@/lib/assets'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { usePlantOutlet } from './plant-route'

const PAGE_SIZE = 25
const FILTER_KEYS = ['search', 'stage', 'network', 'family', 'status', 'criticality'] as const

const SORTABLE = [
  ['tag', 'Tag'],
  ['name', 'Activo'],
] as const

/** Vista de tabla: todos los activos de la planta con filtros, orden y paginación. */
function AssetsListView({ plant, actions }: { plant: PlantDetail; actions: ReactNode }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  // Los filtros viven en la URL (design.md §13): se pueden compartir y sobreviven a recargar.
  const filters: AssetFilters = Object.fromEntries([...params.entries()].filter(([k, v]) => v !== '' && k !== 'view'))
  const page = Math.max(1, Number(filters.page) || 1)
  const sort = filters.sort ?? 'tag'
  const dir = filters.dir === 'desc' ? 'desc' : 'asc'

  const setParam = (updates: Record<string, string | undefined>, { keepPage = false } = {}) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(updates)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        if (!keepPage) next.delete('page')
        return next
      },
      { replace: true },
    )

  // El texto se escribe en local y se vuelca a la URL con debounce.
  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debouncedSearch = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debouncedSearch !== (params.get('search') ?? '')) setParam({ search: debouncedSearch.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const assets = useAssets(plant.slug, filters, PAGE_SIZE)
  const stages = usePlantStages(plant.slug)
  const networks = usePlantNetworks(plant.slug)
  const families = useCatalogFamilies()

  const activeChips: Chip[] = [
    filters.stage && { key: 'stage', label: 'Etapa', value: filters.stage },
    filters.network && { key: 'network', label: 'Red', value: filters.network },
    filters.family && { key: 'family', label: 'Familia', value: families.data?.find((f) => f.code === filters.family)?.name ?? filters.family },
    filters.status && { key: 'status', label: 'Estado', value: statusLabel(filters.status) },
    filters.criticality && { key: 'criticality', label: 'Criticidad', value: criticalityLabel(filters.criticality) },
    filters.search && { key: 'search', label: 'Búsqueda', value: filters.search },
  ].filter((c): c is Chip => !!c)

  const clearAll = () => {
    setSearchText('')
    setParam(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])))
  }

  const toggleSort = (column: string) =>
    setParam({ sort: column, dir: sort === column && dir === 'asc' ? 'desc' : 'asc' }, { keepPage: true })

  const sortIcon = (column: string) =>
    sort !== column ? <ArrowUpDown className="size-3.5 opacity-40" aria-hidden /> : dir === 'asc' ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />

  const ariaSort = (column: string) => (sort === column ? (dir === 'asc' ? 'ascending' : 'descending') : 'none')

  const data = assets.data
  const hasFilters = activeChips.length > 0

  return (
    <>
      <PageHeader title="Activos Físicos" description="Equipos que esta planta realmente utiliza. Cada activo tiene su Ficha Única de Registro (FUR)." actions={actions} />

      <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1">
            <label htmlFor="asset-search" className="text-xs text-fur-gray-600">
              Buscar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input
                id="asset-search"
                type="search"
                className="h-10 pl-9"
                placeholder="Tag, nombre, FUR, modelo…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>
          <FilterSelect
            label="Etapa"
            value={filters.stage ?? ''}
            onChange={(v) => setParam({ stage: v || undefined })}
            options={(stages.data ?? []).filter((s) => s.isEnabled).map((s) => ({ value: s.code, label: `${s.code} — ${s.displayName}` }))}
          />
          <FilterSelect
            label="Red"
            value={filters.network ?? ''}
            onChange={(v) => setParam({ network: v || undefined })}
            options={(networks.data ?? []).filter((n) => n.isEnabled).map((n) => ({ value: n.code, label: n.code }))}
          />
          <FilterSelect
            label="Familia"
            value={filters.family ?? ''}
            onChange={(v) => setParam({ family: v || undefined })}
            options={(families.data ?? []).map((f) => ({ value: f.code, label: f.name }))}
          />
          <FilterSelect
            label="Estado"
            value={filters.status ?? ''}
            onChange={(v) => setParam({ status: v || undefined })}
            options={ASSET_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
          />
          <FilterSelect
            label="Criticidad"
            value={filters.criticality ?? ''}
            onChange={(v) => setParam({ criticality: v || undefined })}
            options={ASSET_CRITICALITIES.map((c) => ({ value: c, label: criticalityLabel(c) }))}
          />
        </div>
        <FilterChips
          chips={activeChips}
          onRemove={(key) => {
            if (key === 'search') setSearchText('')
            setParam({ [key]: undefined })
          }}
          onClear={clearAll}
        />
      </div>

      {assets.isError ? (
        <ErrorState onRetry={() => void assets.refetch()} />
      ) : assets.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando activos">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : data && data.total === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={Search}
            title="Ningún activo coincide con los filtros"
            description="Prueba con otros criterios o limpia los filtros."
            action={<Button variant="secondary" onClick={clearAll}>Limpiar filtros</Button>}
          />
        ) : (
          <EmptyState
            icon={Package}
            title="No hay activos registrados en esta planta"
            description="Cuando se registren activos (o se publiquen para visitantes) aparecerán aquí."
            action={<CreateAssetButton label="Registrar el primer activo" />}
          />
        )
      ) : (
        data && (
          <>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    {SORTABLE.map(([column, label]) => (
                      <TableHead key={column} aria-sort={ariaSort(column)}>
                        <button type="button" onClick={() => toggleSort(column)} className="inline-flex items-center gap-1.5 font-semibold">
                          {label} {sortIcon(column)}
                        </button>
                      </TableHead>
                    ))}
                    <TableHead>Etapa</TableHead>
                    <TableHead>Red</TableHead>
                    <TableHead aria-sort={ariaSort('status')}>
                      <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1.5 font-semibold">
                        Estado {sortIcon("status")}
                      </button>
                    </TableHead>
                    <TableHead aria-sort={ariaSort('criticality')}>
                      <button type="button" onClick={() => toggleSort('criticality')} className="inline-flex items-center gap-1.5 font-semibold">
                        Criticidad {sortIcon("criticality")}
                      </button>
                    </TableHead>
                    <TableHead>Ubicación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/plants/${plant.slug}/assets/${a.id}`)}>
                      <TableCell>
                        <Link
                          to={`/plants/${plant.slug}/assets/${a.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="fur-code text-fur-navy-900 underline-offset-2 hover:underline"
                        >
                          {a.tag}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-fur-gray-600">{a.model.name}</div>
                      </TableCell>
                      <TableCell>
                        {a.stage ? (
                          <span title={a.stage.name}>
                            <span className="fur-code">{a.stage.code}</span>
                            <span className="ml-1.5 hidden text-sm text-fur-gray-600 xl:inline">{a.stage.name}</span>
                          </span>
                        ) : (
                          <span className="text-fur-gray-500">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {a.networks.length === 0 && <span className="text-fur-gray-500">—</span>}
                          {a.networks.map((n) => (
                            <span key={n.code} className="inline-flex items-center gap-1 text-xs">
                              <span className="size-2 rounded-full" style={{ backgroundColor: n.colorToken ? `var(--${n.colorToken})` : undefined }} aria-hidden />
                              <span className="fur-code">{n.code}</span>
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <AssetStatusBadge status={a.status} />
                      </TableCell>
                      <TableCell>
                        <CriticalityBadge criticality={a.criticality} />
                      </TableCell>
                      <TableCell className="text-fur-gray-600">{a.location ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={(p) => setParam({ page: p > 1 ? String(p) : undefined }, { keepPage: true })} />
          </>
        )
      )}
    </>
  )
}

const CreateAssetContext = createContext<() => void>(() => undefined)

/** Botón «Nuevo activo»: abre el formulario que vive en `AssetsPage`. Solo para quien puede crear activos. */
function CreateAssetButton({ label = 'Nuevo activo' }: { label?: string }) {
  const open = useContext(CreateAssetContext)
  return (
    <PermissionGate permission="asset.create">
      <Button onClick={open}>
        <Plus /> {label}
      </Button>
    </PermissionGate>
  )
}

/** Alterna entre el geoportal (por etapas, con mapa) y la tabla completa. */
function ViewToggle({ view, onChange }: { view: 'geoportal' | 'lista'; onChange: (v: 'geoportal' | 'lista') => void }) {
  const options = [
    { value: 'geoportal', label: 'Geoportal', icon: Map },
    { value: 'lista', label: 'Lista', icon: List },
  ] as const
  return (
    <div role="group" aria-label="Vista" className="inline-flex rounded-lg border border-border bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={view === o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${view === o.value ? 'bg-fur-navy-900 text-white' : 'text-fur-gray-800 hover:bg-muted'}`}
        >
          <o.icon className="size-4" aria-hidden /> {o.label}
        </button>
      ))}
    </div>
  )
}

export function AssetsPage() {
  const plant = usePlantOutlet()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const view = params.get('view') === 'lista' ? 'lista' : 'geoportal'

  const changeView = (next: 'geoportal' | 'lista') =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'lista') p.set('view', 'lista')
        else p.delete('view')
        p.delete('page')
        return p
      },
      { replace: true },
    )

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <ViewToggle view={view} onChange={changeView} />
      <CreateAssetButton />
    </div>
  )

  return (
    <CreateAssetContext.Provider value={() => setCreating(true)}>
      {view === 'lista' ? <AssetsListView plant={plant} actions={actions} /> : <AssetsGeoportal plant={plant} actions={actions} />}
      {creating && <AssetFormDialog open onOpenChange={setCreating} plantSlug={plant.slug} onSaved={(a) => navigate(`/plants/${plant.slug}/assets/${a.id}`)} />}
    </CreateAssetContext.Provider>
  )
}
