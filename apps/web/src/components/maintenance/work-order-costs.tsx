import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { FieldsDialog } from '@/components/base/fields-dialog'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useResources } from '@/features/budget/use-budget'
import { useAddWorkOrderCost, useRemoveWorkOrderCost, type WorkOrderDetail } from '@/features/maintenance/use-maintenance'
import { ApiError } from '@/lib/api'
import { resourceTypeLabel } from '@/lib/budget'
import { formatMoney, formatQuantity, formatUnitPrice } from '@/lib/format'
import { COST_KIND_LABELS, COST_KINDS, type CostKind } from '@/lib/maintenance'

/** Igual que los repuestos: se registran mientras la orden se ejecuta o ya terminó, y hasta que se cierre. */
const EDITABLE = ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED']

function AddCostDialog({ slug, workOrderId, canUseResources, onClose }: { slug: string; workOrderId: string; canUseResources: boolean; onClose: () => void }) {
  const add = useAddWorkOrderCost(slug, workOrderId)
  const resources = useResources(slug, { status: 'ACTIVE' }, 100, canUseResources)
  const usable = (resources.data?.items ?? []).filter((r) => ['LABOR', 'EQUIPMENT', 'TRANSPORT'].includes(r.resourceType))

  return (
    <FieldsDialog
      title="Registrar costo"
      description="Mano de obra, equipos, transporte, servicios externos u otros costos de esta orden. Los repuestos se registran aparte, desde el inventario."
      fields={[
        { name: 'kind', label: 'Tipo de costo', type: 'select', required: true, options: COST_KINDS.map((k) => ({ value: k, label: COST_KIND_LABELS[k] })) },
        ...(canUseResources
          ? [
              {
                name: 'resourceId',
                label: 'Recurso del libro de precios',
                type: 'select' as const,
                emptyLabel: 'Costo manual (sin recurso)',
                options: usable.map((r) => ({ value: r.id, label: `${r.code} — ${r.name} (${resourceTypeLabel(r.resourceType)}, ${formatUnitPrice(r.unitPrice, r.currency)}/${r.unit})` })),
                help: 'Solo mano de obra, equipo o transporte del mismo tipo. El precio se toma de Presupuestos y se convierte a la moneda de la planta.',
              },
            ]
          : []),
        { name: 'description', label: 'Descripción', help: 'Obligatoria en un costo manual; con recurso, por defecto su nombre.' },
        { name: 'quantity', label: 'Cantidad (horas, viajes, unidades…)', type: 'number', required: true, min: 0, step: 0.0001 },
        { name: 'unitCost', label: 'Costo unitario (moneda de la planta)', type: 'number', min: 0, step: 0.0001, help: 'Solo en un costo manual; con recurso se calcula.' },
      ]}
      submitLabel="Registrar costo"
      onClose={onClose}
      onSubmit={async (v) => {
        const resourceId = String(v.resourceId ?? '')
        const description = String(v.description ?? '').trim()
        const unitCost = String(v.unitCost ?? '')
        await add.mutateAsync({
          kind: v.kind as CostKind,
          quantity: Number(v.quantity),
          ...(resourceId ? { resourceId } : { unitCost: unitCost === '' ? undefined : Number(unitCost) }),
          ...(description ? { description } : {}),
        })
        toast.success('Costo registrado')
      }}
    />
  )
}

/** Costos de la orden distintos de los repuestos, con su total y el costo total de la orden (repuestos + estos). */
export function WorkOrderCosts({ slug, workOrder, canEdit, canUseResources }: { slug: string; workOrder: WorkOrderDetail; canEdit: boolean; canUseResources: boolean }) {
  const [adding, setAdding] = useState(false)
  const remove = useRemoveWorkOrderCost(slug, workOrder.id)
  const editable = canEdit && EDITABLE.includes(workOrder.status)
  const { costs, otherCost, partsCost, totalCost, currency } = workOrder

  async function quit(id: string, label: string) {
    try {
      await remove.mutateAsync(id)
      toast.success(`${label} quitado`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo quitar el costo')
    }
  }

  return (
    <section aria-labelledby="costs-title">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="costs-title" className="text-base font-semibold text-fur-navy-900">
          Mano de obra, equipos y servicios
        </h3>
        {editable && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus /> Registrar costo
          </Button>
        )}
      </div>

      {costs.length === 0 ? (
        <p className="text-sm text-fur-gray-600">Esta orden no tiene costos registrados además de los repuestos.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                {editable && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div>{c.description}</div>
                    <div className="text-xs text-fur-gray-600">
                      {COST_KIND_LABELS[c.kind]}
                      {c.resource && (
                        <>
                          {' · '}
                          <Link to={`/plants/${slug}/budgets?tab=resources&search=${encodeURIComponent(c.resource.code)}`} className="fur-code underline-offset-2 hover:underline">
                            {c.resource.code}
                          </Link>{' '}
                          (libro de precios)
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatQuantity(c.quantity)}
                    {c.resource ? ` ${c.resource.unit}` : ''} × {formatUnitPrice(c.unitCost, currency)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatMoney(c.lineCost, currency)}</TableCell>
                  {editable && (
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" aria-label={`Quitar costo ${c.description}`} disabled={remove.isPending} onClick={() => void quit(c.id, c.description)}>
                        <Trash2 /> Quitar
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <dl className="mt-2 ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-fur-gray-600">Repuestos</dt>
          <dd>{formatMoney(partsCost, currency)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-fur-gray-600">Mano de obra, equipos y servicios</dt>
          <dd>{formatMoney(otherCost, currency)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-border pt-1 font-semibold">
          <dt>Costo total de la orden</dt>
          <dd>{formatMoney(totalCost, currency)}</dd>
        </div>
      </dl>

      {adding && <AddCostDialog slug={slug} workOrderId={workOrder.id} canUseResources={canUseResources} onClose={() => setAdding(false)} />}
    </section>
  )
}
