import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAssets } from '@/features/assets/use-assets'
import { useItems } from '@/features/inventory/use-inventory'
import { useCreateRequisition, useUpdateRequisition, type LineInput, type RequisitionDetail } from '@/features/procurement/use-procurement'
import { usePlant } from '@/features/plant/plant-context'
import { ApiError } from '@/lib/api'
import { PRIORITY_META, WORK_ORDER_PRIORITIES, type WorkOrderPriority } from '@/lib/maintenance'

type Row = { key: number; itemId: string; description: string; quantity: string; uom: string; price: string }
const NONE = '__none__'

type Props = {
  slug: string
  /** Si se pasa, edita ese borrador; si no, crea una requisición nueva. */
  requisition?: RequisitionDetail
  /** Datos de partida (p. ej. sugerencias de reposición o el activo/orden desde los que se solicita). */
  defaults?: { assetId?: string; workOrderId?: string; justification?: string; lines?: LineInput[] }
  onClose: () => void
  onSaved?: (r: RequisitionDetail) => void
}

let rowKey = 0
const toRow = (l: Partial<LineInput> & { uom?: string }): Row => ({
  key: ++rowKey,
  itemId: l.itemId ?? '',
  description: l.description ?? '',
  quantity: l.quantity === undefined ? '' : String(l.quantity),
  uom: l.uom ?? 'UND',
  price: l.estimatedPrice === undefined ? '' : String(l.estimatedPrice),
})

