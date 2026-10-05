import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

type Props = {
  title: string
  /** `null` = dato no disponible: se muestra "—" con la explicación en `hint`, nunca un valor inventado. */
  value: number | string | null
  unit?: string
  icon: LucideIcon
  hint?: string
  tone?: 'default' | 'warning' | 'danger'
}

const TONE_COLOR = { default: 'var(--fur-navy-800)', warning: 'var(--fur-orange-500)', danger: 'var(--fur-red-500)' } as const

/** KpiCard (design.md §15): título, valor, unidad e icono. */
export function KpiCard({ title, value, unit, icon: Icon, hint, tone = 'default' }: Props) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted" style={{ color: TONE_COLOR[tone] }}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-fur-gray-600">{title}</p>
          <p className="text-2xl font-bold text-fur-navy-900">
            {value ?? '—'}
            {value !== null && unit && <span className="ml-1 text-sm font-medium text-fur-gray-600">{unit}</span>}
          </p>
          {hint && <p className="text-xs text-fur-gray-600">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
