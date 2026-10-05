import { FileSearch } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/base/empty-state'
import { ErrorState } from '@/components/base/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useProviderRfqs, useSubmitQuote, useWithdrawQuote, type ProviderRfq } from '@/features/procurement/use-procurement'
import { ApiError } from '@/lib/api'
import { formatDate, formatDateTime, formatMoney, formatQuantity } from '@/lib/format'
import { priorityLabel } from '@/lib/maintenance'
import { QUOTE_STATUS_LABELS, RFQ_STATUS_LABELS } from '@/lib/procurement'

const CURRENCIES = ['USD', 'PEN', 'CLP', 'ARS', 'EUR']

function QuoteForm({ providerId, rfq }: { providerId: string; rfq: ProviderRfq }) {
  const submit = useSubmitQuote(providerId, rfq.id)
  const withdraw = useWithdrawQuote(providerId, rfq.id)
  const mine = rfq.myQuote
  const [currency, setCurrency] = useState(mine?.currency ?? 'USD')
  const [total, setTotal] = useState(mine ? String(mine.totalAmount) : '')
  const [days, setDays] = useState(mine ? String(mine.deliveryDays) : '')
  const [conditions, setConditions] = useState(mine?.conditions ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const active = mine?.status === 'SUBMITTED'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!(Number(total) > 0)) next.totalAmount = 'Indica un monto mayor que cero'
    if (days === '' || !Number.isInteger(Number(days)) || Number(days) < 0) next.deliveryDays = 'Días enteros (0 o más)'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    try {
      await submit.mutateAsync({ currency, totalAmount: Number(total), deliveryDays: Number(days), conditions: conditions.trim() || undefined })
      toast.success(active ? 'Cotización actualizada' : 'Cotización enviada')
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length > 0) setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.path, f.message])))
      else setErrors({ _form: err instanceof ApiError ? err.message : 'No se pudo enviar la cotización.' })
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border p-3" noValidate aria-label={`Cotizar ${rfq.code}`}>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor={`q-cur-${rfq.id}`} className="text-xs">
            Moneda
          </Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id={`q-cur-${rfq.id}`} className="h-9 w-full" aria-label="Moneda">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`q-total-${rfq.id}`} className="text-xs">
            Monto total
          </Label>
          <Input id={`q-total-${rfq.id}`} type="number" min={0} step={0.01} className="h-9" value={total} onChange={(e) => setTotal(e.target.value)} aria-invalid={!!errors.totalAmount} />
          {errors.totalAmount && <p className="text-xs text-fur-red-500">{errors.totalAmount}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`q-days-${rfq.id}`} className="text-xs">
            Días de entrega
          </Label>
          <Input id={`q-days-${rfq.id}`} type="number" min={0} step={1} className="h-9" value={days} onChange={(e) => setDays(e.target.value)} aria-invalid={!!errors.deliveryDays} />
          {errors.deliveryDays && <p className="text-xs text-fur-red-500">{errors.deliveryDays}</p>}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`q-cond-${rfq.id}`} className="text-xs">
          Condiciones
        </Label>
        <Textarea id={`q-cond-${rfq.id}`} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Forma de pago, validez, garantía…" />
      </div>
      {errors._form && (
        <p role="alert" className="rounded-md bg-fur-red-500/10 p-2 text-sm text-fur-red-500">
          {errors._form}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={submit.isPending}>
          {active ? 'Actualizar cotización' : 'Enviar cotización'}
        </Button>
        {active && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutateAsync().then(() => toast.success('Cotización retirada'), (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo retirar'))}
          >
            Retirar cotización
          </Button>
        )}
      </div>
    </form>
  )
}

/** Solicitudes de cotización recibidas por el proveedor (design.md §24): ve lo necesario para cotizar, nada de la justificación interna. */
export function ProviderRfqsPanel({ providerId }: { providerId: string }) {
  const rfqs = useProviderRfqs(providerId)
  if (rfqs.isError) return <ErrorState onRetry={() => void rfqs.refetch()} />
  if (rfqs.isLoading || !rfqs.data) return <Skeleton className="h-40" aria-busy="true" />
  if (rfqs.data.length === 0) return <EmptyState icon={FileSearch} title="Aún no recibes solicitudes" description="Cuando una planta te invite a cotizar, la solicitud aparecerá aquí." />

  return (
    <ul className="space-y-4">
      {rfqs.data.map((r) => (
        <li key={r.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="fur-code text-base font-semibold text-fur-navy-900">{r.code}</h3>
            <Badge variant="outline">{RFQ_STATUS_LABELS[r.status]}</Badge>
            <span className="text-sm text-fur-gray-600">
              {r.plant.name} · prioridad {priorityLabel(r.priority).toLowerCase()} · requerida {formatDate(r.neededBy)}
            </span>
            {r.myQuote && <Badge variant={r.myQuote.status === 'AWARDED' ? 'default' : 'secondary'}>Mi cotización: {QUOTE_STATUS_LABELS[r.myQuote.status]}</Badge>}
          </div>
          <p className="text-sm">
            Responder hasta <strong>{formatDateTime(r.deadlineAt)}</strong>
            {!r.acceptsQuotes && r.status === 'OPEN' && <span className="ml-2 text-fur-red-500">· plazo vencido</span>}
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {r.lines.map((l) => (
              <li key={l.id}>
                {l.description} — {formatQuantity(l.quantity)} {l.uom}
              </li>
            ))}
          </ul>
          {r.acceptsQuotes ? (
            <QuoteForm providerId={providerId} rfq={r} />
          ) : (
            r.myQuote && (
              <p className="text-sm">
                Tu cotización: <strong>{formatMoney(r.myQuote.totalAmount, r.myQuote.currency)}</strong> · entrega en {r.myQuote.deliveryDays} días
              </p>
            )
          )}
        </li>
      ))}
    </ul>
  )
}
