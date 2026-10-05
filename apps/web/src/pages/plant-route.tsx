import { SearchX } from 'lucide-react'
import { Link, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { usePlantDetail, type PlantDetail } from '@/features/plant/use-plant-data'

/**
 * Resuelve /plants/:plantSlug/*. Una planta privada a la que no tienes acceso responde 404 en el backend
 * (no revela su existencia), y aquí se muestra igual que una planta inexistente.
 */
export function PlantRoute() {
  const { plantSlug } = useParams()
  const { data, isLoading, error, refetch } = usePlantDetail(plantSlug)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        icon={SearchX}
        title="Planta no encontrada"
        description="La planta no existe o no tienes acceso a ella."
        action={
          <Button asChild variant="secondary">
            <Link to="/plants">Ver plantas disponibles</Link>
          </Button>
        }
      />
    )
  }
  if (error || !data) return <ErrorState onRetry={() => void refetch()} />

  return <Outlet context={data satisfies PlantDetail} />
}

// eslint-disable-next-line react-refresh/only-export-components
export const usePlantOutlet = () => useOutletContext<PlantDetail>()
