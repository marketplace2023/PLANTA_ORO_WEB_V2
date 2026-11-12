import { Link } from 'react-router-dom'
import { Search, Store } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { Pagination } from '@/components/data/pagination'
import { PageHeader } from '@/components/layout/page-header'
import { ListingCard } from '@/components/organizations/listing-card'
import { ListingSheet } from '@/components/organizations/listing-sheet'
import { ProviderSheet } from '@/components/organizations/org-sheets'
import { ProviderCard } from '@/components/organizations/provider-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useCatalogFamilies } from '@/features/assets/use-assets'
import { useStageCatalog } from '@/features/catalog/use-catalog'
import { useListings, useProviders } from '@/features/organizations/use-organizations'
import { formatMoney } from '@/lib/format'
import { AVAILABILITY_LABELS, availabilityLabel } from '@/lib/organizations'
import { useUrlFilters } from '@/lib/use-url-filters'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const PAGE_SIZE = 12
const SORTS = [
  { value: 'newest', label: 'Destacados y recientes' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'title', label: 'Nombre (A-Z)' },
]

/** Marketplace (design.md §33): oferta comercial de proveedores. Es información pública, no inventario de planta. */
export function MarketplacePage() {
  const { params, filters, setParam } = useUrlFilters(['listing', 'seller', 'view'])
  const sellerId = params.get('seller') ?? undefined
  const view = params.get('view') === 'sellers' ? 'sellers' : 'products'
  const openListing = params.get('listing') ?? undefined
  const page = Math.max(1, Number(filters.page) || 1)
  const listings = useListings(filters, PAGE_SIZE)
  const stages = useStageCatalog()
  const families = useCatalogFamilies()

  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced.trim() !== (filters.search ?? '')) setParam({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const stageName = (code: string) => stages.data?.find((s) => s.code === code)?.name ?? code
  const familyName = (code: string) => families.data?.find((f) => f.code === code)?.name ?? code
  const chips: Chip[] = [
    filters.stage && { key: 'stage', label: 'Etapa', value: `${filters.stage} · ${stageName(filters.stage)}` },
    filters.family && { key: 'family', label: 'Familia', value: familyName(filters.family) },
    filters.availability && { key: 'availability', label: 'Disponibilidad', value: availabilityLabel(filters.availability) },
    filters.priceMin && { key: 'priceMin', label: 'Precio mín.', value: formatMoney(Number(filters.priceMin), filters.currency ?? 'USD') },
    filters.priceMax && { key: 'priceMax', label: 'Precio máx.', value: formatMoney(Number(filters.priceMax), filters.currency ?? 'USD') },
    filters.providerId && { key: 'providerId', label: 'Vendedor', value: 'seleccionado' },
    filters.sellerType && { key: 'sellerType', label: 'Vendedor', value: filters.sellerType === 'VERIFIED_STORE' ? 'Tiendas verificadas' : 'Particulares no verificados' },
    filters.search && { key: 'search', label: 'Búsqueda', value: filters.search },
  ].filter((c): c is Chip => !!c)

  const clearAll = () => {
    setSearchText('')
    setParam({ stage: undefined, family: undefined, availability: undefined, priceMin: undefined, priceMax: undefined, providerId: undefined, search: undefined, currency: undefined, sellerType: undefined })
  }

  const data = listings.data

  return (
    <div className="directory-page marketplace-page">
      <PageHeader title="Marketplace" description="Productos de tiendas verificadas y vendedores particulares. Compra por transferencia o solicita una cotización." actions={<div className="flex gap-2"><Button asChild variant="outline"><Link to="/marketplace/orders">Mis pedidos</Link></Button><Button asChild><Link to="/marketplace/cart">Mi carrito</Link></Button></div>} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div role="tablist" aria-label="Explorar Marketplace" className="inline-flex gap-1 rounded-xl border border-border bg-card p-1">
          <Button role="tab" aria-selected={view === 'products'} variant={view === 'products' ? 'default' : 'ghost'} onClick={() => setParam({view:undefined,page:undefined})}>Productos</Button>
          <Button role="tab" aria-selected={view === 'sellers'} variant={view === 'sellers' ? 'default' : 'ghost'} onClick={() => setParam({view:'sellers',page:undefined,priceMin:undefined,priceMax:undefined,availability:undefined,sort:undefined,providerId:undefined})}>Vendedores</Button>
        </div>
        <p className="max-w-lg text-xs leading-relaxed text-muted-foreground">Las tiendas verificadas tienen el sello del administrador. Los particulares ofrecen productos sin esa verificación.</p>
      </div>

      <div className="directory-filters mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="mk-search" className="text-xs text-fur-gray-600">
              Buscar
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input id="mk-search" type="search" className="h-10 pl-9" placeholder="Producto, descripción o proveedor…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>
          <FilterSelect label="Etapa" value={filters.stage ?? ''} onChange={(v) => setParam({ stage: v || undefined })} options={(stages.data ?? []).map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))} />
          <FilterSelect label="Familia" value={filters.family ?? ''} onChange={(v) => setParam({ family: v || undefined })} options={(families.data ?? []).map((f) => ({ value: f.code, label: f.name }))} />
          <FilterSelect label="Tipo de vendedor" value={filters.sellerType ?? ''} onChange={(v) => setParam({ sellerType: v || undefined })} options={[{value:'VERIFIED_STORE',label:'Tiendas verificadas'},{value:'INDIVIDUAL',label:'Particulares no verificados'}]} />
          {view === 'products' && <>
          <FilterSelect
            label="Disponibilidad"
            value={filters.availability ?? ''}
            onChange={(v) => setParam({ availability: v || undefined })}
            options={Object.entries(AVAILABILITY_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <div className="w-28 space-y-1">
            <Label htmlFor="mk-pmin" className="text-xs text-fur-gray-600">
              Precio mín.
            </Label>
            <Input id="mk-pmin" type="number" min={0} className="h-10" value={filters.priceMin ?? ''} onChange={(e) => setParam({ priceMin: e.target.value || undefined })} />
          </div>
          <div className="w-28 space-y-1">
            <Label htmlFor="mk-pmax" className="text-xs text-fur-gray-600">
              Precio máx.
            </Label>
            <Input id="mk-pmax" type="number" min={0} className="h-10" value={filters.priceMax ?? ''} onChange={(e) => setParam({ priceMax: e.target.value || undefined })} />
          </div>
          <FilterSelect label="Ordenar" value={filters.sort ?? ''} allLabel={SORTS[0].label} onChange={(v) => setParam({ sort: v || undefined })} options={SORTS.slice(1)} />
          </>}
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

      {view === 'sellers' ? <MarketplaceSellers filters={filters} page={page} onOpen={id=>setParam({seller:id},true)} onPage={p=>setParam({page:p>1?String(p):undefined},true)} /> : listings.isError ? (
        <ErrorState onRetry={() => void listings.refetch()} />
      ) : listings.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando productos">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      ) : data && data.total === 0 ? (
        chips.length > 0 ? (
          <EmptyState icon={Search} title="Ningún producto coincide con los filtros" description="Prueba con otros criterios o limpia los filtros." action={<Button variant="secondary" onClick={clearAll}>Limpiar filtros</Button>} />
        ) : (
          <EmptyState icon={Store} title="Aún no hay productos publicados" description="Las tiendas y los vendedores particulares publicarán aquí sus productos." />
        )
      ) : (
        data && (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((l) => (
                <li key={l.id}>
                  <ListingCard listing={l} onOpen={(id) => setParam({ listing: id }, true)} />
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={(p) => setParam({ page: p > 1 ? String(p) : undefined }, true)} />
          </>
        )
      )}

      {openListing && <ListingSheet id={openListing} onClose={() => setParam({ listing: undefined }, true)} />}
      {sellerId && <ProviderSheet id={sellerId} onClose={()=>setParam({seller:undefined},true)} />}
    </div>
  )
}

function MarketplaceSellers({filters,page,onOpen,onPage}:{filters:Record<string,string|undefined>;page:number;onOpen:(id:string)=>void;onPage:(page:number)=>void}) {
  const q=useProviders({search:filters.search,family:filters.family,stage:filters.stage,country:filters.country,page:String(page),verified:filters.sellerType === 'VERIFIED_STORE' ? '1' : filters.sellerType === 'INDIVIDUAL' ? '0' : undefined},PAGE_SIZE)
  if(q.isLoading)return <Skeleton className="h-64" aria-label="Cargando vendedores" />
  if(q.isError)return <ErrorState onRetry={()=>void q.refetch()} />
  if(!q.data?.items.length)return <EmptyState icon={Store} title="No hay vendedores con estos filtros" description="Aquí aparecerán las tiendas verificadas y los particulares con su cuenta habilitada." />
  return <><ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{q.data.items.map(p=><li key={p.id}><ProviderCard provider={p} onOpen={onOpen}/></li>)}</ul><Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPageChange={onPage}/></>
}
