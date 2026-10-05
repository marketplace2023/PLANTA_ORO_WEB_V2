import { Plus, SearchX, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { FieldsDialog } from '@/components/base/fields-dialog'
import { PermissionGate } from '@/components/base/permission-gate'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAnalysis, useCreateScenario, useDeleteScenario, useDeviations, type Adjustments } from '@/features/budget/use-budget'
import { ApiError } from '@/lib/api'
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPES, resourceTypeLabel } from '@/lib/budget'
import { formatMoney, formatPct, formatUnitPrice } from '@/lib/format'

const describe = (adj: Adjustments) => {
  const parts = RESOURCE_TYPES.filter((t) => adj[t]).map((t) => `${RESOURCE_TYPE_LABELS[t]} ${formatPct(adj[t]!, true)}`)
  return parts.length ? parts.join(' · ') : 'Sin ajustes'
}

/** Escenarios (qué pasa si suben los materiales…) y sensibilidad (±10 % por tipo de recurso). */
export function ScenariosView({ slug, budgetId, currency }: { slug: string; budgetId: string; currency: string }) {
  const analysis = useAnalysis(slug, budgetId)
  const create = useCreateScenario(slug, budgetId)
  const del = useDeleteScenario(slug, budgetId)
  const [creating, setCreating] = useState(false)

  if (analysis.error instanceof ApiError && analysis.error.status === 409) {
    return <EmptyState icon={SearchX} title="No se puede analizar todavía" description={analysis.error.message} />
  }
  if (analysis.isError) return <ErrorState onRetry={() => void analysis.refetch()} />
  if (analysis.isLoading || !analysis.data) return <Skeleton className="h-48" aria-busy="true" />
  const a = analysis.data

  return (
    <div className="space-y-8">
      <section aria-labelledby="sc-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="sc-title" className="text-lg font-semibold text-fur-navy-900">
            Escenarios
          </h3>
          <PermissionGate permission="budget.edit">
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> Nuevo escenario
            </Button>
          </PermissionGate>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Escenario</TableHead>
                <TableHead>Ajustes</TableHead>
                <TableHead className="text-right">Costo directo</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Base (presupuesto)</TableCell>
                <TableCell className="text-fur-gray-600">Sin ajustes</TableCell>
                <TableCell className="text-right whitespace-nowrap">{formatMoney(a.base.direct, currency)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{formatMoney(a.base.total, currency)}</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell />
              </TableRow>
              {a.scenarios.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-fur-gray-600">{describe(s.adjustments)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatMoney(s.totals.direct, currency)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatMoney(s.totals.total, currency)}</TableCell>
                  <TableCell className={`text-right whitespace-nowrap ${s.change > 0 ? 'text-fur-red-500' : ''}`}>
                    {s.change > 0 ? '+' : ''}
                    {formatMoney(s.change, currency)} ({formatPct(s.changePct, true)})
                  </TableCell>
                  <TableCell className="text-right">
                    <PermissionGate permission="budget.edit">
                      <Button size="sm" variant="ghost" aria-label={`Eliminar escenario ${s.name}`} onClick={() => del.mutateAsync(s.id).then(() => toast.success('Escenario eliminado'), (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo eliminar'))}>
                        <Trash2 /> Eliminar
                      </Button>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="se-title" className="space-y-3">
        <h3 id="se-title" className="text-lg font-semibold text-fur-navy-900">
          Sensibilidad (±10 % por tipo de recurso)
        </h3>
        <p className="text-sm text-fur-gray-600">Cuánto se mueve el total si UN tipo de recurso sube o baja 10 %. Ordenado por impacto.</p>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recurso</TableHead>
                <TableHead>Variación</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.sensitivity.rows.map((r) => (
                <TableRow key={`${r.type}${r.deltaPct}`}>
                  <TableCell>{resourceTypeLabel(r.type)}</TableCell>
                  <TableCell>{formatPct(r.deltaPct, true)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatMoney(r.total, currency)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {r.change > 0 ? '+' : ''}
                    {formatMoney(r.change, currency)} ({formatPct(r.changePct, true)})
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {creating && (
        <FieldsDialog
          title="Nuevo escenario"
          description="Porcentaje de ajuste por tipo de recurso (negativo = baja). Los tipos que dejes vacíos no cambian."
          fields={[
            { name: 'name', label: 'Nombre', required: true, placeholder: 'Materiales +10 %' },
            ...RESOURCE_TYPES.map((t) => ({ name: t, label: `${RESOURCE_TYPE_LABELS[t]} (%)`, type: 'number' as const, step: 0.01 })),
          ]}
          submitLabel="Crear escenario"
          onClose={() => setCreating(false)}
          onSubmit={(v) => {
            const adjustments: Adjustments = {}
            for (const t of RESOURCE_TYPES) if (v[t] !== '' && v[t] !== undefined) adjustments[t] = Number(v[t])
            return create.mutateAsync({ name: String(v.name).trim(), adjustments })
          }}
        />
      )}
    </div>
  )
}

/** Desviación de precios: lo congelado al aprobar vs lo vigente hoy en el libro de precios. */
export function DeviationsView({ slug, budgetId, currency }: { slug: string; budgetId: string; currency: string }) {
  const dev = useDeviations(slug, budgetId)
  if (dev.isError) return <ErrorState onRetry={() => void dev.refetch()} />
  if (dev.isLoading || !dev.data) return <Skeleton className="h-48" aria-busy="true" />
  const d = dev.data
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-fur-gray-600">Impacto en costo directo</p>
          <p className="text-2xl font-bold">{formatMoney(d.impactDirect, currency)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-fur-gray-600">Impacto en el total (con tasas)</p>
          <p className={`text-2xl font-bold ${d.impactTotal > 0 ? 'text-fur-red-500' : ''}`}>{formatMoney(d.impactTotal, currency)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-fur-gray-600">Partidas afectadas</p>
          <p className="text-2xl font-bold">{d.itemsAffected}</p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Partida</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Congelado</TableHead>
              <TableHead className="text-right">Vigente</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
              <TableHead className="text-right">Impacto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.items.map((i) => (
              <TableRow key={i.itemId}>
                <TableCell>
                  <span className="fur-code mr-2">{i.code}</span>
                  {i.description}
                </TableCell>
                <TableCell className="text-right">
                  {i.quantity} {i.unit}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">{formatUnitPrice(i.frozenUnitPrice, currency)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{i.currentUnitPrice === null ? 'Sin precio' : formatUnitPrice(i.currentUnitPrice, currency)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{i.diff === null ? '—' : `${i.diff > 0 ? '+' : ''}${formatUnitPrice(i.diff, currency)} (${formatPct(i.diffPct, true)})`}</TableCell>
                <TableCell className={`text-right whitespace-nowrap ${(i.impact ?? 0) > 0 ? 'text-fur-red-500' : ''}`}>{i.impact === null ? '—' : formatMoney(i.impact, currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
