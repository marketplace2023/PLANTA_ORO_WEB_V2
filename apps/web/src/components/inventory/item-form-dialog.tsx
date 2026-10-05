import { FieldsDialog, type Field, type FieldValues } from '@/components/base/fields-dialog'
import { useCreateItem, useUpdateItem, type InventoryItem, type ItemInput } from '@/features/inventory/use-inventory'
import { ITEM_TYPE_LABELS, ITEM_TYPES } from '@/lib/inventory'

const num = (v: string | boolean | undefined) => (v === '' || v === undefined || typeof v === 'boolean' ? undefined : Number(v))
const numOrNull = (v: string | boolean | undefined) => num(v) ?? null

/** Alta o edición de un ítem. SKU y unidad de medida solo se fijan al crear (hay saldos y movimientos expresados en ellas). */
export function ItemFormDialog({ slug, item, onClose, onSaved }: { slug: string; item?: InventoryItem; onClose: () => void; onSaved?: (id: string) => void }) {
  const create = useCreateItem(slug)
  const update = useUpdateItem(slug, item?.id ?? '')

  const fields: Field[] = [
    ...(item
      ? []
      : ([
          { name: 'sku', label: 'SKU', required: true, placeholder: 'ROD-22218', help: 'Único en la planta. No se puede cambiar después.' },
          { name: 'uom', label: 'Unidad de medida', required: true, placeholder: 'UND, KG, L, M…', help: 'No se puede cambiar después.' },
        ] satisfies Field[])),
    { name: 'name', label: 'Nombre', required: true },
    { name: 'description', label: 'Descripción', type: 'textarea' },
    { name: 'itemType', label: 'Tipo', type: 'select', required: true, options: ITEM_TYPES.map((t) => ({ value: t, label: ITEM_TYPE_LABELS[t] })) },
    { name: 'minStock', label: 'Stock mínimo', type: 'number', min: 0, step: 0.0001, help: 'Por debajo de este valor el ítem se marca como bajo mínimo.' },
    { name: 'maxStock', label: 'Stock máximo', type: 'number', min: 0, step: 0.0001 },
    { name: 'unitCost', label: 'Costo unitario', type: 'number', min: 0, step: 0.0001, help: 'Costo promedio; se recalcula solo con cada ingreso que traiga costo.' },
    { name: 'isCritical', label: 'Repuesto crítico (su falta pone en riesgo la operación)', type: 'checkbox' },
  ]

  const initial: FieldValues | undefined = item
    ? {
        name: item.name,
        description: item.description ?? '',
        itemType: item.itemType,
        minStock: String(item.minStock),
        maxStock: item.maxStock === null ? '' : String(item.maxStock),
        unitCost: item.unitCost === null ? '' : String(item.unitCost),
        isCritical: item.isCritical,
      }
    : { itemType: 'SPARE', uom: 'UND', minStock: '0' }

  async function submit(v: FieldValues) {
    if (item) {
      await update.mutateAsync({
        name: String(v.name).trim(),
        description: String(v.description).trim() || null,
        itemType: v.itemType as ItemInput['itemType'],
        minStock: Number(v.minStock || 0),
        maxStock: numOrNull(v.maxStock),
        unitCost: numOrNull(v.unitCost),
        isCritical: v.isCritical === true,
      })
      return
    }
    const created = await create.mutateAsync({
      sku: String(v.sku).trim(),
      name: String(v.name).trim(),
      description: String(v.description).trim() || undefined,
      itemType: v.itemType as ItemInput['itemType'],
      uom: String(v.uom).trim(),
      minStock: Number(v.minStock || 0),
      maxStock: num(v.maxStock),
      unitCost: num(v.unitCost),
      isCritical: v.isCritical === true,
    })
    onSaved?.(created.id)
  }

  return <FieldsDialog title={item ? `Editar ${item.sku}` : 'Nuevo ítem'} fields={fields} initial={initial} submitLabel={item ? 'Guardar cambios' : 'Crear ítem'} onClose={onClose} onSubmit={submit} />
}
