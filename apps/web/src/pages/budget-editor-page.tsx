import { ArrowLeft, CheckCircle2, Copy, LockKeyhole, Pencil, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FieldsDialog } from '@/components/base/fields-dialog'
import { PermissionGate } from '@/components/base/permission-gate'
import { DeviationsView, ScenariosView } from '@/components/budget/analysis-view'
import { BudgetStatusBadge } from '@/components/budget/budgets-view'
import { StructureView } from '@/components/budget/structure-view'
import { TotalsPanel } from '@/components/budget/totals-panel'
import { ValuationsView } from '@/components/budget/valuations-view'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBudget, useBudgetAction, useUpdateBudget } from '@/features/budget/use-budget'
import { usePlant } from '@/features/plant/plant-context'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useUrlFilters } from '@/lib/use-url-filters'
import { usePlantOutlet } from './plant-route'

const errorText = (err: unknown) => (err instanceof ApiError ? (err.fieldErrors[0]?.message ?? err.message) : 'No se pudo completar la acción')
const pct = (v: string | boolean | undefined) => (v === '' || v === undefined || typeof v === 'boolean' ? 0 : Number(v))

/** Editor de un presupuesto (design.md §46): estructura, totales, escenarios, valorizaciones y desviaciones. */
export function BudgetEditorPage() {
  const plant = usePlantOutlet()
  const { budgetId } = useParams()
  const { permissions } = usePlant()
  const navigate = useNavigate()
  const { params, setParam } = useUrlFilters(['tab', 'chapter'])
  const { data: budget, isLoading, isError, error, refetch } = useBudget(plant.slug, budgetId)
  const update = useUpdateBudget(plant.slug, budgetId ?? '')
  const action = useBudgetAction(plant.slug, budgetId ?? '')
  const [editingRates, setEditingRates] = useState(false)
  const back = (
    <Button asChild variant="secondary">
      <Link to={`/plants/${plant.slug}/budgets?tab=budgets`}>
        <ArrowLeft /> Presupuestos
      </Link>
    </Button>
  )

  if (!permissions.includes('budget.read')) return <EmptyState icon={LockKeyhole} title="Sin acceso a Presupuestos" description="Los presupuestos son información interna de la planta." />
  if (error instanceof ApiError && error.status === 404) return <EmptyState icon={SearchX} title="Presupuesto no encontrado" description="No existe en esta planta." action={back} />
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isLoading || !budget) return <Skeleton className="h-64" aria-busy="true" />

  const draft = budget.status === 'DRAFT'
  const tabs = [
    ['items', 'Partidas'],
    ['scenarios', 'Escenarios'],
    ['valuations', 'Valorizaciones'],
    ...(draft ? [] : [['deviations', 'Desviaciones']]),
  ]
  const tab = tabs.find(([k]) => k === params.get('tab'))?.[0] ?? 'items'
  const c = budget.baseCurrency

  const run = (kind: 'approve' | 'close' | 'duplicate') =>
    action.mutateAsync(kind).then(
      (result) => {
        if (kind === 'duplicate') {
          toast.success(`Copia ${result.code} creada como borrador`)
          navigate(`/plants/${plant.slug}/budgets/${result.id}`)
        } else toast.success(kind === 'approve' ? 'Presupuesto aprobado: precios congelados' : 'Presupuesto cerrado')
      },
      (e) => toast.error(errorText(e)),
    )

  return (
    <>
      <PageHeader
        title={`${budget.code} · ${budget.name}`}
        description={`${budget.project.code} · ${budget.project.name} · moneda ${c}${budget.approvedAt ? ` · aprobado el ${formatDate(budget.approvedAt)}` : ''}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BudgetStatusBadge status={budget.status} />
            <PermissionGate permission="budget.edit">
              {draft && (
                <Button variant="secondary" onClick={() => setEditingRates(true)}>
                  <Pencil /> Tasas
                </Button>
              )}
              <Button variant="secondary" disabled={action.isPending} onClick={() => void run('duplicate')}>
                <Copy /> Duplicar
              </Button>
            </PermissionGate>
            <PermissionGate permission="budget.approve">
              {draft && (
                <Button disabled={action.isPending || budget.chapters.every((ch) => ch.items.length === 0) || budget.totals.incomplete} onClick={() => void run('approve')}>
                  <CheckCircle2 /> Aprobar
                </Button>
              )}
              {budget.status === 'APPROVED' && (
                <Button variant="secondary" disabled={action.isPending} onClick={() => void run('close')}>
                  Cerrar presupuesto
                </Button>
              )}
            </PermissionGate>
            {back}
          </div>
        }
      />
      {draft ? (
        <p className="mb-4 rounded-lg border border-border bg-card p-3 text-sm">Borrador: los precios son los vigentes del libro de precios. Al aprobar se congelan y la estructura ya no se puede editar.</p>
      ) : (
        <p className="mb-4 rounded-lg border border-border bg-card p-3 text-sm">Los precios y la estructura están congelados. Para cambiarlos, duplica el presupuesto y edita la copia.</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={(v) => setParam({ tab: v === 'items' ? undefined : v })}>
            <div className="mb-4 overflow-x-auto">
              <TabsList className="w-max">
                {tabs.map(([key, label]) => (
                  <TabsTrigger key={key} value={key}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
          {tab === 'items' && <StructureView slug={plant.slug} budget={budget} chapterId={params.get('chapter') ?? undefined} onChapter={(id) => setParam({ chapter: id })} />}
          {tab === 'scenarios' && <ScenariosView slug={plant.slug} budgetId={budget.id} currency={c} />}
          {tab === 'valuations' && <ValuationsView slug={plant.slug} budget={budget} />}
          {tab === 'deviations' && !draft && <DeviationsView slug={plant.slug} budgetId={budget.id} currency={c} />}
        </div>
        <div className="xl:sticky xl:top-4 xl:self-start">
          <TotalsPanel totals={budget.totals} rates={budget.rates} currency={c} incomplete={budget.totals.incomplete} />
        </div>
      </div>

      {editingRates && (
        <FieldsDialog
          title="Tasas del presupuesto"
          description="Gastos generales y utilidad se calculan sobre el costo directo; el impuesto, sobre el subtotal."
          fields={[
            { name: 'overheadPct', label: 'Gastos generales (%)', type: 'number', min: 0, step: 0.01 },
            { name: 'utilityPct', label: 'Utilidad (%)', type: 'number', min: 0, step: 0.01 },
            { name: 'taxPct', label: 'Impuesto (%)', type: 'number', min: 0, step: 0.01 },
          ]}
          initial={{ overheadPct: String(budget.rates.overheadPct), utilityPct: String(budget.rates.utilityPct), taxPct: String(budget.rates.taxPct) }}
          submitLabel="Guardar"
          onClose={() => setEditingRates(false)}
          onSubmit={(v) => update.mutateAsync({ overheadPct: pct(v.overheadPct), utilityPct: pct(v.utilityPct), taxPct: pct(v.taxPct) })}
        />
      )}
    </>
  )
}
