import { Activity, AlertTriangle, CheckCircle2, ClipboardList, Clock, Gauge, Layers, ListChecks, Timer, Wallet } from 'lucide-react'
import { ErrorState } from '@/components/base/error-state'
import { KpiCard } from '@/components/industrial/kpi-card'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMaintenanceDashboard, type MaintenanceDashboard } from '@/features/maintenance/use-maintenance'
import { formatDate, formatMoney } from '@/lib/format'
import { STATUS_META, TYPE_LABELS, WORK_ORDER_STATUSES, WORK_ORDER_TYPES } from '@/lib/maintenance'
import { PriorityBadge } from './work-order-badges'

function Bars({ title, entries, total }: { title: string; entries: Array<{ key: string; label: string; value: number; color: string }>; total: number }) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <h3 className="text-base font-semibold text-fur-navy-900">{title}</h3>
        {total === 0 ? (
          <p className="text-sm text-fur-gray-600">Sin datos.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e.key} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span>{e.label}</span>
                  <span className="fur-code">{e.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                  <div className="h-full rounded-full" style={{ width: `${(e.value / total) * 100}%`, backgroundColor: e.color }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Content({ d, onOpen }: { d: MaintenanceDashboard; onOpen: (id: string) => void }) {
  const statusEntries = WORK_ORDER_STATUSES.map((s) => ({ key: s, label: STATUS_META[s].label, value: d.byStatus[s] ?? 0, color: STATUS_META[s].color })).filter((e) => e.value > 0)
  const typeEntries = WORK_ORDER_TYPES.map((t) => ({ key: t, label: TYPE_LABELS[t], value: d.openByType[t] ?? 0, color: 'var(--fur-navy-800)' })).filter((e) => e.value > 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <KpiCard title="OT abiertas" value={d.open} icon={ClipboardList} />
        <KpiCard title="Backlog" value={d.backlog} icon={Layers} hint="Aún sin iniciar" />
        <KpiCard title="OT vencidas" value={d.overdue} icon={AlertTriangle} tone={d.overdue > 0 ? 'danger' : 'default'} />
        <KpiCard title="En ejecución" value={d.inProgress} icon={Activity} />
        <KpiCard title="Completadas (30 días)" value={d.completedLast30Days} icon={CheckCircle2} />
        <KpiCard title="MTTR" value={d.mttrHours} unit="h" icon={Timer} hint={d.mttrHours === null ? 'Sin correctivos terminados en 90 días' : 'Correctivos, últimos 90 días'} />
        <KpiCard title="Cumplimiento preventivo" value={d.preventiveCompliancePct} unit="%" icon={ListChecks} hint={d.preventiveCompliancePct === null ? 'Sin preventivos vencidos en 90 días' : 'A tiempo, últimos 90 días'} />
        <KpiCard title="MTBF" value={d.mtbfHours} unit="h" icon={Gauge} hint="Requiere registro de fallas (próximamente)" />
        <KpiCard
          title="Costo de órdenes (30 días)"
          value={formatMoney(d.totalCostLast30Days, d.currency)}
          icon={Wallet}
          hint={`Repuestos ${formatMoney(d.partsCostLast30Days, d.currency)} · mano de obra, equipos y servicios ${formatMoney(d.otherCostLast30Days, d.currency)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title="Órdenes abiertas por tipo" entries={typeEntries} total={d.open} />
        <Bars title="Órdenes por estado" entries={statusEntries} total={statusEntries.reduce((s, e) => s + e.value, 0)} />
      </div>

      <section aria-labelledby="overdue-title">
        <h3 id="overdue-title" className="mb-3 flex items-center gap-2 text-lg font-semibold text-fur-navy-900">
          <Clock className="size-5" /> Órdenes vencidas
        </h3>
        {d.overdueWorkOrders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-fur-gray-600">No hay órdenes vencidas. 👍</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {d.overdueWorkOrders.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => onOpen(o.id)} className="flex w-full flex-wrap items-center gap-3 p-3 text-left hover:bg-muted">
                  <span className="fur-code">{o.code}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{o.title}</span>
                  <span className="fur-code text-fur-gray-600">{o.asset.tag}</span>
                  <PriorityBadge priority={o.priority} />
                  <span className="text-sm text-fur-red-500">Venció el {formatDate(o.plannedEnd)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function DashboardView({ slug, onOpen }: { slug: string; onOpen: (id: string) => void }) {
  const { data, isLoading, isError, refetch } = useMaintenanceDashboard(slug)
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
  return <Content d={data} onOpen={onOpen} />
}
