import { ChevronDown, Lock, type LucideIcon } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useIsAnonymous } from '@/features/auth/auth-context'
import { NAV_ITEMS, PORTAL_NAV_GROUPS, navTarget, type NavItem } from '@/lib/nav'
import { usePlant } from '@/features/plant/plant-context'
import { cn } from '@/lib/utils'

const HomeIcon = NAV_ITEMS[0].icon

type Props = {
  orientation?: 'horizontal' | 'vertical'
  onNavigate?: () => void
}

export function MainNavbar({ orientation = 'horizontal', onNavigate }: Props) {
  const anonymous = useIsAnonymous()
  const locked = (item: NavItem) => anonymous && !['/', '/catalog', 'budgets'].includes(item.path)
  const { currentPlant } = usePlant()
  const vertical = orientation === 'vertical'
  const { pathname } = useLocation()
  const target = (item: NavItem) => anonymous && item.path === 'budgets' ? '/budgets' : navTarget(item, currentPlant?.slug)
  const isActiveItem = (item: NavItem) => {
    if (item.scope === 'plant' && !currentPlant && !item.globalPath) return false
    const path = target(item)
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  const classes = (active: boolean) =>
    cn(
      'flex h-10 items-center gap-1.5 px-3 text-xs font-medium whitespace-nowrap transition-colors',
      vertical ? 'rounded-md' : 'border-b-2',
      active
        ? vertical
          ? 'bg-fur-gold-500 text-fur-navy-900'
          : 'border-fur-navy-900 bg-white/40 text-fur-navy-950'
        : vertical
          ? 'text-fur-navy-950 hover:bg-white/40'
          : 'border-transparent text-fur-navy-950 hover:bg-white/30',
    )

  const renderGroup = (label: string, items: NavItem[], Icon: LucideIcon) => (
    <DropdownMenu key={label} modal={false}>
      <DropdownMenuTrigger className={cn(classes(items.some(isActiveItem)), 'nav-group-trigger')}>
        <Icon className="size-4 shrink-0" aria-hidden />
        {label} <ChevronDown className="size-3.5 transition-transform" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" sideOffset={8} className="nav-more-panel">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((section) => (
          <DropdownMenuItem key={section.path} asChild>
            {section.scope === 'plant' && !currentPlant && !section.globalPath ? (
              <Link to={target(section)} onClick={onNavigate} title="Elige una planta para abrir esta sección">
                <section.icon aria-hidden />{section.label}
                {locked(section) && <Lock className="ml-auto size-3 opacity-60" aria-hidden />}
              </Link>
            ) : (
              <NavLink to={target(section)} onClick={onNavigate}>
                <section.icon aria-hidden />{section.label}
                {locked(section) && <Lock className="ml-auto size-3 opacity-60" aria-hidden />}
              </NavLink>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <nav aria-label="Navegación principal" className={cn('flex gap-1', vertical && 'flex-col')}>
      <NavLink to={navTarget(NAV_ITEMS[0])} end onClick={onNavigate} className={({ isActive }) => classes(isActive)}>
        <HomeIcon className="size-4 shrink-0" aria-hidden />{NAV_ITEMS[0].label}
      </NavLink>
      {PORTAL_NAV_GROUPS.map((group) => renderGroup(group.label, group.items, group.icon))}
    </nav>
  )
}
