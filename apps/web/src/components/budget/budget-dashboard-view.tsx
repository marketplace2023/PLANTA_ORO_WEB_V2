import { Activity, AlertTriangle, Boxes, Calculator, ClipboardCheck, FileSpreadsheet, Percent, Wallet } from 'lucide-react'
import { ErrorState } from '@/components/base/error-state'
import { KpiCard } from '@/components/industrial/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useBudgetSummary, type Summary } from '@/features/budget/use-budget'
import { formatMoney, formatPct } from '@/lib/format'

function Content({ d }: { d: Summary }) {
  const c = d.baseCurrency
  const by = d.budgetsByStatus
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <KpiCard title="Presupuestos" value={d.budgetCount} icon={FileSpreadsheet} hint={`${by.DRAFT ?? 0} en borrador · ${by.APPROVED ?? 0} aprobados · ${by.CLOSED ?? 0} cerrados`} />
        <KpiCard title="Presupuesto aprobado" value={formatMoney(d.approvedTotal, c)} icon={Wallet} hint="Con gastos generales, utilidad e impuestos" />
        <KpiCard title="Costo directo aprobado" value={formatMoney(d.approvedDirect, c)} icon={Calculator} />
        <KpiCard title="Valorizado (ejecutado)" value={formatMoney(d.executedTotal, c)} icon={ClipboardCheck} hint={`Directo: ${formatMoney(d.executedDirect, c)}`} />
        <KpiCard title="Avance" value={d.progressPct === null ? null : formatPct(d.progressPct)} icon={Percent} hint={d.progressPct === null ? 'Aún no hay presupuestos aprobados' : 'Valorizado sobre el costo directo aprobado'} />
        <KpiCard
          title="Desviación de precios"
          value={formatMoney(d.priceDriftDirect, c)}
          icon={AlertTriangle}
          tone={d.priceDriftDirect > 0 ? 'danger' : 'default'}
          hint="Costo directo vigente menos el congelado, en presupuestos aprobados"
        />
        <KpiCard title="APU activos" value={d.apuCount} icon={Activity} />
        <KpiCard title="Recursos activos" value={d.resourceCount} icon={Boxes} />
      </div>
    </div>
  )
}

export function BudgetDashboardView({ slug }: { slug: string }) {
  const { data, isLoading, isError, refetch } = useBudgetSummary(slug)
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Cargando indicadores">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  }
  return <Content d={data} />
}
