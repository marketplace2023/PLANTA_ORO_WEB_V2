import { CalendarClock, Pause, Pencil, Play, Plus, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGeneratePlan, usePlans, useUpdatePlan, type MaintenancePlan } from '@/features/maintenance/use-maintenance'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { frequencyText, PLAN_TYPE_LABELS } from '@/lib/maintenance'
import { PriorityBadge } from './work-order-badges'
import { PlanFormDialog } from './plan-form-dialog'

/** Planes de mantenimiento: generan órdenes bajo demanda y avanzan su próxima fecha. */
export function PlansView({ slug, onOpenOrder }: { slug: string; onOpenOrder: (id: string) => void }) {
  const plans = usePlans(slug)
  const generate = useGeneratePlan(slug)
  const update = useUpdatePlan(slug)
  const [dialog, setDialog] = useState<{ plan?: MaintenancePlan } | null>(null)

  async function onGenerate(plan: MaintenancePlan) {
    try {
      const wo = await generate.mutateAsync(plan.id)
      toast.success(`Orden ${wo.code} generada`)
      onOpenOrder(wo.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo generar la orden.')
    }
  }

  async function onToggle(plan: MaintenancePlan) {
    try {
      await update.mutateAsync({ id: plan.id, status: plan.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar el plan.')
    }
  }

  if (plans.isError) return <ErrorState onRetry={() => void plans.refetch()} />
  if (plans.isLoading || !plans.data) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Cargando planes">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <PermissionGate permission="maintenance.update">
          <Button onClick={() => setDialog({})}>
            <Plus /> Nuevo plan
          </Button>
        </PermissionGate>
      </div>

      {plans.data.total === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No hay planes de mantenimiento"
          description="Un plan define cada cuánto se hace un trabajo sobre un activo y genera las órdenes."
          action={
            <PermissionGate permission="maintenance.update">
              <Button onClick={() => setDialog({})}>
                <Plus /> Crear el primer plan
              </Button>
            </PermissionGate>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Frecuencia</TableHead>
                <TableHead>Próxima fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.data.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <PriorityBadge priority={p.priority} />
                  </TableCell>
                  <TableCell>
                    <span className="fur-code">{p.asset.tag}</span> <span className="text-fur-gray-600">{p.asset.name}</span>
                  </TableCell>
                  <TableCell>{PLAN_TYPE_LABELS[p.planType]}</TableCell>
                  <TableCell>{frequencyText(p.frequencyValue, p.frequencyUnit)}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {formatDate(p.nextDueAt)}
                      {p.overdue && (
                        <Badge variant="outline" className="border-fur-red-500 text-fur-red-500">
                          Vencido
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-card font-medium text-foreground">
                      {p.status === 'ACTIVE' ? 'Activo' : 'Pausado'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <PermissionGate permission="maintenance.update">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="secondary" disabled={p.status !== 'ACTIVE' || generate.isPending} onClick={() => void onGenerate(p)} aria-label={`Generar orden de ${p.name}`}>
                          <Wand2 /> Generar OT
                        </Button>
                        <Button size="icon-sm" variant="ghost" onClick={() => void onToggle(p)} aria-label={`${p.status === 'ACTIVE' ? 'Pausar' : 'Reactivar'} ${p.name}`}>
                          {p.status === 'ACTIVE' ? <Pause /> : <Play />}
                        </Button>
                        <Button size="icon-sm" variant="ghost" onClick={() => setDialog({ plan: p })} aria-label={`Editar ${p.name}`}>
                          <Pencil />
                        </Button>
                      </div>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog && <PlanFormDialog open onOpenChange={(o) => !o && setDialog(null)} slug={slug} plan={dialog.plan} />}
    </>
  )
}
