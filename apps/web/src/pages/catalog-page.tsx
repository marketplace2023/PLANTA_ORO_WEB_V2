import { ArrowUpRight, BookOpen, Box, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { ModelFichaDialog } from '@/components/catalog/model-ficha-dialog'
import { PlantMap } from '@/components/industrial/plant-map'
import { Pagination } from '@/components/data/pagination'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { apiUrl } from '@/lib/api'
import { useCatalogFamilies, useCatalogManufacturers, useCatalogModels, type CatalogFilters, type CatalogModel } from '@/features/assets/use-assets'
import { useNetworkCatalog, useStageCatalog } from '@/features/catalog/use-catalog'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const PAGE_SIZE = 24
/** Etapas visibles en la tarjeta antes de resumir el resto con «+N etapas». */
const MAX_STAGE_BADGES = 6

function ReferenceManufacturers({ value }: { value: unknown }) {
  const names = Array.isArray(value) ? value.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('nombre' in entry) || typeof entry.nombre !== 'string') return []
    const name = entry.nombre.trim()
    return name ? [name] : []
  }) : []
  return names.length > 0 ? <p className="line-clamp-2 text-sm leading-relaxed text-fur-gray-600" title={names.join(', ')}>{names.join(', ')}</p> : null
}

/** Catálogo maestro GLOBAL: qué tipos/modelos existen. No implica posesión; los activos de una planta viven en Activos Físicos. */
export function CatalogPage() {
  const [params, setParams] = useSearchParams()
  const filters: CatalogFilters = Object.fromEntries([...params.entries()].filter(([, v]) => v !== ''))
  const page = Math.max(1, Number(filters.page) || 1)

  const setParam = (updates: Record<string, string | undefined>, keepPage = false) =>
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

  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced !== (params.get('search') ?? '')) setParam({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const models = useCatalogModels(filters, PAGE_SIZE)
  const families = useCatalogFamilies()
  const manufacturers = useCatalogManufacturers()

  const resultsRef = useRef<HTMLUListElement>(null)
  const previousPage = useRef(page)
  useEffect(() => {
    if (previousPage.current === page || !models.isSuccess || models.isPlaceholderData) return
    previousPage.current = page
    resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [page, models.isSuccess, models.isPlaceholderData])

  const [ficha, setFicha] = useState<CatalogModel | null>(null)
  const stages = useStageCatalog()
  const networks = useNetworkCatalog()
  const stageName = (code: string) => stages.data?.find((s) => s.code === code)?.name
  const networkName = (code: string) => networks.data?.find((n) => n.code === code)?.name ?? code

  const chips: Chip[] = [
    filters.stage && { key: 'stage', label: 'Etapa', value: `${filters.stage} · ${stageName(filters.stage) ?? '…'}` },
    filters.network && { key: 'network', label: 'Red transversal', value: networkName(filters.network) },
    filters.family && { key: 'family', label: 'Familia', value: families.data?.find((f) => f.code === filters.family)?.name ?? filters.family },
    filters.manufacturerId && { key: 'manufacturerId', label: 'Fabricante', value: manufacturers.data?.find((m) => m.id === filters.manufacturerId)?.name ?? '…' },
    filters.search && { key: 'search', label: 'Búsqueda', value: filters.search },
  ].filter((c): c is Chip => !!c)

  const clearAll = () => {
    setSearchText('')
    setParam({ stage: undefined, network: undefined, family: undefined, manufacturerId: undefined, search: undefined })
  }

  const data = models.data

  return (
    <>
      <PageHeader title="Catálogo" description="Tipos y modelos de activos disponibles en todo el ecosistema. Los activos físicos de cada planta se crean a partir de estos modelos." />

      <PlantMap />

      <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1">
            <label htmlFor="catalog-search" className="text-xs text-fur-gray-600">
              Buscar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input id="catalog-search" type="search" className="h-10 pl-9" placeholder="Modelo, tipo o fabricante…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>
          <FilterSelect
            label="Etapa"
            value={filters.stage ?? ''}
            onChange={(v) => setParam({ stage: v || undefined })}
            options={(stages.data ?? []).map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))}
            allLabel="Todas las etapas"
          />
          <FilterSelect
            label="Red transversal"
            value={filters.network ?? ''}
            onChange={(v) => setParam({ network: v || undefined })}
            options={(networks.data ?? []).map((n) => ({ value: n.code, label: n.name }))}
            allLabel="Todas las redes"
          />
          <FilterSelect
            label="Familia"
            value={filters.family ?? ''}
            onChange={(v) => setParam({ family: v || undefined })}
            options={(families.data ?? []).map((f) => ({ value: f.code, label: f.name }))}
          />
          <FilterSelect
            label="Fabricante"
            value={filters.manufacturerId ?? ''}
            onChange={(v) => setParam({ manufacturerId: v || undefined })}
            options={(manufacturers.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
          />
        </div>
        <FilterChips
          chips={chips}
          onRemove={(key) => {
            if (key === 'search') setSearchText('')
            setParam({ [key]: undefined })
          }}
          onClear={clearAll}
        />
      </div>

      {models.isError ? (
        <ErrorState onRetry={() => void models.refetch()} />
      ) : models.isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando modelos">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
              <Skeleton className="aspect-video rounded-none" />
              <div className="space-y-3 p-5">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-6 w-4/5" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-6 h-9 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : data && data.total === 0 ? (
        chips.length > 0 ? (
          <EmptyState icon={Search} title="Ningún modelo coincide" description="Prueba con otros criterios." action={<Button variant="secondary" onClick={clearAll}>Limpiar filtros</Button>} />
        ) : (
          <EmptyState icon={BookOpen} title="El catálogo está vacío" description="Aún no hay modelos registrados en el catálogo global." />
        )
      ) : (
        data && (
          <>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-fur-navy-900">Modelos disponibles</h2>
              <span className="text-xs tabular-nums text-fur-gray-600" aria-live="polite">{data.total.toLocaleString('es')} {data.total === 1 ? 'modelo' : 'modelos'}</span>
            </div>
            <ul ref={resultsRef} className="grid scroll-mt-20 gap-5 sm:grid-cols-2 lg:scroll-mt-32 xl:grid-cols-3">
              {data.items.map((m) => (
                <li key={m.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setFicha(m)}
                    aria-label={`Ver la ficha técnica de ${m.modelName}`}
                    className="group block h-full w-full rounded-2xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-4"
                  >
                    <Card className="h-full gap-0 rounded-2xl py-0 ring-fur-navy-900/10 transition-[box-shadow,translate] duration-200 group-hover:shadow-lg group-hover:shadow-fur-navy-900/10 group-hover:ring-fur-navy-900/25 motion-safe:group-hover:-translate-y-1">
                      <div className="relative aspect-video shrink-0 overflow-hidden border-b border-border bg-fur-gray-100">
                        {m.imageUrl ? (
                          <img src={apiUrl(m.imageUrl)} alt={`Foto de ${m.modelName}`} loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]" />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(var(--fur-gray-200)_1px,transparent_1px)] bg-size-[16px_16px] text-fur-gray-600">
                            <Box className="size-12 text-fur-navy-900/35" strokeWidth={1} aria-hidden />
                            <span className="bg-fur-gray-100 px-2 text-xs">Imagen pendiente</span>
                          </div>
                        )}
                      </div>
                      <CardContent className="flex flex-1 flex-col gap-3 p-5">
                        <span className="border-l-2 border-fur-gold-500 pl-2 text-xs font-semibold text-fur-navy-900">{m.family.name}</span>
                        <div className="space-y-1.5">
                          <h3 className="text-lg leading-snug font-semibold tracking-tight text-fur-navy-900 [overflow-wrap:anywhere]">{m.modelName}</h3>
                          <span className="block text-xs leading-relaxed text-fur-gray-600">{m.type.name}</span>
                        </div>
                        <ReferenceManufacturers value={m.technicalData.fabricantesReferencia} />
                        <div className="mt-auto space-y-4 pt-2">
                          {(m.stageCodes.length > 0 || m.networkCodes.length > 0) && (
                            <ul className="flex flex-wrap gap-1.5" aria-label="Etapas y redes del modelo">
                              {stages.data && m.stageCodes.length === stages.data.length ? (
                                <li><Badge variant="outline" className="font-normal">Todas las etapas</Badge></li>
                              ) : (
                                <>
                                  {m.stageCodes.slice(0, MAX_STAGE_BADGES).map((code) => (
                                    <li key={code}>
                                      <Badge variant="outline" className="fur-code font-normal" title={stageName(code)}>{code}</Badge>
                                    </li>
                                  ))}
                                  {m.stageCodes.length > MAX_STAGE_BADGES && (
                                    <li><Badge variant="outline" className="font-normal" title={m.stageCodes.slice(MAX_STAGE_BADGES).join(', ')}>+{m.stageCodes.length - MAX_STAGE_BADGES} etapas</Badge></li>
                                  )}
                                </>
                              )}
                              {m.networkCodes.map((code) => (
                                <li key={code}>
                                  <Badge variant="secondary" className="h-auto max-w-full rounded-md bg-fur-navy-900/5 py-1 font-normal whitespace-normal text-fur-navy-900">{networkName(code)}</Badge>
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                            <span className="text-sm font-semibold text-fur-navy-900">Ver ficha técnica</span>
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fur-navy-900 text-white transition-colors duration-200 group-hover:bg-fur-gold-500 group-hover:text-fur-navy-900 group-focus-visible:bg-fur-gold-500 group-focus-visible:text-fur-navy-900">
                              <ArrowUpRight className="size-4" aria-hidden />
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                </li>
              ))}
            </ul>
            {ficha && <ModelFichaDialog model={ficha} stages={stages.data ?? []} networks={networks.data ?? []} onClose={() => setFicha(null)} />}
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={(p) => setParam({ page: p > 1 ? String(p) : undefined }, true)} />
          </>
        )
      )}
    </>
  )
}
