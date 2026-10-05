import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAssets } from '@/features/assets/use-assets'
import { useAssignees, useCreateWorkOrder, useUpdateWorkOrder, type WorkOrderDetail } from '@/features/maintenance/use-maintenance'
import { ApiError } from '@/lib/api'
import {
  isoToLocalInput,
  localToIso,
  PRIORITY_META,
  TYPE_LABELS,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_TYPES,
  type WorkOrderPriority,
  type WorkOrderType,
} from '@/lib/maintenance'

const NO_ONE = '__none__'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  /** Si se pasa una OT, el formulario la edita; si no, solicita una nueva. */
  workOrder?: WorkOrderDetail
  /** Preselecciona el activo (p. ej. desde su ficha FUR). */
  defaultAssetId?: string
  /** Quien puede editar puede además elegir responsable (maintenance.update). */
  canAssign?: boolean
  onSaved?: (wo: WorkOrderDetail) => void
}

/** Solicitud (maintenance.create) y edición (maintenance.update) de órdenes de trabajo. */
export function WorkOrderFormDialog({ open, onOpenChange, slug, workOrder, defaultAssetId, canAssign = false, onSaved }: Props) {
  const editing = !!workOrder
  const create = useCreateWorkOrder(slug)
  const update = useUpdateWorkOrder(slug, workOrder?.id ?? '')
  const pending = editing ? update.isPending : create.isPending

  const assets = useAssets(slug, {}, 100, !editing)
  const assignees = useAssignees(slug, editing && canAssign)

  const [assetId, setAssetId] = useState(defaultAssetId ?? '')
  const [title, setTitle] = useState(workOrder?.title ?? '')
  const [description, setDescription] = useState(workOrder?.description ?? '')
  const [type, setType] = useState<WorkOrderType>(workOrder?.type ?? 'CORRECTIVE')
  const [priority, setPriority] = useState<WorkOrderPriority>(workOrder?.priority ?? 'MEDIUM')
  const [plannedEnd, setPlannedEnd] = useState(isoToLocalInput(workOrder?.plannedEnd))
  const [assignedTo, setAssignedTo] = useState(workOrder?.assignedTo?.id ?? NO_ONE)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErrors({})
    setFormError(undefined)

    const next: Record<string, string> = {}
    if (!title.trim()) next.title = 'Requerido'
    if (!editing && !assetId) next.assetId = 'Selecciona el activo'
    if (Object.keys(next).length > 0) return setErrors(next)

    try {
      const saved = editing
        ? await update.mutateAsync({
            title: title.trim(),
            description: description.trim() || null,
            type,
            priority,
            plannedEnd: localToIso(plannedEnd) ?? null,
            ...(canAssign && { assignedTo: assignedTo === NO_ONE ? null : assignedTo }),
          })
        : await create.mutateAsync({
            assetId,
            title: title.trim(),
            ...(description.trim() && { description: description.trim() }),
            type,
            priority,
            ...(plannedEnd && { plannedEnd: localToIso(plannedEnd) }),
          })
      toast.success(editing ? 'Orden actualizada' : `Solicitud creada: ${saved.code}`)
      onOpenChange(false)
      onSaved?.(saved)
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else if (err instanceof ApiError && err.status === 403) setFormError('No tienes permiso para esta acción.')
      else setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar. Inténtalo de nuevo.')
    }
  }

  const err = (key: string) => errors[key] && <p className="text-sm text-fur-red-500">{errors[key]}</p>

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar ${workOrder.code}` : 'Solicitar mantenimiento'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Los cambios de estado se hacen desde las acciones de la orden.' : 'Describe el problema; el equipo de mantenimiento la planificará y asignará.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {!editing && (
            <div className="space-y-1.5">
              <Label htmlFor="assetId">Activo</Label>
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger id="assetId" className="h-10 w-full" aria-label="Activo" aria-invalid={!!errors.assetId}>
                  <SelectValue placeholder={assets.isLoading ? 'Cargando activos…' : 'Selecciona el activo'} />
                </SelectTrigger>
                <SelectContent>
                  {(assets.data?.items ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.tag} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err('assetId')}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="wo-title">Título</Label>
            <Input id="wo-title" className="h-10" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} />
            {err('title')}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wo-description">Descripción</Label>
            <Textarea id="wo-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wo-type">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as WorkOrderType)}>
                <SelectTrigger id="wo-type" className="h-10 w-full" aria-label="Tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_ORDER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wo-priority">Prioridad</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as WorkOrderPriority)}>
                <SelectTrigger id="wo-priority" className="h-10 w-full" aria-label="Prioridad">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_ORDER_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wo-end">Fecha límite (opcional)</Label>
            <Input id="wo-end" type="datetime-local" className="h-10" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} aria-invalid={!!errors.plannedEnd} />
            {err('plannedEnd')}
          </div>

          {editing && canAssign && (
            <div className="space-y-1.5">
              <Label htmlFor="wo-assignee">Responsable</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger id="wo-assignee" className="h-10 w-full" aria-label="Responsable" aria-invalid={!!errors.assignedTo}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ONE}>Sin responsable</SelectItem>
                  {(assignees.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err('assignedTo')}
            </div>
          )}

          <div role="alert" aria-live="polite">
            {formError && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{formError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Enviar solicitud'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
