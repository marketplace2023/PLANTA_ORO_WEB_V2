/** ¿El error de Postgres es una violación de unicidad (23505)? Drizzle puede envolver el error original en `cause`. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null
  return (e?.code ?? e?.cause?.code) === '23505'
}