/** Alta y edición (en borrador) de una requisición con sus líneas. */
export function RequisitionFormDialog({ slug, requisition, defaults, onClose, onSaved }: Props) {
  const { permissions } = usePlant()
  const create = useCreateRequisition(slug)
  const update = useUpdateRequisition(slug, requisition?.id ?? '')
  const items = useItems(slug, {}, 100, permissions.includes('inventory.read'))
  const assets = useAssets(slug, {}, 100)

  const [justification, setJustification] = useState(requisition?.justification ?? defaults?.justification ?? '')
  const [priority, setPriority] = useState<WorkOrderPriority>(requisition?.priority ?? 'MEDIUM')
  const [neededBy, setNeededBy] = useState(requisition?.neededBy ?? '')
  const [assetId, setAssetId] = useState(requisition?.asset?.id ?? defaults?.assetId ?? '')
  const [rows, setRows] = useState<Row[]>(() =>
    requisition
      ? requisition.lines.map((l) => toRow({ itemId: l.item?.id, description: l.description, quantity: l.quantity, uom: l.uom, estimatedPrice: l.estimatedPrice ?? undefined }))
      : defaults?.lines?.length
        ? defaults.lines.map(toRow)
        : [toRow({})],
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const pickItem = (key: number, itemId: string) => {
    const item = items.data?.items.find((i) => i.id === itemId)
    setRow(key, itemId === NONE ? { itemId: '' } : { itemId, uom: item?.uom ?? 'UND', description: item?.name ?? '' })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (justification.trim().length < 3) next.justification = 'Explica para qué se necesita'
    rows.forEach((r, i) => {
      if (!r.description.trim()) next[`lines.${i}.description`] = 'Requerido'
      if (!(Number(r.quantity) > 0)) next[`lines.${i}.quantity`] = 'Mayor que cero'
      if (r.price !== '' && !(Number(r.price) >= 0)) next[`lines.${i}.estimatedPrice`] = 'Número válido'
    })
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const lines: LineInput[] = rows.map((r) => ({
      itemId: r.itemId || undefined,
      description: r.description.trim(),
      quantity: Number(r.quantity),
      uom: r.itemId ? undefined : r.uom.trim() || 'UND',
      estimatedPrice: r.price === '' ? undefined : Number(r.price),
    }))
    setBusy(true)
    try {
      const saved = requisition
        ? await update.mutateAsync({ justification: justification.trim(), priority, neededBy: neededBy || null, assetId: assetId || null, lines })
        : await create.mutateAsync({ justification: justification.trim(), priority, neededBy: neededBy || undefined, assetId: assetId || undefined, workOrderId: defaults?.workOrderId, lines })
      toast.success(requisition ? 'Requisición actualizada' : `Requisición ${saved.code} creada como borrador`)
      onSaved?.(saved)
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else setErrors({ _form: err instanceof ApiError ? err.message : 'No se pudo guardar. Inténtalo de nuevo.' })
    } finally {
      setBusy(false)
    }
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-fur-red-500">{errors[k]}</p>

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{requisition ? `Editar ${requisition.code}` : 'Nueva requisición'}</DialogTitle>
          <DialogDescription>Se guarda como borrador; cuando esté lista, envíala a aprobación.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="rq-just">Justificación</Label>
            <Textarea id="rq-just" value={justification} onChange={(e) => setJustification(e.target.value)} aria-invalid={!!errors.justification} />
            {err('justification')}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="rq-prio">Prioridad</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as WorkOrderPriority)}>
                <SelectTrigger id="rq-prio" className="h-10 w-full" aria-label="Prioridad">
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
            <div className="space-y-1.5">
              <Label htmlFor="rq-need">Requerida para</Label>
              <Input id="rq-need" type="date" className="h-10" min={new Date().toISOString().slice(0, 10)} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} aria-invalid={!!errors.neededBy} />
              {err('neededBy')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-asset">Activo (opcional)</Label>
              <Select value={assetId || NONE} onValueChange={(v) => setAssetId(v === NONE ? '' : v)}>
                <SelectTrigger id="rq-asset" className="h-10 w-full" aria-label="Activo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin activo</SelectItem>
                  {(assets.data?.items ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.tag} · {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err('assetId')}
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Líneas</legend>
            {rows.map((r, i) => (
              <div key={r.key} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-12" role="group" aria-label={`Línea ${i + 1}`}>
                {permissions.includes('inventory.read') && (
                  <div className="sm:col-span-12">
                    <Select value={r.itemId || NONE} onValueChange={(v) => pickItem(r.key, v)}>
                      <SelectTrigger className="h-9 w-full" aria-label={`Ítem de inventario de la línea ${i + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sin ítem de inventario (servicio o compra libre)</SelectItem>
                        {(items.data?.items ?? []).map((it) => (
                          <SelectItem key={it.id} value={it.id}>
                            {it.sku} — {it.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {errors[`lines.${i}.itemId`] && <p className="text-xs text-fur-red-500 sm:col-span-12">{errors[`lines.${i}.itemId`]}</p>}
                <div className="space-y-1 sm:col-span-5">
                  <Label className="text-xs" htmlFor={`rq-desc-${r.key}`}>
                    Descripción
                  </Label>
                  <Input id={`rq-desc-${r.key}`} className="h-9" value={r.description} onChange={(e) => setRow(r.key, { description: e.target.value })} aria-invalid={!!errors[`lines.${i}.description`]} />
                  {err(`lines.${i}.description`)}
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs" htmlFor={`rq-qty-${r.key}`}>
                    Cantidad
                  </Label>
                  <Input id={`rq-qty-${r.key}`} type="number" min={0} step={0.0001} className="h-9" value={r.quantity} onChange={(e) => setRow(r.key, { quantity: e.target.value })} aria-invalid={!!errors[`lines.${i}.quantity`]} />
                  {err(`lines.${i}.quantity`)}
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs" htmlFor={`rq-uom-${r.key}`}>
                    Unidad
                  </Label>
                  <Input id={`rq-uom-${r.key}`} className="h-9" value={r.uom} disabled={!!r.itemId} onChange={(e) => setRow(r.key, { uom: e.target.value })} />
                  {err(`lines.${i}.uom`)}
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs" htmlFor={`rq-price-${r.key}`}>
                    Precio estimado
                  </Label>
                  <Input id={`rq-price-${r.key}`} type="number" min={0} step={0.01} className="h-9" value={r.price} onChange={(e) => setRow(r.key, { price: e.target.value })} aria-invalid={!!errors[`lines.${i}.estimatedPrice`]} />
                  {err(`lines.${i}.estimatedPrice`)}
                </div>
                <div className="flex items-end sm:col-span-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Quitar línea ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
            {err('lines')}
            <Button type="button" variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, toRow({})])}>
              <Plus /> Agregar línea
            </Button>
          </fieldset>

          <div role="alert" aria-live="polite">
            {errors._form && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{errors._form}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Guardando…' : requisition ? 'Guardar cambios' : 'Crear requisición'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
