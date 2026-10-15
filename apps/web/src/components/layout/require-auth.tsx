import { Outlet } from 'react-router-dom'
import { LockedSection } from '@/components/base/locked-section'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'

/** Ruta que exige sesión: sin ella se ve el bloqueo con acceso a iniciar sesión o registrarse. */
export function RequireAuth() {
  const { status } = useAuth()
  if (status === 'loading') return <Skeleton className="h-40" aria-busy="true" aria-label="Cargando sesión" />
  if (status === 'anonymous') return <LockedSection />
  return <Outlet />
}
