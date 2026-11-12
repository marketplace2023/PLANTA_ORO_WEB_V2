import { createHash } from 'node:crypto'
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)]))
  return value
}
export const luloHash = (value: unknown) => createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')
