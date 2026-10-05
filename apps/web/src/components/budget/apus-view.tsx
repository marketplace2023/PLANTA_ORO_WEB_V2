import { AlertTriangle, Calculator, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FieldsDialog } from '@/components/base/fields-dialog'
import { PermissionGate } from '@/components/base/permission-gate'
import { Pagination } from '@/components/data/pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useApus, useCreateApu } from '@/features/budget/use-budget'
import { formatQuantity, formatUnitPrice } from '@/lib/format'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { useNavigate } from 'react-router-dom'

const PAGE_SIZE = 25
type Props = { slug: string; filters: Record<string, string | undefined>; setFilters: (updates: Record<string, string | undefined>, keepPage?: boolean) => void }

/** Biblioteca de APU (análisis de precios unitarios) de la planta, con su precio vigente. */
export function ApusView({ slug, filters, setFilters }: Props) {
  const navigate = useNavigate()
  const page = Math.max(1, Number(filters.page) || 1)
  const apus = useApus(slug, filters, PAGE_SIZE)
  const create = useCreateApu(slug)
  const [creating, setCreating] = useState(false)

  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced.trim() !== (filters.search ?? '')) setFilters({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const data = apus.data
  const currency = data?.baseCurrency ?? 'USD'
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 space-y-1">
            <label htmlFor="apu-search" className="text-xs text-fur-gray-600">
              Buscar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input id="apu-search" type="search" className="h-10 pl-9" placeholder="Código o nombre…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>
          <label className="flex h-10 items-center gap-2 text-sm">
            <Checkbox checked={filters.status === 'ALL'} onCheckedChange={(on) => setFilters({ status: on ? 'ALL' : undefined })} />
            Incluir inactivos
          </label>
        </div>
        <PermissionGate permission="budget.edit">
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nuevo APU
          </Button>
        </PermissionGate>
      </div>

      {apus.isError ? (
        <ErrorState onRetry={() => void apus.refetch()} />
      ) : apus.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando APU">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : data && data.total === 0 ? (
        <EmptyState icon={Calculator} title="No hay APU" description="Un APU define el costo directo de una unidad de trabajo: materiales, mano de obra, equipos y transporte." />
      ) : (
        data && (
          <>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>APU</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Rendimiento</TableHead>
                    <TableHead className="text-right">Recursos</TableHead>
                    <TableHead className="text-right">Precio unitario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link to={`/plants/${slug}/budgets/apus/${a.id}`} className="fur-code text-fur-navy-900 underline-offset-2 hover:underline">
                          {a.code}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        {a.name} {a.status === 'INACTIVE' && <Badge variant="outline">Inactivo</Badge>}
                      </TableCell>
                      <TableCell>{a.unit}</TableCell>
                      <TableCell className="text-right">{formatQuantity(a.yieldValue)}</TableCell>
                      <TableCell className="text-right">{a.lineCount}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {a.unitPrice === null ? (
                          <span className="inline-flex items-center gap-1 text-fur-red-500">
                            <AlertTriangle className="size-4" aria-hidden /> Falta tipo de cambio: {a.missingRates.join(', ')}
                          </span>
                        ) : (
                          formatUnitPrice(a.unitPrice, currency)
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

      {creating && (
        <FieldsDialog
          title="Nuevo APU"
          description="Después agregarás sus recursos (materiales, mano de obra, equipos, transporte)."
          fields={[
            { name: 'code', label: 'Código', required: true, placeholder: 'APU-CONC-210' },
            { name: 'name', label: 'Nombre', required: true },
            { name: 'unit', label: 'Unidad', required: true, placeholder: 'M3, M2, ML, UND…' },
            { name: 'yieldValue', label: 'Rendimiento (unidades por jornada)', type: 'number', required: true, min: 0, step: 0.0001, help: 'Lo que produce la cuadrilla en una jornada; afecta mano de obra y equipo.' },
            { name: 'hoursPerDay', label: 'Horas por jornada', type: 'number', required: true, min: 0, step: 0.5 },
            { name: 'description', label: 'Descripción', type: 'textarea' },
          ]}
          initial={{ yieldValue: '1', hoursPerDay: '8' }}
          submitLabel="Crear APU"
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            const created = await create.mutateAsync({
              code: String(v.code).trim(),
              name: String(v.name).trim(),
              unit: String(v.unit).trim(),
              yieldValue: Number(v.yieldValue),
              hoursPerDay: Number(v.hoursPerDay),
              description: String(v.description ?? '').trim() || undefined,
            })
            navigate(`/plants/${slug}/budgets/apus/${created.id}`)
          }}
        />
      )}
    </>
  )
}
