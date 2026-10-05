import { PackageSearch, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { Pagination } from '@/components/data/pagination'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useItems, useWarehouses, type ItemFilters } from '@/features/inventory/use-inventory'
import { formatMoney, formatQuantity } from '@/lib/format'
import { ITEM_TYPE_LABELS, ITEM_TYPES, itemTypeLabel } from '@/lib/inventory'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { ItemTypeBadge, StockFlags } from './item-badges'

const PAGE_SIZE = 25

type Props = {
  slug: string
  currency: string
  filters: ItemFilters
  setFilters: (updates: Record<string, string | undefined>, keepPage?: boolean) => void
  onOpen: (id: string) => void
  onCreate: () => void
}

/** Stock por ítem con filtros en la URL, orden y paginación. */
export function StockView({ slug, currency, filters, setFilters, onOpen, onCreate }: Props) {
  const page = Math.max(1, Number(filters.page) || 1)
  const items = useItems(slug, filters, PAGE_SIZE)
  const warehouses = useWarehouses(slug)

  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced.trim() !== (filters.search ?? '')) setFilters({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const warehouseName = (id: string) => warehouses.data?.find((w) => w.id === id)?.name ?? 'seleccionado'
  const chips: Chip[] = [
    filters.type && { key: 'type', label: 'Tipo', value: itemTypeLabel(filters.type) },
    filters.warehouseId && { key: 'warehouseId', label: 'Almacén', value: warehouseName(filters.warehouseId) },
    filters.critical === '1' && { key: 'critical', label: 'Criticidad', value: 'Críticos' },
    filters.low === '1' && { key: 'low', label: 'Nivel', value: 'Bajo mínimo' },
    filters.status === 'INACTIVE' && { key: 'status', label: 'Estado', value: 'Inactivos' },
    filters.search && { key: 'search', label: 'Búsqueda', value: filters.search },
  ].filter((c): c is Chip => !!c)

  const clearAll = () => {
    setSearchText('')
    setFilters({ type: undefined, warehouseId: undefined, critical: undefined, low: undefined, status: undefined, search: undefined })
  }

  const data = items.data
  return (
    <>
      <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1">
            <label htmlFor="item-search" className="text-xs text-fur-gray-600">
              Buscar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input id="item-search" type="search" className="h-10 pl-9" placeholder="SKU o nombre…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>
          <FilterSelect label="Tipo" value={filters.type ?? ''} onChange={(v) => setFilters({ type: v || undefined })} options={ITEM_TYPES.map((t) => ({ value: t, label: ITEM_TYPE_LABELS[t] }))} />
          <FilterSelect label="Almacén" value={filters.warehouseId ?? ''} onChange={(v) => setFilters({ warehouseId: v || undefined })} options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))} />
          <label className="flex h-10 items-center gap-2 text-sm">
            <Checkbox checked={filters.critical === '1'} onCheckedChange={(on) => setFilters({ critical: on ? '1' : undefined })} />
            Solo críticos
          </label>
          <label className="flex h-10 items-center gap-2 text-sm">
            <Checkbox checked={filters.low === '1'} onCheckedChange={(on) => setFilters({ low: on ? '1' : undefined })} />
            Bajo mínimo
          </label>
          <label className="flex h-10 items-center gap-2 text-sm">
            <Checkbox checked={filters.status === 'INACTIVE'} onCheckedChange={(on) => setFilters({ status: on ? 'INACTIVE' : undefined })} />
            Inactivos
          </label>
        </div>
        <FilterChips
          chips={chips}
          onRemove={(key) => {
            if (key === 'search') setSearchText('')
            setFilters({ [key]: undefined })
          }}
          onClear={clearAll}
        />
      </div>

      {items.isError ? (
        <ErrorState onRetry={() => void items.refetch()} />
      ) : items.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando ítems">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : data && data.total === 0 ? (
        chips.length > 0 ? (
          <EmptyState icon={Search} title="Ningún ítem coincide con los filtros" description="Prueba con otros criterios o limpia los filtros." action={<Button variant="secondary" onClick={clearAll}>Limpiar filtros</Button>} />
        ) : (
          <EmptyState
            icon={PackageSearch}
            title="No hay ítems en el inventario"
            description="Registra repuestos, consumibles y herramientas para controlar su stock."
            action={
              <PermissionGate permission="inventory.create">
                <Button onClick={onCreate}>
                  <Plus /> Nuevo ítem
                </Button>
              </PermissionGate>
            }
          />
        )
      ) : (
        data && (
          <>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Ítem</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Existencias</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead className="text-right">Costo prom.</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Alertas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((i) => (
                    <TableRow key={i.id} className="cursor-pointer" onClick={() => onOpen(i.id)}>
                      <TableCell>
                        <button type="button" className="fur-code text-fur-navy-900 underline-offset-2 hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(i.id) }}>
                          {i.sku}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell>
                        <ItemTypeBadge type={i.itemType} />
                      </TableCell>
                      <TableCell className={`text-right whitespace-nowrap ${i.belowMin ? 'font-semibold text-fur-red-500' : ''}`}>
                        {formatQuantity(i.onHand)} {i.uom}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap text-fur-gray-600">{formatQuantity(i.minStock)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatMoney(i.unitCost, currency)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatMoney(i.value, currency)}</TableCell>
                      <TableCell>
                        <StockFlags belowMin={i.belowMin} isCritical={i.isCritical} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={(p) => setFilters({ page: p > 1 ? String(p) : undefined }, true)} />
          </>
        )
      )}
    </>
  )
}
