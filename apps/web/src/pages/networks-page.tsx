import { AlertTriangle, Network } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PageHeader } from '@/components/layout/page-header'
import { StatusSummary } from '@/components/process/status-summary'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useNetworkOverview } from '@/features/process/use-process'
import { networkColor } from '@/lib/process'
import { usePlantOutlet } from './plant-route'

/** Redes Transversales (design.md §37): solo las habilitadas en la planta actual, cada una con su dashboard. */
export function NetworksPage() {
  const plant = usePlantOutlet()
  const { data, isLoading, isError, refetch } = useNetworkOverview(plant.slug)

  return (
    <>
      <PageHeader title="Redes Transversales" description="Redes habilitadas en esta planta y el estado de los activos que las componen." />
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando redes">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={Network} title="No hay redes habilitadas" description="Un administrador de planta puede habilitar las redes que la planta usa desde Administrar → Redes." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((n) => (
            <li key={n.id}>
              <Card className="h-full border-l-4" style={{ borderLeftColor: networkColor(n.colorToken) }}>
                <CardContent className="space-y-2">
                  <h2 className="text-base font-semibold text-fur-navy-900">
                    <Link to={`/plants/${plant.slug}/networks/${n.code}`} className="underline-offset-2 hover:underline">
                      {n.name}
                    </Link>
                  </h2>
                  <p className="fur-code text-xs text-fur-gray-600">{n.code}</p>
                  {n.description && <p className="text-sm text-fur-gray-600">{n.description}</p>}
                  <p className="text-sm font-medium">{n.assetCount === null ? 'Activos no publicados' : `${n.assetCount} ${n.assetCount === 1 ? 'activo' : 'activos'}`}</p>
                  {n.attentionAssets ? (
                    <Badge variant="outline" className="gap-1 border-fur-red-500 text-fur-red-500">
                      <AlertTriangle aria-hidden /> {n.attentionAssets} requieren atención
                    </Badge>
                  ) : null}
                  <div>
                    <StatusSummary counts={n.statusCounts} total={n.assetCount} />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
