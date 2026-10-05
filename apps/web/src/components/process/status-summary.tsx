import { statusLabel } from '@/lib/assets'

/** Conteo por estado en texto ("2 Operativo · 1 En reparación"); null = no visible (se dice, no se inventa un cero). */
export function StatusSummary({ counts, total }: { counts: Record<string, number> | null; total: number | null }) {
  if (counts === null || total === null) return <span className="text-xs text-fur-gray-600">Activos no publicados</span>
  if (total === 0) return <span className="text-xs text-fur-gray-600">Sin activos</span>
  return (
    <span className="text-xs text-fur-gray-600">
      {Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([status, n]) => `${n} ${statusLabel(status)}`)
        .join(' · ')}
    </span>
  )
}
