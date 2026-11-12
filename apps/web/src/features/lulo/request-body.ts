import { ApiError, jsonBody } from '@/lib/api'
const numeric = new Set(['quantity', 'amount', 'price', 'manualPrice', 'yieldValue', 'wastePct', 'coefficient', 'fixed', 'weight', 'length', 'width', 'height', 'count', 'factor', 'value', 'advanceAmount'])
export function normalizeLuloNumbers(value: unknown, field = ''): unknown {
  if (typeof value === 'string' && (numeric.has(field) || field.endsWith('Pct'))) {
    if (/^-?\d+,\d+$/.test(value)) return value.replace(',', '.')
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(value)) return value.replaceAll('.', '').replace(',', '.')
  }
  if (Array.isArray(value)) return value.map(v => normalizeLuloNumbers(v))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, normalizeLuloNumbers(v, key)]))
  return value
}
export const luloJsonBody = (input: unknown) => jsonBody(normalizeLuloNumbers(input))
export function luloError(error: Error | null | undefined) { return error instanceof ApiError && error.fieldErrors.length ? [...new Set(error.fieldErrors.map(f => f.message))].slice(0, 8).join(' · ') : error?.message ?? '' }
