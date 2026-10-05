import type { ReactNode } from 'react'
import { usePlant } from '@/features/plant/plant-context'

type Props = {
  /** Código de permiso, p. ej. `asset.update`. */
  permission?: string
  /** Alternativa: basta con tener CUALQUIERA de estos permisos. */
  anyOf?: readonly string[]
  /** Contenido alternativo; por defecto no se renderiza nada (docs/design.md §47-48). */
  fallback?: ReactNode
  children: ReactNode
}

/** La UI nunca debe ofrecer una acción que el backend rechazará por falta de permisos. */
export function PermissionGate({ permission, anyOf, fallback = null, children }: Props) {
  const { permissions } = usePlant()
  const required = anyOf ?? (permission ? [permission] : [])
  const allowed = required.length > 0 && required.some((p) => permissions.includes(p))
  return allowed ? <>{children}</> : <>{fallback}</>
}
