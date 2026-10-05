import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

/** Paginación de tablas (design.md §14). */
export function Pagination({ page, pageSize, total, onPageChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm text-fur-gray-600">
      <p aria-live="polite">
        {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft /> Anterior
        </Button>
        <span>
          Página {page} de {pages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Página siguiente">
          Siguiente <ChevronRight />
        </Button>
      </div>
    </nav>
  )
}
