import { BookOpen, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { PlantMap } from '@/components/industrial/plant-map'
import { Pagination } from '@/components/data/pagination'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { apiUrl } from '@/lib/api'
import { useCatalogFamilies, useCatalogManufacturers, useCatalogModels, type CatalogFilters } from '@/features/assets/use-assets'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const PAGE_SIZE = 24

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

  const chips: Chip[] = [
    filters.family && { key: 'family', label: 'Familia', value: families.data?.find((f) => f.code === filters.family)?.name ?? filters.family },
    filters.manufacturerId && { key: 'manufacturerId', label: 'Fabricante', value: manufacturers.data?.find((m) => m.id === filters.manufacturerId)?.name ?? '…' },
    filters.search && { key: 'search', label: 'Búsqueda', value: filters.search },
  ].filter((c): c is Chip => !!c)

  const clearAll = () => {
    setSearchText('')
    setParam({ family: undefined, manufacturerId: undefined, search: undefined })
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
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
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((m) => (
                <li key={m.id}>
                  <Card className="h-full">
                    {m.imageUrl && (
                      <div className="overflow-hidden rounded-t-lg border-b border-border bg-white">
                        <img src={apiUrl(m.imageUrl)} alt={`Foto de ${m.modelName}`} loading="lazy" className="h-44 w-full object-contain" />
                      </div>
                    )}
                    <CardContent className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{m.family.name}</Badge>
                        <span className="text-xs text-fur-gray-600">{m.type.name}</span>
                      </div>
                      <h3 className="text-lg font-semibold text-fur-navy-900">{m.modelName}</h3>
                      <p className="text-sm text-fur-gray-600">{m.manufacturer ? `${m.manufacturer.name}${m.manufacturer.countryCode ? ` · ${m.manufacturer.countryCode}` : ''}` : 'Genérico'}</p>
                      {Object.keys(m.specifications).length > 0 && (
                        <dl className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
                          {Object.entries(m.specifications).slice(0, 4).map(([k, v]) => (
                            <div key={k} className="flex gap-1">
                              <dt className="text-fur-gray-600">{k}:</dt>
                              <dd className="fur-code font-normal">{String(v)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={(p) => setParam({ page: p > 1 ? String(p) : undefined }, true)} />
          </>
        )
      )}
    </>
  )
}
