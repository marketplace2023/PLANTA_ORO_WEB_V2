import { History, Pencil, ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '@/components/base/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkOrder } from '@/features/maintenance/use-maintenance'
import { usePlant } from '@/features/plant/plant-context'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { actionLabel, canMoveTo, isOpenStatus, typeLabel, type WorkOrderStatus } from '@/lib/maintenance'
import { PriorityBadge, WorkOrderStatusBadge } from './work-order-badges'
import { TransitionDialog } from './transition-dialog'
import { WorkOrderCosts } from './work-order-costs'
import { WorkOrderParts } from './work-order-parts'
import { WorkOrderFormDialog } from './work-order-form-dialog'

type Props = { slug: string; workOrderId: string; onClose: () => void }

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-fur-gray-600 uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

/** Detalle de una orden de trabajo: datos, acciones permitidas e historial. */
export function WorkOrderSheet({ slug, workOrderId, onClose }: Props) {
  const { data: wo, isLoading, isError, error, refetch } = useWorkOrder(slug, workOrderId)
  const { permissions } = usePlant()
  const { user } = useAuth()
  const [moveTo, setMoveTo] = useState<WorkOrderStatus | null>(null)
  const [editing, setEditing] = useState(false)

  // La UI solo ofrece las transiciones que el usuario puede ejecutar (el servidor valida igualmente).
  const actions = wo ? wo.nextStatuses.filter((to) => canMoveTo(to, wo, { permissions, userId: user?.id })) : []
  const canEdit = !!wo && isOpenStatus(wo.status) && permissions.includes('maintenance.update')
  const canRequestPurchase = !!wo && isOpenStatus(wo.status) && permissions.includes('procurement.create')
  // Registrar repuestos: quien edita la orden o su responsable, y con acceso para consultar el inventario.
  const canEditParts = !!wo && permissions.includes('inventory.read') && (permissions.includes('maintenance.update') || (!!user && wo.assignedTo?.id === user.id))
  // Registrar otros costos (mano de obra, equipos, servicios): quien edita la orden o su responsable; usar recursos del libro de precios exige budget.read.
  const canEditCosts = !!wo && (permissions.includes('maintenance.update') || (!!user && wo.assignedTo?.id === user.id))

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span className="fur-code">{wo?.code ?? 'Orden de trabajo'}</span>
          </SheetTitle>
          <SheetDescription>{wo?.title ?? 'Detalle de la orden'}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-8" />
              <Skeleton className="h-40" />
            </div>
          ) : error instanceof ApiError && error.status === 404 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-fur-gray-600">La orden no existe o no es visible para tu cuenta.</p>
          ) : isError || !wo ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <WorkOrderStatusBadge status={wo.status} />
                <PriorityBadge priority={wo.priority} />
                <Badge variant="secondary">{typeLabel(wo.type)}</Badge>
                {wo.overdue && (
                  <Badge variant="outline" className="border-fur-red-500 text-fur-red-500">
                    Atrasada
                  </Badge>
                )}
              </div>

              {(actions.length > 0 || canEdit || canRequestPurchase) && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Acciones de la orden">
                  {actions.map((to) => (
                    <Button key={to} size="sm" variant={to === 'CANCELLED' ? 'ghost' : 'default'} onClick={() => setMoveTo(to)}>
                      {actionLabel(wo.status, to)}
                    </Button>
                  ))}
                  {canEdit && (
                    <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                      <Pencil /> Editar
                    </Button>
                  )}
                  {canRequestPurchase && (
                    <Button asChild size="sm" variant="secondary">
                      <Link to={`/plants/${slug}/maintenance?tab=requisitions&new=1&forAsset=${wo.asset.id}&forWo=${wo.id}`}>
                        <ShoppingCart /> Solicitar compra
                      </Link>
                    </Button>
                  )}
                </div>
              )}

              {wo.description && <p className="text-sm whitespace-pre-wrap">{wo.description}</p>}

              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Fact label="Activo">
                  <Link to={`/plants/${slug}/assets/${wo.asset.id}`} className="underline-offset-2 hover:underline">
                    <span className="fur-code">{wo.asset.tag}</span> {wo.asset.name}
                  </Link>
                </Fact>
                <Fact label="Responsable">{wo.assignedTo?.name ?? 'Sin asignar'}</Fact>
                <Fact label="Solicitada por">{wo.requestedBy ?? '—'}</Fact>
                <Fact label="Fecha límite">{formatDateTime(wo.plannedEnd)}</Fact>
                <Fact label="Inicio real">{formatDateTime(wo.actualStart)}</Fact>
                <Fact label="Fin real">{formatDateTime(wo.actualEnd)}</Fact>
              </dl>

              {wo.completionNotes && (
                <section aria-labelledby="done-title">
                  <h3 id="done-title" className="mb-1 text-sm font-semibold text-fur-navy-900">
                    Trabajo realizado
                  </h3>
                  <p className="text-sm whitespace-pre-wrap">{wo.completionNotes}</p>
                </section>
              )}

              <WorkOrderParts slug={slug} workOrder={wo} canEdit={canEditParts} />

              <WorkOrderCosts slug={slug} workOrder={wo} canEdit={canEditCosts} canUseResources={permissions.includes('budget.read')} />

              <section aria-labelledby="history-title">
                <h3 id="history-title" className="mb-3 flex items-center gap-2 text-base font-semibold text-fur-navy-900">
                  <History className="size-4" /> Historial
                </h3>
                <ol className="space-y-3 border-l-2 border-border pl-5">
                  {wo.history.map((h) => (
                    <li key={h.id} className="relative">
                      <span className="absolute top-1.5 -left-[1.6rem] size-3 rounded-full border-2 border-card bg-fur-navy-800" aria-hidden />
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {h.fromStatus && (
                          <>
                            <WorkOrderStatusBadge status={h.fromStatus} /> <span aria-label="cambió a">→</span>
                          </>
                        )}
                        <WorkOrderStatusBadge status={h.toStatus} />
                      </div>
                      {h.note && <p className="mt-1 text-sm">{h.note}</p>}
                      <p className="mt-0.5 text-xs text-fur-gray-600">
                        {formatDateTime(h.changedAt)}
                        {h.changedBy && ` · ${h.changedBy}`}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>

              {moveTo && <TransitionDialog slug={slug} workOrder={wo} to={moveTo} onClose={() => setMoveTo(null)} />}
              {editing && <WorkOrderFormDialog open onOpenChange={setEditing} slug={slug} workOrder={wo} canAssign={permissions.includes('maintenance.update')} />}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
