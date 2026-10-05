import { Factory } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AssetFur } from '@/features/assets/use-assets'
import { AssetStatusBadge, CriticalityBadge } from './asset-badges'

/** Cabecera de la FUR (design.md §17): tag, nombre, estado, criticidad, planta y etapa. */
export function FurHeader({ fur, actions }: { fur: AssetFur; actions?: ReactNode }) {
  const { asset, plant, stage } = fur
  return (
    <header className="mb-6 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="fur-code text-3xl text-fur-navy-900">{asset.tag}</h1>
            <AssetStatusBadge status={asset.status} />
            <CriticalityBadge criticality={asset.criticality} />
          </div>
          <p className="mt-1 text-lg">{asset.name}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fur-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <Factory className="size-4" aria-hidden /> Planta {plant.name}
            </span>
            {stage && (
              <span>
                <span className="fur-code">{stage.code}</span> — {stage.name}
              </span>
            )}
            <span className="fur-code">{asset.furCode}</span>
          </p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  )
}
