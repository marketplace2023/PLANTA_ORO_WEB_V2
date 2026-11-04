/** Presentación compartida para los valores tipados del maestro y los datos anteriores. */
export function formatSpecificationValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (Array.isArray(value)) return value.map(formatSpecificationValue).join(', ')
  if (typeof value === 'object') {
    const r = value as { min?: unknown; max?: unknown }
    if (r.min !== undefined && r.max !== undefined) return `${r.min} – ${r.max}`
    if (r.min !== undefined) return `≥ ${r.min}`
    if (r.max !== undefined) return `≤ ${r.max}`
    return JSON.stringify(value)
  }
  return String(value)
}
