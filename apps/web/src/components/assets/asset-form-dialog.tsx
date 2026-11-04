import { useState, type FormEvent } from 'react'
import { AssetTechnicalFields } from './asset-technical-fields'
import { FamilyPicker } from './family-picker'
import { CatalogModelPicker } from './catalog-model-picker'
import { ClipboardList, Network, Package, X } from 'lucide-react'
import { technicalDraft, technicalPayload } from '@/lib/asset-technical'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  useCatalogModels,
  useCatalogFamilies,
  useAssetTagPreview,
  useCreateAsset,
  useUpdateAsset,
  type AssetDetail,
  type AssetInput,
} from '@/features/assets/use-assets'
import { usePlantNetworks, usePlantStages } from '@/features/plant/use-plant-data'
import { ApiError } from '@/lib/api'
import { ASSET_CRITICALITIES, ASSET_STATUSES, criticalityLabel, statusLabel, type AssetCriticality, type AssetStatus } from '@/lib/assets'

const NO_STAGE = '__none__'
const NO_NETWORK = '__none__'
const KEEP_NETWORKS = '__keep__'

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

  const [modelSearch, setModelSearch] = useState('')
  const search = useDebouncedValue(modelSearch.trim())
  const [technical, setTechnical] = useState(() => technicalDraft(asset?.specifications, asset?.technicalData))
  const stages = usePlantStages(plantSlug)
  const networks = usePlantNetworks(plantSlug)

  const [form, setForm] = useState({
    name: asset?.name ?? '',
    familyId: asset?.family.id ?? '',
    stageCode: asset?.stage?.code ?? NO_STAGE,
    serialNumber: asset?.serialNumber ?? '',
    status: (asset?.status ?? 'OPERATIVE') as AssetStatus,
    statusReason: '',
    criticality: (asset?.criticality ?? 'MEDIUM') as AssetCriticality,
    isPublic: asset?.isPublic ?? false,
    // La clasificación del activo se elige directamente en la planta.
    networkCodes: asset?.networks.map((n) => n.code) ?? ([] as string[]),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))
  const statusChanged = editing && form.status !== asset.status
  const families = useCatalogFamilies()
  const selectedFamily = families.data?.find(family => family.id === form.familyId || (!form.familyId && family.code === asset?.family.code))
  const familyId = selectedFamily?.id ?? form.familyId
  const [references, setReferences] = useState<NonNullable<AssetDetail['referenceModels']>>(asset?.referenceModels ?? [])
  const models = useCatalogModels({ family: selectedFamily?.code ?? '__none__', stage: form.stageCode !== NO_STAGE ? form.stageCode : undefined, search: search || undefined, status: 'ACTIVE' }, 100)
  const enabledStages = stages.data?.filter(s => s.isEnabled) ?? []
  const enabledNetworks = networks.data?.filter(n => n.isEnabled) ?? []
  const networkCodes = form.networkCodes
  const tagSelection = familyId && form.stageCode !== NO_STAGE && networkCodes.length === 1
    ? { familyId, stageCode: form.stageCode, networkCode: networkCodes[0] } : null
  const suggestedTag = useAssetTagPreview(plantSlug, tagSelection, open && !editing)
  const partialTag = `${networkCodes.length === 1 ? networkCodes[0] : 'XXX'}-${form.stageCode !== NO_STAGE ? form.stageCode : 'XXX'}-${selectedFamily?.tagCode ?? 'XXX'}-${tagSelection ? '…' : '001'}`
  const tagPreview = suggestedTag.data?.tag ?? partialTag

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErrors({})
    setFormError(undefined)

    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = 'Requerido'
    if (!familyId) next.familyId = 'Selecciona una familia'
    if (!editing && form.stageCode === NO_STAGE) next.stageCode = 'Selecciona una etapa para generar el TAG'
    if (!editing && networkCodes.length !== 1) next.networkCodes = 'Selecciona una red para generar el TAG'
    if (Object.keys(next).length > 0) return setErrors(next)

    let ownTechnical: ReturnType<typeof technicalPayload>
    try { ownTechnical = technicalPayload(technical) }
    catch (error) { setFormError(error instanceof Error ? error.message : 'Revisa la ficha técnica.'); return }

    const common: AssetInput = {
      ...ownTechnical,
      name: form.name.trim(),
      familyId,
      referenceModelIds: references.map(reference => reference.id),
      criticality: form.criticality,
      isPublic: form.isPublic,
      networkCodes,
      status: form.status,
    }
    const stageCode = form.stageCode === NO_STAGE ? null : form.stageCode

    try {
      const saved = editing
        ? await update.mutateAsync({
            ...common,
            stageCode,
            serialNumber: form.serialNumber.trim() || null,
            ...(statusChanged && form.statusReason.trim() && { statusReason: form.statusReason.trim() }),
          })
        : await create.mutateAsync({
            ...common,
            ...(stageCode && { stageCode }),
            ...(form.serialNumber.trim() && { serialNumber: form.serialNumber.trim() }),
          })
      toast.success(editing ? 'Activo actualizado' : `Activo creado: ${saved.furCode}`)
      onOpenChange(false)
      onSaved?.(saved)
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) {
        setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
        setFormError(err.fieldErrors.map(field => field.message).join(' '))
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[92dvh] w-[calc(100%-1.5rem)] min-w-0 max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 gap-0 border-b border-border px-5 py-5 sm:px-7">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-fur-gold-500/15 text-fur-navy-900"><Package className="size-5" aria-hidden /></span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                <DialogTitle className="truncate text-xl leading-snug font-semibold tracking-tight" title={editing ? asset.tag : undefined}>{editing ? 'Editar ' + asset.tag : 'Nuevo activo'}</DialogTitle>
                {!editing && <span aria-label="Vista previa del TAG" aria-live="polite" aria-atomic="true" title={tagPreview} className="fur-code max-w-full truncate rounded-lg border border-fur-gold-500/30 bg-fur-gold-500/10 px-2.5 py-1 text-xs font-medium text-fur-navy-900">{tagPreview}</span>}
              </div>
              <DialogDescription className="text-sm leading-relaxed [overflow-wrap:anywhere]">
                {editing ? 'El código FUR (' + asset.furCode + ') es permanente.' : 'El TAG y el código FUR se asignan al guardar.'}
              </DialogDescription>
            </div>
            <DialogClose asChild><Button type="button" variant="ghost" size="icon-sm" className="shrink-0 rounded-lg" aria-label="Cerrar"><X className="size-4" /></Button></DialogClose>
          </div>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col" noValidate>
          <div className="min-h-0 min-w-0 flex-1 space-y-7 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
            <section className="min-w-0 space-y-5" aria-label="Clasificación e identificación">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><ClipboardList className="size-4 text-fur-navy-900" aria-hidden /> Clasificación e identificación</h3>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="networkCode">Red transversal</Label>
                <Select value={networkCodes.length > 1 ? KEEP_NETWORKS : networkCodes[0] ?? NO_NETWORK} onValueChange={code => { if (code !== KEEP_NETWORKS) set('networkCodes', code === NO_NETWORK ? [] : [code]) }} disabled={networks.isPending || networks.isError}>
                  <SelectTrigger id="networkCode" className="h-11 w-full min-w-0 max-w-full bg-background data-[size=default]:h-11 *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate *:data-[slot=select-value]:block" aria-label="Red transversal" {...a11y('networkCodes')}>
                    <SelectValue placeholder="Selecciona una red" />
                  </SelectTrigger>
                  <SelectContent>
                    {networkCodes.length > 1 && <SelectItem value={KEEP_NETWORKS}>Conservar redes actuales ({networkCodes.length})</SelectItem>}
                    <SelectItem value={NO_NETWORK}>Sin red asignada</SelectItem>
                    {enabledNetworks.map(network => <SelectItem key={network.code} value={network.code}>{network.code} · {network.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {networks.isPending ? 'Cargando redes de la planta…' : networks.isError ? 'No se pudieron cargar las redes de la planta.' : networkCodes.length > 1 ? 'Este activo ya tiene varias redes. Se conservarán hasta que selecciones una sola.' : enabledNetworks.length === 0 ? 'La planta no tiene redes habilitadas.' : editing ? 'Selecciona una sola red para este activo.' : 'Selecciona la red transversal de este activo.'}
                </p>
                {fieldError('networkCodes')}
              </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="stageCode">Etapa</Label>
                  <Select value={form.stageCode} onValueChange={v => { if (v !== form.stageCode) { set('stageCode', v); setReferences([]); setModelSearch('') } }}>
                    <SelectTrigger id="stageCode" className="h-11 w-full min-w-0 max-w-full bg-background data-[size=default]:h-11 *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate *:data-[slot=select-value]:block" aria-label="Etapa">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_STAGE}>Sin etapa asignada</SelectItem>
                      {enabledStages.map((s) => (
                        <SelectItem key={s.code} value={s.code}>
                          {s.code} - {s.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldError('stageCode')}
                </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="familyId">Familia</Label>
                <FamilyPicker value={familyId} items={families.data ?? []} loading={families.isPending} failed={families.isError} onRetry={() => void families.refetch()} invalid={!!errors.familyId}
                  onChange={id => { if (id !== familyId) { set('familyId', id); setReferences([]); setModelSearch('') } }} />
                {fieldError('familyId')}
              </div>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="tag">Tag</Label>
                  <Input id="tag" className="fur-code h-11 min-w-0 bg-muted/40" readOnly value={editing ? asset.tag : tagPreview} placeholder="Se genera al guardar" {...a11y('tag')} aria-describedby={errors.tag ? 'tag-error' : 'asset-tag-hint'} />
                  <p id="asset-tag-hint" className="text-xs leading-relaxed text-muted-foreground">{editing ? 'El TAG es permanente.' : suggestedTag.isError ? 'No se pudo actualizar la vista previa. El TAG se asignará al guardar.' : suggestedTag.isFetching ? 'Consultando el siguiente correlativo…' : 'Vista previa. El TAG definitivo se asigna al guardar.'}</p>
                  {fieldError('tag')}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input id="name" className="h-11 min-w-0 bg-background" value={form.name} onChange={(e) => set('name', e.target.value)} {...a11y('name')} />
                  {fieldError('name')}
                </div>
              </div>

            </section>

            <section className="min-w-0 space-y-5 border-t border-border pt-6" aria-label="Datos de la unidad">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Network className="size-4 text-fur-navy-900" aria-hidden /> Datos de la unidad</h3>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="criticality">Criticidad</Label>
                  <Select value={form.criticality} onValueChange={(v) => set('criticality', v as AssetCriticality)}>
                    <SelectTrigger id="criticality" className="h-11 w-full min-w-0 max-w-full bg-background data-[size=default]:h-11 *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate *:data-[slot=select-value]:block" aria-label="Criticidad">
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
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="status">Estado</Label>
                  <Select value={form.status} onValueChange={(v) => set('status', v as AssetStatus)}>
                    <SelectTrigger id="status" className="h-11 w-full min-w-0 max-w-full bg-background data-[size=default]:h-11 *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate *:data-[slot=select-value]:block" aria-label="Estado">
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
              </div>

              {statusChanged && (
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="statusReason">Motivo del cambio de estado (opcional)</Label>
                  <Textarea id="statusReason" value={form.statusReason} onChange={(e) => set('statusReason', e.target.value)} />
                </div>
              )}

              <div className="min-w-0 space-y-2">
                <Label htmlFor="serialNumber">Número de serie</Label>
                <Input id="serialNumber" className="h-11 min-w-0 bg-background" value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} />
              </div>


              <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-muted/35 p-3 text-sm">
                <Checkbox checked={form.isPublic} onCheckedChange={(on) => set('isPublic', on === true)} className="mt-0.5" />
                <span>
                  Visible públicamente
                  <span className="mt-0.5 block text-xs text-muted-foreground">Solo se muestra a visitantes si la planta publica sus activos.</span>
                </span>
              </label>

            </section>

            <AssetTechnicalFields value={technical} onChange={setTechnical} />
            {fieldError('specifications')}
            {fieldError('components')}

            <section className="min-w-0 space-y-3 border-t border-border pt-6" aria-label="Referencias del catálogo">
              <h3 className="text-sm font-semibold">Referencias del catálogo (opcional)</h3>
              <p className="text-sm text-muted-foreground">Relaciona modelos de la familia y la etapa seleccionadas como referencia.</p>
              {familyId && form.stageCode !== NO_STAGE ? <CatalogModelPicker value="" selected={null} selectedIds={references.map(reference => reference.id)} items={models.data?.items ?? []} total={models.data?.total ?? 0}
                search={modelSearch} onSearchChange={setModelSearch} onSelect={model => { setReferences(current => current.some(reference => reference.id === model.id) ? current.filter(reference => reference.id !== model.id) : [...current, { id: model.id, modelName: model.modelName, catalogTag: model.catalogTag }]); setModelSearch('') }}
                loading={models.isFetching || modelSearch.trim() !== search} failed={models.isError} onRetry={() => void models.refetch()} /> : <p className="text-sm text-muted-foreground">Selecciona una familia y una etapa para consultar sus modelos.</p>}
              <ul className="space-y-2">{references.map(reference => <li key={reference.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <span className="min-w-0 truncate" title={reference.modelName}>{reference.catalogTag ? reference.catalogTag + ' · ' : ''}{reference.modelName}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={'Quitar referencia ' + reference.modelName} onClick={() => setReferences(current => current.filter(item => item.id !== reference.id))}><X /></Button>
              </li>)}</ul>
              {fieldError('referenceModelIds')}
            </section>

            <div role="alert" aria-live="polite">
              {formError && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{formError}</p>}
            </div>

          </div>
          <DialogFooter className="static z-auto m-0 shrink-0 gap-2 rounded-none bg-muted/30 px-5 py-4 sm:px-7">
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
