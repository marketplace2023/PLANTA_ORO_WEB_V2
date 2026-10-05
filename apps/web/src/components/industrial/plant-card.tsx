import { Eye, Factory, Globe, Lock, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { PlantSummary } from '@/features/plant/plant-context'
import { VISIBILITY_LABELS } from '@/lib/roles'

const VISIBILITY_ICON = { PUBLIC: Globe, AUTHENTICATED: Eye, PRIVATE: Lock } as const

const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Activa', INACTIVE: 'Inactiva', ARCHIVED: 'Archivada' }

/** PlantCard (design.md §15). Estado = icono + texto + color, nunca solo color (§1.7). */
export function PlantCard({ plant, section = 'dashboard' }: { plant: PlantSummary; /** Sección de planta a abrir (por defecto el tablero). */ section?: string }) {
  const Visibility = VISIBILITY_ICON[plant.visibility]
  const active = plant.status === 'ACTIVE'

  return (
    <Link
      to={`/plants/${plant.slug}/${section}`}
      className="group block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-fur-navy-900 text-fur-gold-400">
              <Factory className="size-6" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-fur-navy-900">{plant.name}</h3>
              <p className="fur-code text-fur-gray-600">{plant.code}</p>
            </div>
          </div>

          {plant.description && <p className="line-clamp-3 text-sm text-fur-gray-600">{plant.description}</p>}

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="secondary" className="gap-1.5">
              <span className={`size-2 rounded-full ${active ? 'bg-fur-green-500' : 'bg-fur-gray-500'}`} aria-hidden />
              {STATUS_LABELS[plant.status] ?? plant.status}
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Visibility className="size-3.5" />
              {VISIBILITY_LABELS[plant.visibility]}
            </Badge>
            {plant.countryCode && (
              <span className="ml-auto flex items-center gap-1 text-xs text-fur-gray-600">
                <MapPin className="size-3.5" /> {plant.countryCode}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
