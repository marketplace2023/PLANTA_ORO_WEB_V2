import { Factory, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PlantCard } from '@/components/industrial/plant-card'
import { PageHeader } from '@/components/layout/page-header'
import { PlantFormDialog } from '@/components/plant/plant-form-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { usePlant } from '@/features/plant/plant-context'
import { plantSection } from '@/lib/nav'

export function PlantsPage() {
  const { availablePlants, isLoadingPlants, plantsError, reloadPlants, selectPlant } = usePlant()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [creating, setCreating] = useState(false)

  // Venimos de una sección de planta de la barra sin planta elegida (`?next=budgets`): tras elegir, se abre esa sección.
  const target = plantSection(params.get('next'))
  const section = target?.path ?? 'dashboard'

  // Con una sola planta visible no hay nada que elegir: se entra directo a la sección pedida.
  const onlyPlant = target && !isLoadingPlants && availablePlants.length === 1 ? availablePlants[0] : null
  useEffect(() => {
    if (!onlyPlant) return
    selectPlant(onlyPlant.id)
    navigate(`/plants/${onlyPlant.slug}/${section}`, { replace: true })
  }, [onlyPlant, section, selectPlant, navigate])

  // Crear plantas es una acción del ecosistema (sin planta): solo el administrador del ecosistema.
  const canCreate = !!user?.isGlobalAdmin

  return (
    <>
      <PageHeader
        title="Plantas"
        description={target ? `Elige una planta para abrir ${target.label}.` : 'Selecciona una planta para ver sus procesos, activos y operación.'}
        actions={
          canCreate && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Nueva planta
            </Button>
          )
        }
      />

      {isLoadingPlants ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : plantsError ? (
        <ErrorState onRetry={() => reloadPlants?.()} />
      ) : availablePlants.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="No hay plantas visibles"
          description={
            user
              ? 'Aún no hay plantas disponibles para tu cuenta. Un administrador puede asignarte a una planta.'
              : 'Inicia sesión para ver más plantas o espera a que se publique alguna.'
          }
          action={
            canCreate && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Crear la primera planta
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {availablePlants.map((p) => (
            <PlantCard key={p.id} plant={p} section={section} />
          ))}
        </div>
      )}

      {creating && (
        <PlantFormDialog open onOpenChange={setCreating} onSaved={(p) => navigate(`/plants/${p.slug}/dashboard`)} />
      )}
    </>
  )
}
