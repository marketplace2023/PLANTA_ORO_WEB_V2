import type { ComponentProps, ReactNode } from 'react'
import { ModuleShortcuts } from './module-shortcuts'
import { usePlant } from '@/features/plant/plant-context'

type Props = {
  title: string
  description?: string
  actions?: ReactNode
  shortcutVariant?: ComponentProps<typeof ModuleShortcuts>['variant']
  hideShortcuts?: boolean
}

export function PageHeader({ title, description, actions, shortcutVariant, hideShortcuts = false }: Props) {
  const { currentPlant } = usePlant()
  return (
    <>
      <div className="page-banner">
      <div>
        {/* Contexto siempre visible (docs/design.md §54) */}
        <p className="banner-context">
          {currentPlant ? `Planta: ${currentPlant.name}` : 'Ecosistema global'}
        </p>
        <h1 className="banner-title">{title}</h1>
        {description && <p className="banner-description">{description}</p>}
      </div>
      {actions && <div className="banner-actions">{actions}</div>}
    </div>
      {!hideShortcuts && <ModuleShortcuts variant={shortcutVariant} />}
    </>
  )
}
