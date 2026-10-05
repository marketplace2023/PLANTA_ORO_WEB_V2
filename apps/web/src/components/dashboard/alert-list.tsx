import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SEVERITY_LABELS, type AlertSeverity, type DashboardAlert } from '@/lib/alerts'

const ICONS = { danger: AlertOctagon, warning: AlertTriangle, info: Info } as const
const TONE: Record<AlertSeverity, string> = { danger: 'text-fur-red-500', warning: 'text-fur-orange-500', info: 'text-fur-blue-500' }

/** Alertas con icono + etiqueta de texto + enlace al detalle (el estado nunca depende solo del color, design.md §1.7). */
export function AlertList({ alerts, emptyText = 'Sin alertas activas.' }: { alerts: DashboardAlert[]; emptyText?: string }) {
  if (alerts.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-fur-gray-600">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden /> {emptyText}
      </p>
    )
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {alerts.map((a) => {
        const Icon = ICONS[a.severity]
        return (
          <li key={a.id}>
            <Link to={a.to} className="flex items-center gap-3 px-4 py-3 text-sm outline-none hover:bg-muted focus-visible:bg-muted">
              <Icon className={`size-5 shrink-0 ${TONE[a.severity]}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="mr-2 text-xs font-semibold tracking-wide uppercase">{SEVERITY_LABELS[a.severity]}</span>
                {a.text}
              </span>
              <span className="shrink-0 text-xs text-fur-gray-600 underline underline-offset-2">Ver</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
