import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { ErrorState } from '@/components/base/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkOrders, type WorkOrderItem } from '@/features/maintenance/use-maintenance'
import { usePlant } from '@/features/plant/plant-context'
import { formatDate } from '@/lib/format'
import { actionLabel, canMoveTo, KANBAN_COLUMNS, STATUS_META, typeLabel, type WorkOrderStatus } from '@/lib/maintenance'
import { PriorityBadge } from './work-order-badges'
import { TransitionDialog } from './transition-dialog'

const LIMIT = 100

function Card({ wo, onOpen, onMove }: { wo: WorkOrderItem; onOpen: (id: string) => void; onMove: (wo: WorkOrderItem, to: WorkOrderStatus) => void }) {
  const { permissions } = usePlant()
  const { user } = useAuth()
  const moves = wo.nextStatuses.filter((to) => canMoveTo(to, wo, { permissions, userId: user?.id }))

  return (
    <li className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => onOpen(wo.id)} className="min-w-0 text-left">
          <span className="fur-code text-xs text-fur-gray-600">{wo.code}</span>
          <span className="block text-sm font-medium text-fur-navy-900 hover:underline">{wo.title}</span>
        </button>
        {moves.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Mover ${wo.code}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {moves.map((to) => (
                <DropdownMenuItem key={to} onSelect={() => onMove(wo, to)}>
                  {actionLabel(wo.status, to)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p className="mt-1 text-xs text-fur-gray-600">
        <span className="fur-code">{wo.asset.tag}</span> · {typeLabel(wo.type)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={wo.priority} />
        {wo.overdue && (
          <Badge variant="outline" className="border-fur-red-500 text-fur-red-500">
            Atrasada · {formatDate(wo.plannedEnd)}
          </Badge>
        )}
      </div>
      {wo.assignedTo && <p className="mt-2 text-xs text-fur-gray-600">{wo.assignedTo.name}</p>}
    </li>
  )
}

/**
 * Tablero Kanban (design.md §38). Se mueve con un menú (no arrastrar y soltar): es accesible por teclado y
 * cada movimiento pasa por el diálogo que pide los datos obligatorios de la transición.
 */
export function KanbanView({ slug, onOpen }: { slug: string; onOpen: (id: string) => void }) {
  const orders = useWorkOrders(slug, { sort: 'createdAt', dir: 'desc' }, LIMIT)
  const [moving, setMoving] = useState<{ wo: WorkOrderItem; to: WorkOrderStatus } | null>(null)

  if (orders.isError) return <ErrorState onRetry={() => void orders.refetch()} />
  if (orders.isLoading || !orders.data) {
    return (
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7" aria-busy="true" aria-label="Cargando tablero">
        {KANBAN_COLUMNS.map((c) => (
          <Skeleton key={c} className="h-64" />
        ))}
      </div>
    )
  }

  const { items, total } = orders.data
  return (
    <>
      {total > LIMIT && <p className="mb-3 text-sm text-fur-gray-600">Mostrando las {LIMIT} órdenes más recientes de {total}. Usa la lista para ver el resto.</p>}
      <div className="grid gap-3 overflow-x-auto md:grid-cols-4 xl:grid-cols-7">
        {KANBAN_COLUMNS.map((status) => {
          const meta = STATUS_META[status]
          const column = items.filter((o) => o.status === status)
          const Icon = meta.icon
          return (
            <section key={status} aria-labelledby={`col-${status}`} className="min-w-52 rounded-lg bg-muted/60 p-2">
              <h3 id={`col-${status}`} className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold text-fur-navy-900">
                <Icon className="size-4" style={{ color: meta.color }} aria-hidden />
                {meta.label}
                <span className="fur-code ml-auto text-fur-gray-600" aria-label={`${column.length} órdenes`}>
                  {column.length}
                </span>
              </h3>
              <ul className="space-y-2">
                {column.map((wo) => (
                  <Card key={wo.id} wo={wo} onOpen={onOpen} onMove={(w, to) => setMoving({ wo: w, to })} />
                ))}
                {column.length === 0 && <li className="px-1 py-4 text-center text-xs text-fur-gray-500">Sin órdenes</li>}
              </ul>
            </section>
          )
        })}
      </div>
      {moving && <TransitionDialog slug={slug} workOrder={moving.wo} to={moving.to} onClose={() => setMoving(null)} />}
    </>
  )
}
