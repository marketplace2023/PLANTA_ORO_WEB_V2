import { Building2, Plus, Search, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { Pagination } from '@/components/data/pagination'
import { PageHeader } from '@/components/layout/page-header'
import { ProviderSheet } from '@/components/organizations/org-sheets'
import { ProviderCard } from '@/components/organizations/provider-card'
import { RegisterOrgDialog } from '@/components/organizations/register-org-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useCatalogFamilies } from '@/features/assets/use-assets'
import { useAuth } from '@/features/auth/auth-context'
import { useStageCatalog } from '@/features/catalog/use-catalog'
import { useMyProviders, useProviders } from '@/features/organizations/use-organizations'
import { countryName, countryOptions, RATING_MIN_OPTIONS } from '@/lib/organizations'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { useUrlFilters } from '@/lib/use-url-filters'

const PAGE_SIZE = 12

/** Proveedores (design.md §34): organizaciones que publican productos en el marketplace. */
export function ProvidersPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { params, filters, setParam } = useUrlFilters(['provider'])
  const openId = params.get('provider') ?? undefined
  const page = Math.max(1, Number(filters.page) || 1)
  const providers = useProviders(filters, PAGE_SIZE)
  const mine = useMyProviders(!!user)
  const stages = useStageCatalog()
  const families = useCatalogFamilies()
  const [registering, setRegistering] = useState(false)

  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced.trim() !== (filters.search ?? '')) setParam({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const chips: Chip[] = [
    filters.stage && { key: 'stage', label: 'Etapa', value: `${filters.stage} · ${stages.data?.find((s) => s.code === filters.stage)?.name ?? ''}`.trim() },
    filters.family && { key: 'family', label: 'Familia', value: families.data?.find((f) => f.code === filters.family)?.name ?? filters.family },
    filters.country && { key: 'country', label: 'País', value: countryName(filters.country) },
    filters.ratingMin && { key: 'ratingMin', label: 'Rating', value: `${filters.ratingMin} o más` },
    filters.verified === '1' && { key: 'verified', label: 'Estado', value: 'Verificados' },
    filters.search && { key: 'search', label: 'Búsqueda', value: filters.search },
  ].filter((c): c is Chip => !!c)
  const clearAll = () => {
    setSearchText('')
    setParam({ stage: undefined, family: undefined, country: undefined, ratingMin: undefined, verified: undefined, search: undefined })
  }

  const data = providers.data
  return (
    <>
      <PageHeader
        title="Proveedores"
        description="Empresas que ofrecen repuestos y equipos al ecosistema, filtrables por etapa, familia y país."
        actions={
          <div className="flex flex-wrap gap-2">
            {mine.data?.map((p) => (
              <Button key={p.id} asChild variant="secondary">
                <Link to={`/providers/${p.id}/manage`}>
                  <Settings /> {p.organizationName}
                </Link>
              </Button>
            ))}
            {user ? (
              <Button onClick={() => setRegistering(true)}>
                <Plus /> Registrar mi empresa
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link to="/login">Inicia sesión para registrar tu empresa</Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="pv-search" className="text-xs text-fur-gray-600">
              Buscar
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input id="pv-search" type="search" className="h-10 pl-9" placeholder="Nombre o descripción…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>
          <FilterSelect label="Etapa" value={filters.stage ?? ''} onChange={(v) => setParam({ stage: v || undefined })} options={(stages.data ?? []).map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))} />
          <FilterSelect label="Familia" value={filters.family ?? ''} onChange={(v) => setParam({ family: v || undefined })} options={(families.data ?? []).map((f) => ({ value: f.code, label: f.name }))} />
          <FilterSelect label="País" value={filters.country ?? ''} onChange={(v) => setParam({ country: v || undefined })} options={countryOptions()} />
          <FilterSelect label="Rating" value={filters.ratingMin ?? ''} onChange={(v) => setParam({ ratingMin: v || undefined })} options={RATING_MIN_OPTIONS} />
          <label className="flex h-10 items-center gap-2 text-sm">
            <Checkbox checked={filters.verified === '1'} onCheckedChange={(on) => setParam({ verified: on ? '1' : undefined })} />
            Solo verificados
          </label>
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

      {providers.isError ? (
        <ErrorState onRetry={() => void providers.refetch()} />
      ) : providers.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando proveedores">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : data && data.total === 0 ? (
        chips.length > 0 ? (
          <EmptyState icon={Search} title="Ningún proveedor coincide con los filtros" action={<Button variant="secondary" onClick={clearAll}>Limpiar filtros</Button>} />
        ) : (
          <EmptyState icon={Building2} title="Aún no hay proveedores" description="Los proveedores aprobados por el administrador aparecerán aquí." />
        )
      ) : (
        data && (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((p) => (
                <li key={p.id}>
                  <ProviderCard provider={p} onOpen={(id) => setParam({ provider: id }, true)} />
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={(p) => setParam({ page: p > 1 ? String(p) : undefined }, true)} />
          </>
        )
      )}

      {openId && <ProviderSheet id={openId} onClose={() => setParam({ provider: undefined }, true)} />}
      {registering && <RegisterOrgDialog kind="provider" onClose={() => setRegistering(false)} onDone={(id) => navigate(`/providers/${id}/manage`)} />}
    </>
  )
}
