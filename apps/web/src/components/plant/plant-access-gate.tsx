import { Clock, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { Button } from '@/components/ui/button'
import { useMyAccessRequests, useRequestAccess } from '@/features/plant/use-access-requests'
import { ApiError } from '@/lib/api'

/** Pantalla para quien tiene sesión pero no pertenece a la planta: no ve ningún dato y puede solicitar acceso. */
export function PlantAccessGate({ plantName, plantSlug }: { plantName: string; plantSlug: string }) {
  const mine = useMyAccessRequests()
  const request = useRequestAccess()
  const current = mine.data?.find((r) => r.plantSlug === plantSlug && r.status === 'PENDING')
  const rejected = mine.data?.find((r) => r.plantSlug === plantSlug && r.status === 'REJECTED')

  const ask = () =>
    request.mutate(
      { plant: plantSlug },
      {
        onSuccess: () => toast.success('Solicitud enviada. El administrador la revisará.'),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo enviar la solicitud'),
      },
    )

  if (current) {
    return (
      <EmptyState
        icon={Clock}
        title="Solicitud de acceso pendiente"
        description={`Tu solicitud para ${plantName} está en revisión. Cuando el administrador la apruebe verás aquí la información de la planta.`}
      />
    )
  }

  return (
    <EmptyState
      icon={Lock}
      title={`No perteneces a ${plantName}`}
      description={
        rejected?.decisionNote
          ? `Tu solicitud anterior fue rechazada: ${rejected.decisionNote}. Puedes volver a solicitarla.`
          : 'La información de la planta solo la ve su personal. Solicita acceso y el administrador del ecosistema lo revisará.'
      }
      action={
        <Button onClick={ask} disabled={request.isPending || mine.isLoading}>
          {request.isPending ? 'Enviando…' : 'Solicitar acceso'}
        </Button>
      }
    />
  )
}
