import { History, Search } from 'lucide-react'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { Pagination } from '@/components/data/pagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useMovements, type MovementFilters } from '@/features/inventory/use-inventory'
import { formatDate } from '@/lib/format'
import { MOVEMENT_LABELS, MOVEMENT_TYPES, movementLabel, REFERENCE_LABELS } from '@/lib/inventory'
import { MovementsTable } from './movements-table'

const PAGE_SIZE = 25

type Props = {
  slug: string
  filters: MovementFilters
  setFilters: (updates: Record<string, string | undefined>, keepPage?: boolean) => void
  onOpenItem: (id: string) => void
}

/** Libro de movimientos de la planta, filtrable por tipo, origen del movimiento y fechas. */
export function MovementsView({ slug, filters, setFilters, onOpenItem }: Props) {
  const page = Math.max(1, Number(filters.page) || 1)
  const moves = useMovements(slug, filters, PAGE_SIZE)

  const chips: Chip[] = [
    filters.type && { key: 'type', label: 'Tipo', value: movementLabel(filters.type) },
    filters.referenceType && { key: 'referenceType', label: 'Origen', value: REFERENCE_LABELS[filters.referenceType] ?? filters.referenceType },
    filters.itemId && { key: 'itemId', label: 'Ítem', value: 'seleccionado' },
    filters.from && { key: 'from', label: 'Desde', value: formatDate(filters.from) },
    filters.to && { key: 'to', label: 'Hasta', value: formatDate(filters.to) },
  ].filter((c): c is Chip => !!c)
  const clearAll = () => setFilters({ type: undefined, referenceType: undefined, itemId: undefined, from: undefined, to: undefined })

  const data = moves.data
  return (
    <>
      <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect label="Tipo" value={filters.type ?? ''} onChange={(v) => setFilters({ type: v || undefined })} options={MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_LABELS[t] }))} />
          <FilterSelect
            label="Origen"
            value={filters.referenceType ?? ''}
            onChange={(v) => setFilters({ referenceType: v || undefined })}
            options={Object.entries(REFERENCE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <div className="space-y-1">
            <Label htmlFor="mv-from" className="text-xs text-fur-gray-600">
              Desde
            </Label>
            <Input id="mv-from" type="date" className="h-10" value={filters.from ?? ''} max={filters.to || undefined} onChange={(e) => setFilters({ from: e.target.value || undefined })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mv-to" className="text-xs text-fur-gray-600">
              Hasta
            </Label>
            <Input id="mv-to" type="date" className="h-10" value={filters.to ?? ''} min={filters.from || undefined} onChange={(e) => setFilters({ to: e.target.value || undefined })} />
          </div>
        </div>
        <FilterChips chips={chips} onRemove={(key) => setFilters({ [key]: undefined })} onClear={clearAll} />
      </div>

      {moves.isError ? (
        <ErrorState onRetry={() => void moves.refetch()} />
      ) : moves.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando movimientos">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : data && data.total === 0 ? (
        chips.length > 0 ? (
          <EmptyState icon={Search} title="Ningún movimiento coincide con los filtros" action={<Button variant="secondary" onClick={clearAll}>Limpiar filtros</Button>} />
        ) : (
          <EmptyState icon={History} title="Aún no hay movimientos" description="Los ingresos, salidas, transferencias y ajustes quedan registrados aquí." />
        )
      ) : (
        data && (
          <>
            <MovementsTable slug={slug} movements={data.items} onOpenItem={onOpenItem} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={(p) => setFilters({ page: p > 1 ? String(p) : undefined }, true)} />
          </>
        )
      )}
    </>
  )
}
