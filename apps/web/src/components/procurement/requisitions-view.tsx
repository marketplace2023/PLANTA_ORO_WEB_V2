import { ClipboardList, FileSearch, PackageCheck, Plus, Search, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { Pagination } from '@/components/data/pagination'
import { KpiCard } from '@/components/industrial/kpi-card'
import { PriorityBadge } from '@/components/maintenance/work-order-badges'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useProcurementSummary, useRequisitions, type RequisitionFilters } from '@/features/procurement/use-procurement'
import { formatDate, formatMoney } from '@/lib/format'
import { priorityLabel, PRIORITY_META, WORK_ORDER_PRIORITIES } from '@/lib/maintenance'
import { REQUISITION_STATUS_META, REQUISITION_STATUSES, requisitionStatusLabel } from '@/lib/procurement'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { RequisitionStatusBadge } from './requisition-badges'

const PAGE_SIZE = 25

type Props = {
  slug: string
  filters: RequisitionFilters
  setFilters: (updates: Record<string, string | undefined>, keepPage?: boolean) => void
  onOpen: (id: string) => void
  onCreate: () => void
}

/** Requisiciones de la planta: resumen, filtros en la URL, orden y paginación. */
export function RequisitionsView({ slug, filters, setFilters, onOpen, onCreate }: Props) {
  const page = Math.max(1, Number(filters.page) || 1)
  const list = useRequisitions(slug, filters, PAGE_SIZE)
  const summary = useProcurementSummary(slug)

  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced.trim() !== (filters.search ?? '')) setFilters({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const chips: Chip[] = [
    filters.status && { key: 'status', label: 'Estado', value: filters.status.split(',').map(requisitionStatusLabel).join(', ') },
    filters.priority && { key: 'priority', label: 'Prioridad', value: priorityLabel(filters.priority) },
    filters.mine === '1' && { key: 'mine', label: 'Solicitante', value: 'Yo' },
    filters.assetId && { key: 'assetId', label: 'Activo', value: 'seleccionado' },
    filters.search && { key: 'search', label: 'Búsqueda', value: filters.search },
  ].filter((c): c is Chip => !!c)
  const clearAll = () => {
    setSearchText('')
    setFilters({ status: undefined, priority: undefined, mine: undefined, assetId: undefined, search: undefined })
  }

  const data = list.data
  return (
    <>
      {summary.data && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <KpiCard title="Por aprobar" value={summary.data.pendingApproval} icon={Send} tone={summary.data.pendingApproval > 0 ? 'warning' : 'default'} />
          <KpiCard title="En cotización" value={summary.data.openRfqs} icon={FileSearch} />
          <KpiCard title="Pendientes de recepción" value={summary.data.awaitingReceipt} icon={PackageCheck} />
        </div>
      )}

      <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1">
            <label htmlFor="rq-search" className="text-xs text-fur-gray-600">
              Buscar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input id="rq-search" type="search" className="h-10 pl-9" placeholder="Código o justificación…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>
          <FilterSelect label="Estado" value={filters.status ?? ''} onChange={(v) => setFilters({ status: v || undefined })} options={REQUISITION_STATUSES.map((s) => ({ value: s, label: REQUISITION_STATUS_META[s].label }))} />
          <FilterSelect label="Prioridad" value={filters.priority ?? ''} onChange={(v) => setFilters({ priority: v || undefined })} options={WORK_ORDER_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
          <label className="flex h-10 items-center gap-2 text-sm">
            <Checkbox checked={filters.mine === '1'} onCheckedChange={(on) => setFilters({ mine: on ? '1' : undefined })} />
            Solicitadas por mí
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

      {list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : list.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando requisiciones">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : data && data.total === 0 ? (
        chips.length > 0 ? (
          <EmptyState icon={Search} title="Ninguna requisición coincide con los filtros" action={<Button variant="secondary" onClick={clearAll}>Limpiar filtros</Button>} />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No hay requisiciones"
            description="Las solicitudes de compra de repuestos, consumibles y servicios aparecerán aquí."
            action={
              <PermissionGate permission="procurement.create">
                <Button onClick={onCreate}>
                  <Plus /> Nueva requisición
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
                    <TableHead>Código</TableHead>
                    <TableHead>Requisición</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Requerida</TableHead>
                    <TableHead className="text-right">Estimado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpen(r.id)}>
                      <TableCell>
                        <button type="button" className="fur-code text-fur-navy-900 underline-offset-2 hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(r.id) }}>
                          {r.code}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-md truncate font-medium">{r.justification}</div>
                        <div className="text-xs text-fur-gray-600">
                          {r.requestedBy?.name ?? '—'} · {r.lineCount} {r.lineCount === 1 ? 'línea' : 'líneas'}
                          {r.asset && <> · <span className="fur-code">{r.asset.tag}</span></>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={r.priority} />
                      </TableCell>
                      <TableCell>
                        <RequisitionStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>{formatDate(r.neededBy)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatMoney(r.estimatedTotal)}</TableCell>
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
