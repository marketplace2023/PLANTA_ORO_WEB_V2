import { FileSpreadsheet, FolderPlus, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FieldsDialog } from '@/components/base/fields-dialog'
import { PermissionGate } from '@/components/base/permission-gate'
import { FilterChips, type Chip } from '@/components/data/filter-chips'
import { FilterSelect } from '@/components/data/filter-select'
import { Pagination } from '@/components/data/pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useBudgets, useCreateBudget, useCreateProject, useProjects } from '@/features/budget/use-budget'
import { BUDGET_STATUS_LABELS } from '@/lib/budget'
import { formatDate, formatMoney } from '@/lib/format'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const PAGE_SIZE = 25
type Props = { slug: string; filters: Record<string, string | undefined>; setFilters: (updates: Record<string, string | undefined>, keepPage?: boolean) => void }

export function BudgetStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === 'APPROVED' ? 'default' : 'outline'}>{BUDGET_STATUS_LABELS[status] ?? status}</Badge>
}

const pct = (v: string | boolean | undefined) => (v === '' || v === undefined || typeof v === 'boolean' ? 0 : Number(v))

/** Lista de presupuestos con proyecto, estado y total (con tasas aplicadas). Partidas sin precio se marcan como incompletas. */
export function BudgetsView({ slug, filters, setFilters }: Props) {
  const page = Math.max(1, Number(filters.page) || 1)
  const budgets = useBudgets(slug, filters, PAGE_SIZE)
  const projects = useProjects(slug)
  const createBudget = useCreateBudget(slug)
  const createProject = useCreateProject(slug)
  const [newBudget, setNewBudget] = useState(false)
  const [newProject, setNewProject] = useState(false)

  const [searchText, setSearchText] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchText, 300)
  useEffect(() => {
    if (debounced.trim() !== (filters.search ?? '')) setFilters({ search: debounced.trim() || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const chips: Chip[] = [
    filters.status && { key: 'status', label: 'Estado', value: BUDGET_STATUS_LABELS[filters.status] ?? filters.status },
    filters.projectId && { key: 'projectId', label: 'Proyecto', value: projects.data?.find((p) => p.id === filters.projectId)?.name ?? 'seleccionado' },
    filters.search && { key: 'search', label: 'Búsqueda', value: filters.search },
  ].filter((c): c is Chip => !!c)
  const clearAll = () => {
    setSearchText('')
    setFilters({ status: undefined, projectId: undefined, search: undefined })
  }

  const activeProjects = (projects.data ?? []).filter((p) => p.status === 'ACTIVE')
  const data = budgets.data
  const currency = data?.baseCurrency ?? 'USD'

  return (
    <>
      <PermissionGate permission="budget.edit">
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setNewProject(true)}>
            <FolderPlus /> Nuevo proyecto
          </Button>
          <Button onClick={() => setNewBudget(true)} disabled={activeProjects.length === 0} title={activeProjects.length === 0 ? 'Crea primero un proyecto' : undefined}>
            <Plus /> Nuevo presupuesto
          </Button>
        </div>
      </PermissionGate>

      <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1">
            <label htmlFor="bg-search" className="text-xs text-fur-gray-600">
              Buscar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fur-gray-500" aria-hidden />
              <Input id="bg-search" type="search" className="h-10 pl-9" placeholder="Código o nombre…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
          </div>
          <FilterSelect label="Estado" value={filters.status ?? ''} onChange={(v) => setFilters({ status: v || undefined })} options={Object.entries(BUDGET_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Proyecto" value={filters.projectId ?? ''} onChange={(v) => setFilters({ projectId: v || undefined })} options={(projects.data ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
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

      {budgets.isError ? (
        <ErrorState onRetry={() => void budgets.refetch()} />
      ) : budgets.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando presupuestos">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : data && data.total === 0 ? (
        chips.length > 0 ? (
          <EmptyState icon={Search} title="Ningún presupuesto coincide con los filtros" action={<Button variant="secondary" onClick={clearAll}>Limpiar filtros</Button>} />
        ) : (
          <EmptyState icon={FileSpreadsheet} title="Aún no hay presupuestos" description="Crea un proyecto y luego su presupuesto: capítulos, partidas con su APU y totales." />
        )
      ) : (
        data && (
          <>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Presupuesto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Partidas</TableHead>
                    <TableHead className="text-right">Costo directo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <Link to={`/plants/${slug}/budgets/${b.id}`} className="fur-code text-fur-navy-900 underline-offset-2 hover:underline">
                          {b.code}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{b.name}</div>
                        <div className="text-xs text-fur-gray-600">
                          {b.project.code} · {b.project.name}
                          {b.approvedAt && ` · aprobado el ${formatDate(b.approvedAt)}`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <BudgetStatusBadge status={b.status} />
                      </TableCell>
                      <TableCell className="text-right">{b.itemCount}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatMoney(b.direct, currency)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatMoney(b.total, currency)}
                        {b.incomplete && <div className="text-xs text-fur-red-500">Incompleto: hay partidas sin precio</div>}
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

      {newProject && (
        <FieldsDialog
          title="Nuevo proyecto"
          fields={[
            { name: 'code', label: 'Código', required: true, placeholder: 'PRJ-1', help: 'Único en la planta; se guarda en mayúsculas.' },
            { name: 'name', label: 'Nombre', required: true },
            { name: 'description', label: 'Descripción', type: 'textarea' },
          ]}
          submitLabel="Crear proyecto"
          onClose={() => setNewProject(false)}
          onSubmit={(v) => createProject.mutateAsync({ code: String(v.code).trim(), name: String(v.name).trim(), description: String(v.description ?? '').trim() || undefined })}
        />
      )}
      {newBudget && (
        <FieldsDialog
          title="Nuevo presupuesto"
          description="Las tasas se aplican sobre el costo directo (gastos generales y utilidad) y sobre el subtotal (impuesto)."
          fields={[
            { name: 'projectId', label: 'Proyecto', type: 'select', required: true, options: activeProjects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })) },
            { name: 'name', label: 'Nombre', required: true },
            { name: 'overheadPct', label: 'Gastos generales (%)', type: 'number', min: 0, step: 0.01 },
            { name: 'utilityPct', label: 'Utilidad (%)', type: 'number', min: 0, step: 0.01 },
            { name: 'taxPct', label: 'Impuesto (%)', type: 'number', min: 0, step: 0.01, help: 'IGV / IVA.' },
          ]}
          initial={{ overheadPct: '0', utilityPct: '0', taxPct: '0' }}
          submitLabel="Crear presupuesto"
          onClose={() => setNewBudget(false)}
          onSubmit={async (v) => {
            const created = await createBudget.mutateAsync({ projectId: String(v.projectId), name: String(v.name).trim(), overheadPct: pct(v.overheadPct), utilityPct: pct(v.utilityPct), taxPct: pct(v.taxPct) })
            toast.success(`Presupuesto ${created.code} creado como borrador`)
          }}
        />
      )}
    </>
  )
}
