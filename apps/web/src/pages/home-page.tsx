import { Activity, Cable, CircleCheck, CircleX } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { ErrorState } from '@/components/base/error-state'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useHealth, useNetworkCatalog, useStageCatalog } from '@/features/catalog/use-catalog'

function SystemStatus() {
  const { data, isLoading, isError } = useHealth()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-5 text-fur-navy-800" /> Salud del sistema
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {isLoading ? (
          <Skeleton className="h-6 w-48" />
        ) : (
          <>
            <Badge variant={isError ? 'destructive' : 'secondary'} className="gap-1.5">
              {isError ? <CircleX /> : <CircleCheck className="text-fur-green-500" />}
              API: {isError ? 'sin conexión' : 'en línea'}
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              {data?.database === 'up' ? <CircleCheck className="text-fur-green-500" /> : <CircleX className="text-fur-red-500" />}
              Base de datos: {data?.database === 'up' ? 'conectada' : 'sin conexión'}
            </Badge>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function NetworkCatalog() {
  const { data, isLoading, isError, refetch } = useNetworkCatalog()

  return (
    <section aria-labelledby="networks-title">
      <h2 id="networks-title" className="mb-3 flex items-center gap-2 text-xl text-fur-navy-900">
        <Cable className="size-5" /> Redes Transversales
      </h2>
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {isLoading
            ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24" />)
            : data?.map((n) => (
                <Card key={n.id} className="border-l-4" style={{ borderLeftColor: n.colorToken ? `var(--${n.colorToken})` : undefined }}>
                  <CardContent className="space-y-1">
                    <p className="fur-code text-fur-navy-900">{n.code}</p>
                    <p className="font-semibold">{n.name}</p>
                  </CardContent>
                </Card>
              ))}
        </div>
      )}
    </section>
  )
}

function StageCatalog() {
  const { data, isLoading, isError, refetch } = useStageCatalog()

  return (
    <section aria-labelledby="stages-title">
      <h2 id="stages-title" className="mb-3 text-xl text-fur-navy-900">
        Etapas del proceso
      </h2>
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-16" />)
            : data?.map((s) => (
                <Card key={s.id} size="sm">
                  <CardContent className="flex items-center gap-3">
                    <span className="fur-code rounded-md bg-fur-navy-900 px-2 py-1 text-fur-gold-400">{s.code}</span>
                    <span className="text-sm font-medium">{s.name}</span>
                  </CardContent>
                </Card>
              ))}
        </div>
      )}
    </section>
  )
}

export function HomePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Ecosistema Digital FUR"
        description="Plataforma multi-planta para plantas de beneficio de oro: activos, procesos, mantenimiento, inventario y más."
      />
      <SystemStatus />
      <NetworkCatalog />
      <StageCatalog />
    </div>
  )
}
