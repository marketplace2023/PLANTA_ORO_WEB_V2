import { PackagePlus, Undo2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAddWorkOrderPart, useItem, useItems, useReturnWorkOrderPart } from '@/features/inventory/use-inventory'
import type { WorkOrderDetail } from '@/features/maintenance/use-maintenance'
import { ApiError } from '@/lib/api'
import { formatMoney, formatQuantity } from '@/lib/format'

/** El consumo se registra mientras la orden se ejecuta o ya terminó, y hasta que se cierre. */
const EDITABLE = ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED']

function AddPartDialog({ slug, workOrderId, onClose }: { slug: string; workOrderId: string; onClose: () => void }) {
  const add = useAddWorkOrderPart(slug, workOrderId)
  const items = useItems(slug, {}, 100)
  const [itemId, setItemId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const item = useItem(slug, itemId || undefined)

  const options = (items.data?.items ?? []).filter((i) => i.onHand > 0)
  const stock = item.data?.stock ?? []

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!itemId) next.itemId = 'Requerido'
    if (!locationId) next.locationId = 'Requerido'
    if (!(Number(quantity) > 0)) next.quantity = 'Indica una cantidad mayor que cero'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    try {
      await add.mutateAsync({ itemId, locationId, quantity: Number(quantity), note: note.trim() || undefined })
      toast.success('Repuesto registrado')
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else setErrors({ _form: err instanceof ApiError ? err.message : 'No se pudo registrar el repuesto.' })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar repuesto usado</DialogTitle>
          <DialogDescription>Las existencias se descuentan al guardar y se asocian a esta orden.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="part-item">Ítem</Label>
            <Select
              value={itemId}
              onValueChange={(v) => {
                setItemId(v)
                setLocationId('')
              }}
            >
              <SelectTrigger id="part-item" className="h-10 w-full" aria-label="Ítem">
                <SelectValue placeholder="Selecciona…" />
              </SelectTrigger>
              <SelectContent>
                {options.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.sku} — {i.name} ({formatQuantity(i.onHand)} {i.uom})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {items.data && options.length === 0 && <p className="text-xs text-fur-gray-600">No hay ítems con existencias.</p>}
            {errors.itemId && <p className="text-sm text-fur-red-500">{errors.itemId}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="part-location">Ubicación de origen</Label>
            <Select value={locationId} onValueChange={setLocationId} disabled={!itemId || !item.data}>
              <SelectTrigger id="part-location" className="h-10 w-full" aria-label="Ubicación de origen">
                <SelectValue placeholder={itemId ? 'Selecciona…' : 'Elige primero el ítem'} />
              </SelectTrigger>
              <SelectContent>
                {stock.map((s) => (
                  <SelectItem key={s.locationId} value={s.locationId}>
                    {s.warehouseCode} · {s.locationCode} (disponible: {formatQuantity(s.quantity)} {item.data?.uom})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.locationId && <p className="text-sm text-fur-red-500">{errors.locationId}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="part-qty">{item.data ? `Cantidad (${item.data.uom})` : 'Cantidad'}</Label>
            <Input id="part-qty" type="number" min={0} step={0.0001} className="h-10" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={!!errors.quantity} />
            {errors.quantity && <p className="text-sm text-fur-red-500">{errors.quantity}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="part-note">Nota</Label>
            <Textarea id="part-note" placeholder="Opcional" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div role="alert" aria-live="polite">
            {errors._form && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{errors._form}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? 'Guardando…' : 'Registrar consumo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Repuestos consumidos por la orden: descuentan stock al registrarse y se pueden devolver mientras la orden no esté cerrada. */
export function WorkOrderParts({ slug, workOrder, canEdit }: { slug: string; workOrder: WorkOrderDetail; canEdit: boolean }) {
  const [adding, setAdding] = useState(false)
  const returnPart = useReturnWorkOrderPart(slug, workOrder.id)
  const editable = canEdit && EDITABLE.includes(workOrder.status)
  const { parts, partsCost, partsHaveUncosted, currency } = workOrder

  async function giveBack(id: string, label: string) {
    try {
      await returnPart.mutateAsync(id)
      toast.success(`${label} devuelto al inventario`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo devolver el repuesto')
    }
  }

  return (
    <section aria-labelledby="parts-title">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="parts-title" className="text-base font-semibold text-fur-navy-900">
          Repuestos usados
        </h3>
        {editable && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <PackagePlus /> Registrar repuesto
          </Button>
        )}
      </div>

      {parts.length === 0 ? (
        <p className="text-sm text-fur-gray-600">Esta orden no ha consumido repuestos.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  {editable && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="fur-code">{p.item.sku}</span> {p.item.name}
                      {p.location && <div className="fur-code text-xs text-fur-gray-600">Desde {p.location}</div>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {formatQuantity(p.quantity)} {p.item.uom}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{p.lineCost === null ? 'Sin costo' : formatMoney(p.lineCost, currency)}</TableCell>
                    {editable && (
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" aria-label={`Devolver ${p.item.sku} al inventario`} disabled={returnPart.isPending} onClick={() => void giveBack(p.id, p.item.sku)}>
                          <Undo2 /> Devolver
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-right text-sm">
            Costo de repuestos: <strong>{formatMoney(partsCost, currency)}</strong>
            {partsHaveUncosted && <span className="block text-xs text-fur-gray-600">Hay ítems sin costo cargado que no suman al total.</span>}
          </p>
        </>
      )}

      {adding && <AddPartDialog slug={slug} workOrderId={workOrder.id} onClose={() => setAdding(false)} />}
    </section>
  )
}
