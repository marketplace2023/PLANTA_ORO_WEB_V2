import { Lock } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { EmptyState } from '@/components/base/empty-state'
import { Button } from '@/components/ui/button'

/** Sección que solo ve quien tiene sesión. Se muestra en lugar del contenido; no se pide nada a la API. */
export function LockedSection() {
  const location = useLocation()
  const from = `${location.pathname}${location.search}`
  return (
    <EmptyState
      icon={Lock}
      title="Contenido para usuarios registrados"
      description="Inicia sesión o crea tu cuenta para ver esta sección. La información de cada planta solo la ve el personal de esa empresa."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/login" state={{ from }}>
              Iniciar sesión
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/register" state={{ from }}>
              Crear cuenta
            </Link>
          </Button>
        </div>
      }
    />
  )
}
