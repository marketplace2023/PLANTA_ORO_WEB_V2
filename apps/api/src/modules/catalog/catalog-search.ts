import { ilike, sql, type SQLWrapper } from 'drizzle-orm'

/** Compara sin acentos ni distinción de mayúsculas, conservando el escape de LIKE. */
export function catalogSearch(value: SQLWrapper, pattern: string) {
  const withoutAccents = pattern.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return ilike(sql`regexp_replace(normalize(${value}, NFD), ${'[\u0300-\u036f]'}, '', 'g')`, withoutAccents)
}
