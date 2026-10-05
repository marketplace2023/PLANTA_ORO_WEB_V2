import { Cable, Eye, Pencil, Settings, Workflow } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { PermissionGate } from '@/components/base/permission-gate'
import { PlantOverview } from '@/components/dashboard/plant-overview'
import { ErrorState } from '@/components/base/error-state'
import { PageHeader } from '@/components/layout/page-header'
import { PlantFormDialog } from '@/components/plant/plant-form-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlantNetworks, usePlantStages } from '@/features/plant/use-plant-data'
import { ROLE_LABELS } from '@/lib/roles'
import { usePlantOutlet } from './plant-route'

const GROUP_COLORS: Record<string, string> = {
  orange: 'var(--fur-orange-500)',
  blue: 'var(--fur-blue-500)',
  green: 'var(--fur-green-500)',
  purple: 'var(--fur-purple-500)',
  yellow: 'var(--fur-yellow-500)',
  cyan: 'var(--fur-cyan-500)',
}

function AccessBanner({ roles, canWrite }: { roles: string[]; canWrite: boolean }) {
  if (roles.length === 0) {
    return (
      <p className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-fur-gray-600">
        <Eye className="size-4 shrink-0" /> Estás viendo esta planta en modo solo lectura.
      </p>
    )
  }
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-fur-gray-600">
      Tu rol en esta planta:
      {roles.map((r) => (
        <Badge key={r} variant="secondary">
          {ROLE_LABELS[r] ?? r}
        </Badge>
      ))}
      {!canWrite && <span>· Sin permisos de edición</span>}
    </div>
  )
}

export function PlantDashboardPage() {
  const plant = usePlantOutlet()
  const stages = usePlantStages(plant.slug)
  const networks = usePlantNetworks(plant.slug)
  const [editing, setEditing] = useState(false)

  const enabledStages = stages.data?.filter((s) => s.isEnabled) ?? []
  const enabledNetworks = networks.data?.filter((n) => n.isEnabled) ?? []

  return (
    <>
      <PageHeader
        title={plant.name}
        description={plant.description ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <PermissionGate anyOf={['user.read', 'plant.configure']}>
              <Button asChild variant="secondary">
                <Link to={`/plants/${plant.slug}/admin`}>
                  <Settings /> Administrar
                </Link>
              </Button>
            </PermissionGate>
            <PermissionGate permission="plant.update">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil /> Editar planta
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <AccessBanner roles={plant.access.roles} canWrite={plant.access.permissions.includes('plant.update')} />

      <PlantOverview slug={plant.slug} permissions={plant.access.permissions} />

      <section aria-labelledby="stages-title" className="mb-8">
        <h2 id="stages-title" className="mb-3 flex items-center gap-2 text-xl text-fur-navy-900">
          <Workflow className="size-5" /> Etapas del proceso
        </h2>
        {stages.isError ? (
          <ErrorState onRetry={() => void stages.refetch()} />
        ) : stages.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : enabledStages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-sm text-fur-gray-600">
            No hay etapas habilitadas o visibles en esta planta.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {enabledStages.map((s) => (
              <Card key={s.id} size="sm" className="border-l-4" style={{ borderLeftColor: GROUP_COLORS[s.colorToken ?? ''] }}>
                <CardContent className="flex items-center gap-3">
                  <span className="fur-code rounded-md bg-fur-navy-900 px-2 py-1 text-fur-gold-400">{s.code}</span>
                  <span className="text-sm font-medium">{s.displayName}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="networks-title">
        <h2 id="networks-title" className="mb-3 flex items-center gap-2 text-xl text-fur-navy-900">
          <Cable className="size-5" /> Redes Transversales
        </h2>
        {networks.isError ? (
          <ErrorState onRetry={() => void networks.refetch()} />
        ) : networks.isLoading ? (
          <Skeleton className="h-20" />
        ) : enabledNetworks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-sm text-fur-gray-600">
            No hay redes transversales habilitadas o visibles en esta planta.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {enabledNetworks.map((n) => (
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

      {editing && <PlantFormDialog open onOpenChange={setEditing} plant={plant} />}
    </>
  )
}
