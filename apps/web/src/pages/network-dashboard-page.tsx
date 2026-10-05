import { AlertTriangle, Clock, Network, Package, SearchX, Wrench } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { AssetStatusBadge, CriticalityBadge } from '@/components/industrial/asset-badges'
import { KpiCard } from '@/components/industrial/kpi-card'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useNetworkDashboard } from '@/features/process/use-process'
import { ApiError } from '@/lib/api'
import { ASSET_CRITICALITIES, criticalityLabel, statusLabel } from '@/lib/assets'
import { networkColor } from '@/lib/process'
import { usePlantOutlet } from './plant-route'

function Bars({ title, entries }: { title: string; entries: Array<{ key: string; label: string; value: number }> }) {
  const total = entries.reduce((s, e) => s + e.value, 0)
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
                  <div className="h-full rounded-full bg-fur-navy-800" style={{ width: `${(e.value / total) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Dashboard propio de una red transversal (arquitectura §34): estado, criticidad, etapas y activos que requieren atención. */
export function NetworkDashboardPage() {
  const plant = usePlantOutlet()
  const { code } = useParams()
  const { data, isLoading, isError, error, refetch } = useNetworkDashboard(plant.slug, code)
  const back = (
    <Button asChild variant="secondary">
      <Link to={`/plants/${plant.slug}/networks`}>Ver todas las redes</Link>
    </Button>
  )

  if (error instanceof ApiError && error.status === 404) {
    return <EmptyState icon={SearchX} title="Red no disponible" description="La red no está habilitada en esta planta o no es visible para tu cuenta." action={back} />
  }
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isLoading || !data) return <Skeleton className="h-64" aria-busy="true" />

  const { network, assets, workOrders } = data
  return (
    <>
      <PageHeader title={network.name} description={network.description ?? undefined} actions={back} />
      <p className="mb-4 flex items-center gap-2 text-sm text-fur-gray-600">
        <span className="size-3 rounded-full" style={{ backgroundColor: networkColor(network.colorToken) }} aria-hidden />
        <span className="fur-code">{network.code}</span>
      </p>

      {assets === null ? (
        <EmptyState icon={Network} title="Activos no publicados" description="La planta no publica los activos de esta red para visitantes." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Activos de la red" value={assets.total} icon={Package} />
            <KpiCard
              title="Requieren atención"
              value={assets.attention.length}
              icon={AlertTriangle}
              tone={assets.attention.length > 0 ? 'danger' : 'default'}
              hint="Crítico, fuera de servicio, en reparación o mantenimiento"
            />
            {workOrders && (
              <>
                <KpiCard title="OT abiertas" value={workOrders.open} icon={Wrench} />
                <KpiCard title="OT vencidas" value={workOrders.overdue} icon={Clock} tone={workOrders.overdue > 0 ? 'danger' : 'default'} />
              </>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Bars title="Por estado" entries={Object.entries(assets.byStatus).map(([k, v]) => ({ key: k, label: statusLabel(k), value: v }))} />
            <Bars title="Por criticidad" entries={ASSET_CRITICALITIES.filter((c) => assets.byCriticality[c]).map((c) => ({ key: c, label: criticalityLabel(c), value: assets.byCriticality[c] }))} />
            <Bars title="Por etapa" entries={assets.byStage.map((s) => ({ key: s.code ?? 'none', label: s.code ? `${s.code} · ${s.name}` : 'Sin etapa', value: s.count }))} />
          </div>

          <section aria-labelledby="attn-title">
            <h3 id="attn-title" className="mb-3 flex items-center gap-2 text-lg font-semibold text-fur-navy-900">
              <AlertTriangle className="size-5" /> Activos que requieren atención
            </h3>
            {assets.attention.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-fur-gray-600">Ningún activo de esta red requiere atención.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {assets.attention.map((a) => (
                  <li key={a.id}>
                    <Link to={`/plants/${plant.slug}/assets/${a.id}`} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted">
                      <span className="fur-code">{a.tag}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                      <CriticalityBadge criticality={a.criticality} />
                      <AssetStatusBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  )
}
