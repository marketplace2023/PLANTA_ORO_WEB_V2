import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  useCatalogModels,
  useCreateAsset,
  useUpdateAsset,
  type AssetDetail,
  type AssetInput,
} from '@/features/assets/use-assets'
import { usePlantNetworks, usePlantStages } from '@/features/plant/use-plant-data'
import { ApiError } from '@/lib/api'
import { ASSET_CRITICALITIES, ASSET_STATUSES, criticalityLabel, statusLabel, type AssetCriticality, type AssetStatus } from '@/lib/assets'

const NO_STAGE = '__none__'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  plantSlug: string
  /** Si se pasa un activo, el formulario edita; si no, crea. */
  asset?: AssetDetail
  onSaved?: (asset: AssetDetail) => void
}

/**
 * Alta/edición de activo. Las etapas y redes ofrecidas son solo las habilitadas en la planta (§47):
 * la UI no ofrece lo que el backend rechazaría. Quien lo muestra lo protege con PermissionGate.
 */
export function AssetFormDialog({ open, onOpenChange, plantSlug, asset, onSaved }: Props) {
  const editing = !!asset
  const create = useCreateAsset(plantSlug)
  const update = useUpdateAsset(plantSlug, asset?.id ?? '')
  const pending = editing ? update.isPending : create.isPending

  const models = useCatalogModels({}, 100)
  const stages = usePlantStages(plantSlug)
  const networks = usePlantNetworks(plantSlug)

  const [form, setForm] = useState({
    tag: asset?.tag ?? '',
    name: asset?.name ?? '',
    assetModelId: asset?.model.id ?? '',
    stageCode: asset?.stage?.code ?? NO_STAGE,
    serialNumber: asset?.serialNumber ?? '',
    status: (asset?.status ?? 'OPERATIVE') as AssetStatus,
    statusReason: '',
    criticality: (asset?.criticality ?? 'MEDIUM') as AssetCriticality,
    location: asset?.location ?? '',
    isPublic: asset?.isPublic ?? false,
    networkCodes: asset?.networks.map((n) => n.code) ?? ([] as string[]),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))
  const statusChanged = editing && form.status !== asset.status

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErrors({})
    setFormError(undefined)

    const next: Record<string, string> = {}
    if (!form.tag.trim()) next.tag = 'Requerido'
    if (!form.name.trim()) next.name = 'Requerido'
    if (!form.assetModelId) next.assetModelId = 'Selecciona un modelo del catálogo'
    if (Object.keys(next).length > 0) return setErrors(next)

    const common: AssetInput = {
      tag: form.tag.trim(),
      name: form.name.trim(),
      assetModelId: form.assetModelId,
      criticality: form.criticality,
      isPublic: form.isPublic,
      networkCodes: form.networkCodes,
      status: form.status,
    }
    const stageCode = form.stageCode === NO_STAGE ? null : form.stageCode

    try {
      const saved = editing
        ? await update.mutateAsync({
            ...common,
            stageCode,
            serialNumber: form.serialNumber.trim() || null,
            location: form.location.trim() || null,
            ...(statusChanged && form.statusReason.trim() && { statusReason: form.statusReason.trim() }),
          })
        : await create.mutateAsync({
            ...common,
            ...(stageCode && { stageCode }),
            ...(form.serialNumber.trim() && { serialNumber: form.serialNumber.trim() }),
            ...(form.location.trim() && { location: form.location.trim() }),
          })
      toast.success(editing ? 'Activo actualizado' : `Activo creado: ${saved.furCode}`)
      onOpenChange(false)
      onSaved?.(saved)
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      } else if (err instanceof ApiError && err.status === 403) {
        setFormError('No tienes permiso para esta acción.')
      } else if (err instanceof ApiError && err.status === 409) {
        setErrors({ tag: err.message })
      } else {
        setFormError(err instanceof ApiError ? err.message : 'No se pudo guardar. Inténtalo de nuevo.')
      }
    }
  }

  const a11y = (key: string) => ({ 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `${key}-error` : undefined })
  const fieldError = (key: string) =>
    errors[key] && (
      <p id={`${key}-error`} className="text-sm text-fur-red-500">
        {errors[key]}
      </p>
    )

  const enabledStages = stages.data?.filter((s) => s.isEnabled) ?? []
  const enabledNetworks = networks.data?.filter((n) => n.isEnabled) ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar ${asset.tag}` : 'Nuevo activo'}</DialogTitle>
          <DialogDescription>
            {editing ? `El código FUR (${asset.furCode}) es permanente.` : 'El código FUR se genera automáticamente al guardar.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tag">Tag</Label>
              <Input id="tag" className="fur-code h-10" value={form.tag} onChange={(e) => set('tag', e.target.value)} {...a11y('tag')} />
              {fieldError('tag')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" className="h-10" value={form.name} onChange={(e) => set('name', e.target.value)} {...a11y('name')} />
              {fieldError('name')}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assetModelId">Modelo del catálogo</Label>
            <Select value={form.assetModelId} onValueChange={(v) => set('assetModelId', v)}>
              <SelectTrigger id="assetModelId" className="h-10 w-full" aria-label="Modelo del catálogo" {...a11y('assetModelId')}>
                <SelectValue placeholder={models.isLoading ? 'Cargando catálogo…' : 'Selecciona un modelo'} />
              </SelectTrigger>
              <SelectContent>
                {models.data?.items.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.type.name} · {m.manufacturer?.name ?? 'Genérico'} · {m.modelName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError('assetModelId')}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="stageCode">Etapa</Label>
              <Select value={form.stageCode} onValueChange={(v) => set('stageCode', v)}>
                <SelectTrigger id="stageCode" className="h-10 w-full" aria-label="Etapa">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STAGE}>Sin etapa asignada</SelectItem>
                  {enabledStages.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.code} — {s.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError('stageCode')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="criticality">Criticidad</Label>
              <Select value={form.criticality} onValueChange={(v) => set('criticality', v as AssetCriticality)}>
                <SelectTrigger id="criticality" className="h-10 w-full" aria-label="Criticidad">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_CRITICALITIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {criticalityLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="status">Estado</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v as AssetStatus)}>
                <SelectTrigger id="status" className="h-10 w-full" aria-label="Estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_STATUSES.filter((s) => s !== 'DECOMMISSIONED').map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Ubicación</Label>
              <Input id="location" className="h-10" value={form.location} onChange={(e) => set('location', e.target.value)} {...a11y('location')} />
              {fieldError('location')}
            </div>
          </div>

          {statusChanged && (
            <div className="space-y-1.5">
              <Label htmlFor="statusReason">Motivo del cambio de estado (opcional)</Label>
              <Textarea id="statusReason" value={form.statusReason} onChange={(e) => set('statusReason', e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="serialNumber">Número de serie</Label>
            <Input id="serialNumber" className="h-10" value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Redes transversales</legend>
            {enabledNetworks.length === 0 ? (
              <p className="text-sm text-fur-gray-600">La planta no tiene redes habilitadas.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {enabledNetworks.map((n) => (
                  <label key={n.code} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.networkCodes.includes(n.code)}
                      onCheckedChange={(on) =>
                        set('networkCodes', on ? [...form.networkCodes, n.code] : form.networkCodes.filter((c) => c !== n.code))
                      }
                    />
                    <span className="fur-code">{n.code}</span> {n.name}
                  </label>
                ))}
              </div>
            )}
            {fieldError('networkCodes')}
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={form.isPublic} onCheckedChange={(on) => set('isPublic', on === true)} className="mt-0.5" />
            <span>
              Visible públicamente
              <span className="block text-xs text-fur-gray-600">Solo se muestra a visitantes si la planta publica sus activos.</span>
            </span>
          </label>

          <div role="alert" aria-live="polite">
            {formError && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{formError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear activo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
