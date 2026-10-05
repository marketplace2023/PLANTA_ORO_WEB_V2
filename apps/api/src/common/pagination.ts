import { z } from 'zod'

/** Paginación estándar de listados: ?page=1&pageSize=25 (máximo 100). */
export const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number }

export const pageOf = <T>(items: T[], total: number, page: number, pageSize: number): Page<T> => ({
  items,
  total,
  page,
  pageSize,
})

/** Escapa % _ \ para usarlos de forma literal dentro de un ILIKE. */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`)
