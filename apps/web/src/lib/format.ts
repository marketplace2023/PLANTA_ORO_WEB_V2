const dateFmt = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Quita el punto de la abreviatura y fuerza 3 letras: ICU escribe septiembre como "sept", el diseño usa "sep". */
const threeLetterMonth = (text: string) => text.replace(/\./g, '').replace(/\bsept\b/, 'sep')

/** "2022-03-15" → "15 mar 2022" (design.md §58). Se interpreta como fecha local, sin corrimiento de zona. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return '—'
  return threeLetterMonth(dateFmt.format(new Date(y, m - 1, d)))
}

/** Instante ISO → "15 mar 2022, 14:32" en la zona del navegador. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${threeLetterMonth(dateFmt.format(date))}, ${timeFmt.format(date)}`
}

const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const quantityFmt = new Intl.NumberFormat('es', { maximumFractionDigits: 4 })

/** Dinero con código de moneda delante y miles con coma (design.md §58): "USD 125,430.50". */
export function formatMoney(value: number | null | undefined, currency = 'USD'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${currency} ${moneyFmt.format(value)}`
}

/** Cantidades de inventario: hasta 4 decimales, sin ceros sobrantes. */
export function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return quantityFmt.format(value)
}

const unitPriceFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

/** Precio unitario de APU/recursos: hasta 4 decimales ("USD 113.1667"); "—" si no hay precio calculable. */
export function formatUnitPrice(value: number | null | undefined, currency = 'USD'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${currency} ${unitPriceFmt.format(value)}`
}

const pctFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** Porcentaje con signo opcional: 9.28 → "9.28 %"; null → "—". */
export function formatPct(value: number | null | undefined, signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${signed && value > 0 ? '+' : ''}${pctFmt.format(value)} %`
}
