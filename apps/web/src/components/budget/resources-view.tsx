import { Download, History, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FieldsDialog } from '@/components/base/fields-dialog'
import { PermissionGate } from '@/components/base/permission-gate'
import { FilterSelect } from '@/components/data/filter-select'
import { Pagination } from '@/components/data/pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useItems } from '@/features/inventory/use-inventory'
import { useCreateResource, useDeleteRate, useExchangeRates, useImportInventory, usePriceHistory, useResources, useSetRate, useUpdateResource, type Resource } from '@/features/budget/use-budget'
import { usePlant } from '@/features/plant/plant-context'
import { ApiError } from '@/lib/api'
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPES, resourceTypeLabel, type ResourceType } from '@/lib/budget'
import { formatDateTime, formatUnitPrice } from '@/lib/format'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const PAGE_SIZE = 25
type Props = { slug: string; filters: Record<string, string | undefined>; setFilters: (updates: Record<string, string | undefined>, keepPage?: boolean) => void }

function HistoryDialog({ slug, resource, onClose }: { slug: string; resource: Resource; onClose: () => void }) {
  const history = usePriceHistory(slug, resource.id)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Historial de precios · {resource.code}</DialogTitle>
          <DialogDescription>{resource.name}. Los presupuestos aprobados conservan el precio con el que se aprobaron.</DialogDescription>
        </DialogHeader>
        {history.isLoading || !history.data ? (
          <Skeleton className="h-24" aria-busy="true" />
        ) : (
          <ol className="divide-y divide-border rounded-lg border border-border">
            {history.data.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-semibold">{formatUnitPrice(h.unitPrice, h.currency)}</span>
                <span className="min-w-0 flex-1 text-fur-gray-600">{h.note ?? '—'}</span>
                <span className="text-xs text-fur-gray-600">
                  {formatDateTime(h.changedAt)}
                  {h.changedBy && ` · ${h.changedBy}`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Tipos de cambio a la moneda base: sin ellos, un recurso en otra moneda deja a sus APU sin precio. */
function RatesPanel({ slug }: { slug: string }) {
  const rates = useExchangeRates(slug)
  const set = useSetRate(slug)
  const del = useDeleteRate(slug)
  const [editing, setEditing] = useState<string | null | 'new'>(null)
  if (!rates.data) return null
  const base = rates.data.baseCurrency
  return (
    <section aria-labelledby="fx-title" className="mt-8 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="fx-title" className="text-lg font-semibold text-fur-navy-900">
          Tipos de cambio <span className="text-sm font-normal text-fur-gray-600">(moneda base: {base})</span>
        </h3>
        <PermissionGate permission="budget.edit">
          <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
            <Plus /> Agregar tipo de cambio
          </Button>
        </PermissionGate>
      </div>
      {rates.data.rates.length === 0 ? (
        <p className="text-sm text-fur-gray-600">No hay tipos de cambio: todos los recursos deben estar en {base}.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {rates.data.rates.map((r) => (
            <li key={r.currency} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="fur-code font-semibold">{r.currency}</span>
              <span className="min-w-0 flex-1">
                1 {r.currency} = {r.rate} {base}
              </span>
              <PermissionGate permission="budget.edit">
                <Button size="sm" variant="ghost" aria-label={`Editar tipo de cambio ${r.currency}`} onClick={() => setEditing(r.currency)}>
                  <Pencil /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Quitar tipo de cambio ${r.currency}`}
                  onClick={() => del.mutateAsync(r.currency).then(() => toast.success(`${r.currency} quitado`), (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo quitar'))}
                >
                  <Trash2 /> Quitar
                </Button>
              </PermissionGate>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <FieldsDialog
          title={editing === 'new' ? 'Agregar tipo de cambio' : `Tipo de cambio ${editing}`}
          description={`1 unidad de la moneda = X ${base}.`}
          fields={[
            ...(editing === 'new' ? [{ name: 'currency', label: 'Moneda (código de 3 letras)', required: true, placeholder: 'PEN' }] : []),
            { name: 'rate', label: `Equivale a (${base})`, type: 'number' as const, required: true, min: 0, step: 0.000001 },
          ]}
          initial={editing === 'new' ? {} : { rate: String(rates.data.rates.find((r) => r.currency === editing)?.rate ?? '') }}
          submitLabel="Guardar"
          onClose={() => setEditing(null)}
          onSubmit={(v) => set.mutateAsync({ currency: editing === 'new' ? String(v.currency).trim().toUpperCase() : editing, rate: Number(v.rate) })}
        />
      )}
    </section>
  )
}

/** Libro de precios: recursos por tipo, con historial de cambios, importación desde inventario y tipos de cambio. */
export function ResourcesView({ slug, filters, setFilters }: Props) {
  const { permissions } = usePlant()
  const page = Math.max(1, Number(filters.page) || 1)
  const resources = useResources(slug, filters, PAGE_SIZE)
  const create = useCreateResource(slug)
  const update = useUpdateResource(slug)
  const importer = useImportInventory(slug)
  const rates = useExchangeRates(slug)
  const inventory = useItems(slug, {}, 100, permissions.includes('inventory.read'))
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [priceOf, setPriceOf] = useState<Resource | null>(null)
  const [historyOf, setHistoryOf] = useState<Resource | null>(null)

  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced.trim() !== (filters.search ?? '')) setFilters({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const data = resources.data
  const currencies = [rates.data?.baseCurrency ?? 'USD', ...(rates.data?.rates.map((r) => r.currency) ?? [])]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 space-y-1">
            <label htmlFor="res-search" className="text-xs text-fur-gray-600">
              Buscar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input id="res-search" type="search" className="h-10 pl-9" placeholder="Código o nombre…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>
          <FilterSelect label="Tipo" value={filters.type ?? ''} onChange={(v) => setFilters({ type: v || undefined })} options={RESOURCE_TYPES.map((t) => ({ value: t, label: RESOURCE_TYPE_LABELS[t] }))} />
          <label className="flex h-10 items-center gap-2 text-sm">
            <Checkbox checked={filters.status === 'ALL'} onCheckedChange={(on) => setFilters({ status: on ? 'ALL' : undefined })} />
            Incluir inactivos
          </label>
        </div>
        <PermissionGate permission="budget.edit">
          <div className="flex flex-wrap gap-2">
            {permissions.includes('inventory.read') && (
              <Button variant="secondary" onClick={() => setImporting(true)}>
                <Download /> Importar desde inventario
              </Button>
            )}
            <Button onClick={() => setCreating(true)}>
              <Plus /> Nuevo recurso
            </Button>
          </div>
        </PermissionGate>
      </div>

      {resources.isError ? (
        <ErrorState onRetry={() => void resources.refetch()} />
      ) : resources.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando recursos">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : data && data.total === 0 ? (
        <EmptyState icon={Search} title="No hay recursos" description="Registra materiales, mano de obra, equipos y transporte con su precio." />
      ) : (
        data && (
          <>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="fur-code">{r.code}</TableCell>
                      <TableCell className="font-medium">
                        {r.name} {r.status === 'INACTIVE' && <Badge variant="outline">Inactivo</Badge>}
                      </TableCell>
                      <TableCell>{resourceTypeLabel(r.resourceType)}</TableCell>
                      <TableCell>{r.unit}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatUnitPrice(r.unitPrice, r.currency)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" aria-label={`Historial de ${r.code}`} onClick={() => setHistoryOf(r)}>
                          <History /> Historial
                        </Button>
                        <PermissionGate permission="budget.edit">
                          <Button size="sm" variant="ghost" aria-label={`Cambiar precio de ${r.code}`} onClick={() => setPriceOf(r)}>
                            <Pencil /> Precio
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`${r.status === 'ACTIVE' ? 'Desactivar' : 'Activar'} ${r.code}`}
                            onClick={() => update.mutateAsync({ id: r.id, status: r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }).catch((e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo actualizar'))}
                          >
                            <Power /> {r.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                          </Button>
                        </PermissionGate>
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

      <RatesPanel slug={slug} />

      {historyOf && <HistoryDialog slug={slug} resource={historyOf} onClose={() => setHistoryOf(null)} />}
      {priceOf && (
        <FieldsDialog
          title={`Cambiar precio · ${priceOf.code}`}
          description="Queda en el historial. Los presupuestos aprobados no cambian."
          fields={[
            { name: 'unitPrice', label: 'Nuevo precio', type: 'number', required: true, min: 0, step: 0.0001 },
            { name: 'currency', label: 'Moneda', type: 'select', required: true, options: currencies.map((c) => ({ value: c, label: c })) },
            { name: 'note', label: 'Motivo', type: 'textarea', placeholder: 'Opcional: cotización, proveedor…' },
          ]}
          initial={{ unitPrice: String(priceOf.unitPrice), currency: priceOf.currency }}
          submitLabel="Guardar precio"
          onClose={() => setPriceOf(null)}
          onSubmit={(v) => update.mutateAsync({ id: priceOf.id, unitPrice: Number(v.unitPrice), currency: String(v.currency), note: String(v.note ?? '').trim() || undefined })}
        />
      )}
      {creating && (
        <FieldsDialog
          title="Nuevo recurso"
          fields={[
            { name: 'code', label: 'Código', required: true, placeholder: 'MAT-CEM' },
            { name: 'name', label: 'Nombre', required: true },
            { name: 'resourceType', label: 'Tipo', type: 'select', required: true, options: RESOURCE_TYPES.map((t) => ({ value: t, label: RESOURCE_TYPE_LABELS[t] })) },
            { name: 'unit', label: 'Unidad', required: true, placeholder: 'BOL, M3, HH, HM…', help: 'Mano de obra y equipo se precian por hora (HH / HM).' },
            { name: 'unitPrice', label: 'Precio unitario', type: 'number', required: true, min: 0, step: 0.0001 },
            { name: 'currency', label: 'Moneda', type: 'select', options: currencies.map((c) => ({ value: c, label: c })), help: 'Si no eliges, se usa la moneda base.' },
          ]}
          initial={{ resourceType: 'MATERIAL' }}
          submitLabel="Crear recurso"
          onClose={() => setCreating(false)}
          onSubmit={(v) => create.mutateAsync({ code: String(v.code).trim(), name: String(v.name).trim(), resourceType: v.resourceType as ResourceType, unit: String(v.unit).trim(), unitPrice: Number(v.unitPrice), currency: String(v.currency || '') || undefined })}
        />
      )}
      {importing && (
        <FieldsDialog
          title="Importar desde inventario"
          description="Toma el costo promedio vigente del ítem como precio del recurso (queda vinculado a su origen)."
          fields={[
            { name: 'itemId', label: 'Ítem de inventario', type: 'select', required: true, options: (inventory.data?.items ?? []).filter((i) => i.unitCost !== null).map((i) => ({ value: i.id, label: `${i.sku} — ${i.name} (${formatUnitPrice(i.unitCost)})` })) },
            { name: 'resourceType', label: 'Tipo de recurso', type: 'select', required: true, options: (['MATERIAL', 'EQUIPMENT', 'TRANSPORT'] as const).map((t) => ({ value: t, label: RESOURCE_TYPE_LABELS[t] })) },
          ]}
          initial={{ resourceType: 'MATERIAL' }}
          submitLabel="Importar"
          onClose={() => setImporting(false)}
          onSubmit={(v) => importer.mutateAsync({ itemId: String(v.itemId), resourceType: v.resourceType as 'MATERIAL' | 'EQUIPMENT' | 'TRANSPORT' })}
        />
      )}
    </>
  )
}
