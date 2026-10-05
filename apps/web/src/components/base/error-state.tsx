import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  message?: string
  onRetry?: () => void
}

/** Error con mensaje + reintentar (docs/design.md §20). */
export function ErrorState({ message = 'No se pudo cargar la información.', onRetry }: Props) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg border border-fur-red-500/30 bg-fur-red-500/5 p-4 text-sm text-fur-gray-800"
    >
      <AlertCircle className="size-5 shrink-0 text-fur-red-500" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  )
}
