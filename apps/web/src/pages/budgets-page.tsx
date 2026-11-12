import { LockKeyhole } from 'lucide-react'
import { EmptyState } from '@/components/base/empty-state'
import { ApusView } from '@/components/budget/apus-view'
import { BudgetDashboardView } from '@/components/budget/budget-dashboard-view'
import { BudgetsView } from '@/components/budget/budgets-view'
import { ResourcesView } from '@/components/budget/resources-view'
import { PageHeader } from '@/components/layout/page-header'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlant } from '@/features/plant/plant-context'
import { useUrlFilters } from '@/lib/use-url-filters'
import { usePlantOutlet } from './plant-route'
import { LuloPlantOverview } from './lulo-pages'
import { LuloMasterWorkspace } from '@/features/lulo/master-workspace'
import { LuloWorksPortfolio } from '@/features/lulo/works-portfolio'

const TABS = [
  ['masters', 'Maestros y estimación'],
  ['lulo', 'Presupuestos LULO'],
  ['works', 'Obras y clientes'],
  ['contracts', 'Contratos y ejecución'],
  ['dashboard', 'Dashboard'],
  ['budgets', 'Presupuestos'],
  ['apus', 'APU'],
  ['resources', 'Recursos y precios'],
] as const

/** Presupuestos (LULO, design.md §28 y §46). Es información interna de la planta: sin budget.read no se muestra. */
export function BudgetsPage() {
  const plant = usePlantOutlet()
  const { permissions } = usePlant()
  const { params, filters, setParam } = useUrlFilters(['tab'])
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'masters') as (typeof TABS)[number][0]

  if (!permissions.includes('budget.read')) {
    return (
      <>
        <PageHeader title="Presupuestos (LULO)" />
        <EmptyState icon={LockKeyhole} title="Sin acceso a Presupuestos" description="Los presupuestos, APU y precios son información interna de la planta. Solicita acceso a un administrador de planta." />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Presupuestos (LULO)" description="Presupuestos con capítulos y partidas, APU, libro de precios, escenarios y valorizaciones." hideShortcuts={tab === 'lulo'} />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          // Cambiar de pestaña descarta los filtros de la anterior.
          setParam({ tab: v, status: undefined, type: undefined, search: undefined, page: undefined, projectId: undefined }, true)
        }
      >
        <div className="mb-4 overflow-x-auto">
          <TabsList className="w-max">
            {TABS.map(([key, label]) => (
              <TabsTrigger key={key} value={key}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {tab === 'lulo' && <LuloPlantOverview />}
      {tab === 'masters' && <LuloMasterWorkspace plant={plant} canEdit={permissions.includes('budget.edit')} />}
      {(tab === 'works' || tab === 'contracts') && <LuloWorksPortfolio key={tab} slug={plant.slug} canEdit={permissions.includes('budget.edit')} canApprove={permissions.includes('budget.approve')} initialTab={tab} presetDocument={params.get('documentId') ?? undefined} />}
      {tab === 'dashboard' && <BudgetDashboardView slug={plant.slug} />}
      {tab === 'budgets' && <BudgetsView slug={plant.slug} filters={filters} setFilters={setParam} />}
      {tab === 'apus' && <ApusView slug={plant.slug} filters={filters} setFilters={setParam} />}
      {tab === 'resources' && <ResourcesView slug={plant.slug} filters={filters} setFilters={setParam} />}
    </>
  )
}
