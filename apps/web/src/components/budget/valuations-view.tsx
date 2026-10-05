import { CheckCircle2, ClipboardList, Eye, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { PermissionGate } from '@/components/base/permission-gate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useApproveValuation, useCreateValuation, useDeleteValuation, useUpdateValuation, useValuation, useValuations, type BudgetDetail, type ValuationInput } from '@/features/budget/use-budget'
import { ApiError } from '@/lib/api'
import { VALUATION_STATUS_LABELS } from '@/lib/budget'
import { formatDate, formatMoney, formatPct, formatQuantity } from '@/lib/format'

const errorText = (err: unknown) => (err instanceof ApiError ? (err.fieldErrors[0]?.message ?? err.message) : 'No se pudo completar la acción')

/** Valorizaciones: avance ejecutado por periodo sobre un presupuesto aprobado, con tope en la cantidad contratada. */
export function ValuationsView({ slug, budget }: { slug: string; budget: BudgetDetail }) {
  const list = useValuations(slug, budget.id)
  const [form, setForm] = useState<{ id?: string } | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const c = budget.baseCurrency

  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />
  if (list.isLoading || !list.data) return <Skeleton className="h-48" aria-busy="true" />
  const data = list.data

  if (budget.status === 'DRAFT') {
    return <EmptyState icon={ClipboardList} title="Aprueba el presupuesto para valorizar" description="Las valorizaciones miden el avance contra los precios y cantidades congelados al aprobar." />
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-fur-gray-600">Avance acumulado</p>
          <p className="text-2xl font-bold">{data.progressPct === null ? '—' : formatPct(data.progressPct)}</p>
          {data.progressPct !== null && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Avance acumulado" aria-valuenow={Math.min(100, data.progressPct)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-fur-navy-900" style={{ width: `${Math.min(100, data.progressPct)}%` }} />
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-fur-gray-600">Ejecutado (costo directo)</p>
          <p className="text-2xl font-bold">{formatMoney(data.executedDirect, c)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-fur-gray-600">Ejecutado (total con tasas)</p>
          <p className="text-2xl font-bold">{formatMoney(data.executedTotal, c)}</p>
        </div>
      </div>

      <div className="flex justify-end">
        {budget.status === 'APPROVED' && (
          <PermissionGate permission="budget.edit">
            <Button onClick={() => setForm({})}>
              <Plus /> Nueva valorización
            </Button>
          </PermissionGate>
        )}
      </div>

      {data.items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Aún no hay valorizaciones" description="Registra el avance de cada periodo indicando las cantidades ejecutadas por partida." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N.º</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Partidas</TableHead>
                <TableHead className="text-right">Costo directo</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="fur-code">{v.number}</TableCell>
                  <TableCell>
                    {formatDate(v.periodStart)} – {formatDate(v.periodEnd)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={v.status === 'APPROVED' ? 'default' : 'outline'}>{VALUATION_STATUS_LABELS[v.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{v.lineCount}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatMoney(v.direct, c)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatMoney(v.total, c)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" aria-label={`Ver valorización ${v.number}`} onClick={() => setViewing(v.id)}>
                      <Eye /> Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {viewing && (
        <ValuationDetailDialog
          slug={slug}
          budget={budget}
          id={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setForm({ id: viewing })
            setViewing(null)
          }}
        />
      )}
      {form && <ValuationFormDialog slug={slug} budget={budget} id={form.id} onClose={() => setForm(null)} />}
    </div>
  )
}

function ValuationDetailDialog({ slug, budget, id, onClose, onEdit }: { slug: string; budget: BudgetDetail; id: string; onClose: () => void; onEdit: () => void }) {
  const detail = useValuation(slug, budget.id, id)
  const approve = useApproveValuation(slug, budget.id)
  const del = useDeleteValuation(slug, budget.id)
  const c = budget.baseCurrency
  const v = detail.data

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{v ? `Valorización ${v.number}` : 'Valorización'}</DialogTitle>
          <DialogDescription>{v ? `${formatDate(v.periodStart)} – ${formatDate(v.periodEnd)} · ${VALUATION_STATUS_LABELS[v.status]}` : 'Cargando…'}</DialogDescription>
        </DialogHeader>
        {detail.isError ? (
          <ErrorState onRetry={() => void detail.refetch()} />
        ) : !v ? (
          <Skeleton className="h-40" aria-busy="true" />
        ) : (
          <>
            {v.note && <p className="text-sm">{v.note}</p>}
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partida</TableHead>
                    <TableHead className="text-right">Contratado</TableHead>
                    <TableHead className="text-right">Anterior</TableHead>
                    <TableHead className="text-right">Este periodo</TableHead>
                    <TableHead className="text-right">Acumulado</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v.lines.map((l) => (
                    <TableRow key={l.itemId}>
                      <TableCell>
                        <span className="fur-code mr-2">{l.code}</span>
                        {l.description}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatQuantity(l.contractQuantity)} {l.unit}
                      </TableCell>
                      <TableCell className="text-right">{formatQuantity(l.previousQuantity)}</TableCell>
                      <TableCell className="text-right font-medium">{formatQuantity(l.quantity)}</TableCell>
                      <TableCell className="text-right">{formatQuantity(l.cumulativeQuantity)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{l.amount === null ? '—' : formatMoney(l.amount, c)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-fur-gray-600">Costo directo</dt>
                <dd>{formatMoney(v.totals.direct, c)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fur-gray-600">Subtotal</dt>
                <dd>{formatMoney(v.totals.subtotal, c)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <dt>Total</dt>
                <dd>{formatMoney(v.totals.total, c)}</dd>
              </div>
            </dl>
            {v.status === 'DRAFT' && (
              <DialogFooter>
                <PermissionGate permission="budget.edit">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void del.mutateAsync(v.id).then(
                        () => {
                          toast.success('Valorización eliminada')
                          onClose()
                        },
                        (e) => toast.error(errorText(e)),
                      )
                    }
                  >
                    Eliminar
                  </Button>
                  <Button variant="secondary" onClick={onEdit}>
                    Editar
                  </Button>
                </PermissionGate>
                <PermissionGate permission="budget.approve">
                  <Button
                    disabled={approve.isPending}
                    onClick={() =>
                      void approve.mutateAsync(v.id).then(
                        () => {
                          toast.success(`Valorización ${v.number} aprobada`)
                          onClose()
                        },
                        (e) => toast.error(errorText(e)),
                      )
                    }
                  >
                    <CheckCircle2 /> Aprobar valorización
                  </Button>
                </PermissionGate>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Alta o edición de una valorización de borrador. Una cantidad vacía o 0 significa que la partida no avanzó en el periodo. */
function ValuationFormDialog({ slug, budget, id, onClose }: { slug: string; budget: BudgetDetail; id?: string; onClose: () => void }) {
  const existing = useValuation(slug, budget.id, id)
  const create = useCreateValuation(slug, budget.id)
  const update = useUpdateValuation(slug, budget.id)
  const today = new Date().toISOString().slice(0, 10)
  const [start, setStart] = useState<string | null>(null)
  const [end, setEnd] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [qty, setQty] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const loading = !!id && !existing.data
  const c = budget.baseCurrency

  const saved = new Map((existing.data?.lines ?? []).map((l) => [l.itemId, l]))
  const periodStart = start ?? existing.data?.periodStart ?? today
  const periodEnd = end ?? existing.data?.periodEnd ?? today
  const noteValue = note ?? existing.data?.note ?? ''
  const valueOf = (itemId: string) => qty[itemId] ?? (saved.has(itemId) ? String(saved.get(itemId)!.quantity) : '')
  const items = budget.chapters.flatMap((ch) => ch.items)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const lines = items.map((i) => ({ itemId: i.id, quantity: Number(valueOf(i.id) || 0) })).filter((l) => l.quantity !== 0)
    if (lines.some((l) => !Number.isFinite(l.quantity) || l.quantity < 0)) return setError('Las cantidades deben ser números positivos')
    if (lines.length === 0) return setError('Indica la cantidad ejecutada de al menos una partida')
    if (periodEnd < periodStart) return setError('El fin del periodo no puede ser anterior al inicio')
    const input: ValuationInput = { periodStart, periodEnd, note: noteValue.trim() || undefined, lines }
    setBusy(true)
    setError('')
    try {
      if (id) await update.mutateAsync({ vid: id, ...input })
      else await create.mutateAsync(input)
      toast.success(id ? 'Valorización actualizada' : 'Valorización creada como borrador')
      onClose()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{id ? `Editar valorización ${existing.data?.number ?? ''}` : 'Nueva valorización'}</DialogTitle>
          <DialogDescription>Cantidad ejecutada en el periodo por partida. El acumulado no puede superar lo contratado.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <Skeleton className="h-40" aria-busy="true" />
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="val-start">Inicio del periodo</Label>
                <Input id="val-start" type="date" className="h-10" value={periodStart} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="val-end">Fin del periodo</Label>
                <Input id="val-end" type="date" className="h-10" value={periodEnd} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="val-note">Nota</Label>
              <Input id="val-note" className="h-10" value={noteValue} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partida</TableHead>
                    <TableHead className="text-right">Contratado</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="w-36 text-right">Ejecutado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <span className="fur-code mr-2">{i.code}</span>
                        {i.description}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatQuantity(i.quantity)} {i.unit}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{i.unitPrice === null ? '—' : formatMoney(i.unitPrice, c)}</TableCell>
                      <TableCell>
                        <Input type="number" min={0} step={0.0001} className="h-9 text-right" aria-label={`Cantidad ejecutada de ${i.code}`} value={valueOf(i.id)} onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div role="alert" aria-live="polite">
              {error && <p className="rounded-md bg-fur-red-500/10 p-3 text-sm text-fur-red-500">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Guardando…' : id ? 'Guardar' : 'Crear valorización'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
