import { ClipboardList, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { Pagination } from '@/components/data/pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useWorkOrders, type WorkOrderFilters } from '@/features/maintenance/use-maintenance'
import { formatDate } from '@/lib/format'
import { priorityLabel, PRIORITY_META, statusLabel, STATUS_META, TYPE_LABELS, typeLabel, WORK_ORDER_PRIORITIES, WORK_ORDER_STATUSES, WORK_ORDER_TYPES } from '@/lib/maintenance'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { PriorityBadge, WorkOrderStatusBadge } from './work-order-badges'

const PAGE_SIZE = 25

type Props = {
  slug: string
  filters: WorkOrderFilters
  setFilters: (updates: Record<string, string | undefined>, keepPage?: boolean) => void
  onOpen: (id: string) => void
  onCreate: () => void
}

/** Lista de OT con filtros en la URL, orden y paginación. */
export function OrdersView({ slug, filters, setFilters, onOpen, onCreate }: Props) {
  const page = Math.max(1, Number(filters.page) || 1)
  const orders = useWorkOrders(slug, filters, PAGE_SIZE)

  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced.trim() !== (filters.search ?? '')) setFilters({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const chips: Chip[] = [
    filters.status && { key: 'status', label: 'Estado', value: statusLabel(filters.status) },
    filters.type && { key: 'type', label: 'Tipo', value: typeLabel(filters.type) },
    filters.priority && { key: 'priority', label: 'Prioridad', value: priorityLabel(filters.priority) },
    filters.assignedTo === 'me' && { key: 'assignedTo', label: 'Responsable', value: 'Yo' },
    filters.overdue === '1' && { key: 'overdue', label: 'Vencimiento', value: 'Atrasadas' },
    filters.assetId && { key: 'assetId', label: 'Activo', value: 'seleccionado' },
    filters.search && { key: 'search', label: 'Búsqueda', value: filters.search },
  ].filter((c): c is Chip => !!c)

  const clearAll = () => {
    setSearchText('')
    setFilters({ status: undefined, type: undefined, priority: undefined, assignedTo: undefined, overdue: undefined, assetId: undefined, search: undefined })
  }

  const data = orders.data
  return (
    <>
      <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1">
            <label htmlFor="wo-search" className="text-xs text-fur-gray-600">
              Buscar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input id="wo-search" type="search" className="h-10 pl-9" placeholder="Código, título o activo…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>
          <FilterSelect label="Estado" value={filters.status ?? ''} onChange={(v) => setFilters({ status: v || undefined })} options={WORK_ORDER_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))} />
          <FilterSelect label="Tipo" value={filters.type ?? ''} onChange={(v) => setFilters({ type: v || undefined })} options={WORK_ORDER_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))} />
          <FilterSelect label="Prioridad" value={filters.priority ?? ''} onChange={(v) => setFilters({ priority: v || undefined })} options={WORK_ORDER_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
          <label className="flex h-10 items-center gap-2 text-sm">
            <Checkbox checked={filters.assignedTo === 'me'} onCheckedChange={(on) => setFilters({ assignedTo: on ? 'me' : undefined })} />
            Asignadas a mí
          </label>
          <label className="flex h-10 items-center gap-2 text-sm">
            <Checkbox checked={filters.overdue === '1'} onCheckedChange={(on) => setFilters({ overdue: on ? '1' : undefined })} />
            Atrasadas
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

      {orders.isError ? (
        <ErrorState onRetry={() => void orders.refetch()} />
      ) : orders.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando órdenes">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : data && data.total === 0 ? (
        chips.length > 0 ? (
          <EmptyState icon={Search} title="Ninguna orden coincide con los filtros" description="Prueba con otros criterios o limpia los filtros." action={<Button variant="secondary" onClick={clearAll}>Limpiar filtros</Button>} />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No hay órdenes de trabajo"
            description="Las solicitudes de mantenimiento de esta planta aparecerán aquí."
            action={
              <PermissionGate permission="maintenance.create">
                <Button onClick={onCreate}>
                  <Plus /> Solicitar mantenimiento
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
                    <TableHead>Orden</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Fecha límite</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => onOpen(o.id)}>
                      <TableCell>
                        <button type="button" className="fur-code text-fur-navy-900 underline-offset-2 hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(o.id) }}>
                          {o.code}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{o.title}</div>
                        <div className="text-xs text-fur-gray-600">
                          <span className="fur-code">{o.asset.tag}</span> {o.asset.name}
                        </div>
                      </TableCell>
                      <TableCell>{typeLabel(o.type)}</TableCell>
                      <TableCell>
                        <PriorityBadge priority={o.priority} />
                      </TableCell>
                      <TableCell>
                        <WorkOrderStatusBadge status={o.status} />
                      </TableCell>
                      <TableCell className="text-fur-gray-600">{o.assignedTo?.name ?? '—'}</TableCell>
                      <TableCell>
                        {o.plannedEnd ? (
                          <span className="flex items-center gap-2">
                            {formatDate(o.plannedEnd)}
                            {o.overdue && (
                              <Badge variant="outline" className="border-fur-red-500 text-fur-red-500">
                                Atrasada
                              </Badge>
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
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
