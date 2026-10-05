import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useStageCatalog } from '@/features/catalog/use-catalog'
import { useCreateService, useUpdateService, type ContractorService } from '@/features/organizations/use-organizations'
import { ApiError } from '@/lib/api'
import { specialtyLabel } from '@/lib/organizations'
import { CheckGroup } from './check-group'

/** Alta o edición de un servicio del contratista. */
export function ServiceFormDialog({ contractorId, service, onClose }: { contractorId: string; service?: ContractorService; onClose: () => void }) {
  const create = useCreateService(contractorId)
  const update = useUpdateService(contractorId)
  const stages = useStageCatalog()
  const [name, setName] = useState(service?.name ?? '')
  const [description, setDescription] = useState(service?.description ?? '')
  const [serviceType, setServiceType] = useState(service ? specialtyLabel(service.serviceType) : '')
  const [stageCodes, setStageCodes] = useState(service?.stages.map((s) => s.code) ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Requerido'
    if (serviceType.trim().length < 2) next.serviceType = 'Indica la especialidad (mínimo 2 caracteres)'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    try {
      if (service) await update.mutateAsync({ id: service.id, name: name.trim(), description: description.trim() || undefined, serviceType: serviceType.trim(), stageCodes })
      else await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined, serviceType: serviceType.trim(), stageCodes })
      toast.success(service ? 'Servicio actualizado' : 'Servicio creado')
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else setErrors({ _form: err instanceof ApiError ? err.message : 'No se pudo guardar. Inténtalo de nuevo.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{service ? 'Editar servicio' : 'Nuevo servicio'}</DialogTitle>
          <DialogDescription>Los servicios activos aparecen en Servicios Profesionales, filtrables por etapa y especialidad.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="sf-name">Nombre</Label>
            <Input id="sf-name" className="h-10" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-sm text-fur-red-500">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-type">Especialidad</Label>
            <Input id="sf-type" className="h-10" placeholder="Mecánica, Instrumentación, Automatización…" value={serviceType} onChange={(e) => setServiceType(e.target.value)} aria-invalid={!!errors.serviceType} />
            {errors.serviceType && <p className="text-sm text-fur-red-500">{errors.serviceType}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-desc">Descripción</Label>
            <Textarea id="sf-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <CheckGroup legend="Etapas que atiende" options={(stages.data ?? []).map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))} value={stageCodes} onChange={setStageCodes} error={errors.stageCodes} />
          <div role="alert" aria-live="polite">
            {errors._form && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{errors._form}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Guardando…' : service ? 'Guardar cambios' : 'Crear servicio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
