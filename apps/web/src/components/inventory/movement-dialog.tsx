import { FieldsDialog, type Field, type FieldValues } from '@/components/base/fields-dialog'
import { useLocations, useMove, type InventoryItemDetail, type MovementInput } from '@/features/inventory/use-inventory'
import { formatQuantity } from '@/lib/format'

export type MoveKind = MovementInput['kind']

const TITLES: Record<MoveKind, string> = { receipt: 'Recibir stock', issue: 'Emitir stock', transfer: 'Transferir stock', adjust: 'Ajustar saldo' }
const SUBMIT: Record<MoveKind, string> = { receipt: 'Registrar ingreso', issue: 'Registrar salida', transfer: 'Transferir', adjust: 'Aplicar ajuste' }

const num = (v: string | boolean | undefined) => (v === '' || v === undefined || typeof v === 'boolean' ? undefined : Number(v))

/** Ingreso, salida, transferencia o ajuste de un ítem. El servidor valida saldos y ubicaciones; aquí solo se arma el formulario. */
export function MovementDialog({ slug, kind, item, onClose }: { slug: string; kind: MoveKind; item: InventoryItemDetail; onClose: () => void }) {
  const locations = useLocations(slug)
  const move = useMove(slug)
  if (!locations.data) return null

  const active = locations.data.filter((l) => l.status === 'ACTIVE')
  const label = (l: { warehouseCode: string; code: string; name: string }, extra = '') => ({ label: `${l.warehouseCode} · ${l.code} — ${l.name}${extra}` })
  const onHandAt = (id: string) => item.stock.find((s) => s.locationId === id)?.quantity ?? 0
  const allOptions = active.map((l) => ({ value: l.id, ...label(l, ` (actual: ${formatQuantity(onHandAt(l.id))})`) }))
  // Salida y origen de una transferencia: solo ubicaciones donde hay existencias.
  const withStock = item.stock.map((s) => ({ value: s.locationId, label: `${s.warehouseCode} · ${s.locationCode} — ${s.locationName} (disponible: ${formatQuantity(s.quantity)} ${item.uom})` }))

  const quantity: Field = { name: 'quantity', label: `Cantidad (${item.uom})`, type: 'number', required: true, min: 0, step: 0.0001 }
  const note: Field = { name: 'note', label: 'Nota', type: 'textarea', placeholder: 'Opcional' }

  const fields: Field[] =
    kind === 'receipt'
      ? [
          { name: 'locationId', label: 'Ubicación de destino', type: 'select', options: allOptions, required: true },
          quantity,
          {
            name: 'unitCost',
            label: 'Costo unitario',
            type: 'number',
            min: 0,
            step: 0.0001,
            help: 'Opcional. Si lo indicas, actualiza el costo promedio ponderado del ítem.',
          },
          note,
        ]
      : kind === 'issue'
        ? [{ name: 'locationId', label: 'Ubicación de origen', type: 'select', options: withStock, required: true }, quantity, note]
        : kind === 'transfer'
          ? [
              { name: 'fromLocationId', label: 'Origen', type: 'select', options: withStock, required: true },
              { name: 'toLocationId', label: 'Destino', type: 'select', options: allOptions, required: true },
              quantity,
              note,
            ]
          : [
              { name: 'locationId', label: 'Ubicación', type: 'select', options: allOptions, required: true },
              { name: 'newQuantity', label: `Saldo real contado (${item.uom})`, type: 'number', required: true, min: 0, step: 0.0001 },
              { name: 'reason', label: 'Motivo del ajuste', type: 'textarea', required: true, help: 'Queda registrado en el historial del ítem.' },
            ]

  const submit = (v: FieldValues) => {
    const common = { itemId: item.id }
    const text = (k: string) => (String(v[k] ?? '').trim() || undefined)
    switch (kind) {
      case 'receipt':
        return move.mutateAsync({ kind, ...common, locationId: String(v.locationId), quantity: Number(v.quantity), unitCost: num(v.unitCost), note: text('note') })
      case 'issue':
        return move.mutateAsync({ kind, ...common, locationId: String(v.locationId), quantity: Number(v.quantity), note: text('note') })
      case 'transfer':
        return move.mutateAsync({ kind, ...common, fromLocationId: String(v.fromLocationId), toLocationId: String(v.toLocationId), quantity: Number(v.quantity), note: text('note') })
      case 'adjust':
        return move.mutateAsync({ kind, ...common, locationId: String(v.locationId), newQuantity: Number(v.newQuantity), reason: String(v.reason).trim() })
    }
  }

  return (
    <FieldsDialog
      title={`${TITLES[kind]} · ${item.sku}`}
      description={item.name}
      fields={fields}
      submitLabel={SUBMIT[kind]}
      onClose={onClose}
      onSubmit={submit}
    />
  )
}
