import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { PlantSummary } from '@/features/plant/plant-context'
import { useCreatePlant, useUpdatePlant, type PlantInput } from '@/features/plant/use-plant-data'
import { ApiError } from '@/lib/api'
import { VISIBILITY_LABELS } from '@/lib/roles'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si se pasa una planta, el formulario edita; si no, crea. */
  plant?: PlantSummary
  onSaved?: (plant: PlantSummary) => void
}

/** Crear/editar planta. Quien lo muestra debe protegerlo con PermissionGate; el backend lo valida igualmente. */
export function PlantFormDialog({ open, onOpenChange, plant, onSaved }: Props) {
  const editing = !!plant
  const create = useCreatePlant()
  const update = useUpdatePlant(plant?.slug ?? '')
  const mutation = editing ? update : create

  const [form, setForm] = useState<PlantInput>({
    code: plant?.code ?? '',
    name: plant?.name ?? '',
    description: plant?.description ?? '',
    visibility: plant?.visibility ?? 'PRIVATE',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErrors({})
    setFormError(undefined)
    try {
      const saved = editing
        ? await update.mutateAsync({ name: form.name, description: form.description, visibility: form.visibility })
        : await create.mutateAsync({ ...form, description: form.description || undefined })
      toast.success(editing ? 'Planta actualizada' : 'Planta creada')
      onOpenChange(false)
      onSaved?.(saved)
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      } else if (err instanceof ApiError && err.status === 403) {
        setFormError('No tienes permiso para esta acción.')
      } else {
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar. Inténtalo de nuevo.')
      }
    }
  }

  const invalid = (key: string) => ({ 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `${key}-error` : undefined })
  const fieldError = (key: string) =>
    errors[key] && (
      <p id={`${key}-error`} className="text-sm text-fur-red-500">
        {errors[key]}
      </p>
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar planta' : 'Nueva planta'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'El código y la dirección (slug) no se pueden cambiar.'
              : 'Por defecto la planta es privada: solo la verán sus miembros.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" className="h-10" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} {...invalid('name')} />
            {fieldError('name')}
          </div>

          {!editing && (
            <div className="space-y-1.5">
              <Label htmlFor="code">Código</Label>
              <Input id="code" className="fur-code h-10" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} {...invalid('code')} />
              {fieldError('code')}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} {...invalid('description')} />
            {fieldError('description')}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="visibility">Visibilidad</Label>
            <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v as PlantInput['visibility'] })}>
              <SelectTrigger id="visibility" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(VISIBILITY_LABELS) as Array<keyof typeof VISIBILITY_LABELS>).map((v) => (
                  <SelectItem key={v} value={v}>
                    {VISIBILITY_LABELS[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div role="alert" aria-live="polite">
            {formError && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{formError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear planta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
