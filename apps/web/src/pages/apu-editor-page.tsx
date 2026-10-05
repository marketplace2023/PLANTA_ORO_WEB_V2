import { AlertTriangle, ArrowLeft, LockKeyhole, Pencil, Plus, SearchX, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FieldsDialog } from '@/components/base/fields-dialog'
import { PermissionGate } from '@/components/base/permission-gate'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAddApuLine, useApu, useDeleteApuLine, useResources, useUpdateApu, useUpdateApuLine, type ApuLine } from '@/features/budget/use-budget'
import { usePlant } from '@/features/plant/plant-context'
import { ApiError } from '@/lib/api'
import { isCrewBased, RESOURCE_TYPE_LABELS, RESOURCE_TYPES, resourceTypeLabel } from '@/lib/budget'
import { formatQuantity, formatUnitPrice } from '@/lib/format'
import { usePlantOutlet } from './plant-route'

const errorText = (err: unknown) => (err instanceof ApiError ? (err.fieldErrors[0]?.message ?? err.message) : 'No se pudo completar la acción')

/** Editor de un APU (design.md §46): líneas de recursos y pie fijo con costo directo y su desglose por tipo. */
export function ApuEditorPage() {
  const plant = usePlantOutlet()
  const { apuId } = useParams()
  const { permissions } = usePlant()
  const { data: apu, isLoading, isError, error, refetch } = useApu(plant.slug, apuId)
  const update = useUpdateApu(plant.slug, apuId ?? '')
  const addLine = useAddApuLine(plant.slug, apuId ?? '')
  const updateLine = useUpdateApuLine(plant.slug, apuId ?? '')
  const deleteLine = useDeleteApuLine(plant.slug, apuId ?? '')
  const resources = useResources(plant.slug, { status: 'ACTIVE' }, 100, permissions.includes('budget.edit'))
  const [dialog, setDialog] = useState<'header' | 'add' | null>(null)
  const [editing, setEditing] = useState<ApuLine | null>(null)
  const back = (
    <Button asChild variant="secondary">
      <Link to={`/plants/${plant.slug}/budgets?tab=apus`}>
        <ArrowLeft /> Ver APU
      </Link>
    </Button>
  )

  if (!permissions.includes('budget.read')) return <EmptyState icon={LockKeyhole} title="Sin acceso a Presupuestos" description="Los APU son información interna de la planta." />
  if (error instanceof ApiError && error.status === 404) return <EmptyState icon={SearchX} title="APU no encontrado" description="No existe en esta planta." action={back} />
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isLoading || !apu) return <Skeleton className="h-64" aria-busy="true" />

  const c = apu.baseCurrency
  const used = new Set(apu.lines.map((l) => l.resourceId))
  const run = (action: () => Promise<unknown>, ok: string) => action().then(() => toast.success(ok), (e) => toast.error(errorText(e)))

  return (
    <>
      <PageHeader
        title={`${apu.code} · ${apu.name}`}
        description={`Unidad ${apu.unit} · rinde ${formatQuantity(apu.yieldValue)} ${apu.unit} por jornada de ${formatQuantity(apu.hoursPerDay)} h${apu.usedInBudgets > 0 ? ` · usado en ${apu.usedInBudgets} presupuesto(s)` : ''}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {apu.status === 'INACTIVE' && <Badge variant="outline">Inactivo</Badge>}
            <PermissionGate permission="budget.edit">
              <Button variant="secondary" onClick={() => setDialog('header')}>
                <Pencil /> Datos y rendimiento
              </Button>
              <Button onClick={() => setDialog('add')}>
                <Plus /> Agregar recurso
              </Button>
            </PermissionGate>
            {back}
          </div>
        }
      />
      {apu.description && <p className="mb-4 text-sm">{apu.description}</p>}
      {apu.missingRates.length > 0 && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-fur-red-500 bg-fur-red-500/10 p-3 text-sm">
          <AlertTriangle className="size-4 shrink-0" aria-hidden /> Falta el tipo de cambio de {apu.missingRates.join(', ')}: el APU no tiene precio hasta cargarlo (pestaña Recursos y precios).
        </p>
      )}

      {apu.lines.length === 0 ? (
        <EmptyState icon={Plus} title="Este APU aún no tiene recursos" description="Agrega materiales, mano de obra, equipos y transporte para calcular su costo directo." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Recurso</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Desperdicio</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apu.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="fur-code">{l.code}</TableCell>
                  <TableCell>
                    {l.name} {l.resourceStatus === 'INACTIVE' && <Badge variant="outline">Inactivo</Badge>}
                  </TableCell>
                  <TableCell>{resourceTypeLabel(l.type)}</TableCell>
                  <TableCell>{l.unit}</TableCell>
                  <TableCell className="text-right">{formatQuantity(l.quantity)}</TableCell>
                  <TableCell className="text-right">{isCrewBased(l.type) ? '—' : `${formatQuantity(l.wastePct)} %`}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatUnitPrice(l.unitPrice, l.currency)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatUnitPrice(l.subtotal, c)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <PermissionGate permission="budget.edit">
                      <Button size="sm" variant="ghost" aria-label={`Editar ${l.code}`} onClick={() => setEditing(l)}>
                        <Pencil /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Quitar ${l.code}`} disabled={deleteLine.isPending} onClick={() => void run(() => deleteLine.mutateAsync(l.id), 'Recurso quitado')}>
                        <Trash2 /> Quitar
                      </Button>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pie fijo: costo directo y desglose (design.md §46) */}
      <aside aria-label="Totales del APU" className="sticky bottom-0 mt-6 rounded-t-lg border border-border bg-card p-4 shadow-lg">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {RESOURCE_TYPES.map((t) => (
              <div key={t}>
                <dt className="text-xs text-fur-gray-600">{RESOURCE_TYPE_LABELS[t]}</dt>
                <dd>{apu.breakdown ? formatUnitPrice(apu.breakdown[t], c) : '—'}</dd>
              </div>
            ))}
          </dl>
          <p className="text-right">
            <span className="block text-xs text-fur-gray-600">Costo directo por {apu.unit}</span>
            <span className="text-2xl font-bold text-fur-navy-900">{formatUnitPrice(apu.directCost, c)}</span>
          </p>
        </div>
      </aside>

      {dialog === 'header' && (
        <FieldsDialog
          title={`Editar ${apu.code}`}
          description="Cambiar el rendimiento o la jornada recalcula la mano de obra y el equipo. Los presupuestos aprobados no cambian."
          fields={[
            { name: 'name', label: 'Nombre', required: true },
            { name: 'description', label: 'Descripción', type: 'textarea' },
            { name: 'yieldValue', label: 'Rendimiento (por jornada)', type: 'number', required: true, min: 0, step: 0.0001 },
            { name: 'hoursPerDay', label: 'Horas por jornada', type: 'number', required: true, min: 0, step: 0.5 },
            { name: 'status', label: 'Estado', type: 'select', required: true, options: [{ value: 'ACTIVE', label: 'Activo' }, { value: 'INACTIVE', label: 'Inactivo (no se puede usar en presupuestos nuevos)' }] },
          ]}
          initial={{ name: apu.name, description: apu.description ?? '', yieldValue: String(apu.yieldValue), hoursPerDay: String(apu.hoursPerDay), status: apu.status }}
          submitLabel="Guardar"
          onClose={() => setDialog(null)}
          onSubmit={(v) =>
            update.mutateAsync({ name: String(v.name).trim(), description: String(v.description ?? '').trim() || null, yieldValue: Number(v.yieldValue), hoursPerDay: Number(v.hoursPerDay), status: v.status as 'ACTIVE' | 'INACTIVE' })
          }
        />
      )}
      {dialog === 'add' && (
        <FieldsDialog
          title="Agregar recurso"
          description="Material y transporte: cantidad y desperdicio. Mano de obra y equipo: cantidad de la cuadrilla (el costo sale del rendimiento)."
          fields={[
            {
              name: 'resourceId',
              label: 'Recurso',
              type: 'select',
              required: true,
              options: (resources.data?.items ?? []).filter((r) => !used.has(r.id)).map((r) => ({ value: r.id, label: `${r.code} — ${r.name} (${resourceTypeLabel(r.resourceType)}, ${formatUnitPrice(r.unitPrice, r.currency)}/${r.unit})` })),
            },
            { name: 'quantity', label: 'Cantidad', type: 'number', required: true, min: 0, step: 0.0001 },
            { name: 'wastePct', label: 'Desperdicio (%)', type: 'number', min: 0, step: 0.01, help: 'Solo material y transporte.' },
          ]}
          initial={{ wastePct: '0' }}
          submitLabel="Agregar"
          onClose={() => setDialog(null)}
          onSubmit={(v) => addLine.mutateAsync({ resourceId: String(v.resourceId), quantity: Number(v.quantity), wastePct: Number(v.wastePct || 0) })}
        />
      )}
      {editing && (
        <FieldsDialog
          title={`Editar ${editing.code}`}
          fields={[
            { name: 'quantity', label: 'Cantidad', type: 'number', required: true, min: 0, step: 0.0001 },
            ...(isCrewBased(editing.type) ? [] : [{ name: 'wastePct', label: 'Desperdicio (%)', type: 'number' as const, min: 0, step: 0.01 }]),
          ]}
          initial={{ quantity: String(editing.quantity), wastePct: String(editing.wastePct) }}
          submitLabel="Guardar"
          onClose={() => setEditing(null)}
          onSubmit={(v) => updateLine.mutateAsync({ lineId: editing.id, quantity: Number(v.quantity), ...(isCrewBased(editing.type) ? {} : { wastePct: Number(v.wastePct || 0) }) })}
        />
      )}
    </>
  )
}
