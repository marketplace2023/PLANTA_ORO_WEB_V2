import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Tarjeta con título e icono, la unidad visual del geoportal. */
export function GeoPanel({
  title,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      <header className="flex items-center justify-between gap-2 border-b border-border bg-fur-navy-900 px-3 py-2 text-white">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="size-4 text-fur-gold-400" aria-hidden />}
          {title}
        </h2>
        {actions}
      </header>
      <div className={cn('p-3', bodyClassName)}>{children}</div>
    </section>
  )
}
