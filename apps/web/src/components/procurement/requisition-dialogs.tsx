import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { FieldsDialog } from '@/components/base/fields-dialog'
import { CheckGroup } from '@/components/organizations/check-group'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLocations } from '@/features/inventory/use-inventory'
import { useProviders } from '@/features/organizations/use-organizations'
import { useRequisitionAction, type RequisitionDetail } from '@/features/procurement/use-procurement'
import { ApiError } from '@/lib/api'
import { formatQuantity } from '@/lib/format'
import { defaultDeadlineLocal } from '@/lib/procurement'

/** Pide un motivo obligatorio (rechazar y cancelar son acciones que deben dejar explicación). */
export function ReasonDialog({ slug, id, action, title, submitLabel, onClose }: { slug: string; id: string; action: 'reject' | 'cancel'; title: string; submitLabel: string; onClose: () => void }) {
  const run = useRequisitionAction(slug, id)
  return (
    <FieldsDialog
      title={title}
      fields={[{ name: 'note', label: 'Motivo', type: 'textarea', required: true }]}
      submitLabel={submitLabel}
      onClose={onClose}
      onSubmit={(v) => run.mutateAsync({ action, note: String(v.note).trim() })}
    />
  )
}

/** Selección de proveedores a invitar y plazo de respuesta. */
export function RfqDialog({ slug, requisition, onClose }: { slug: string; requisition: RequisitionDetail; onClose: () => void }) {
  const run = useRequisitionAction(slug, requisition.id)
  const providers = useProviders({ sort: 'rating' }, 50)
  const [selected, setSelected] = useState<string[]>([])
  const [deadline, setDeadline] = useState(defaultDeadlineLocal())
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (selected.length === 0) next.providerIds = 'Invita al menos a un proveedor'
    if (!deadline || new Date(deadline).getTime() <= Date.now()) next.deadlineAt = 'La fecha límite debe ser futura'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    try {
      await run.mutateAsync({ action: 'rfq', providerIds: selected, deadlineAt: new Date(deadline).toISOString() })
      toast.success('Solicitud de cotización enviada')
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else setErrors({ _form: err instanceof ApiError ? err.message : 'No se pudo enviar la solicitud.' })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Solicitar cotización · {requisition.code}</DialogTitle>
          <DialogDescription>Los proveedores invitados verán las líneas, cantidades y la fecha requerida, pero no tu justificación ni tus precios estimados.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <CheckGroup
            legend="Proveedores a invitar"
            options={(providers.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.organizationName}${p.verified ? ' ✓' : ''}` }))}
            value={selected}
            onChange={setSelected}
            error={errors.providerIds}
            help={providers.data && providers.data.items.length === 0 ? 'No hay proveedores activos en el ecosistema.' : 'Solo proveedores activos.'}
          />
          <div className="space-y-1.5">
            <Label htmlFor="rfq-deadline">Responder hasta</Label>
            <Input id="rfq-deadline" type="datetime-local" className="h-10" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-invalid={!!errors.deadlineAt} />
            {errors.deadlineAt && <p className="text-sm text-fur-red-500">{errors.deadlineAt}</p>}
          </div>
          {errors._form && (
            <p role="alert" className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">
              {errors._form}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={run.isPending}>
              {run.isPending ? 'Enviando…' : 'Enviar solicitud'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type RecvRow = { quantity: string; locationId: string; unitCost: string }

/** Recepción (total o parcial): las líneas con ítem ingresan stock a la ubicación elegida. */
export function ReceiveDialog({ slug, requisition, onClose }: { slug: string; requisition: RequisitionDetail; onClose: () => void }) {
  const run = useRequisitionAction(slug, requisition.id)
  const locations = useLocations(slug)
  const pending = requisition.lines.filter((l) => l.receivedQuantity < l.quantity)
  const [rows, setRows] = useState<Record<string, RecvRow>>(() => Object.fromEntries(pending.map((l) => [l.id, { quantity: '', locationId: '', unitCost: '' }])))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (id: string, patch: Partial<RecvRow>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }))
  const active = (locations.data ?? []).filter((l) => l.status === 'ACTIVE')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    const lines = pending
      .filter((l) => rows[l.id].quantity !== '')
      .map((l) => {
        const r = rows[l.id]
        if (!(Number(r.quantity) > 0)) next[l.id] = 'Cantidad mayor que cero'
        else if (Number(r.quantity) > l.quantity - l.receivedQuantity + 1e-9) next[l.id] = `Máximo ${formatQuantity(l.quantity - l.receivedQuantity)} ${l.uom}`
        else if (l.item && !r.locationId) next[l.id] = 'Elige la ubicación de ingreso'
        return { lineId: l.id, quantity: Number(r.quantity), locationId: r.locationId || undefined, unitCost: r.unitCost === '' ? undefined : Number(r.unitCost) }
      })
    if (lines.length === 0) next._form = 'Indica la cantidad recibida de al menos una línea'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    try {
      await run.mutateAsync({ action: 'receive', lines })
      toast.success('Recepción registrada')
      onClose()
    } catch (err) {
      setErrors({ _form: err instanceof ApiError ? (err.fieldErrors[0]?.message ?? err.message) : 'No se pudo registrar la recepción.' })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Registrar recepción · {requisition.code}</DialogTitle>
          <DialogDescription>Deja en blanco las líneas que aún no llegan. Las líneas con ítem ingresan stock a la ubicación elegida.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          {pending.map((l) => (
            <div key={l.id} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-12" role="group" aria-label={`Recepción de ${l.description}`}>
              <p className="text-sm sm:col-span-12">
                <span className="font-medium">{l.description}</span>{' '}
                <span className="text-fur-gray-600">
                  — pedido {formatQuantity(l.quantity)} {l.uom}, recibido {formatQuantity(l.receivedQuantity)}
                </span>
              </p>
              <div className="space-y-1 sm:col-span-3">
                <Label className="text-xs" htmlFor={`rc-q-${l.id}`}>
                  Cantidad recibida
                </Label>
                <Input id={`rc-q-${l.id}`} type="number" min={0} step={0.0001} className="h-9" value={rows[l.id].quantity} onChange={(e) => set(l.id, { quantity: e.target.value })} />
              </div>
              {l.item ? (
                <>
                  <div className="space-y-1 sm:col-span-6">
                    <Label className="text-xs" htmlFor={`rc-l-${l.id}`}>
                      Ubicación de ingreso
                    </Label>
                    <Select value={rows[l.id].locationId} onValueChange={(v) => set(l.id, { locationId: v })}>
                      <SelectTrigger id={`rc-l-${l.id}`} className="h-9 w-full" aria-label={`Ubicación de ${l.description}`}>
                        <SelectValue placeholder="Selecciona…" />
                      </SelectTrigger>
                      <SelectContent>
                        {active.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {loc.warehouseCode} · {loc.code} — {loc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-3">
                    <Label className="text-xs" htmlFor={`rc-c-${l.id}`}>
                      Costo unitario
                    </Label>
                    <Input id={`rc-c-${l.id}`} type="number" min={0} step={0.01} className="h-9" value={rows[l.id].unitCost} onChange={(e) => set(l.id, { unitCost: e.target.value })} />
                  </div>
                </>
              ) : (
                <p className="self-end text-xs text-fur-gray-600 sm:col-span-9">Sin ítem de inventario: solo se registra lo recibido.</p>
              )}
              {errors[l.id] && <p className="text-sm text-fur-red-500 sm:col-span-12">{errors[l.id]}</p>}
            </div>
          ))}
          {errors._form && (
            <p role="alert" className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">
              {errors._form}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={run.isPending}>
              {run.isPending ? 'Registrando…' : 'Registrar recepción'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
