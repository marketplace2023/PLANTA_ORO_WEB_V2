import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAssignees, useTransitionWorkOrder, type WorkOrderItem } from '@/features/maintenance/use-maintenance'
import { ApiError } from '@/lib/api'
import { actionLabel, statusLabel, type WorkOrderStatus } from '@/lib/maintenance'
import { ROLE_LABELS } from '@/lib/roles'

type Props = {
  slug: string
  workOrder: Pick<WorkOrderItem, 'id' | 'code' | 'title' | 'status' | 'assignedTo'>
  to: WorkOrderStatus
  onClose: () => void
  onDone?: () => void
}

/**
 * Pide lo que cada transición exige (responsable, trabajo realizado, motivo) antes de llamar al servidor.
 * El servidor valida lo mismo: aquí solo se evita un viaje inútil.
 */
export function TransitionDialog({ slug, workOrder, to, onClose, onDone }: Props) {
  const transition = useTransitionWorkOrder(slug, workOrder.id)
  const assignees = useAssignees(slug, needsAssignee(to))

  const [assignedTo, setAssignedTo] = useState(workOrder.assignedTo?.id ?? '')
  const [completionNotes, setCompletionNotes] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErrors({})
    setFormError(undefined)

    const next: Record<string, string> = {}
    if (needsAssignee(to) && !assignedTo) next.assignedTo = 'Selecciona al responsable'
    if (to === 'COMPLETED' && !completionNotes.trim()) next.completionNotes = 'Indica qué trabajo se realizó'
    if (to === 'CANCELLED' && !note.trim()) next.note = 'Indica el motivo de la cancelación'
    if (Object.keys(next).length > 0) return setErrors(next)

    try {
      await transition.mutateAsync({
        to,
        ...(needsAssignee(to) && { assignedTo }),
        ...(to === 'COMPLETED' && { completionNotes: completionNotes.trim() }),
        ...(note.trim() && { note: note.trim() }),
      })
      toast.success(`${workOrder.code}: ${statusLabel(to)}`)
      onClose()
      onDone?.()
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else if (err instanceof ApiError && err.status === 403) setFormError('No tienes permiso para esta acción.')
      else setFormError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado. Inténtalo de nuevo.')
    }
  }

  const fieldError = (key: string) => errors[key] && <p className="text-sm text-fur-red-500">{errors[key]}</p>

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {actionLabel(workOrder.status, to)}: {workOrder.code}
          </DialogTitle>
          <DialogDescription>
            {workOrder.title} · {statusLabel(workOrder.status)} → {statusLabel(to)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {needsAssignee(to) && (
            <div className="space-y-1.5">
              <Label htmlFor="assignedTo">Responsable</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger id="assignedTo" className="h-10 w-full" aria-label="Responsable" aria-invalid={!!errors.assignedTo}>
                  <SelectValue placeholder={assignees.isLoading ? 'Cargando…' : 'Selecciona una persona'} />
                </SelectTrigger>
                <SelectContent>
                  {(assignees.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {a.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError('assignedTo')}
            </div>
          )}

          {to === 'COMPLETED' && (
            <div className="space-y-1.5">
              <Label htmlFor="completionNotes">Trabajo realizado</Label>
              <Textarea id="completionNotes" value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} aria-invalid={!!errors.completionNotes} />
              {fieldError('completionNotes')}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="note">{to === 'CANCELLED' ? 'Motivo de la cancelación' : 'Nota (opcional)'}</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={!!errors.note} />
            {fieldError('note')}
          </div>

          <div role="alert" aria-live="polite">
            {formError && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{formError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Volver
            </Button>
            <Button type="submit" variant={to === 'CANCELLED' ? 'destructive' : 'default'} disabled={transition.isPending}>
              {transition.isPending ? 'Guardando…' : actionLabel(workOrder.status, to)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function needsAssignee(to: WorkOrderStatus) {
  return to === 'ASSIGNED'
}
