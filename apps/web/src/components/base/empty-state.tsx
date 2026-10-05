import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  icon: LucideIcon
  title: string
  description?: string
  /** Mostrar CTA solo si el usuario tiene permiso (docs/design.md §20). */
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-muted text-fur-navy-800">
        <Icon className="size-7" />
      </span>
      <h2 className="text-lg font-semibold text-fur-navy-900">{title}</h2>
      {description && <p className="max-w-md text-sm text-fur-gray-600">{description}</p>}
      {action}
    </div>
  )
}
