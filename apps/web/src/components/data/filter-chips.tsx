import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type Chip = { key: string; label: string; value: string }

/** Filtros activos como chips ("Etapa: D06 ×"), design.md §13. */
export function FilterChips({ chips, onRemove, onClear }: { chips: Chip[]; onRemove: (key: string) => void; onClear: () => void }) {
  if (chips.length === 0) return null
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Filtros activos">
      {chips.map((c) => (
        <li key={c.key}>
          <button
            type="button"
            onClick={() => onRemove(c.key)}
            aria-label={`Quitar filtro ${c.label}: ${c.value}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="text-fur-gray-600">{c.label}:</span> {c.value}
            <X className="size-3.5" aria-hidden />
          </button>
        </li>
      ))}
      <li>
        <Button variant="ghost" size="xs" onClick={onClear}>
          Limpiar filtros
        </Button>
      </li>
    </ul>
  )
}
