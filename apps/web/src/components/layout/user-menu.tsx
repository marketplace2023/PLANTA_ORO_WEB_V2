import { BookOpen, LogIn, LogOut, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/auth-context'
import { usePlant } from '@/features/plant/plant-context'
import { ROLE_LABELS } from '@/lib/roles'

export function UserMenu() {
  const { status, user, logout } = useAuth()
  const { roleCodes, currentPlant } = usePlant()
  const navigate = useNavigate()

  if (status === 'loading') return <span className="size-9 animate-pulse rounded-full bg-fur-navy-800" aria-hidden />

  if (!user) {
    return (
      <Button asChild size="sm" className="ml-2">
        <Link to="/login">
          <LogIn /> Iniciar sesión
        </Link>
      </Button>
    )
  }

  // Rol visible siempre (design.md §9): el de la planta actual, o el global si es administrador.
  const roleLabel = user.isGlobalAdmin
    ? ROLE_LABELS.ECOSYSTEM_ADMIN
    : roleCodes.length > 0
      ? roleCodes.map((r) => ROLE_LABELS[r] ?? r).join(', ')
      : 'Usuario común · solo lectura'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="ml-2 h-11 gap-2 px-2 text-white hover:bg-fur-navy-800 hover:text-white aria-expanded:bg-fur-navy-800"
          aria-label="Menú de usuario"
        >
          <span className="grid size-9 place-items-center rounded-full bg-fur-navy-800">
            <UserRound className="size-5" />
          </span>
          <span className="hidden flex-col items-start leading-tight xl:flex">
            <span className="text-sm font-semibold">{user.firstName} {user.lastName}</span>
            <span className="max-w-44 truncate text-xs font-normal text-white/70">{roleLabel}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block text-sm font-semibold text-foreground">{user.firstName} {user.lastName}</span>
          <span className="block text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {currentPlant ? `${currentPlant.name}: ` : ''}
            {roleLabel}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.isGlobalAdmin && (
          <DropdownMenuItem onSelect={() => navigate('/admin/catalog')}>
            <BookOpen /> Administrar catálogo
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={async () => {
            await logout()
            navigate('/')
          }}
        >
          <LogOut /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
