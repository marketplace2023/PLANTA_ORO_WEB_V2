import { BadgeCheck, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Tag } from '@/features/organizations/use-organizations'
import { ratingText } from '@/lib/organizations'

/** Verificado por el administrador del ecosistema: icono + texto (el color no es el único canal). */
export function VerifiedBadge({ verified }: { verified: boolean }) {
  if (!verified) return null
  return (
    <Badge variant="outline" className="gap-1 border-fur-green-500 text-fur-green-500">
      <BadgeCheck aria-hidden /> Verificado
    </Badge>
  )
}

export function Rating({ rating }: { rating: number | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm" title={rating === null ? 'Aún sin calificaciones' : undefined}>
      <Star className={rating === null ? 'size-4 text-fur-gray-500' : 'size-4 fill-fur-orange-500 text-fur-orange-500'} aria-hidden />
      <span className={rating === null ? 'text-fur-gray-600' : 'font-medium'}>{ratingText(rating)}</span>
    </span>
  )
}

/** Etapas como etiquetas; si hay muchas, muestra las primeras y el conteo del resto. */
export function StageTags({ stages, max = 3 }: { stages: Tag[]; max?: number }) {
  if (stages.length === 0) return <span className="text-xs text-fur-gray-600">Sin etapas indicadas</span>
  const shown = stages.slice(0, max)
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Etapas">
      {shown.map((s) => (
        <li key={s.code}>
          <Badge variant="secondary" title={s.name}>
            <span className="fur-code">{s.code}</span> {s.name}
          </Badge>
        </li>
      ))}
      {stages.length > max && (
        <li>
          <Badge variant="outline" title={stages.slice(max).map((s) => s.name).join(', ')}>
            +{stages.length - max}
          </Badge>
        </li>
      )}
    </ul>
  )
}

/** Logo si el proveedor cargó uno; si no, sus iniciales. */
export function OrgLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return logoUrl ? (
    // URL elegida por la organización: sin enviar el referer y sin bloquear la carga de la página.
    <img src={logoUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-12 shrink-0 rounded-lg border border-border bg-card object-contain" />
  ) : (
    <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-lg bg-fur-navy-800 text-sm font-bold text-white">
      {initials}
    </span>
  )
}
