import { AlertTriangle } from 'lucide-react'
import type { Rates, Totals } from '@/features/budget/use-budget'
import { formatMoney, formatPct } from '@/lib/format'

/** Panel de totales (design.md §46): costo directo, gastos generales, utilidad, impuesto y total. */
export function TotalsPanel({ totals, rates, currency, incomplete }: { totals: Totals; rates: Rates; currency: string; incomplete: boolean }) {
  const rows: Array<[string, number, string | null]> = [
    ['Costo directo', totals.direct, null],
    ['Gastos generales', totals.overhead, formatPct(rates.overheadPct)],
    ['Utilidad', totals.utility, formatPct(rates.utilityPct)],
    ['Subtotal', totals.subtotal, null],
    ['Impuesto', totals.tax, formatPct(rates.taxPct)],
  ]
  return (
    <aside aria-label="Totales del presupuesto" className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h3 className="text-base font-semibold text-fur-navy-900">Totales</h3>
      {incomplete && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-fur-red-500/10 p-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Hay partidas sin precio (falta un tipo de cambio): el total está incompleto.
        </p>
      )}
      <dl className="space-y-1.5 text-sm">
        {rows.map(([label, value, rate]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-fur-gray-600">
              {label}
              {rate && <span className="ml-1 text-xs">({rate})</span>}
            </dt>
            <dd className="font-medium">{formatMoney(value, currency)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-border pt-2 text-base">
          <dt className="font-semibold">Total</dt>
          <dd className="font-bold text-fur-navy-900">{formatMoney(totals.total, currency)}</dd>
        </div>
      </dl>
    </aside>
  )
}
