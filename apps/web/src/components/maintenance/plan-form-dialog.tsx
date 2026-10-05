import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAssets } from '@/features/assets/use-assets'
import { useCreatePlan, useUpdatePlan, type MaintenancePlan } from '@/features/maintenance/use-maintenance'
import { ApiError } from '@/lib/api'
import {
  FREQUENCY_LABELS,
  FREQUENCY_UNITS,
  isoToLocalInput,
  localToIso,
  PLAN_TYPE_LABELS,
  PLAN_TYPES,
  PRIORITY_META,
  WORK_ORDER_PRIORITIES,
  type FrequencyUnit,
  type WorkOrderPriority,
} from '@/lib/maintenance'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  /** Si se pasa un plan, el formulario lo edita; si no, crea uno. */
  plan?: MaintenancePlan
  defaultAssetId?: string
}

export function PlanFormDialog({ open, onOpenChange, slug, plan, defaultAssetId }: Props) {
  const editing = !!plan
  const create = useCreatePlan(slug)
  const update = useUpdatePlan(slug)
  const pending = editing ? update.isPending : create.isPending
  const assets = useAssets(slug, {}, 100, !editing)

  const [assetId, setAssetId] = useState(defaultAssetId ?? '')
  const [name, setName] = useState(plan?.name ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')
  const [planType, setPlanType] = useState<MaintenancePlan['planType']>(plan?.planType ?? 'PREVENTIVE')
  const [priority, setPriority] = useState<WorkOrderPriority>(plan?.priority ?? 'MEDIUM')
  const [frequencyValue, setFrequencyValue] = useState(String(plan?.frequencyValue ?? 1))
  const [frequencyUnit, setFrequencyUnit] = useState<FrequencyUnit>(plan?.frequencyUnit ?? 'MONTHS')
  const [due, setDue] = useState(isoToLocalInput(plan?.nextDueAt))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErrors({})
    setFormError(undefined)

    const value = Number(frequencyValue)
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Requerido'
    if (!editing && !assetId) next.assetId = 'Selecciona el activo'
    if (!Number.isInteger(value) || value < 1) next.frequencyValue = 'Debe ser un entero mayor o igual a 1'
    if (!due) next[editing ? 'nextDueAt' : 'firstDueAt'] = 'Indica la fecha'
    if (Object.keys(next).length > 0) return setErrors(next)

    try {
      if (editing) {
        await update.mutateAsync({ id: plan.id, name: name.trim(), priority, frequencyValue: value, frequencyUnit, nextDueAt: localToIso(due) })
      } else {
        await create.mutateAsync({
          assetId,
          name: name.trim(),
          ...(description.trim() && { description: description.trim() }),
          planType,
          priority,
          frequencyValue: value,
          frequencyUnit,
          firstDueAt: localToIso(due)!,
        })
      }
      toast.success(editing ? 'Plan actualizado' : 'Plan creado')
      onOpenChange(false)
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
          <DialogTitle>{editing ? `Editar «${plan.name}»` : 'Nuevo plan de mantenimiento'}</DialogTitle>
          <DialogDescription>El plan genera órdenes de trabajo cuando lo indiques desde la lista de planes.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {!editing && (
            <div className="space-y-1.5">
              <Label htmlFor="plan-asset">Activo</Label>
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger id="plan-asset" className="h-10 w-full" aria-label="Activo" aria-invalid={!!errors.assetId}>
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
            <Label htmlFor="plan-name">Nombre</Label>
            <Input id="plan-name" className="h-10" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
            {err('name')}
          </div>

          {!editing && (
            <div className="space-y-1.5">
              <Label htmlFor="plan-description">Tareas / descripción</Label>
              <Textarea id="plan-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {!editing && (
              <div className="space-y-1.5">
                <Label htmlFor="plan-type">Tipo de plan</Label>
                <Select value={planType} onValueChange={(v) => setPlanType(v as MaintenancePlan['planType'])}>
                  <SelectTrigger id="plan-type" className="h-10 w-full" aria-label="Tipo de plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {PLAN_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="plan-priority">Prioridad</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as WorkOrderPriority)}>
                <SelectTrigger id="plan-priority" className="h-10 w-full" aria-label="Prioridad">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plan-freq">Cada</Label>
              <Input id="plan-freq" type="number" min={1} className="h-10" value={frequencyValue} onChange={(e) => setFrequencyValue(e.target.value)} aria-invalid={!!errors.frequencyValue} />
              {err('frequencyValue')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-unit">Unidad</Label>
              <Select value={frequencyUnit} onValueChange={(v) => setFrequencyUnit(v as FrequencyUnit)}>
                <SelectTrigger id="plan-unit" className="h-10 w-full" aria-label="Unidad">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {FREQUENCY_LABELS[u].many}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-due">{editing ? 'Próxima fecha' : 'Primera fecha'}</Label>
            <Input id="plan-due" type="datetime-local" className="h-10" value={due} onChange={(e) => setDue(e.target.value)} aria-invalid={!!errors.firstDueAt || !!errors.nextDueAt} />
            {err('firstDueAt')}
            {err('nextDueAt')}
          </div>

          <div role="alert" aria-live="polite">
            {formError && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{formError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
