import type { ReactNode } from 'react'
import { usePlant } from '@/features/plant/plant-context'

type Props = {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: Props) {
  const { currentPlant } = usePlant()
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {/* Contexto siempre visible (docs/design.md §54) */}
        <p className="fur-code mb-1 text-fur-gray-600 uppercase">
          {currentPlant ? `Planta: ${currentPlant.name}` : 'Ecosistema global'}
        </p>
        <h1 className="text-3xl text-fur-navy-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-fur-gray-600">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
