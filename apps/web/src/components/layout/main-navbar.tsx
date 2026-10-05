import { Link, NavLink } from 'react-router-dom'
import { NAV_ITEMS, type NavItem } from '@/lib/nav'
import { usePlant } from '@/features/plant/plant-context'
import { cn } from '@/lib/utils'

function useNavTarget() {
  const { currentPlant } = usePlant()
  return (item: NavItem) => {
    if (item.scope === 'global') return item.path
    if (currentPlant) return `/plants/${currentPlant.slug}/${item.path}`
    // Sin planta elegida: o hay un destino global propio (Dashboards) o se va a la lista de plantas recordando la sección pedida.
    return item.globalPath ?? `/plants?next=${item.path}`
  }
}

type Props = {
  orientation?: 'horizontal' | 'vertical'
  onNavigate?: () => void
}

export function MainNavbar({ orientation = 'horizontal', onNavigate }: Props) {
  const target = useNavTarget()
  const { currentPlant } = usePlant()
  const vertical = orientation === 'vertical'

  const classes = (active: boolean) =>
    cn(
      'flex h-11 items-center gap-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
      vertical ? 'rounded-md' : 'border-b-2',
      active
        ? vertical
          ? 'bg-fur-gold-500 text-fur-navy-900'
          : 'border-fur-gold-500 text-fur-gold-400'
        : vertical
          ? 'text-white hover:bg-fur-navy-800'
          : 'border-transparent text-white/80 hover:text-white',
    )

  return (
    <nav aria-label="Navegación principal" className={cn('flex gap-1', vertical && 'flex-col')}>
      {NAV_ITEMS.map((item) =>
        item.scope === 'plant' && !currentPlant && !item.globalPath ? (
          // Sin planta, todas estas secciones apuntan a /plants: un Link simple (no NavLink) para que no se marquen
          // todas como "activas" a la vez cuando estás en la lista de plantas.
          <Link key={item.label} to={target(item)} onClick={onNavigate} title="Elige una planta para abrir esta sección" className={classes(false)}>
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        ) : (
          <NavLink key={item.label} to={target(item)} end={item.path === '/'} onClick={onNavigate} className={({ isActive }) => classes(isActive)}>
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </NavLink>
        ),
      )}
    </nav>
  )
}
